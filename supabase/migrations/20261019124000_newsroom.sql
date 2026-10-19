-- The Nexverse newsroom: original news stories written from public, official sources.
--
-- news_sources   where the newsroom looks: vendor blogs and changelogs (RSS), GitHub releases of major AI
--                projects, arXiv categories (an internal signal only) and a few official news pages without a
--                feed. Staff manage the list; editors (news.write) can read it.
-- news_signals   raw items collected from those sources, deduplicated by a hash of their address. Internal:
--                only editors read them.
-- news_stories   the articles. Everyone reads published ones (and scheduled ones once their time has come);
--                editors (news.write) read and write drafts; publishing needs news.publish. Rumours and leaks
--                are always marked unconfirmed.
-- news_tips      tips members send (news.tip), for the editors' inbox.
-- news_runs      one row per collection run (the daily cron or "Collect now"), for the run log and the rate limit.
--
-- Capabilities come from public.has_cap(cap) (roles migration 20261019121000).

-- Sources

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rss', 'github_releases', 'arxiv_query', 'site')),
  label text not null check (char_length(label) between 2 and 80),
  publisher text not null default '' check (char_length(publisher) <= 80),
  -- rss and site: the feed or the index page. github_releases: owner/name in repo. arxiv_query: a category in query.
  url text check (url ~ '^https://[^\s]{4,500}$'),
  repo text check (repo ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$'),
  -- arxiv_query: the category (cs.CL). site: the path prefix article links start with (/news/).
  query text check (char_length(query) between 1 and 120),
  category_hint text check (category_hint in ('launch', 'research', 'policy', 'industry', 'tools', 'rumor')),
  -- Internal signals inform research stories but are never shown or linked on their own.
  internal_only boolean not null default false,
  enabled boolean not null default true,
  last_checked timestamptz,
  last_ok boolean,
  last_error text check (char_length(last_error) <= 300),
  last_count integer,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (
    (kind = 'rss' and url is not null)
    or (kind = 'site' and url is not null and query is not null)
    or (kind = 'github_releases' and repo is not null)
    or (kind = 'arxiv_query' and query ~ '^[a-z-]{2,12}(\.[A-Za-z-]{2,6})?$')
  )
);

create unique index if not exists news_sources_target_idx on public.news_sources (kind, coalesce(url, ''), coalesce(lower(repo), ''), coalesce(query, ''));

alter table public.news_sources enable row level security;
create policy "Editors read news sources" on public.news_sources for select to authenticated
  using (public.has_cap('news.write') or public.is_staff());
create policy "Staff add news sources" on public.news_sources for insert to authenticated with check (public.is_staff());
create policy "Staff change news sources" on public.news_sources for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff remove news sources" on public.news_sources for delete to authenticated using (public.is_staff());
revoke all on public.news_sources from anon;

