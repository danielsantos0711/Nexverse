-- Editable site content (round 9): every piece of copy and every curated list on the site can be changed by
-- the admins without a deploy. One row per key. The code ships the default text (the "fallback"); a row with a
-- value overrides it, and a row with a null value means "back to the default" while keeping the history.
--
-- Keys:
--   copy and blocks   "<page>.<section>.<field>", such as "forum.header.title" or "events.empty.lead"
--   page SEO          "seo.<path>", such as "seo./forum"        (value: { title, description, image })
--   page visibility   "visibility.<path>", such as "visibility./crews" (value: "everyone" | "members" | "staff" | "hidden")
--
-- Builds on 20261019070000_roles_admin.sql (is_admin(), moderation_log) and 20261019122000_cms.sql (cms_can()).
-- Additive only: no drop and no delete. Reset to default writes null; the newest 20 earlier values stay in
-- `history` (capped by rebuilding the array, not by deleting rows).

create table if not exists public.site_content (
  key text primary key check (
    char_length(key) <= 200
    and (
      key ~ '^[a-z0-9][a-z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*){1,7}$'
      or key ~ '^(seo|visibility)\.(/|(/[][a-z0-9_.-]+)+)$'
    )
  ),
  kind text not null default 'copy' check (kind in ('copy', 'block')),
  -- null: the code's default is used.
  value jsonb check (value is null or pg_column_size(value) <= 65536),
  -- The default the code shipped when an editor last saw this key, so the site editor can list texts that were
  -- never changed and show what "reset" goes back to. Written by editors in edit mode; never shown as content.
  fallback jsonb check (fallback is null or pg_column_size(fallback) <= 65536),
  -- The page the key was first seen on ("/forum"), for the site editor's per-page lists.
  path text check (path is null or (char_length(path) <= 200 and path ~ '^/')),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Copy is plain text of a sane length.
  constraint site_content_copy_is_text check (kind <> 'copy' or value is null or (jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= 5000)),
  -- Visibility is one of four words.
  constraint site_content_visibility_word check (
    key !~ '^visibility\.' or value is null or value in ('"everyone"'::jsonb, '"members"'::jsonb, '"staff"'::jsonb, '"hidden"'::jsonb)
  ),
  -- SEO is a small object.
  constraint site_content_seo_object check (key !~ '^seo\.' or value is null or jsonb_typeof(value) = 'object')
);

create index if not exists site_content_path_idx on public.site_content (path);
create index if not exists site_content_updated_idx on public.site_content (updated_at desc);

-- ─── Who may write ──────────────────────────────────────────────────────────────────────────────────────────

-- Page editors change copy, lists and SEO; who may see a page is an admin decision (settings.manage).
create or replace function public.site_content_can_write(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when k like 'visibility.%' then public.is_admin() or public.cms_can('settings.manage')
    else public.is_admin() or public.cms_can('pages.edit')
  end
$$;
grant execute on function public.site_content_can_write(text) to anon, authenticated;

alter table public.site_content enable row level security;

create policy "Site content is public" on public.site_content for select using (true);
create policy "Editors add site content" on public.site_content for insert to authenticated
  with check (public.site_content_can_write(key));
create policy "Editors change site content" on public.site_content for update to authenticated
  using (public.site_content_can_write(key)) with check (public.site_content_can_write(key));
-- No delete policy: a reset writes null and keeps the history.
revoke delete, truncate on public.site_content from anon, authenticated;


-- ─── Stamps, history and the moderation log ─────────────────────────────────────────────────────────────────

-- Before a write: stamp who and when (only when the value changed; noting a default is not an edit), keep the
-- previous value in the history (newest first, at most 20), and ignore any history a client tried to send.
create or replace function public.site_content_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prior jsonb;
  kept jsonb;
begin
  if tg_op = 'INSERT' then
    new.history := '[]'::jsonb;
    if new.value is not null then
      new.updated_by := auth.uid();
    else
      new.updated_by := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.value is distinct from old.value then
    prior := jsonb_build_array(jsonb_build_object('value', old.value, 'by', old.updated_by, 'at', old.updated_at));
    select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into kept
    from jsonb_array_elements(prior || old.history) with ordinality as t(e, i)
    where i <= 20;
    new.history := kept;
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.history := old.history;
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- After a write that changed the value: one row in the moderation log.
create or replace function public.site_content_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  if tg_op = 'INSERT' and new.value is null then
    return new;
  end if;
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values (
    auth.uid(),
    case when new.value is null then 'reset' else 'edit' end,
    'site_content',
    left(new.key, 200),
    left(case
      when new.value is null then 'Back to the default'
      when new.kind = 'copy' then 'Text: ' || (new.value #>> '{}')
      when new.key like 'visibility.%' then 'Visible to: ' || (new.value #>> '{}')
      when new.key like 'seo.%' then 'Search and share details'
      else 'List or settings changed'
    end, 500)
  );
  return new;
end;
$$;

revoke execute on function public.site_content_stamp(), public.site_content_log() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'site_content_stamp' and tgrelid = 'public.site_content'::regclass) then
    create trigger site_content_stamp before insert or update on public.site_content
      for each row execute function public.site_content_stamp();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'site_content_log' and tgrelid = 'public.site_content'::regclass) then
    create trigger site_content_log after insert or update on public.site_content
      for each row execute function public.site_content_log();
  end if;
end;
$$;

-- Every open page picks up an edit within seconds.
do $$
begin
  alter publication supabase_realtime add table public.site_content;
exception when duplicate_object then
  null;
end;
$$;
