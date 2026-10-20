-- Round 9, publishing: richer projects (cover, gallery, links, SPDX licence, visibility, scheduling, comments
-- switch, featured, co-authors, revision history), editor drafts saved per member, a public bucket for images
-- pasted into posts, and downloadable files on projects and shared links (private "downloads" bucket, signed
-- URLs for signed-in members only, honest download counts, per-member quotas).
--
-- Everything is additive: new columns, new tables, extra permissive policies and restrictive policies.

-- ─── Projects: more publishing options ──────────────────────────────────────────────────────────────────────

-- A list of {url, caption} pictures, or {label, url} links: an array of small objects with https URLs.
create or replace function public.valid_link_list(list jsonb, max_items int, label_key text) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(list) = 'array'
    and jsonb_array_length(list) <= max_items
    and pg_column_size(list) <= 16384
    and not exists (
      select 1 from jsonb_array_elements(list) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 'url') <> 'string'
         or char_length(e ->> 'url') > 500
         or (e ->> 'url') !~ '^https://[^\s]+$'
         or (e ? label_key and (jsonb_typeof(e -> label_key) <> 'string' or char_length(e ->> label_key) > 120))
    )
$$;

alter table public.projects
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'members', 'unlisted')),
  add column if not exists comments_enabled boolean not null default true,
  -- Published projects with a future publish_at stay hidden from everyone but their editors until then.
  add column if not exists publish_at timestamptz,
  -- Set by staff only, through feature_project().
  add column if not exists featured_at timestamptz,
  add column if not exists cover_url text check (cover_url is null or (char_length(cover_url) <= 500 and cover_url ~ '^https://[^\s]+$')),
  add column if not exists gallery jsonb not null default '[]'::jsonb check (public.valid_link_list(gallery, 12, 'caption')),
  add column if not exists extra_links jsonb not null default '[]'::jsonb check (public.valid_link_list(extra_links, 10, 'label')),
  -- Any SPDX identifier (or LicenseRef-…). The older "license" column keeps its short list for old rows.
  add column if not exists license_id text check (license_id is null or license_id ~ '^(LicenseRef-)?[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$');

create index if not exists projects_featured_idx on public.projects (featured_at desc) where featured_at is not null;

grant update (visibility, comments_enabled, publish_at, cover_url, gallery, extra_links, license_id) on public.projects to authenticated;

-- Server timestamps as before; a scheduled project is "published" from its publish_at.
create or replace function public.project_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.published_at := null;
    new.featured_at := null;
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.publish_at is not null and new.publish_at > now() then
    new.published_at := new.publish_at;
  elsif new.status = 'published' and new.published_at is null then
    new.published_at := now();
  elsif new.status = 'published' and tg_op = 'UPDATE' and old.published_at > now() and (new.publish_at is null or new.publish_at <= now()) then
    -- The schedule was cleared: it goes out now.
    new.published_at := now();
  end if;
  return new;
end;
$$;

-- ─── Co-authors ─────────────────────────────────────────────────────────────────────────────────────────────

-- A surrogate key (not a composite one) on purpose: PostgREST would otherwise read this table as a many-to-many
-- link between projects and profiles, and every existing "owner:profiles(...)" embed would become ambiguous.
create table if not exists public.project_coauthors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (project_id, member_id)
);

create index if not exists project_coauthors_member_idx on public.project_coauthors (member_id);

alter table public.project_coauthors enable row level security;

-- Owner or co-author. Security definer so policies on projects can call it without looping through RLS.
create or replace function public.is_project_editor(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.projects p where p.id = pid and p.owner_id = (select auth.uid()))
    or exists (select 1 from public.project_coauthors c where c.project_id = pid and c.member_id = (select auth.uid()))
  )
$$;

create or replace function public.is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = pid and p.owner_id = (select auth.uid()))
$$;

grant execute on function public.is_project_editor(uuid) to anon, authenticated;
grant execute on function public.is_project_owner(uuid) to anon, authenticated;

create policy "Co-authors follow their project" on public.project_coauthors for select
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "Owners add co-authors" on public.project_coauthors for insert
  to authenticated with check (public.is_project_owner(project_id) and member_id <> (select auth.uid()));
create policy "Owners or the co-author remove a co-author" on public.project_coauthors for delete
  to authenticated using (public.is_project_owner(project_id) or member_id = (select auth.uid()));