-- Editors who are not staff record a check on a source through this function (the cron uses the service key).
create or replace function public.news_source_checked(source uuid, ok boolean, items integer, err text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_cap('news.write') then
    raise exception 'Only news editors can do this';
  end if;
  update public.news_sources
  set last_checked = now(), last_ok = ok, last_count = greatest(0, coalesce(items, 0)),
      last_error = nullif(left(coalesce(err, ''), 300), '')
  where id = source;
end;
$$;

revoke execute on function public.news_source_checked(uuid, boolean, integer, text) from public, anon;
grant execute on function public.news_source_checked(uuid, boolean, integer, text) to authenticated;

-- Stories

create table if not exists public.news_stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,98})[a-z0-9]$'),
  title text not null check (char_length(title) between 8 and 140),
  dek text not null default '' check (char_length(dek) <= 320),
  body text not null default '' check (char_length(body) <= 20000),
  category text not null check (category in ('launch', 'research', 'policy', 'industry', 'tools', 'rumor')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'rejected')),
  unconfirmed boolean not null default false,
  -- [{ "url": "https://…", "title": "…", "publisher": "…" }]
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 12),
  cover text check (cover ~ '^https://[^\s]{4,600}$'),
  ai_generated boolean not null default false,
  model text check (char_length(model) <= 120),
  written_by uuid references public.profiles (id) on delete set null,
  edited_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  featured boolean not null default false,
  signal_hashes text[] not null default '{}' check (cardinality(signal_hashes) <= 20),
  reject_note text check (char_length(reject_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Rumours and leaks are never presented as confirmed.
  check (category <> 'rumor' or unconfirmed),
  check (status <> 'scheduled' or published_at is not null)
);

create index if not exists news_stories_public_idx on public.news_stories (status, published_at desc);
create index if not exists news_stories_queue_idx on public.news_stories (status, created_at desc);

alter table public.news_stories enable row level security;
create policy "Published news is public" on public.news_stories for select
  using (status = 'published' or (status = 'scheduled' and published_at <= now()) or public.has_cap('news.write'));
create policy "Editors write drafts" on public.news_stories for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors edit stories" on public.news_stories for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
create policy "Publishers remove stories" on public.news_stories for delete to authenticated using (public.has_cap('news.publish'));

-- Who wrote and edited what, rumour labels, and the publishing check. A request without a member (the cron,
-- with the service key) is trusted; everyone else needs news.publish to publish, schedule, or change a story
-- that is already out.
create or replace function public.news_stories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
begin
  new.updated_at := now();
  if new.category = 'rumor' then
    new.unconfirmed := true;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if me is not null then
      new.written_by := case when new.ai_generated then null else me end;
      new.edited_by := null;
    end if;
  elsif me is not null then
    new.edited_by := me;
    new.written_by := old.written_by;
    new.ai_generated := old.ai_generated;
    new.model := old.model;
    new.created_at := old.created_at;
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if me is not null and not public.has_cap('news.publish') then
    if new.status in ('published', 'scheduled') then
      raise exception 'Only editors who can publish may publish or schedule stories';
    end if;
    if tg_op = 'UPDATE' and old.status in ('published', 'scheduled') then
      raise exception 'Only editors who can publish may change a published story';
    end if;
    if new.featured then
      raise exception 'Only editors who can publish may feature a story';
    end if;
  end if;
  return new;
end;
$$;

create trigger news_stories_guard before insert or update on public.news_stories
  for each row execute function public.news_stories_guard();
revoke execute on function public.news_stories_guard() from public, anon, authenticated;

-- Signals

create table if not exists public.news_signals (
  id bigint generated always as identity primary key,
  source_id uuid references public.news_sources (id) on delete set null,
  url text not null check (url ~ '^https://[^\s]{4,1000}$'),
  title text not null check (char_length(title) between 1 and 300),
  excerpt text not null default '' check (char_length(excerpt) <= 1200),
  publisher text not null default '' check (char_length(publisher) <= 80),
  internal_only boolean not null default false,
  published_at timestamptz,
  hash text not null unique check (hash ~ '^[a-f0-9]{16,64}$'),
  used boolean not null default false,
  story_id uuid references public.news_stories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists news_signals_fresh_idx on public.news_signals (used, created_at desc);

alter table public.news_signals enable row level security;
create policy "Editors read signals" on public.news_signals for select to authenticated using (public.has_cap('news.write'));
create policy "Editors collect signals" on public.news_signals for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors mark signals" on public.news_signals for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_signals from anon;

-- Tips from members

create table if not exists public.news_tips (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  url text check (url ~ '^https://[^\s]{4,1000}$'),
  note text not null check (char_length(note) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  story_id uuid references public.news_stories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists news_tips_inbox_idx on public.news_tips (status, created_at desc);

alter table public.news_tips enable row level security;
create policy "Tips are read by their sender and editors" on public.news_tips for select to authenticated
  using (member_id = (select auth.uid()) or public.has_cap('news.write'));
create policy "Members send tips" on public.news_tips for insert to authenticated
  with check (member_id = (select auth.uid()) and status = 'new' and handled_by is null and story_id is null and public.has_cap('news.tip'));
create policy "Editors handle tips" on public.news_tips for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_tips from anon;
revoke update on public.news_tips from authenticated;
grant update (status, handled_by, handled_at, story_id) on public.news_tips to authenticated;

create or replace function public.news_tips_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.news_tips t where t.member_id = new.member_id and t.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent 10 tips today. Thank you! Send more tomorrow.';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger news_tips_rate_limit before insert on public.news_tips
  for each row execute function public.news_tips_rate_limit();
revoke execute on function public.news_tips_rate_limit() from public, anon, authenticated;

-- Collection runs

create table if not exists public.news_runs (
  id bigint generated always as identity primary key,
  trigger text not null check (trigger in ('cron', 'manual')),
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  sources_checked integer not null default 0,
  signals_new integer not null default 0,
  drafts integer not null default 0,
  published integer not null default 0,
  rejected integer not null default 0,
  -- [{ "where": "OpenAI News", "error": "timed out" }]
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  note text not null default '' check (char_length(note) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists news_runs_recent_idx on public.news_runs (started_at desc);

alter table public.news_runs enable row level security;
create policy "Editors read runs" on public.news_runs for select to authenticated using (public.has_cap('news.write'));
create policy "Editors start runs" on public.news_runs for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors finish runs" on public.news_runs for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_runs from anon;

-- At most one run every five minutes, whoever starts it (the cron included).
create or replace function public.news_runs_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.news_runs r where r.started_at > now() - interval '5 minutes') then
    raise exception 'The newsroom collected less than five minutes ago. Try again in a few minutes.';
  end if;
  new.started_at := now();
  new.actor_id := (select auth.uid());
  return new;
end;
$$;

create trigger news_runs_rate_limit before insert on public.news_runs
  for each row execute function public.news_runs_rate_limit();
revoke execute on function public.news_runs_rate_limit() from public, anon, authenticated;

-- Every editorial action goes to the moderation log, for editors who are not moderators too.
create or replace function public.news_log(action text, target_kind text, target_id text, note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_cap('news.write') then
    raise exception 'Only news editors can do this';
  end if;
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values ((select auth.uid()), left(action, 40), left(target_kind, 40), left(target_id, 200), left(coalesce(note, ''), 500));
end;
$$;

revoke execute on function public.news_log(text, text, text, text) from public, anon;
grant execute on function public.news_log(text, text, text, text) to authenticated;

-- Newsroom settings (auto-publish per category, the daily cap) live in site_settings under the key
-- "newsroom". Admins can already write every key; editors who can publish may write this one.
create policy "Publishers write newsroom settings" on public.site_settings for insert to authenticated
  with check (key = 'newsroom' and public.has_cap('news.publish'));
create policy "Publishers change newsroom settings" on public.site_settings for update to authenticated
  using (key = 'newsroom' and public.has_cap('news.publish')) with check (key = 'newsroom' and public.has_cap('news.publish'));

-- Official sources, each checked to answer before it was added (19 Oct 2026). No community sites.
insert into public.news_sources (kind, label, publisher, url, repo, query, category_hint, internal_only) values
  ('rss', 'OpenAI News', 'OpenAI', 'https://openai.com/news/rss.xml', null, null, null, false),
  ('rss', 'Google DeepMind blog', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml', null, null, 'research', false),
  ('rss', 'Google: AI on The Keyword', 'Google', 'https://blog.google/technology/ai/rss/', null, null, 'launch', false),
  ('rss', 'Google Research blog', 'Google Research', 'https://research.google/blog/rss/', null, null, 'research', false),
  ('site', 'Anthropic newsroom', 'Anthropic', 'https://www.anthropic.com/news', null, '/news/', null, false),
  ('site', 'Meta AI blog', 'Meta', 'https://ai.meta.com/blog/', null, '/blog/', null, false),
  ('rss', 'Engineering at Meta', 'Meta', 'https://engineering.fb.com/feed/', null, null, 'tools', false),
  ('rss', 'Mistral AI news', 'Mistral AI', 'https://mistral.ai/news/rss', null, null, 'launch', false),
  ('rss', 'NVIDIA blog', 'NVIDIA', 'https://blogs.nvidia.com/feed/', null, null, 'industry', false),
  ('rss', 'NVIDIA technical blog', 'NVIDIA', 'https://developer.nvidia.com/blog/feed', null, null, 'tools', false),
  ('rss', 'Microsoft Research blog', 'Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/', null, null, 'research', false),
  ('rss', 'Microsoft Source: AI', 'Microsoft', 'https://news.microsoft.com/source/topics/ai/feed/', null, null, 'industry', false),
  ('rss', 'AWS Machine Learning blog', 'Amazon Web Services', 'https://aws.amazon.com/blogs/machine-learning/feed/', null, null, 'tools', false),
  ('rss', 'Apple Machine Learning Research', 'Apple', 'https://machinelearning.apple.com/rss.xml', null, null, 'research', false),
  ('rss', 'PyTorch blog', 'PyTorch', 'https://pytorch.org/blog/feed/', null, null, 'tools', false),
  ('rss', 'GitHub blog: AI and ML', 'GitHub', 'https://github.blog/ai-and-ml/feed/', null, null, 'tools', false),
  ('rss', 'Ollama blog', 'Ollama', 'https://ollama.com/blog/rss.xml', null, null, 'tools', false),
  ('github_releases', 'Ollama releases', 'Ollama', null, 'ollama/ollama', null, 'tools', false),
  ('github_releases', 'vLLM releases', 'vLLM', null, 'vllm-project/vllm', null, 'tools', false),
  ('github_releases', 'llama.cpp releases', 'ggml', null, 'ggml-org/llama.cpp', null, 'tools', false),
  ('github_releases', 'PyTorch releases', 'PyTorch', null, 'pytorch/pytorch', null, 'tools', false),
  ('github_releases', 'SGLang releases', 'SGLang', null, 'sgl-project/sglang', null, 'tools', false),
  ('arxiv_query', 'arXiv: computation and language', 'arXiv', null, null, 'cs.CL', 'research', true),
  ('arxiv_query', 'arXiv: machine learning', 'arXiv', null, null, 'cs.LG', 'research', true)
on conflict do nothing;
