-- The hub: links members share (models, datasets, tools, repos, news) and the likes they give.
-- Readable by everyone; each member writes and deletes only their own rows.

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('model', 'dataset', 'tool', 'repo', 'news')),
  title text not null check (char_length(title) between 3 and 120),
  url text not null check (char_length(url) <= 500 and url ~ '^https://'),
  summary text not null default '' check (char_length(summary) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  created_at timestamptz not null default now()
);

create index submissions_created_idx on public.submissions (created_at desc);
create index submissions_kind_idx on public.submissions (kind, created_at desc);
create index submissions_author_idx on public.submissions (author_id);

-- A like points at anything by a readable key such as "model:orbit-8b" or "thread:<uuid>".
create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target text not null check (target ~ '^[a-z]{2,16}:[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, target)
);

create index likes_target_idx on public.likes (target);

alter table public.submissions enable row level security;
alter table public.likes enable row level security;

create policy "Submissions are public" on public.submissions for select using (true);
create policy "Members share as themselves" on public.submissions for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Members delete their own submissions" on public.submissions for delete to authenticated using (author_id = (select auth.uid()));

create policy "Likes are public" on public.likes for select using (true);
create policy "Members like as themselves" on public.likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members remove their own likes" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

revoke update on public.submissions from anon, authenticated;
revoke update on public.likes from anon, authenticated;