create or replace function public.project_coauthor_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.project_coauthors c where c.project_id = new.project_id) >= 10 then
    raise exception 'A project can have up to 10 co-authors.' using errcode = 'P0001';
  end if;
  new.added_at := now();
  perform public.notify(new.member_id, 'mention', (select auth.uid()), 'project:' || new.project_id::text,
    'added you as a co-author of ' || coalesce((select p.name from public.projects p where p.id = new.project_id), 'a project'));
  return new;
end;
$$;

revoke execute on function public.project_coauthor_rules() from public, anon, authenticated;

create or replace trigger project_coauthors_rules
  before insert on public.project_coauthors
  for each row execute function public.project_coauthor_rules();

-- Co-authors read drafts and edit the project and its changelog (deleting stays with the owner).
create policy "Co-authors read their projects" on public.projects for select
  to authenticated using (public.is_project_editor(id));
create policy "Co-authors edit their projects" on public.projects for update
  to authenticated using (public.is_project_editor(id)) with check (public.is_project_editor(id));

-- Members-only projects need an account; scheduled ones wait for their time. Editors and staff always see them.
create policy "Members-only and scheduled projects" on public.projects as restrictive for select
  using (
    owner_id = (select auth.uid())
    or public.is_staff()
    or public.is_project_editor(id)
    or ((publish_at is null or publish_at <= now()) and (visibility <> 'members' or (select auth.uid()) is not null))
  );

create policy "Co-authors read versions" on public.project_versions for select
  to authenticated using (public.is_project_editor(project_id));
create policy "Versions only where the project is readable" on public.project_versions as restrictive for select
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "Co-authors add versions" on public.project_versions for insert
  to authenticated with check (public.is_project_editor(project_id));
create policy "Co-authors edit versions" on public.project_versions for update
  to authenticated using (public.is_project_editor(project_id)) with check (public.is_project_editor(project_id));
create policy "Co-authors remove versions" on public.project_versions for delete
  to authenticated using (public.is_project_editor(project_id));

-- ─── Comments on or off ─────────────────────────────────────────────────────────────────────────────────────

create or replace function public.project_comments_open(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.comments_enabled from public.projects p where p.id = pid), true)
$$;

grant execute on function public.project_comments_open(uuid) to anon, authenticated;

create policy "Closed project discussions take no replies" on public.answers as restrictive for insert
  to authenticated with check (
    sample_thread is null
    or sample_thread !~ '^project-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or public.project_comments_open(substr(sample_thread, 9)::uuid)
  );

-- ─── Featured (staff) ───────────────────────────────────────────────────────────────────────────────────────

create or replace function public.feature_project(target uuid, featured boolean) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  stamp timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Only moderators can feature projects';
  end if;
  update public.projects set featured_at = case when featured then now() else null end
   where id = target
  returning featured_at into stamp;
  if not found then
    raise exception 'This project is no longer here';
  end if;
  perform public.log_moderation(case when featured then 'feature' else 'unfeature' end, 'project', target::text, '');
  return stamp;
end;
$$;

revoke execute on function public.feature_project(uuid, boolean) from public, anon;
grant execute on function public.feature_project(uuid, boolean) to authenticated;

-- ─── Revision history ───────────────────────────────────────────────────────────────────────────────────────

-- The text of a project before each change to its name, summary or README. Written by the trigger only.
create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  editor_id uuid references public.profiles (id) on delete set null,
  name text not null,
  summary text not null,
  readme text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_project_idx on public.project_revisions (project_id, created_at desc);

alter table public.project_revisions enable row level security;

create policy "Editors and staff read revisions" on public.project_revisions for select
  to authenticated using (public.is_project_editor(project_id) or public.is_staff());

create or replace function public.project_keep_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.readme is distinct from new.readme or old.name is distinct from new.name or old.summary is distinct from new.summary then
    insert into public.project_revisions (project_id, editor_id, name, summary, readme)
    values (old.id, (select auth.uid()), old.name, old.summary, old.readme);
  end if;
  return new;
end;
$$;

revoke execute on function public.project_keep_revision() from public, anon, authenticated;

create or replace trigger projects_keep_revision
  after update on public.projects
  for each row execute function public.project_keep_revision();

-- ─── Editor drafts ──────────────────────────────────────────────────────────────────────────────────────────

-- What a member is writing, saved as they type: one row per place ("project:<id>", "forum:new", …).
create table if not exists public.editor_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9:_.-]{0,119}$'),
  title text not null default '' check (char_length(title) <= 300),
  body text not null default '' check (char_length(body) <= 60000),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 16384),
  updated_at timestamptz not null default now(),
  unique (owner_id, key)
);

alter table public.editor_drafts enable row level security;

create policy "Members read their drafts" on public.editor_drafts for select
  to authenticated using (owner_id = (select auth.uid()));
