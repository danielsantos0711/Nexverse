-- Round 10, the hub: projects and Nexverse Code become one thing, model and dataset pages get real data to
-- show, members import models and datasets from Hugging Face and OpenRouter, and downloads take big files.
--
--   projects.project_type   model | dataset | tool | app | paper | other (kind stays the hub list it sits in)
--   projects.code_repo_id   the project's code repository (one per project), set by its owner who also manages
--                           the repository; the repository keeps living in code_repos, nothing moves
--   projects.specs          what a model or dataset page shows: context length, pricing, modalities, parameters,
--                           providers, splits, features… (written by the editor or by an import)
--   projects.source         "imported from" credit, set once when the project is created
--   projects.related        "built with": the Nexverse projects this one uses (apps using a model, …)
--   projects.appearance     the owner's choices for the page: accent colour, emoji, the tab it opens on
--   project_code (view)     project ↔ repository with the repository's owner and slug, for redirects
--   project_activity()      views, downloads and likes per day for a project's activity chart
--   project_imports         one row per import, so imports are rate-limited per member
--   downloads bucket        5 GB per file (the project-wide limit in the dashboard must allow it too)
--
-- Everything is additive: new columns, a new view, new tables, new functions and replaced functions.

-- ─── Projects: type, specs, source, related, code repository, appearance ────────────────────────────────

alter table public.projects
  add column if not exists project_type text check (project_type is null or project_type in ('model', 'dataset', 'tool', 'app', 'paper', 'other')),
  add column if not exists specs jsonb not null default '{}'::jsonb check (jsonb_typeof(specs) = 'object' and pg_column_size(specs) <= 32768),
  add column if not exists source jsonb check (source is null or (jsonb_typeof(source) = 'object' and pg_column_size(source) <= 4096)),
  add column if not exists related uuid[] not null default '{}' check (cardinality(related) <= 12),
  add column if not exists code_repo_id uuid references public.code_repos (id) on delete set null,
  add column if not exists appearance jsonb not null default '{}'::jsonb check (jsonb_typeof(appearance) = 'object' and pg_column_size(appearance) <= 2048);

-- A repository belongs to one project at most.
create unique index if not exists projects_code_repo_key on public.projects (code_repo_id) where code_repo_id is not null;
create index if not exists projects_related_idx on public.projects using gin (related);
create index if not exists projects_type_idx on public.projects (project_type) where project_type is not null;

grant update (project_type, specs, related, code_repo_id, appearance) on public.projects to authenticated;

-- The hub list a type sits in: apps next to tools, papers and everything else next to repos.
create or replace function public.project_kind_for(t text) returns text
language sql immutable set search_path = public as $$
  select case t when 'model' then 'model' when 'dataset' then 'dataset' when 'tool' then 'tool' when 'app' then 'tool' else 'repo' end
$$;

grant execute on function public.project_kind_for(text) to anon, authenticated;

-- Keeps kind in step with the type, checks the code repository link and the "built with" list, and keeps the
-- import credit as it was written at creation.
create or replace function public.project_hub_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_type is not null then
    new.kind := public.project_kind_for(new.project_type);
  end if;

  if tg_op = 'UPDATE' then
    new.source := old.source;
  end if;

  if new.code_repo_id is not null and (tg_op = 'INSERT' or new.code_repo_id is distinct from old.code_repo_id) then
    if tg_op = 'UPDATE' and old.owner_id is distinct from (select auth.uid()) then
      raise exception 'Only the owner of this project connects its code repository.' using errcode = 'P0001';
    end if;
    if not coalesce(public.code_can_admin(new.code_repo_id), false) then
      raise exception 'You can only connect a repository you own or manage.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.projects p where p.code_repo_id = new.code_repo_id and p.id <> new.id) then
      raise exception 'That repository already belongs to another project.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and new.code_repo_id is null and old.code_repo_id is not null and old.owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the owner of this project disconnects its code repository.' using errcode = 'P0001';
  end if;

  if new.id = any (new.related) then
    new.related := array_remove(new.related, new.id);
  end if;
  new.related := (select coalesce(array_agg(distinct r), '{}') from unnest(new.related) r);
  return new;
