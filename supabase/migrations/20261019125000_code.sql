-- Nexverse Code: git-like repositories on Postgres and Storage, without a git binary.
--
-- How it is stored
--   * Blobs are content-addressed: a file's bytes live once per storing repository in the private "code" bucket
--     at "<store repo uuid>/<sha256 hex>". public.code_blobs says "repository R contains blob S, stored under
--     repository T's folder". A fork gets rows pointing at its source's folder, so forking copies no bytes, and the
--     fork keeps working even if the source later goes private (access follows the row, not the folder).
--   * A commit is a full snapshot: tree jsonb {"path": {"sha", "size", "mode"}} plus parents and a message. Its id
--     is the sha256 of its canonical content, computed here (never trusted from the browser).
--   * Refs (branches and tags) point at commits. They only move through code_commit / code_merge_pull, which lock
--     the ref row and refuse to move it unless the caller saw the current head: no lost updates.
--   * Issues and pull requests share one number sequence per repository, like GitHub.
--
-- Who may do what (row level security, checked here for every write)
--   * Public repositories are readable by everyone, private ones by their owner, collaborators and staff.
--   * Creating a repository needs has_cap('repo.create'); opening issues and pull requests needs
--     has_cap('issue.create'); comments need has_cap('reply.create').
--   * Writes to code need the owner or a collaborator with the write or admin role; settings need owner or admin.
--   * Staff can hide a repository, issue, pull request or comment (logged in the moderation log).
--   * Deleting a repository is a soft delete through code_delete_repo; the name becomes free again.

-- ─── Helpers that need no tables ────────────────────────────────────────────────────────────────────────────

-- A branch or tag name: git's rules, simplified.
create or replace function public.code_valid_ref(name text) returns boolean
language sql immutable set search_path = public as $$
  select name is not null
    and char_length(name) between 1 and 100
    and name ~ '^[A-Za-z0-9._/-]+$'
    and name !~ '(^[./-]|[/.]$|\.\.|//|@\{|\.lock$|/\.)'
$$;

-- A file path inside a repository: relative, no empty, "." or ".." segments, no control characters or backslashes.
create or replace function public.code_valid_path(p text) returns boolean
language sql immutable set search_path = public as $$
  select p is not null
    and char_length(p) between 1 and 400
    and p !~ '[[:cntrl:]\\]'
    and p !~ '(^/|/$|//)'
    and p !~ '(^|/)\.{1,2}(/|$)'
$$;

-- ─── Tables ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.code_repos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9._-]{0,99}$' and slug !~ '\.(git|atom)$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 350),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  default_branch text not null default 'main' check (public.code_valid_ref(default_branch)),
  topics text[] not null default '{}' check (
    cardinality(topics) <= 20
    and (cardinality(topics) = 0 or array_to_string(topics, ' ') ~ '^[a-z0-9][a-z0-9-]{0,34}( [a-z0-9][a-z0-9-]{0,34})*$')
  ),
  license text check (license is null or license ~ '^[A-Za-z0-9.+-]{1,40}$'),
  homepage text check (homepage is null or (char_length(homepage) <= 300 and homepage ~ '^https?://[^\s<>"]+$')),
  -- The README of the default branch, kept by the browser after each commit, for search and AI summaries.
  readme text not null default '' check (char_length(readme) <= 100000),
  -- Nexverse items this repository is about: "project:<uuid>", "share:<uuid>" (hub models, datasets, tools),
  -- "thread:<uuid>" (its forum discussion), "launch:<uuid>".
  links text[] not null default '{}' check (
    cardinality(links) <= 12
    and (cardinality(links) = 0 or array_to_string(links, ' ') ~ '^(project|share|thread|launch):[0-9a-f-]{36}( (project|share|thread|launch):[0-9a-f-]{36})*$')
  ),
  forked_from uuid references public.code_repos (id) on delete set null,
  stars_count integer not null default 0,
  forks_count integer not null default 0,
  watchers_count integer not null default 0,
  open_issues_count integer not null default 0,
  open_pulls_count integer not null default 0,
  next_number integer not null default 1,
  -- Sum of the sizes of blobs stored in this repository's own folder.
  stored_bytes bigint not null default 0,
  pushed_at timestamptz,
  archived_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 300),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists code_repos_owner_slug_key on public.code_repos (owner_id, slug) where deleted_at is null;
create index if not exists code_repos_public_idx on public.code_repos (visibility, pushed_at desc nulls last) where deleted_at is null;
create index if not exists code_repos_stars_idx on public.code_repos (stars_count desc) where deleted_at is null;
create index if not exists code_repos_topics_idx on public.code_repos using gin (topics);
create index if not exists code_repos_forked_idx on public.code_repos (forked_from);

create table if not exists public.code_collaborators (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'write' check (role in ('read', 'write', 'admin')),
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (repo_id, member_id)
);
create index if not exists code_collaborators_member_idx on public.code_collaborators (member_id);

-- ─── Permission helpers ─────────────────────────────────────────────────────────────────────────────────────

-- 'owner' | 'admin' | 'write' | 'read' | null for the signed-in member.
create or replace function public.code_role(repo uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when r.owner_id = (select auth.uid()) then 'owner'
    else (select c.role from public.code_collaborators c where c.repo_id = r.id and c.member_id = (select auth.uid()))
  end
  from public.code_repos r
  where r.id = repo and r.deleted_at is null
$$;

create or replace function public.code_can_read(repo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.code_repos r
    where r.id = repo and r.deleted_at is null
      and (
        (r.visibility = 'public' and r.hidden_at is null)
        or r.owner_id = (select auth.uid())
        or exists (select 1 from public.code_collaborators c where c.repo_id = r.id and c.member_id = (select auth.uid()))
        or public.is_staff()
      )
  )
$$;

create or replace function public.code_can_write(repo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_suspended()
    and coalesce(public.code_role(repo) in ('owner', 'admin', 'write'), false)
    and exists (select 1 from public.code_repos r where r.id = repo and r.archived_at is null and r.hidden_at is null and r.deleted_at is null)
$$;

create or replace function public.code_can_admin(repo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_suspended() and coalesce(public.code_role(repo) in ('owner', 'admin'), false)
$$;

grant execute on function public.code_valid_ref(text), public.code_valid_path(text), public.code_role(uuid),
  public.code_can_read(uuid), public.code_can_write(uuid), public.code_can_admin(uuid) to anon, authenticated;

-- ─── Content tables ─────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.code_blobs (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size >= 0),
  -- The repository whose folder holds the bytes: itself, or the source it was forked from.
  store_repo uuid not null references public.code_repos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (repo_id, sha)
);
create index if not exists code_blobs_store_idx on public.code_blobs (store_repo, sha);

create table if not exists public.code_commits (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{64}$'),
  parents text[] not null default '{}' check (cardinality(parents) <= 2),
  tree jsonb not null,
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  author_id uuid references public.profiles (id) on delete set null,
  -- The author's display name when the commit was made (kept if the account goes away).
  author_name text not null default '' check (char_length(author_name) <= 100),
  -- {"added": n, "modified": n, "removed": n} against the first parent.
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (repo_id, id)
);
create index if not exists code_commits_recent_idx on public.code_commits (repo_id, created_at desc);

create table if not exists public.code_refs (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  kind text not null check (kind in ('branch', 'tag')),
  name text not null check (public.code_valid_ref(name)),
  commit_id text not null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (repo_id, kind, name),
  foreign key (repo_id, commit_id) references public.code_commits (repo_id, id)
);

create table if not exists public.code_releases (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  tag text not null check (public.code_valid_ref(tag)),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  notes text not null default '' check (char_length(notes) <= 20000),
  -- [{"name": "model.onnx", "sha": "<blob sha>", "size": 123, "type": "application/octet-stream"}]
  assets jsonb not null default '[]' check (jsonb_typeof(assets) = 'array' and jsonb_array_length(assets) <= 20),
  prerelease boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, tag)
);

create table if not exists public.code_stars (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  member_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (repo_id, member_id)
);
create index if not exists code_stars_member_idx on public.code_stars (member_id, created_at desc);
create index if not exists code_stars_recent_idx on public.code_stars (created_at desc);

create table if not exists public.code_watchers (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  member_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (repo_id, member_id)
);

create table if not exists public.code_labels (
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name !~ '[[:cntrl:],]'),
  color text not null default '8fb4ff' check (color ~ '^[0-9a-f]{6}$'),
  description text not null default '' check (char_length(description) <= 140),
  primary key (repo_id, name)
);