create policy "Members save their drafts" on public.editor_drafts for insert
  to authenticated with check (owner_id = (select auth.uid()));
create policy "Members update their drafts" on public.editor_drafts for update
  to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Members discard their drafts" on public.editor_drafts for delete
  to authenticated using (owner_id = (select auth.uid()));

create or replace function public.editor_draft_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.editor_drafts d where d.owner_id = new.owner_id) >= 200 then
    raise exception 'You have 200 saved drafts. Publish or discard some first.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.editor_draft_rules() from public, anon, authenticated;

create or replace trigger editor_drafts_rules
  before insert or update on public.editor_drafts
  for each row execute function public.editor_draft_rules();

-- ─── Images in posts ────────────────────────────────────────────────────────────────────────────────────────

-- Public bucket: "<member uuid>/<random>.<ext>". 5 MB per picture, images only, 1000 per member, 60 an hour.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.post_media_writable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null
    and not public.is_suspended()
    and object_name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{8,64}\.(png|jpe?g|webp|gif|avif)$')
    and (select count(*) from storage.objects o where o.bucket_id = 'post-media' and o.owner_id = (select auth.uid())::text) < 1000
    and (select count(*) from storage.objects o where o.bucket_id = 'post-media' and o.owner_id = (select auth.uid())::text
         and o.created_at > now() - interval '1 hour') < 60
$$;

grant execute on function public.post_media_writable(text) to authenticated;

create policy "Members upload post images to their folder" on storage.objects for insert
  to authenticated with check (bucket_id = 'post-media' and public.post_media_writable(name));
create policy "Members read their post images" on storage.objects for select
  to authenticated using (bucket_id = 'post-media' and owner_id = (select auth.uid())::text);
create policy "Members remove their post images" on storage.objects for delete
  to authenticated using (bucket_id = 'post-media' and owner_id = (select auth.uid())::text);

-- ─── Downloads ──────────────────────────────────────────────────────────────────────────────────────────────

-- Private bucket: "<project|share>/<target uuid>/<random uuid>/<file name>". 50 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('downloads', 'downloads', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Whether the caller may see a project or shared link (same rules as their select policies).
create or replace function public.file_target_visible(kind text, tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case kind
    when 'project' then exists (
      select 1 from public.projects p
      where p.id = tid and (
        p.owner_id = (select auth.uid()) or public.is_staff() or public.is_project_editor(p.id)
        or (p.status = 'published' and p.hidden_at is null
            and (p.publish_at is null or p.publish_at <= now())
            and (p.visibility <> 'members' or (select auth.uid()) is not null))
      ))
    when 'share' then exists (
      select 1 from public.submissions s
      where s.id = tid and (s.hidden_at is null or s.author_id = (select auth.uid()) or public.is_staff()))
    else false
  end
$$;

-- Whether the caller may add files to it: project owner or co-author, or the member who shared the link.
create or replace function public.file_target_editable(kind text, tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null and not public.is_suspended() and case kind
    when 'project' then public.is_project_editor(tid)
    when 'share' then exists (select 1 from public.submissions s where s.id = tid and s.author_id = (select auth.uid()))
    else false
  end
$$;

grant execute on function public.file_target_visible(text, uuid) to anon, authenticated;
grant execute on function public.file_target_editable(text, uuid) to authenticated;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind in ('project', 'share')),
  target_id uuid not null,
  path text not null unique check (path ~ '^(project|share)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]{1,200}$'),
  name text not null check (char_length(name) between 1 and 200 and name !~ '[/\\]'),
  size bigint not null default 0 check (size >= 0),
  mime text not null default 'application/octet-stream' check (char_length(mime) <= 120),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  version text check (version is null or version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'),
  note text not null default '' check (char_length(note) <= 300),
  download_count bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists files_target_idx on public.files (target_kind, target_id, created_at desc);
create index if not exists files_owner_idx on public.files (owner_id);

alter table public.files enable row level security;

create policy "Files follow their page's visibility" on public.files for select
  using (public.file_target_visible(target_kind, target_id));
create policy "Editors add files" on public.files for insert
  to authenticated with check (owner_id = (select auth.uid()) and public.file_target_editable(target_kind, target_id));
create policy "Uploaders and editors rename files" on public.files for update
  to authenticated
  using (owner_id = (select auth.uid()) or public.file_target_editable(target_kind, target_id))
  with check (owner_id = (select auth.uid()) or public.file_target_editable(target_kind, target_id));
create policy "Uploaders, editors and staff remove files" on public.files for delete
  to authenticated using (owner_id = (select auth.uid()) or public.file_target_editable(target_kind, target_id) or public.is_staff());

revoke update on public.files from anon, authenticated;
grant update (name, version, note) on public.files to authenticated;

-- A file row must describe an object the member really uploaded: size and type come from storage, the path
-- must sit under its own target, and quotas hold (1 GB per member, 100 files per page).
create or replace function public.file_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  obj record;
begin
  if tg_op = 'UPDATE' then
    if new.path <> old.path or new.target_id <> old.target_id or new.target_kind <> old.target_kind or new.owner_id <> old.owner_id
       or new.size <> old.size or new.sha256 <> old.sha256 or new.download_count <> old.download_count then
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
  if (select count(*) from public.files f where f.target_kind = new.target_kind and f.target_id = new.target_id) >= 100 then
    raise exception 'A page can hold up to 100 files.' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(f.size), 0) from public.files f where f.owner_id = new.owner_id) + new.size > 1073741824 then
    raise exception 'Your files are over the 1 GB limit for one account. Remove old versions first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.file_rules() from public, anon, authenticated;

create or replace trigger files_rules
  before insert or update on public.files
  for each row execute function public.file_rules();

-- Storage: reading needs an account and a file row on a page you can see; uploading needs edit rights on the
-- page in the path and room in your 1 GB; removing is for the uploader or the page's editors.
create or replace function public.download_object_readable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.files f where f.path = object_name and public.file_target_visible(f.target_kind, f.target_id)
  )