end;
$$;

revoke execute on function public.project_hub_rules() from public, anon, authenticated;

create or replace trigger projects_hub_rules
  before insert or update on public.projects
  for each row execute function public.project_hub_rules();

-- Project ↔ repository, read with the caller's own rights (both tables' policies apply).
create or replace view public.project_code with (security_invoker = true) as
  select p.id as project_id, p.kind, p.project_type, p.status, r.id as repo_id, r.slug as repo_slug, r.owner_id as repo_owner_id, o.handle as repo_owner_handle
  from public.projects p
  join public.code_repos r on r.id = p.code_repo_id and r.deleted_at is null
  left join public.profiles o on o.id = r.owner_id;

grant select on public.project_code to anon, authenticated;

-- ─── Views and activity ─────────────────────────────────────────────────────────────────────────────────

-- Page views per project and day. The page counts once a day per browser; nobody reads this table directly.
create table if not exists public.project_view_days (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0 check (views >= 0),
  primary key (project_id, day)
);

alter table public.project_view_days enable row level security;
-- No policies: record_project_view() writes, project_activity() reads.

create or replace function public.record_project_view(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.file_target_visible('project', pid) then
    return;
  end if;
  -- Editors looking at their own page do not count.
  if public.is_project_editor(pid) then
    return;
  end if;
  insert into public.project_view_days (project_id, day, views) values (pid, current_date, 1)
  on conflict (project_id, day) do update set views = least(public.project_view_days.views + 1, 1000000);
end;
$$;

revoke execute on function public.record_project_view(uuid) from public;
grant execute on function public.record_project_view(uuid) to anon, authenticated;

-- Views, downloads (one per member, file and day) and new likes per day, for the last `days` days.
create or replace function public.project_activity(pid uuid, days integer default 90)
returns table (day date, views integer, downloads integer, likes integer)
language sql stable security definer set search_path = public as $$
  with span as (
    select generate_series(current_date - (least(greatest(days, 7), 365) - 1), current_date, interval '1 day')::date as day
  )
  select s.day,
    coalesce((select v.views from public.project_view_days v where v.project_id = pid and v.day = s.day), 0)::integer,
    coalesce((select count(*) from public.file_downloads d join public.files f on f.id = d.file_id
              where f.target_kind = 'project' and f.target_id = pid and d.day = s.day), 0)::integer,
    coalesce((select count(*) from public.likes l where l.target = 'project:' || pid::text and l.created_at::date = s.day), 0)::integer
  from span s
  where public.file_target_visible('project', pid)
  order by s.day
$$;

revoke execute on function public.project_activity(uuid, integer) from public;
grant execute on function public.project_activity(uuid, integer) to anon, authenticated;

-- ─── Imports ────────────────────────────────────────────────────────────────────────────────────────────

-- One row per import from Hugging Face or OpenRouter, written by the import route as the member before it
-- fetches anything. The trigger is the rate limit: 10 an hour and 30 a day per member.
create table if not exists public.project_imports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  site text not null check (site in ('huggingface', 'openrouter')),
  item_type text not null check (item_type in ('model', 'dataset')),
  ref text not null check (char_length(ref) between 3 and 200 and ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'),
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_imports_member_idx on public.project_imports (member_id, created_at desc);

alter table public.project_imports enable row level security;

create policy "Members read their imports" on public.project_imports for select
  to authenticated using (member_id = (select auth.uid()));
create policy "Members log their imports" on public.project_imports for insert
  to authenticated with check (member_id = (select auth.uid()) and public.has_cap('project.create') and not public.is_suspended());
create policy "Members attach the project to their import" on public.project_imports for update
  to authenticated using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

revoke update on public.project_imports from anon, authenticated;
grant update (project_id) on public.project_imports to authenticated;

create or replace function public.project_import_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = new.member_id) then
      raise exception 'That project is not yours.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (select count(*) from public.project_imports i where i.member_id = new.member_id and i.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You imported 10 items in the last hour. Try again later.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.project_imports i where i.member_id = new.member_id and i.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You imported 30 items today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.project_id := null;
  return new;
end;
$$;

revoke execute on function public.project_import_rules() from public, anon, authenticated;

create or replace trigger project_imports_rules
  before insert or update on public.project_imports
  for each row execute function public.project_import_rules();

-- ─── Downloads: big files ───────────────────────────────────────────────────────────────────────────────

-- 5 GB per file. Supabase also applies the project-wide "global file size limit" (Storage settings in the
-- dashboard); the lower of the two wins, and on the Free plan that one cannot go past 50 MB.
update storage.buckets set file_size_limit = 5368709120 where id = 'downloads';

-- Same checks as round 9 with room for real models and datasets: 1,000 files per page, 20 GB per member.
create or replace function public.file_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  obj record;
begin
  if tg_op = 'UPDATE' then
    if new.path <> old.path or new.target_id <> old.target_id or new.target_kind <> old.target_kind or new.owner_id <> old.owner_id
       or new.size <> old.size or new.sha256 <> old.sha256
       or (new.download_count <> old.download_count and coalesce(current_setting('nexverse.counting', true), '') <> 'on') then
      raise exception 'Only the name, version and note of a file can change.';
    end if;
    return new;
  end if;
  if split_part(new.path, '/', 1) <> new.target_kind or split_part(new.path, '/', 2) <> new.target_id::text then
    raise exception 'The file is not in this page''s folder.';
  end if;
  select o.metadata, o.owner_id into obj from storage.objects o where o.bucket_id = 'downloads' and o.name = new.path;
  if not found or obj.owner_id is distinct from new.owner_id::text then
    raise exception 'Upload the file before adding it.';
  end if;
  new.size := coalesce((obj.metadata ->> 'size')::bigint, 0);
  new.mime := left(coalesce(nullif(obj.metadata ->> 'mimetype', ''), 'application/octet-stream'), 120);
  new.download_count := 0;
  new.created_at := now();
  if (select count(*) from public.files f where f.target_kind = new.target_kind and f.target_id = new.target_id) >= 1000 then
    raise exception 'A page can hold up to 1,000 files.' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(f.size), 0) from public.files f where f.owner_id = new.owner_id) + new.size > 21474836480 then
    raise exception 'Your files are over the 20 GB limit for one account. Remove old versions first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.file_rules() from public, anon, authenticated;

create or replace function public.download_object_writable(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  kind text;
  tid uuid;
begin
  if object_name !~ '^(project|share)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]{1,200}$' then
    return false;
  end if;
  kind := split_part(object_name, '/', 1);
  tid := split_part(object_name, '/', 2)::uuid;
  if not public.file_target_editable(kind, tid) then
    return false;
  end if;
  return (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
          where o.bucket_id = 'downloads' and o.owner_id = (select auth.uid())::text) < 21474836480
     and (select count(*) from storage.objects o
          where o.bucket_id = 'downloads' and o.owner_id = (select auth.uid())::text and o.created_at > now() - interval '1 hour') < 200;
end;
$$;

grant execute on function public.download_object_writable(text) to authenticated;

-- What the upload area shows: the bucket's per-file limit and the account limits above.
create or replace function public.upload_limits() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'fileBytes', coalesce((select b.file_size_limit from storage.buckets b where b.id = 'downloads'), 52428800),
    'memberBytes', 21474836480::bigint,
    'perPage', 1000,
    'perHour', 200
  )
$$;

grant execute on function public.upload_limits() to anon, authenticated;