create table if not exists public.code_issues (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  number integer not null default 0,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 30000),
  state text not null default 'open' check (state in ('open', 'closed')),
  labels text[] not null default '{}' check (cardinality(labels) <= 10),
  assignees uuid[] not null default '{}' check (cardinality(assignees) <= 10),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  comments_count integer not null default 0,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, number)
);
create index if not exists code_issues_list_idx on public.code_issues (repo_id, state, created_at desc);

create table if not exists public.code_issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.code_issues (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists code_issue_comments_idx on public.code_issue_comments (issue_id, created_at);

create table if not exists public.code_pulls (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  number integer not null default 0,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 30000),
  state text not null default 'open' check (state in ('open', 'merged', 'closed')),
  from_repo uuid not null references public.code_repos (id) on delete cascade,
  from_branch text not null check (public.code_valid_ref(from_branch)),
  to_branch text not null check (public.code_valid_ref(to_branch)),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  comments_count integer not null default 0,
  -- Filled when merged: the target branch before the merge, the source head that was merged and the commit
  -- the target branch moved to.
  base_commit text,
  head_commit text,
  merge_commit text,
  merged_by uuid references public.profiles (id) on delete set null,
  merged_at timestamptz,
  closed_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo_id, number)
);
create index if not exists code_pulls_list_idx on public.code_pulls (repo_id, state, created_at desc);