$$;

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
          where o.bucket_id = 'downloads' and o.owner_id = (select auth.uid())::text) < 1073741824
     and (select count(*) from storage.objects o
          where o.bucket_id = 'downloads' and o.owner_id = (select auth.uid())::text and o.created_at > now() - interval '1 hour') < 100;
end;
$$;

create or replace function public.download_object_removable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from storage.objects o where o.bucket_id = 'downloads' and o.name = object_name and o.owner_id = (select auth.uid())::text)
    or (object_name ~ '^(project|share)/[0-9a-f-]{36}/'
        and public.file_target_editable(split_part(object_name, '/', 1), split_part(object_name, '/', 2)::uuid))
    or public.is_staff()
  )
$$;

grant execute on function public.download_object_readable(text) to authenticated;
grant execute on function public.download_object_writable(text) to authenticated;
grant execute on function public.download_object_removable(text) to authenticated;

create policy "Members download files they can see" on storage.objects for select
  to authenticated using (bucket_id = 'downloads' and public.download_object_readable(name));
-- Storage removal also needs read access; uploaders can always see their own objects (for cleaning up an upload
-- whose file row was refused).
create policy "Uploaders read their own downloadable files" on storage.objects for select
  to authenticated using (bucket_id = 'downloads' and owner_id = (select auth.uid())::text);
create policy "Editors upload downloadable files" on storage.objects for insert
  to authenticated with check (bucket_id = 'downloads' and public.download_object_writable(name));
create policy "Uploaders and editors remove downloadable files" on storage.objects for delete
  to authenticated using (bucket_id = 'downloads' and public.download_object_removable(name));

-- One count per member, file and day, so refreshing does not inflate the number.
-- Surrogate key for the same reason as project_coauthors (no implicit files <-> profiles many-to-many).
create table if not exists public.file_downloads (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  unique (file_id, member_id, day)
);

alter table public.file_downloads enable row level security;
-- No policies: only count_download() writes here, and nobody reads it directly.

create or replace function public.count_download(file uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  f record;
  total bigint;
begin
  if me is null then
    raise exception 'Sign in to download files.';
  end if;
  select x.id, x.target_kind, x.target_id, x.download_count into f from public.files x where x.id = file;
  if not found or not public.file_target_visible(f.target_kind, f.target_id) then
    raise exception 'This file is no longer here.';
  end if;
  insert into public.file_downloads (file_id, member_id, day) values (file, me, current_date) on conflict do nothing;
  if found then
    update public.files set download_count = download_count + 1 where id = file returning download_count into total;
  else
    total := f.download_count;
  end if;
  return total;
end;
$$;

revoke execute on function public.count_download(uuid) from public, anon;
grant execute on function public.count_download(uuid) to authenticated;

-- How much of the 1 GB a member has used, for the upload area.
create or replace function public.my_file_usage() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(f.size), 0)::bigint from public.files f where f.owner_id = (select auth.uid())
$$;

revoke execute on function public.my_file_usage() from public, anon;
grant execute on function public.my_file_usage() to authenticated;
