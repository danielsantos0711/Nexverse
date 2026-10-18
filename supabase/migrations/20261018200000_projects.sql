-- Creator studio: projects members publish (models, datasets, tools, repos) with a README and a changelog,
-- the profile fields the settings page edits, and the "avatars" storage bucket.
-- Published projects are readable by everyone; drafts only by their owner. Each member writes only their own rows.

-- ─── Profiles ───────────────────────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column handle text check (handle is null or handle ~ '^[a-z0-9_]{3,30}$'),
  add column bio text not null default '' check (char_length(bio) <= 300),
  add column website text check (website is null or (char_length(website) <= 300 and website ~ '^https://[^\s]+$')),
  add column github text check (github is null or github ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'),
  add column location text not null default '' check (char_length(location) <= 80),
  -- What a member cares about: "category:<slug>" (forum categories) and "kind:<model|dataset|tool|repo>".
  add column interests text[] not null default '{}' check (
    cardinality(interests) <= 30
    and array_to_string(interests, ',') ~ '^((category|kind):[a-z0-9-]{1,40}(,(category|kind):[a-z0-9-]{1,40})*)?$'
  ),
  -- Only pictures in this project's own "avatars" bucket, in the member's own folder (enforced by trigger below).
  add column avatar_url text check (
    avatar_url is null
    or (char_length(avatar_url) <= 500 and avatar_url ~ '^https://[^/\s]+/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$')
  ),
  -- In-app notification switches by kind ("reply", "like", "follow", "mention") plus "digest" for a future email digest.
  add column notify_prefs jsonb not null default '{}' check (jsonb_typeof(notify_prefs) = 'object' and pg_column_size(notify_prefs) <= 1024),
  add column onboarded_at timestamptz,
  add column deletion_requested_at timestamptz;

create unique index profiles_handle_key on public.profiles (handle) where handle is not null;

-- An avatar must sit in the member's own folder, so nobody can point their picture at someone else's file.
create function public.check_profile_avatar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.avatar_url is not null and position('/avatars/' || new.id::text || '/' in new.avatar_url) = 0 then
    raise exception 'avatar must be uploaded to your own folder';
  end if;
  return new;
end;
$$;

create trigger profiles_avatar_owner
  before insert or update of avatar_url on public.profiles
  for each row execute function public.check_profile_avatar();

-- Columns a member may change on their own profile (the update policy already limits it to their row).
grant update (handle, bio, website, github, location, interests, avatar_url, notify_prefs, onboarded_at) on public.profiles to authenticated;

-- Asking for, or withdrawing, the deletion of your account. The timestamp is always the server's.
create function public.set_account_deletion(requested boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  stamp timestamptz;
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  update public.profiles
     set deletion_requested_at = case when requested then coalesce(deletion_requested_at, now()) else null end
   where id = me
  returning deletion_requested_at into stamp;
  return stamp;
end;
$$;

revoke execute on function public.set_account_deletion(boolean) from public, anon;
grant execute on function public.set_account_deletion(boolean) to authenticated;
revoke execute on function public.check_profile_avatar() from public, anon, authenticated;

-- ─── Projects ───────────────────────────────────────────────────────────────────────────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('model', 'dataset', 'tool', 'repo')),
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$'),
  summary text not null check (char_length(trim(summary)) between 10 and 160),
  readme text not null default '' check (char_length(readme) <= 50000),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 8 and array_to_string(tags, ',') ~ '^([a-z0-9][a-z0-9-]{0,29}(,[a-z0-9][a-z0-9-]{0,29})*)?$'
  ),
  license text not null default 'unspecified' check (license in (
    'unspecified', 'Apache-2.0', 'MIT', 'BSD-3-Clause', 'GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'MPL-2.0',
    'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC0-1.0', 'OpenRAIL-M', 'Llama-community', 'Proprietary'
  )),
  langs text[] not null default '{}' check (cardinality(langs) <= 12 and array_to_string(langs, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  repo_url text check (repo_url is null or (char_length(repo_url) <= 300 and repo_url ~ '^https://github\.com/[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}/?$')),
  paper_url text check (paper_url is null or (char_length(paper_url) <= 500 and paper_url ~ '^https://[^\s]+$')),
  demo_url text check (demo_url is null or (char_length(demo_url) <= 500 and demo_url ~ '^https://[^\s]+$')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (owner_id, slug)
);

create index projects_published_idx on public.projects (published_at desc) where status = 'published';
create index projects_kind_published_idx on public.projects (kind, published_at desc) where status = 'published';
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

-- A release in a project's changelog.
create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version text not null check (version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$'),
  notes text not null default '' check (char_length(notes) <= 5000),
  released_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index project_versions_project_idx on public.project_versions (project_id, released_on desc);

-- Timestamps are the server's: updated_at on every change, published_at the first time a project goes public.
create function public.project_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.published_at := null;
  end if;
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_rules
  before insert or update on public.projects
  for each row execute function public.project_rules();

-- No more than 20 new projects a day from one member, and 50 versions per project.
create function public.project_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    if (select count(*) from public.projects p
        where p.owner_id = new.owner_id and p.created_at > now() - interval '1 day') >= 20 then
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

create trigger projects_rate_limit
  before insert on public.projects
  for each row execute function public.project_rate_limit();

create trigger project_versions_rate_limit
  before insert on public.project_versions
  for each row execute function public.project_rate_limit();

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;

create policy "Published projects are public, drafts are their owner's" on public.projects for select
  using (status = 'published' or owner_id = (select auth.uid()));
create policy "Members create projects as themselves" on public.projects for insert
  to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners edit their projects" on public.projects for update
  to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete their projects" on public.projects for delete
  to authenticated using (owner_id = (select auth.uid()));

create policy "Versions follow their project's visibility" on public.project_versions for select
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and (p.status = 'published' or p.owner_id = (select auth.uid()))
  ));
create policy "Owners add versions" on public.project_versions for insert
  to authenticated with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "Owners edit versions" on public.project_versions for update
  to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "Owners delete versions" on public.project_versions for delete
  to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- After creating, the owner and the server-kept timestamps never change from the client.
revoke update on public.projects from anon, authenticated;
grant update (kind, name, slug, summary, readme, tags, license, langs, repo_url, paper_url, demo_url, status) on public.projects to authenticated;
revoke update on public.project_versions from anon, authenticated;
grant update (version, notes, released_on) on public.project_versions to authenticated;

revoke execute on function public.project_rules() from public, anon, authenticated;
revoke execute on function public.project_rate_limit() from public, anon, authenticated;

-- Likes, saves and replies for projects the caller may see. Bookmarks are private, so only their count leaves here.
create function public.project_stats(project_ids uuid[])
returns table (project_id uuid, likes bigint, saves bigint, replies bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,
    (select count(*) from public.likes l where l.target = 'project:' || p.id::text),
    (select count(*) from public.bookmarks b where b.target = 'project:' || p.id::text),
    (select count(*) from public.answers a where a.sample_thread = 'project-' || p.id::text)
  from public.projects p
  where p.id = any (project_ids[1:200])
    and (p.status = 'published' or p.owner_id = (select auth.uid()));
$$;

revoke execute on function public.project_stats(uuid[]) from public;
grant execute on function public.project_stats(uuid[]) to anon, authenticated;

-- ─── Notifications ──────────────────────────────────────────────────────────────────────────────────────────

-- Same as before, but a member who switched a kind off in settings no longer receives it.
create or replace function public.notify(recipient uuid, what text, actor uuid, about text, excerpt text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if recipient is null or recipient = actor then
    return;
  end if;
  if exists (select 1 from public.profiles p where p.id = recipient and p.notify_prefs -> what = 'false'::jsonb) then
    return;
  end if;
  if what in ('like', 'follow') and exists (
    select 1 from public.notifications n
    where n.user_id = recipient and n.kind = what and n.actor_id is not distinct from actor
      and n.target is not distinct from about and n.read_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, target, snippet)
  values (recipient, what, actor, about, left(nullif(trim(excerpt), ''), 200));
end;
$$;

-- Replies to a member's question tell the asker; replies under a project ("project-<uuid>") tell its owner.
create or replace function public.notify_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if new.question_id is not null then
    perform public.notify(
      (select q.author_id from public.questions q where q.id = new.question_id),
      'reply', new.author_id, 'thread:' || new.question_id::text, new.body
    );
  elsif new.sample_thread ~ '^project-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    pid := substr(new.sample_thread, 9)::uuid;
    perform public.notify(
      (select p.owner_id from public.projects p where p.id = pid and p.status = 'published'),
      'reply', new.author_id, 'project:' || pid::text, new.body
    );
  end if;
  return new;
end;
$$;

-- Upvotes on a member's question tell the asker; likes on a published project tell its owner.
create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  qid uuid;
  owner uuid;
  title text;
begin
  if new.target ~ '^thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    qid := substr(new.target, 8)::uuid;
    select q.author_id, q.title into owner, title from public.questions q where q.id = qid;
    perform public.notify(owner, 'like', new.user_id, new.target, title);
  elsif new.target ~ '^project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    qid := substr(new.target, 9)::uuid;
    select p.owner_id, p.name into owner, title from public.projects p where p.id = qid and p.status = 'published';
    perform public.notify(owner, 'like', new.user_id, new.target, title);
  end if;
  return new;
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_answer() from public, anon, authenticated;
revoke execute on function public.notify_like() from public, anon, authenticated;

-- ─── Avatars ────────────────────────────────────────────────────────────────────────────────────────────────

-- Public bucket: pictures load by URL without a policy. Members manage files only inside "<their uuid>/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Members see their own avatar files" on storage.objects for select
  to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members upload avatars to their own folder" on storage.objects for insert
  to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members replace their own avatar files" on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members delete their own avatar files" on storage.objects for delete
  to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