create table if not exists public.code_pull_comments (
  id uuid primary key default gen_random_uuid(),
  pull_id uuid not null references public.code_pulls (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  -- A review comment sits on one line of the diff: the file, the line number and which side.
  path text check (path is null or public.code_valid_path(path)),
  line integer check (line is null or line > 0),
  side text check (side is null or side in ('old', 'new')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((path is null) = (line is null) and (line is null) = (side is null))
);
create index if not exists code_pull_comments_idx on public.code_pull_comments (pull_id, created_at);

create table if not exists public.code_activity (
  id bigint generated always as identity primary key,
  repo_id uuid not null references public.code_repos (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('create', 'commit', 'branch', 'tag', 'release', 'issue', 'issue_closed', 'issue_reopened', 'pull', 'pull_merged', 'pull_closed', 'fork', 'archive', 'visibility', 'import')),
  -- A short line ("Fix the tokenizer") and where it points inside the repository ("commit/<sha>", "issues/4").
  title text not null default '' check (char_length(title) <= 200),
  ref text not null default '' check (char_length(ref) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists code_activity_repo_idx on public.code_activity (repo_id, created_at desc);
create index if not exists code_activity_recent_idx on public.code_activity (created_at desc);

-- ─── Row level security ─────────────────────────────────────────────────────────────────────────────────────

alter table public.code_repos enable row level security;
alter table public.code_collaborators enable row level security;
alter table public.code_blobs enable row level security;
alter table public.code_commits enable row level security;
alter table public.code_refs enable row level security;
alter table public.code_releases enable row level security;
alter table public.code_stars enable row level security;
alter table public.code_watchers enable row level security;
alter table public.code_labels enable row level security;
alter table public.code_issues enable row level security;
alter table public.code_issue_comments enable row level security;
alter table public.code_pulls enable row level security;
alter table public.code_pull_comments enable row level security;
alter table public.code_activity enable row level security;

-- Repositories
-- The owner test is inline as well: a function cannot see a row the same statement just inserted (insert ... returning).
create policy "Readable repositories" on public.code_repos for select to anon, authenticated
  using ((owner_id = (select auth.uid()) and deleted_at is null) or public.code_can_read(id));
create policy "Members with the capability create repositories" on public.code_repos for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and public.has_cap('repo.create') and not public.is_suspended()
    and forked_from is null and hidden_at is null and deleted_at is null and archived_at is null
  );
create policy "Writers update repositories" on public.code_repos for update to authenticated
  using (coalesce(public.code_role(id) in ('owner', 'admin', 'write'), false) and not public.is_suspended())
  with check (coalesce(public.code_role(id) in ('owner', 'admin', 'write'), false));
revoke update, delete on public.code_repos from anon, authenticated;
grant update (name, slug, description, visibility, default_branch, topics, license, homepage, readme, links, archived_at)
  on public.code_repos to authenticated;
revoke insert on public.code_repos from anon;

-- Collaborators: visible to everyone who can read the repository; managed by its owner and admins.
create policy "Collaborators of readable repositories" on public.code_collaborators for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Admins add collaborators" on public.code_collaborators for insert to authenticated
  with check (public.code_can_admin(repo_id) and member_id <> (select r.owner_id from public.code_repos r where r.id = repo_id));
create policy "Admins change collaborator roles" on public.code_collaborators for update to authenticated
  using (public.code_can_admin(repo_id)) with check (public.code_can_admin(repo_id));
create policy "Admins remove collaborators, members leave" on public.code_collaborators for delete to authenticated
  using (public.code_can_admin(repo_id) or member_id = (select auth.uid()));
revoke update on public.code_collaborators from authenticated;
grant update (role) on public.code_collaborators to authenticated;
revoke insert, update, delete on public.code_collaborators from anon;

-- Blobs, commits: read with the repository; written only by the functions below.
create policy "Blobs of readable repositories" on public.code_blobs for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Commits of readable repositories" on public.code_commits for select to anon, authenticated
  using (public.code_can_read(repo_id));
revoke insert, update, delete on public.code_blobs, public.code_commits from anon, authenticated;

-- Refs: writers create branches and tags at existing commits; moving and deleting go through functions.
create policy "Refs of readable repositories" on public.code_refs for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Writers create branches and tags" on public.code_refs for insert to authenticated
  with check (public.code_can_write(repo_id) and created_by = (select auth.uid()));
revoke update, delete on public.code_refs from anon, authenticated;
revoke insert on public.code_refs from anon;

-- Releases
create policy "Releases of readable repositories" on public.code_releases for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Writers publish releases" on public.code_releases for insert to authenticated
  with check (public.code_can_write(repo_id) and author_id = (select auth.uid()));
create policy "Writers edit releases" on public.code_releases for update to authenticated
  using (public.code_can_write(repo_id)) with check (public.code_can_write(repo_id));
create policy "Writers delete releases" on public.code_releases for delete to authenticated
  using (public.code_can_write(repo_id));
revoke update on public.code_releases from authenticated;
grant update (title, notes, assets, prerelease) on public.code_releases to authenticated;
revoke insert, update, delete on public.code_releases from anon;

-- Stars and watchers: your own, on repositories you can read.
create policy "Stars of readable repositories" on public.code_stars for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Members star readable repositories" on public.code_stars for insert to authenticated
  with check (member_id = (select auth.uid()) and public.code_can_read(repo_id) and not public.is_suspended());
create policy "Members unstar" on public.code_stars for delete to authenticated using (member_id = (select auth.uid()));
create policy "Watchers of readable repositories" on public.code_watchers for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Members watch readable repositories" on public.code_watchers for insert to authenticated
  with check (member_id = (select auth.uid()) and public.code_can_read(repo_id));
create policy "Members unwatch" on public.code_watchers for delete to authenticated using (member_id = (select auth.uid()));
revoke update on public.code_stars, public.code_watchers from anon, authenticated;
revoke insert, delete on public.code_stars, public.code_watchers from anon;

-- Labels
create policy "Labels of readable repositories" on public.code_labels for select to anon, authenticated
  using (public.code_can_read(repo_id));
create policy "Writers manage labels" on public.code_labels for all to authenticated
  using (public.code_can_write(repo_id)) with check (public.code_can_write(repo_id));
revoke insert, update, delete on public.code_labels from anon;

-- Issues: anyone with the capability opens them on a readable, unarchived repository. Authors edit their text
-- and close or reopen; writers also label, assign, close and reopen (the trigger below enforces which fields).
create policy "Issues of readable repositories" on public.code_issues for select to anon, authenticated
  using (public.code_can_read(repo_id) and (hidden_at is null or author_id = (select auth.uid()) or public.is_staff()));
create policy "Members open issues" on public.code_issues for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.has_cap('issue.create') and not public.is_suspended()
    and public.code_can_read(repo_id) and state = 'open' and hidden_at is null
    and exists (select 1 from public.code_repos r where r.id = repo_id and r.archived_at is null)
  );
create policy "Authors and writers update issues" on public.code_issues for update to authenticated
  using ((author_id = (select auth.uid()) or public.code_can_write(repo_id)) and not public.is_suspended())
  with check (author_id = (select auth.uid()) or public.code_can_write(repo_id));
revoke update, delete on public.code_issues from anon, authenticated;
grant update (title, body, state, labels, assignees) on public.code_issues to authenticated;
revoke insert on public.code_issues from anon;

create policy "Comments on readable issues" on public.code_issue_comments for select to anon, authenticated
  using (
    exists (select 1 from public.code_issues i where i.id = issue_id and public.code_can_read(i.repo_id))
    and (hidden_at is null or author_id = (select auth.uid()) or public.is_staff())
  );
create policy "Members comment on issues" on public.code_issue_comments for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.has_cap('reply.create') and not public.is_suspended() and hidden_at is null
    and exists (select 1 from public.code_issues i join public.code_repos r on r.id = i.repo_id
                where i.id = issue_id and public.code_can_read(i.repo_id) and r.archived_at is null)
  );
create policy "Authors edit their issue comments" on public.code_issue_comments for update to authenticated
  using (author_id = (select auth.uid()) and not public.is_suspended()) with check (author_id = (select auth.uid()));
create policy "Authors and writers delete issue comments" on public.code_issue_comments for delete to authenticated
  using (author_id = (select auth.uid()) or exists (select 1 from public.code_issues i where i.id = issue_id and public.code_can_write(i.repo_id)));
revoke update on public.code_issue_comments from authenticated;
grant update (body) on public.code_issue_comments to authenticated;
revoke insert, update, delete on public.code_issue_comments from anon;

-- Pull requests: from a branch of the same repository or of a direct fork, both readable by the author.
create policy "Pull requests of readable repositories" on public.code_pulls for select to anon, authenticated
  using (public.code_can_read(repo_id) and (hidden_at is null or author_id = (select auth.uid()) or public.is_staff()));
create policy "Members open pull requests" on public.code_pulls for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.has_cap('issue.create') and not public.is_suspended()
    and state = 'open' and hidden_at is null and merge_commit is null and head_commit is null and base_commit is null and merged_by is null
    and public.code_can_read(repo_id) and public.code_can_read(from_repo)
    and (from_repo = repo_id or exists (select 1 from public.code_repos f where f.id = from_repo and f.forked_from = repo_id))
    and exists (select 1 from public.code_repos r where r.id = repo_id and r.archived_at is null)
  );
create policy "Authors and writers update pull requests" on public.code_pulls for update to authenticated
  using ((author_id = (select auth.uid()) or public.code_can_write(repo_id)) and not public.is_suspended())
  with check (author_id = (select auth.uid()) or public.code_can_write(repo_id));
revoke update, delete on public.code_pulls from anon, authenticated;
grant update (title, body, state) on public.code_pulls to authenticated;
revoke insert on public.code_pulls from anon;

create policy "Comments on readable pull requests" on public.code_pull_comments for select to anon, authenticated
  using (
    exists (select 1 from public.code_pulls p where p.id = pull_id and public.code_can_read(p.repo_id))
    and (hidden_at is null or author_id = (select auth.uid()) or public.is_staff())
  );
create policy "Members comment on pull requests" on public.code_pull_comments for insert to authenticated
  with check (
    author_id = (select auth.uid()) and public.has_cap('reply.create') and not public.is_suspended() and hidden_at is null
    and exists (select 1 from public.code_pulls p join public.code_repos r on r.id = p.repo_id
                where p.id = pull_id and public.code_can_read(p.repo_id) and r.archived_at is null)
  );
create policy "Authors edit their review comments" on public.code_pull_comments for update to authenticated
  using (author_id = (select auth.uid()) and not public.is_suspended()) with check (author_id = (select auth.uid()));
create policy "Authors and writers delete review comments" on public.code_pull_comments for delete to authenticated
  using (author_id = (select auth.uid()) or exists (select 1 from public.code_pulls p where p.id = pull_id and public.code_can_write(p.repo_id)));
revoke update on public.code_pull_comments from authenticated;
grant update (body) on public.code_pull_comments to authenticated;
revoke insert, update, delete on public.code_pull_comments from anon;

-- Activity: written by triggers and functions only.
create policy "Activity of readable repositories" on public.code_activity for select to anon, authenticated
  using (public.code_can_read(repo_id));
revoke insert, update, delete on public.code_activity from anon, authenticated;

-- ─── Internal helpers (not callable by members) ─────────────────────────────────────────────────────────────

create or replace function public.code__log(repo uuid, what text, line text, at_ref text) returns void
language sql security definer set search_path = public as $$
  insert into public.code_activity (repo_id, actor_id, kind, title, ref)
  values (repo, (select auth.uid()), what, left(coalesce(line, ''), 200), left(coalesce(at_ref, ''), 300))
$$;

