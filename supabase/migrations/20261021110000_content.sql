-- Round 11, content: covers for imported projects, the admin mass import, and "Rising in Nexverse".
--
--   project_media_credits   where a project's cover picture came from (copied into post-media at import)
--   mass_imports            one row per item an admin's mass import created, skipped or failed: the
--                           de-duplication record, the progress log and the per-day cap (300 an admin)
--   project_rate_limit()    admins may create up to 300 projects a day (members keep 20)
--   post_media_writable()   admins may store 600 pictures an hour, 5000 in all (members keep 60 and 1000)
--   "Admins set covers..."  admins may refresh the cover of any imported project
--   nexverse_rising()       real momentum on Nexverse over the last N days: likes, saves, views, downloads,
--                           replies and stars, with a per-day sparkline
--
-- Owner of mass-imported items: the admin who runs the import (profiles.id references auth.users, so a separate
-- "Nexverse Curator" profile would need a fabricated sign-in account; we do not invent members). Every curated
-- item keeps its "imported from" credit and is logged here and in moderation_log.
--
-- No drops, no deletes. Tables and functions use if-not-exists or create-or-replace; the policies are new names.

-- ─── Cover credits ──────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.project_media_credits (
  project_id uuid primary key references public.projects (id) on delete cascade,
  -- readme | thumbnail | sample | avatar | social
  origin text not null check (origin in ('readme', 'thumbnail', 'sample', 'avatar', 'social')),
  source_site text not null check (source_site in ('huggingface', 'openrouter', 'github', 'arxiv')),
  source_url text not null check (char_length(source_url) <= 1000 and source_url ~ '^https://'),
  stored_url text not null check (char_length(stored_url) <= 500 and stored_url ~ '^https://'),
  set_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.project_media_credits enable row level security;

create policy "Cover credits are public with their project" on public.project_media_credits for select
  using (public.file_target_visible('project', project_id));
create policy "Owners and admins credit a cover" on public.project_media_credits for insert
  to authenticated with check (
    exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_admin()))
  );
create policy "Owners and admins update a cover credit" on public.project_media_credits for update
  to authenticated using (
    exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_admin()))
  ) with check (
    exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or public.is_admin()))
  );

-- Admins refresh covers of imported projects someone else imported (column grants already limit what an
-- update can touch: cover_url is among the columns members may update).
create policy "Admins set covers of imported projects" on public.projects for update
  to authenticated using (public.is_admin() and source is not null) with check (public.is_admin() and source is not null);

-- ─── Mass import log ────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.mass_imports (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  run_id uuid not null,
  site text not null check (site in ('huggingface', 'openrouter', 'github', 'arxiv')),
  item_type text not null check (item_type in ('model', 'dataset', 'repo', 'tool', 'paper')),
  ref text not null check (char_length(ref) between 2 and 200),
  status text not null check (status in ('created', 'skipped', 'failed')),
  project_id uuid references public.projects (id) on delete set null,
  share_id uuid references public.submissions (id) on delete set null,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists mass_imports_run_idx on public.mass_imports (run_id, created_at);
create index if not exists mass_imports_ref_idx on public.mass_imports (site, ref);
create index if not exists mass_imports_actor_idx on public.mass_imports (actor_id, created_at desc);

alter table public.mass_imports enable row level security;

create policy "Admins read the mass import log" on public.mass_imports for select
  to authenticated using (public.is_admin());
create policy "Admins write the mass import log" on public.mass_imports for insert
  to authenticated with check (public.is_admin() and actor_id = (select auth.uid()));

create or replace function public.mass_import_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'created' and (
    select count(*) from public.mass_imports m
    where m.actor_id = new.actor_id and m.status = 'created' and m.created_at > now() - interval '1 day'
  ) >= 300 then
    raise exception 'Mass imports are capped at 300 new items a day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function public.mass_import_rules() from public, anon, authenticated;

create or replace trigger mass_imports_rules
  before insert on public.mass_imports
  for each row execute function public.mass_import_rules();

-- Finding what is already on Nexverse, by the source it came from.
create index if not exists projects_source_ref_idx on public.projects ((source ->> 'site'), (source ->> 'ref')) where source is not null;
create index if not exists projects_paper_url_idx on public.projects (paper_url) where paper_url is not null;
create index if not exists submissions_url_idx on public.submissions (url);

-- ─── Limits that a mass import needs lifted for admins ─────────────────────────────────────────────────────

create or replace function public.project_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    if (select count(*) from public.projects p
        where p.owner_id = new.owner_id and p.created_at > now() - interval '1 day') >= (case when public.is_admin() then 300 else 20 end) then
      raise exception 'You can create up to 20 projects a day.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'project_versions' then
    if (select count(*) from public.project_versions v where v.project_id = new.project_id) >= 50 then
      raise exception 'A project can list up to 50 versions.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.post_media_writable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null
    and not public.is_suspended()
    and object_name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{8,64}\.(png|jpe?g|webp|gif|avif)$')
    and (select count(*) from storage.objects o where o.bucket_id = 'post-media' and o.owner_id = (select auth.uid())::text)
        < (case when public.is_admin() then 5000 else 1000 end)
    and (select count(*) from storage.objects o where o.bucket_id = 'post-media' and o.owner_id = (select auth.uid())::text
         and o.created_at > now() - interval '1 hour') < (case when public.is_admin() then 600 else 60 end)
$$;

grant execute on function public.post_media_writable(text) to authenticated;

-- ─── Rising in Nexverse ─────────────────────────────────────────────────────────────────────────────────────

-- What is gaining attention on Nexverse over the last `days` days (1–90), from real activity only:
-- views x1, likes x4, saves x3, downloads x3, replies x3, code stars x4, and a member publishing something
-- new x2 (imports do not count as new). Recent days weigh more. Items with no activity are left out.
-- `only_kind`: model | dataset | tool | repo | thread | code, or null for everything.
create or replace function public.nexverse_rising(days integer default 7, only_kind text default null, lim integer default 24)
returns table (
  target text, item_type text, kind text, item_id uuid, title text, summary text, slug text,
  owner_name text, owner_handle text, cover_url text, created_at timestamptz, score numeric,
  likes integer, saves integer, views integer, downloads integer, replies integer, stars integer, spark integer[]
)
language sql stable security definer set search_path = public as $$
  with span as (
    select greatest(1, least(coalesce(days, 7), 90)) as n
  ),
  since as (
    select current_date - ((select n from span) - 1) as d
  ),
  ev as (
    select l.target, l.created_at::date as day, 'like'::text as k, 1 as c from public.likes l
      where l.created_at >= (select d from since) and l.target ~ '^(project|thread|share):'
    union all
    select b.target, b.created_at::date, 'save', 1 from public.bookmarks b
      where b.created_at >= (select d from since) and b.target ~ '^(project|thread|share):'
    union all
    select 'project:' || v.project_id, v.day, 'view', v.views from public.project_view_days v
      where v.day >= (select d from since)
    union all
    select f.target_kind || ':' || f.target_id, fd.day, 'download', 1 from public.file_downloads fd
      join public.files f on f.id = fd.file_id
      where fd.day >= (select d from since) and f.target_kind in ('project', 'share')
    union all
    select case when a.question_id is not null then 'thread:' || a.question_id else 'project:' || substr(a.sample_thread, 9) end,
      a.created_at::date, 'reply', 1 from public.answers a
      where a.created_at >= (select d from since) and a.hidden_at is null
        and (a.question_id is not null or a.sample_thread like 'project-%')
    union all
    select 'code:' || s.repo_id, s.created_at::date, 'star', 1 from public.code_stars s
      where s.created_at >= (select d from since)
    union all
    select 'project:' || p.id, coalesce(p.published_at, p.created_at)::date, 'new', 1 from public.projects p
      where p.source is null and p.status = 'published' and coalesce(p.published_at, p.created_at) >= (select d from since)
    union all
    select 'thread:' || q.id, q.created_at::date, 'new', 1 from public.questions q
      where q.created_at >= (select d from since)
  ),
  weighted as (
    select e.target, e.day, e.k, e.c,
      e.c * (case e.k when 'view' then 1 when 'like' then 4 when 'save' then 3 when 'download' then 3 when 'reply' then 3 when 'star' then 4 else 2 end)
        * (1.0 - 0.5 * (current_date - e.day)::numeric / (select n from span)) as w
    from ev e
    where e.target is not null
  ),
  agg as (
    select w.target,
      sum(w.w) as score,
      coalesce(sum(w.c) filter (where w.k = 'like'), 0)::integer as likes,
      coalesce(sum(w.c) filter (where w.k = 'save'), 0)::integer as saves,
      coalesce(sum(w.c) filter (where w.k = 'view'), 0)::integer as views,
      coalesce(sum(w.c) filter (where w.k = 'download'), 0)::integer as downloads,
      coalesce(sum(w.c) filter (where w.k = 'reply'), 0)::integer as replies,
      coalesce(sum(w.c) filter (where w.k = 'star'), 0)::integer as stars
    from weighted w
    group by w.target
  ),
  items as (
    select 'project:' || p.id as target, 'project'::text as item_type, p.kind, p.id as item_id, p.name as title, p.summary,
      p.slug, pr.name as owner_name, pr.handle as owner_handle, p.cover_url, coalesce(p.published_at, p.created_at) as created_at
    from public.projects p
    left join public.profiles pr on pr.id = p.owner_id
    where 'project:' || p.id in (select a.target from agg a)
      and p.status = 'published' and p.hidden_at is null and p.visibility = 'public'
      and (p.publish_at is null or p.publish_at <= now())
    union all
    select 'thread:' || q.id, 'thread', 'thread', q.id, q.title, left(regexp_replace(q.body, '\s+', ' ', 'g'), 160),
      null, pr.name, pr.handle, null, q.created_at
    from public.questions q
    left join public.profiles pr on pr.id = q.author_id
    where 'thread:' || q.id in (select a.target from agg a) and q.hidden_at is null
    union all
    select 'share:' || s.id, 'share', s.kind, s.id, s.title, s.summary, null, pr.name, pr.handle, null, s.created_at
    from public.submissions s
    left join public.profiles pr on pr.id = s.author_id
    where 'share:' || s.id in (select a.target from agg a) and s.hidden_at is null and s.kind <> 'news'
    union all
    select 'code:' || r.id, 'code', 'code', r.id, r.name, coalesce(r.description, ''), r.slug, pr.name, pr.handle, null, r.created_at
    from public.code_repos r
    join public.profiles pr on pr.id = r.owner_id and pr.handle is not null
    where 'code:' || r.id in (select a.target from agg a)
      and r.visibility = 'public' and r.hidden_at is null and r.deleted_at is null
  )
  select i.target, i.item_type, i.kind, i.item_id, i.title, i.summary, i.slug, i.owner_name, i.owner_handle, i.cover_url, i.created_at,
    round(a.score, 2), a.likes, a.saves, a.views, a.downloads, a.replies, a.stars,
    array(
      select coalesce((select sum(w.c)::integer from weighted w where w.target = i.target and w.day = g.day::date and w.k <> 'new'), 0)
      from generate_series((select d from since), current_date, interval '1 day') as g(day)
      order by g.day
    )
  from items i
  join agg a on a.target = i.target
  where only_kind is null or i.kind = only_kind
  order by a.score desc, i.created_at desc
  limit greatest(1, least(coalesce(lim, 24), 60))
$$;

revoke execute on function public.nexverse_rising(integer, text, integer) from public;
grant execute on function public.nexverse_rising(integer, text, integer) to anon, authenticated;