-- "owner-handle/slug" for notification snippets.
create or replace function public.code__full_name(repo uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(p.handle, p.name, 'member') || '/' || r.slug
  from public.code_repos r join public.profiles p on p.id = r.owner_id where r.id = repo
$$;

-- Checks a tree and returns {"added","modified","removed"} against `base` (may be null). Raises on any problem.
create or replace function public.code__check_tree(repo uuid, tree jsonb, base jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n integer;
  bad text;
  stats jsonb;
begin
  if tree is null or jsonb_typeof(tree) <> 'object' then
    raise exception 'The file tree must be an object.';
  end if;
  select count(*) into n from jsonb_object_keys(tree);
  if n > 5000 then
    raise exception 'A commit can hold at most 5000 files.';
  end if;

  select k into bad from jsonb_each(tree) as e(k, v)
  where not public.code_valid_path(k)
     or jsonb_typeof(v) <> 'object'
     or coalesce(v ->> 'sha', '') !~ '^[0-9a-f]{64}$'
     or coalesce(v ->> 'mode', '') not in ('100644', '100755')
     or coalesce(jsonb_typeof(v -> 'size'), '') <> 'number'
  limit 1;
  if bad is not null then
    raise exception 'Invalid file entry: %', left(bad, 200);
  end if;

  -- Every blob must belong to this repository, with the size it was stored with.
  select e.k into bad from jsonb_each(tree) as e(k, v)
  left join public.code_blobs b on b.repo_id = repo and b.sha = e.v ->> 'sha'
  where b.sha is null or b.size <> (e.v ->> 'size')::bigint
  limit 1;
  if bad is not null then
    raise exception 'File content was not uploaded: %', left(bad, 200);
  end if;

  -- A path cannot be both a file and a folder ("a" and "a/b").
  select p.prefix into bad
  from (
    select distinct array_to_string((string_to_array(k, '/'))[1:i], '/') as prefix
    from jsonb_object_keys(tree) as k, generate_series(1, greatest(array_length(string_to_array(k, '/'), 1) - 1, 0)) as i
  ) p
  where tree ? p.prefix
  limit 1;
  if bad is not null then
    raise exception '"%" cannot be both a file and a folder.', left(bad, 200);
  end if;

  select jsonb_build_object(
    'added', count(*) filter (where o.v is null),
    'modified', count(*) filter (where o.v is not null and o.v ->> 'sha' is distinct from t.v ->> 'sha'),
    'removed', (select count(*) from jsonb_object_keys(coalesce(base, '{}'::jsonb)) as bk where not tree ? bk)
  ) into stats
  from jsonb_each(tree) as t(k, v)
  left join jsonb_each(coalesce(base, '{}'::jsonb)) as o(k, v) on o.k = t.k;
  return stats;
end;
$$;

-- Writes a commit row and returns its id. Callers have already checked permission and locked the ref.
create or replace function public.code__make_commit(repo uuid, parent_ids text[], tree jsonb, message text, stats jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  at timestamptz := clock_timestamp();
  who text;
  cid text;
begin
  select coalesce(nullif(p.handle, ''), p.name, 'member') into who from public.profiles p where p.id = me;
  cid := encode(sha256(convert_to(jsonb_build_object(
    'parents', to_jsonb(parent_ids), 'tree', tree, 'message', message, 'author', me, 'at', at
  )::text, 'UTF8')), 'hex');
  insert into public.code_commits (repo_id, id, parents, tree, message, author_id, author_name, stats, created_at)
  values (repo, cid, parent_ids, tree, btrim(message), me, left(coalesce(who, ''), 100), coalesce(stats, '{}'), at)
  on conflict do nothing;
  update public.code_repos set pushed_at = at where id = repo;
  return cid;
end;
$$;

-- Is `ancestor` reachable from `descendant` through parents (or the same commit)?
create or replace function public.code__is_ancestor(repo uuid, ancestor text, descendant text) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive walk(id, depth) as (
    select descendant, 0
    union
    select unnest(c.parents), w.depth + 1
    from walk w join public.code_commits c on c.repo_id = repo and c.id = w.id
    where w.depth < 100000
  )
  select exists (select 1 from walk where id = ancestor)
$$;

revoke execute on function public.code__log(uuid, text, text, text), public.code__full_name(uuid),
  public.code__check_tree(uuid, jsonb, jsonb), public.code__make_commit(uuid, text[], jsonb, text, jsonb),
  public.code__is_ancestor(uuid, text, text) from public, anon, authenticated;

-- ─── Triggers ───────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.code_repo_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  role text;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.code_repos r where r.owner_id = new.owner_id and r.created_at > now() - interval '1 day') >= 20 then
      raise exception 'You created 20 repositories today. Try again tomorrow.';
    end if;
    new.name := btrim(new.name);
    new.created_at := now();
    new.updated_at := now();
    new.stars_count := 0; new.forks_count := 0; new.watchers_count := 0;
    new.open_issues_count := 0; new.open_pulls_count := 0; new.next_number := 1; new.stored_bytes := 0;
    new.pushed_at := null;
    return new;
  end if;

  -- Counters and timestamps changed by the functions below: nothing members can edit moved.
  if (new.name, new.slug, new.description, new.visibility, new.default_branch, new.topics, new.license, new.homepage, new.readme, new.links, new.archived_at)
     is not distinct from
     (old.name, old.slug, old.description, old.visibility, old.default_branch, old.topics, old.license, old.homepage, old.readme, old.links, old.archived_at) then
    return new;
  end if;

  role := public.code_role(new.id);
  if (new.name, new.slug, new.description, new.visibility, new.default_branch, new.topics, new.license, new.homepage, new.links, new.archived_at)
     is distinct from
     (old.name, old.slug, old.description, old.visibility, old.default_branch, old.topics, old.license, old.homepage, old.links, old.archived_at)
     and coalesce(role not in ('owner', 'admin'), true) then
    raise exception 'Only the owner and admins of this repository change its settings.';
  end if;
  if old.archived_at is not null and new.archived_at is not null and new.readme is distinct from old.readme then
    raise exception 'This repository is archived.';
  end if;
  if new.default_branch is distinct from old.default_branch
     and exists (select 1 from public.code_refs f where f.repo_id = new.id)
     and not exists (select 1 from public.code_refs f where f.repo_id = new.id and f.kind = 'branch' and f.name = new.default_branch) then
    raise exception 'There is no branch called %.', new.default_branch;
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  if new.visibility is distinct from old.visibility then
    perform public.code__log(new.id, 'visibility', 'Made ' || new.visibility, '');
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform public.code__log(new.id, 'archive', case when new.archived_at is null then 'Unarchived' else 'Archived' end, '');
  end if;
  return new;
end;
$$;

create or replace trigger code_repo_rules before insert or update on public.code_repos
  for each row execute function public.code_repo_rules();

create or replace function public.code_repo_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.code_watchers (repo_id, member_id) values (new.id, new.owner_id) on conflict do nothing;
  insert into public.code_labels (repo_id, name, color, description) values
    (new.id, 'bug', 'ff7a70', 'Something is not working'),
    (new.id, 'enhancement', '8fb4ff', 'A new feature or an improvement'),
    (new.id, 'documentation', 'd8c59e', 'Docs, examples and READMEs'),
    (new.id, 'question', 'd3b4ff', 'Needs an answer, not a change'),
    (new.id, 'good first issue', '7fe0b0', 'A good place to start contributing')
  on conflict do nothing;
  if new.forked_from is not null then
    update public.code_repos set forks_count = forks_count + 1 where id = new.forked_from;
  end if;
  perform public.code__log(new.id, case when new.forked_from is null then 'create' else 'fork' end, 'Created ' || new.name, '');
  return new;
end;
$$;

create or replace trigger code_repo_created after insert on public.code_repos
  for each row execute function public.code_repo_created();

create or replace function public.code_count_stars() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.code_repos set stars_count = stars_count + 1 where id = new.repo_id;
  else
    update public.code_repos set stars_count = greatest(stars_count - 1, 0) where id = old.repo_id;
  end if;
  return null;
end;
$$;
create or replace trigger code_count_stars after insert or delete on public.code_stars
  for each row execute function public.code_count_stars();

create or replace function public.code_count_watchers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.code_repos set watchers_count = watchers_count + 1 where id = new.repo_id;
  else
    update public.code_repos set watchers_count = greatest(watchers_count - 1, 0) where id = old.repo_id;
  end if;
  return null;
end;
$$;
create or replace trigger code_count_watchers after insert or delete on public.code_watchers
  for each row execute function public.code_count_watchers();

create or replace function public.code_ref_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.updated_at := now();
  -- A tag never moves; a branch only moves through code_commit / code_merge_pull.
  if coalesce(current_setting('code.quiet_refs', true), '') = 'on' then
    return new;
  end if;
  perform public.code__log(new.repo_id, new.kind, new.name, case when new.kind = 'tag' then 'tags' else 'tree/' || new.name end);
  return new;
end;
$$;
create or replace trigger code_ref_created before insert on public.code_refs
  for each row execute function public.code_ref_created();

create or replace function public.code_release_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
begin
  if tg_op = 'INSERT' and not exists (select 1 from public.code_refs f where f.repo_id = new.repo_id and f.kind = 'tag' and f.name = new.tag) then
    raise exception 'Create the tag % first.', new.tag;
  end if;
  for a in select * from jsonb_array_elements(new.assets) loop
    if coalesce(a ->> 'name', '') !~ '^[A-Za-z0-9._ +()-]{1,120}$'
       or coalesce(a ->> 'sha', '') !~ '^[0-9a-f]{64}$'
       or coalesce(a ->> 'type', '') !~ '^[a-z0-9.+-]+/[A-Za-z0-9.+-]+$'
       or not exists (select 1 from public.code_blobs b where b.repo_id = new.repo_id and b.sha = a ->> 'sha' and b.size = (a ->> 'size')::bigint) then
      raise exception 'Upload each release file before attaching it.';
    end if;
  end loop;
  new.title := btrim(new.title);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    perform public.code__log(new.repo_id, 'release', new.title, 'releases');
  end if;
  return new;
end;
$$;
create or replace trigger code_release_rules before insert or update on public.code_releases
  for each row execute function public.code_release_rules();

-- Issues and pull requests share the repository's number sequence.
create or replace function public.code_next_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.code_repos set next_number = next_number + 1 where id = new.repo_id returning next_number - 1 into new.number;
  new.created_at := now();
  new.updated_at := now();
  new.comments_count := 0;
  return new;
end;
$$;
create or replace trigger code_issue_number before insert on public.code_issues
  for each row execute function public.code_next_number();
create or replace trigger code_pull_number before insert on public.code_pulls
  for each row execute function public.code_next_number();

create or replace function public.code_issue_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  writer boolean := public.code_can_write(new.repo_id);
  label text;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.code_issues i where i.author_id = new.author_id and i.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'You opened 20 issues in the last hour. Try again later.';
    end if;
    if not writer then
      new.labels := '{}';
      new.assignees := '{}';
    end if;
    new.closed_at := null;
    new.closed_by := null;
  else
    if not writer and (new.labels is distinct from old.labels or new.assignees is distinct from old.assignees) then
      raise exception 'Only people who can write to this repository label and assign issues.';
    end if;
    if new.author_id <> (select auth.uid()) and not writer and (new.title, new.body) is distinct from (old.title, old.body) then
      raise exception 'Only the author edits an issue.';
    end if;
    if new.state is distinct from old.state then
      new.closed_at := case when new.state = 'closed' then now() end;
      new.closed_by := case when new.state = 'closed' then (select auth.uid()) end;
      perform public.code__log(new.repo_id, case when new.state = 'closed' then 'issue_closed' else 'issue_reopened' end, new.title, 'issues/' || new.number);
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'UPDATE' and new.labels is not distinct from old.labels and new.assignees is not distinct from old.assignees then
    new.title := btrim(new.title);
    return new;
  end if;
  foreach label in array new.labels loop
    if not exists (select 1 from public.code_labels l where l.repo_id = new.repo_id and l.name = label) then
      raise exception 'There is no label called %.', label;
    end if;
  end loop;
  if exists (
    select 1 from unnest(new.assignees) a
    where a <> (select r.owner_id from public.code_repos r where r.id = new.repo_id)
      and not exists (select 1 from public.code_collaborators c where c.repo_id = new.repo_id and c.member_id = a)
  ) then
    raise exception 'Only the owner and collaborators can be assigned.';
  end if;
  new.title := btrim(new.title);
  return new;
end;
$$;
create or replace trigger code_issue_rules before insert or update on public.code_issues
  for each row execute function public.code_issue_rules();

create or replace function public.code_issue_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.code_repos set open_issues_count = open_issues_count + 1 where id = new.repo_id returning owner_id into owner;
    perform public.code__log(new.repo_id, 'issue', new.title, 'issues/' || new.number);
    perform public.notify(owner, 'system', new.author_id, 'codeissue:' || new.id, 'New issue in ' || public.code__full_name(new.repo_id) || ': ' || new.title);
  elsif new.state is distinct from old.state then
    update public.code_repos
    set open_issues_count = greatest(open_issues_count + case when new.state = 'open' then 1 else -1 end, 0)
    where id = new.repo_id;
  end if;
  return null;
end;
$$;
create or replace trigger code_issue_changed after insert or update on public.code_issues
  for each row execute function public.code_issue_changed();

create or replace function public.code_issue_comment_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i public.code_issues;
  owner uuid;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.code_issue_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 hour') >= 60 then
      raise exception 'You commented 60 times in the last hour. Try again later.';
    end if;
    new.created_at := now();
    select * into i from public.code_issues where id = new.issue_id;
    update public.code_issues set comments_count = comments_count + 1 where id = new.issue_id;
    select r.owner_id into owner from public.code_repos r where r.id = i.repo_id;
    perform public.notify(i.author_id, 'reply', new.author_id, 'codeissue:' || i.id, left(new.body, 140));
    if owner <> i.author_id then
      perform public.notify(owner, 'reply', new.author_id, 'codeissue:' || i.id, left(new.body, 140));
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger code_issue_comment_rules before insert or update on public.code_issue_comments
  for each row execute function public.code_issue_comment_rules();

create or replace function public.code_issue_comment_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.code_issues set comments_count = greatest(comments_count - 1, 0) where id = old.issue_id;
  return null;
end;
$$;
create or replace trigger code_issue_comment_gone after delete on public.code_issue_comments
  for each row execute function public.code_issue_comment_gone();

create or replace function public.code_pull_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  writer boolean := public.code_can_write(new.repo_id);
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.code_pulls p where p.author_id = new.author_id and p.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'You opened 20 pull requests in the last hour. Try again later.';
    end if;
    if not exists (select 1 from public.code_refs f where f.repo_id = new.from_repo and f.kind = 'branch' and f.name = new.from_branch)
       or not exists (select 1 from public.code_refs f where f.repo_id = new.repo_id and f.kind = 'branch' and f.name = new.to_branch) then
      raise exception 'Both branches must exist.';
    end if;
    if new.from_repo = new.repo_id and new.from_branch = new.to_branch then
      raise exception 'Pick two different branches.';
    end if;
    return new;
  end if;
  -- Merging only happens through code_merge_pull, which sets the merge fields itself.
  if new.state = 'merged' and old.state <> 'merged' and new.merge_commit is null then
    raise exception 'Use the merge button to merge.';
  end if;
  if old.state = 'merged' and new.state <> 'merged' then
    raise exception 'A merged pull request stays merged.';
  end if;
  if new.author_id <> (select auth.uid()) and not writer and (new.title, new.body) is distinct from (old.title, old.body) then
    raise exception 'Only the author edits a pull request.';
  end if;
  if new.state is distinct from old.state and new.state <> 'merged' then
    new.closed_at := case when new.state = 'closed' then now() end;
    perform public.code__log(new.repo_id, case when new.state = 'closed' then 'pull_closed' else 'pull' end, new.title, 'pulls/' || new.number);
  end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger code_pull_rules before insert or update on public.code_pulls
  for each row execute function public.code_pull_rules();

create or replace function public.code_pull_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.code_repos set open_pulls_count = open_pulls_count + 1 where id = new.repo_id returning owner_id into owner;
    perform public.code__log(new.repo_id, 'pull', new.title, 'pulls/' || new.number);
    perform public.notify(owner, 'system', new.author_id, 'codepull:' || new.id, 'New pull request in ' || public.code__full_name(new.repo_id) || ': ' || new.title);
  elsif (new.state = 'open') is distinct from (old.state = 'open') then
    update public.code_repos
    set open_pulls_count = greatest(open_pulls_count + case when new.state = 'open' then 1 else -1 end, 0)
    where id = new.repo_id;
  end if;
  return null;
end;
$$;
create or replace trigger code_pull_changed after insert or update on public.code_pulls
  for each row execute function public.code_pull_changed();

create or replace function public.code_pull_comment_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.code_pulls;
  owner uuid;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.code_pull_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 hour') >= 60 then
      raise exception 'You commented 60 times in the last hour. Try again later.';
    end if;
    new.created_at := now();
    select * into p from public.code_pulls where id = new.pull_id;
    update public.code_pulls set comments_count = comments_count + 1 where id = new.pull_id;
    select r.owner_id into owner from public.code_repos r where r.id = p.repo_id;
    perform public.notify(p.author_id, 'reply', new.author_id, 'codepull:' || p.id, left(new.body, 140));
    if owner <> p.author_id then
      perform public.notify(owner, 'reply', new.author_id, 'codepull:' || p.id, left(new.body, 140));
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger code_pull_comment_rules before insert or update on public.code_pull_comments
  for each row execute function public.code_pull_comment_rules();

create or replace function public.code_pull_comment_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.code_pulls set comments_count = greatest(comments_count - 1, 0) where id = old.pull_id;
  return null;
end;
$$;
create or replace trigger code_pull_comment_gone after delete on public.code_pull_comments
  for each row execute function public.code_pull_comment_gone();

create or replace function public.code_collaborator_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.member_id, 'system', (select auth.uid()), 'coderepo:' || new.repo_id,
    'You can now ' || case when new.role = 'read' then 'read' else 'push to' end || ' ' || public.code__full_name(new.repo_id));
  return null;
end;
$$;
create or replace trigger code_collaborator_added after insert on public.code_collaborators
  for each row execute function public.code_collaborator_added();

revoke execute on function public.code_repo_rules(), public.code_repo_created(), public.code_count_stars(), public.code_count_watchers(),
  public.code_ref_created(), public.code_release_rules(), public.code_next_number(), public.code_issue_rules(), public.code_issue_changed(),
  public.code_issue_comment_rules(), public.code_issue_comment_gone(), public.code_pull_rules(), public.code_pull_changed(),
  public.code_pull_comment_rules(), public.code_pull_comment_gone(), public.code_collaborator_added() from public, anon, authenticated;

-- ─── Functions members call ─────────────────────────────────────────────────────────────────────────────────

-- Per-repository and per-member storage limits, so the free storage tier is not filled by one account.
create or replace function public.code_limits() returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('repo_bytes', 104857600, 'member_bytes', 314572800, 'file_bytes', 26214400, 'files', 5000)
$$;
grant execute on function public.code_limits() to anon, authenticated;

-- After uploading blobs to "code/<repo>/<sha>", register them. Sizes come from Storage, not from the browser.
-- Returns the shas that are now usable in this repository.
create or replace function public.code_register_blobs(repo uuid, shas text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  added bigint;
  lim jsonb := public.code_limits();
begin
  if not public.code_can_write(repo) then
    raise exception 'You cannot write to this repository.';
  end if;
  if cardinality(shas) > 1000 then
    raise exception 'Register at most 1000 files at a time.';
  end if;
  select r.owner_id into owner from public.code_repos r where r.id = repo for update;

  with fresh as (
    select s.sha, (o.metadata ->> 'size')::bigint as size
    from (select distinct unnest(shas) as sha) s
    join storage.objects o on o.bucket_id = 'code' and o.name = repo::text || '/' || s.sha
    where s.sha ~ '^[0-9a-f]{64}$'
      and not exists (select 1 from public.code_blobs b where b.repo_id = repo and b.sha = s.sha)
  ), ins as (
    insert into public.code_blobs (repo_id, sha, size, store_repo)
    select repo, f.sha, coalesce(f.size, 0), repo from fresh f
    on conflict do nothing
    returning size
  )
  select coalesce(sum(size), 0) into added from ins;

  update public.code_repos set stored_bytes = stored_bytes + added where id = repo;
  if (select stored_bytes from public.code_repos where id = repo) > (lim ->> 'repo_bytes')::bigint then
    raise exception 'This repository is over its 100 MB storage limit.';
  end if;
  if (select coalesce(sum(r.stored_bytes), 0) from public.code_repos r where r.owner_id = owner and r.deleted_at is null) > (lim ->> 'member_bytes')::bigint then
    raise exception 'Your repositories are over the 300 MB storage limit for one account.';
  end if;

  return array(select b.sha from public.code_blobs b where b.repo_id = repo and b.sha = any (shas));
end;
$$;

-- Commit a full tree to a branch. `expected_head` is the head the browser started from (null for the first commit
-- of an empty repository). For a branch that does not exist yet, `expected_head` is the commit it starts from.
-- Raises 'stale_head' when the branch moved in the meantime, so nobody's work is silently overwritten.
create or replace function public.code_commit(repo uuid, branch text, expected_head text, tree jsonb, message text) returns text
language plpgsql security definer set search_path = public as $$
declare
  head text;
  base_tree jsonb;
  stats jsonb;
  cid text;
  created boolean := false;
begin
  if not public.code_can_write(repo) then
    raise exception 'You cannot write to this repository.';
  end if;
  if not public.code_valid_ref(branch) then
    raise exception 'That is not a valid branch name.';
  end if;
  if char_length(btrim(coalesce(message, ''))) = 0 then
    raise exception 'Write a commit message.';
  end if;
  if (select count(*) from public.code_commits c where c.author_id = (select auth.uid()) and c.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'You made 300 commits in the last hour. Try again later.';
  end if;

  perform 1 from public.code_repos where id = repo for update;
  select f.commit_id into head from public.code_refs f where f.repo_id = repo and f.kind = 'branch' and f.name = branch for update;

  if found then
    if head is distinct from expected_head then
      raise exception 'stale_head: % moved since you started. Reload to get the latest version.', branch;
    end if;
  else
    created := true;
    if expected_head is null and exists (select 1 from public.code_commits c where c.repo_id = repo) then
      raise exception 'Pick the commit the new branch starts from.';
    end if;
    if expected_head is not null and not exists (select 1 from public.code_commits c where c.repo_id = repo and c.id = expected_head) then
      raise exception 'That starting commit is not in this repository.';
    end if;
    head := expected_head;
  end if;

  select c.tree into base_tree from public.code_commits c where c.repo_id = repo and c.id = head;
  if base_tree is not null and base_tree = tree then
    raise exception 'Nothing changed, so there is nothing to commit.';
  end if;
  stats := public.code__check_tree(repo, tree, base_tree);
  cid := public.code__make_commit(repo, case when head is null then '{}'::text[] else array[head] end, tree, message, stats);

  if created then
    insert into public.code_refs (repo_id, kind, name, commit_id, created_by) values (repo, 'branch', branch, cid, (select auth.uid()));
  else
    update public.code_refs set commit_id = cid, updated_at = now() where repo_id = repo and kind = 'branch' and name = branch;
  end if;
  perform public.code__log(repo, 'commit', left(split_part(btrim(message), E'\n', 1), 200), 'commit/' || cid);
  return cid;
end;
$$;

-- Delete a branch or tag. The default branch stays.
create or replace function public.code_delete_ref(repo uuid, ref_kind text, ref_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.code_can_write(repo) then
    raise exception 'You cannot write to this repository.';
  end if;
  if ref_kind = 'branch' and exists (select 1 from public.code_repos r where r.id = repo and r.default_branch = ref_name) then
    raise exception 'The default branch cannot be deleted. Make another branch the default first.';
  end if;
  if ref_kind = 'tag' and exists (select 1 from public.code_releases rl where rl.repo_id = repo and rl.tag = ref_name) then
    raise exception 'Delete the release for this tag first.';
  end if;
  delete from public.code_refs where repo_id = repo and kind = ref_kind and name = ref_name;
  if not found then
    raise exception 'There is no % called %.', ref_kind, ref_name;
  end if;
end;
$$;

-- Fork: a new repository owned by the caller with the same commits, refs and blobs (bytes are not copied).
create or replace function public.code_fork(source uuid, new_slug text, new_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  src public.code_repos;
  fid uuid;
  me uuid := (select auth.uid());
begin
  if me is null or not public.has_cap('repo.create') or public.is_suspended() then
    raise exception 'You cannot create repositories.';
  end if;
  if not public.code_can_read(source) then
    raise exception 'That repository does not exist or is private.';
  end if;
  select * into src from public.code_repos where id = source;
  if src.owner_id = me then
    raise exception 'You cannot fork your own repository. Create a branch instead.';
  end if;
  if exists (select 1 from public.code_repos r where r.owner_id = me and r.forked_from = source and r.deleted_at is null) then
    raise exception 'You already have a fork of this repository.';
  end if;

  -- forked_from is not settable by members, so it is written here (the created trigger counts the fork).
  insert into public.code_repos (owner_id, slug, name, description, visibility, default_branch, topics, license, homepage, readme, links, forked_from)
  values (me, new_slug, coalesce(nullif(btrim(new_name), ''), src.name), src.description, src.visibility, src.default_branch,
          src.topics, src.license, src.homepage, src.readme, '{}', source)
  returning id into fid;
  update public.code_repos set pushed_at = src.pushed_at where id = fid;

  insert into public.code_blobs (repo_id, sha, size, store_repo, created_at)
  select fid, b.sha, b.size, b.store_repo, b.created_at from public.code_blobs b where b.repo_id = source;
  insert into public.code_commits (repo_id, id, parents, tree, message, author_id, author_name, stats, created_at)
  select fid, c.id, c.parents, c.tree, c.message, c.author_id, c.author_name, c.stats, c.created_at from public.code_commits c where c.repo_id = source;
  -- The copied refs are not news (the fork itself is the one line in the activity), so the ref trigger stays quiet.
  perform set_config('code.quiet_refs', 'on', true);
  insert into public.code_refs (repo_id, kind, name, commit_id, created_by, created_at, updated_at)
  select fid, f.kind, f.name, f.commit_id, me, f.created_at, f.updated_at from public.code_refs f where f.repo_id = source;
  perform set_config('code.quiet_refs', 'off', true);
  insert into public.code_labels (repo_id, name, color, description)
  select fid, l.name, l.color, l.description from public.code_labels l where l.repo_id = source on conflict do nothing;

  perform public.notify(src.owner_id, 'system', me, 'coderepo:' || source, 'Your repository ' || public.code__full_name(source) || ' was forked');
  return fid;
end;
$$;

-- Merge a pull request. The browser computes the merged tree (fast-forward or a clean three-way merge); this checks
-- permission, that the target branch has not moved, copies a fork's commits and blobs in, and moves the branch.
create or replace function public.code_merge_pull(pull uuid, expected_base text, fast_forward boolean, merged_tree jsonb, message text, expected_head text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.code_pulls;
  base text;
  head text;
  base_tree jsonb;
  stats jsonb;
  cid text;
  missing text[];
begin
  select * into p from public.code_pulls where id = pull for update;
  if not found or p.state <> 'open' then
    raise exception 'This pull request is not open.';
  end if;
  if not public.code_can_write(p.repo_id) then
    raise exception 'Only people who can write to this repository merge.';
  end if;

  perform 1 from public.code_repos where id = p.repo_id for update;
  select f.commit_id into base from public.code_refs f where f.repo_id = p.repo_id and f.kind = 'branch' and f.name = p.to_branch for update;
  if not found then
    raise exception 'The target branch % is gone.', p.to_branch;
  end if;
  if base is distinct from expected_base then
    raise exception 'stale_head: % moved since you opened this page. Reload and try again.', p.to_branch;
  end if;
  select f.commit_id into head from public.code_refs f where f.repo_id = p.from_repo and f.kind = 'branch' and f.name = p.from_branch;
  if head is null then
    raise exception 'The source branch % is gone.', p.from_branch;
  end if;
  -- The merged tree was built from the head the merger saw; refuse if the source branch moved since.
  if expected_head is not null and head <> expected_head then
    raise exception 'stale_head: % got new commits since you opened this page. Reload and try again.', p.from_branch;
  end if;

  if p.from_repo <> p.repo_id then
    -- Bring the fork's history in: every commit reachable from its head, and the blobs those commits use.
    with recursive walk(id) as (
      select head
      union
      select unnest(c.parents) from walk w join public.code_commits c on c.repo_id = p.from_repo and c.id = w.id
    )
    select coalesce(array_agg(w.id), '{}') into missing
    from walk w where not exists (select 1 from public.code_commits c where c.repo_id = p.repo_id and c.id = w.id);

    insert into public.code_blobs (repo_id, sha, size, store_repo)
    select distinct on (b.sha) p.repo_id, b.sha, b.size, b.store_repo
    from public.code_commits c
    cross join lateral jsonb_each(c.tree) as e(k, v)
    join public.code_blobs b on b.repo_id = p.from_repo and b.sha = e.v ->> 'sha'
    where c.repo_id = p.from_repo and c.id = any (missing)
    on conflict do nothing;

    insert into public.code_commits (repo_id, id, parents, tree, message, author_id, author_name, stats, created_at)
    select p.repo_id, c.id, c.parents, c.tree, c.message, c.author_id, c.author_name, c.stats, c.created_at
    from public.code_commits c where c.repo_id = p.from_repo and c.id = any (missing)
    on conflict do nothing;
  end if;

  if fast_forward then
    if not public.code__is_ancestor(p.repo_id, base, head) then
      raise exception 'This cannot be fast-forwarded: % has commits the pull request does not have.', p.to_branch;
    end if;
    cid := head;
  else
    if char_length(btrim(coalesce(message, ''))) = 0 then
      raise exception 'Write a merge message.';
    end if;
    select c.tree into base_tree from public.code_commits c where c.repo_id = p.repo_id and c.id = base;
    stats := public.code__check_tree(p.repo_id, merged_tree, base_tree);
    cid := public.code__make_commit(p.repo_id, array[base, head], merged_tree, message, stats);
  end if;

  update public.code_refs set commit_id = cid, updated_at = now() where repo_id = p.repo_id and kind = 'branch' and name = p.to_branch;
  update public.code_repos set pushed_at = now() where id = p.repo_id;
  update public.code_pulls
  set state = 'merged', base_commit = base, head_commit = head, merge_commit = cid, merged_by = (select auth.uid()), merged_at = now(), updated_at = now()
  where id = pull;
  perform public.code__log(p.repo_id, 'pull_merged', p.title, 'pulls/' || p.number);
  perform public.notify(p.author_id, 'system', (select auth.uid()), 'codepull:' || p.id, 'Merged: ' || p.title);
  return cid;
end;
$$;

-- Soft delete. The owner (or staff, logged) removes a repository; its name is free again.
create or replace function public.code_delete_repo(repo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.code_repos;
begin
  select * into r from public.code_repos where id = repo and deleted_at is null;
  if not found then
    raise exception 'That repository does not exist.';
  end if;
  if r.owner_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'Only the owner deletes a repository.';
  end if;
  update public.code_repos set deleted_at = now() where id = repo;
  if r.forked_from is not null then
    update public.code_repos set forks_count = greatest(forks_count - 1, 0) where id = r.forked_from;
  end if;
  if r.owner_id <> (select auth.uid()) then
    perform public.log_moderation('delete', 'code_repo', repo::text, r.slug);
  end if;
end;
$$;

-- Staff: hide or show a repository, issue, pull request or comment. Logged in the moderation log.
create or replace function public.code_moderate(target_kind text, target uuid, hide boolean, reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Only moderators can do this.';
  end if;
  case target_kind
    when 'repo' then
      update public.code_repos set hidden_at = case when hide then now() end, hidden_reason = case when hide then left(reason, 300) end where id = target;
    when 'issue' then update public.code_issues set hidden_at = case when hide then now() end where id = target;
    when 'pull' then update public.code_pulls set hidden_at = case when hide then now() end where id = target;
    when 'issue_comment' then update public.code_issue_comments set hidden_at = case when hide then now() end where id = target;
    when 'pull_comment' then update public.code_pull_comments set hidden_at = case when hide then now() end where id = target;
    else raise exception 'Unknown kind %', target_kind;
  end case;
  perform public.log_moderation(case when hide then 'hide' else 'unhide' end, 'code_' || target_kind, target::text, coalesce(reason, ''));
end;
$$;

-- Trending: public repositories by stars gained recently, then by recent pushes. Runs with the caller's rights.
create or replace function public.code_trending(days integer default 7, max_rows integer default 30)
returns setof public.code_repos
language sql stable set search_path = public as $$
  select r.*
  from public.code_repos r
  left join (
    select s.repo_id, count(*) as n from public.code_stars s
    where s.created_at > now() - make_interval(days => least(greatest(days, 1), 90))
    group by s.repo_id
  ) g on g.repo_id = r.id
  where r.visibility = 'public' and r.deleted_at is null and r.hidden_at is null and r.pushed_at is not null
  order by coalesce(g.n, 0) desc, r.stars_count desc, r.pushed_at desc nulls last
  limit least(greatest(max_rows, 1), 100)
$$;

revoke execute on function public.code_register_blobs(uuid, text[]), public.code_commit(uuid, text, text, jsonb, text),
  public.code_delete_ref(uuid, text, text), public.code_fork(uuid, text, text),
  public.code_merge_pull(uuid, text, boolean, jsonb, text, text), public.code_delete_repo(uuid),
  public.code_moderate(text, uuid, boolean, text) from public, anon;
grant execute on function public.code_register_blobs(uuid, text[]), public.code_commit(uuid, text, text, jsonb, text),
  public.code_delete_ref(uuid, text, text), public.code_fork(uuid, text, text),
  public.code_merge_pull(uuid, text, boolean, jsonb, text, text), public.code_delete_repo(uuid),
  public.code_moderate(text, uuid, boolean, text) to authenticated;
grant execute on function public.code_trending(integer, integer) to anon, authenticated;

-- ─── Storage ────────────────────────────────────────────────────────────────────────────────────────────────

-- Private bucket. Objects are "<repo uuid>/<sha256>"; readable when a readable repository registers that blob in
-- that folder; writable by people who can write to the folder's repository; never replaced or deleted (content
-- addressed, and forks may share them).
insert into storage.buckets (id, name, public, file_size_limit)
values ('code', 'code', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.code_object_readable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.code_blobs b
    where b.store_repo::text = split_part(object_name, '/', 1)
      and b.sha = split_part(object_name, '/', 2)
      and public.code_can_read(b.repo_id)
  )
$$;

create or replace function public.code_object_writable(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  repo uuid;
begin
  if object_name !~ '^[0-9a-f-]{36}/[0-9a-f]{64}$' then
    return false;
  end if;
  repo := split_part(object_name, '/', 1)::uuid;
  if not public.code_can_write(repo) then
    return false;
  end if;
  -- Uploads that are never registered still take space, so cap the pace per repository.
  return (select count(*) from storage.objects o
          where o.bucket_id = 'code' and o.name like repo::text || '/%' and o.created_at > now() - interval '1 hour') < 3000;
end;
$$;

grant execute on function public.code_object_readable(text) to anon, authenticated;
grant execute on function public.code_object_writable(text) to authenticated;

create policy "Code blobs of readable repositories" on storage.objects for select
  to anon, authenticated using (bucket_id = 'code' and public.code_object_readable(name));
create policy "Writers upload code blobs" on storage.objects for insert
  to authenticated with check (bucket_id = 'code' and public.code_object_writable(name));
