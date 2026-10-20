-- The newsroom, round 9: researched long-form stories and real covers.
--
-- news_stories   gains what a long-form story carries: the cover's kind, credit and alt text, the candidate
--                covers the editors can swap between, the key facts box, the pull quote, the depth it was
--                written at and its word count. Sources (already jsonb) may now carry an excerpt per source for
--                the citation previews; their shape is checked in the app.
-- news_checks    the second-pass fact check for each AI story: what was verified, what was removed as
--                unsupported, what was labelled unconfirmed. Editors only; readers never see it.
-- news_pages     a cache of official pages the newsroom read (clean text, images, links), so a story that is
--                rewritten or a source that is read twice costs no second fetch. Editors only.
-- news_runs      gains the number of deep stories each run wrote.
--
-- Newsroom settings (depth, length, sections, tone, categories, schedule, cover policy) stay in site_settings
-- under the key "newsroom", which publishers can already write (20261019124000_newsroom.sql).
-- No drop statements; every change is additive.

-- Stories

alter table public.news_stories add column if not exists cover_kind text
  check (cover_kind in ('source', 'openverse', 'wikimedia', 'generated', 'editor'));
-- { "creator": "…", "creatorUrl": "https://…", "license": "CC BY 2.0", "licenseUrl": "https://…", "landing": "https://…", "provider": "flickr" }
alter table public.news_stories add column if not exists cover_credit jsonb
  check (cover_credit is null or (jsonb_typeof(cover_credit) = 'object' and octet_length(cover_credit::text) <= 2000));
alter table public.news_stories add column if not exists cover_alt text check (char_length(cover_alt) <= 300);
-- [{ "url": "https://…", "kind": "source", "width": 1600, "height": 900, "alt": "…", "credit": {…} }]
alter table public.news_stories add column if not exists cover_candidates jsonb not null default '[]'::jsonb
  check (jsonb_typeof(cover_candidates) = 'array' and jsonb_array_length(cover_candidates) <= 24 and octet_length(cover_candidates::text) <= 40000);
-- [{ "text": "…", "source": 1 }]
alter table public.news_stories add column if not exists key_facts jsonb not null default '[]'::jsonb
  check (jsonb_typeof(key_facts) = 'array' and jsonb_array_length(key_facts) <= 12 and octet_length(key_facts::text) <= 8000);
-- { "text": "…", "source": 2 }: always words that appear in that source
alter table public.news_stories add column if not exists pull_quote jsonb
  check (pull_quote is null or (jsonb_typeof(pull_quote) = 'object' and octet_length(pull_quote::text) <= 1200));
alter table public.news_stories add column if not exists depth text not null default 'short'
  check (depth in ('short', 'standard', 'deep'));
alter table public.news_stories add column if not exists word_count integer check (word_count between 0 and 10000);

-- Fact checks (editors only)

create table if not exists public.news_checks (
  story_id uuid primary key references public.news_stories (id) on delete cascade,
  -- { "verified": 14, "dropped": [{ "claim": "…", "why": "…" }], "removed": [{ "text": "…", "why": "…" }], "unconfirmed": ["…"], "steps": ["gather", "brief", "write", "check"], "sources": 4 }
  report jsonb not null default '{}'::jsonb check (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 30000),
  model text check (char_length(model) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_checks enable row level security;
create policy "Editors read fact checks" on public.news_checks for select to authenticated using (public.has_cap('news.write'));
create policy "Editors save fact checks" on public.news_checks for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors update fact checks" on public.news_checks for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_checks from anon;

-- Page cache (editors only)

create table if not exists public.news_pages (
  hash text primary key check (hash ~ '^[a-f0-9]{16,64}$'),
  url text not null check ((url ~ '^https://[^\s]{4,}$' and char_length(url) <= 1008)),
  title text not null default '' check (char_length(title) <= 300),
  description text not null default '' check (char_length(description) <= 600),
  site_name text not null default '' check (char_length(site_name) <= 120),
  text text not null default '' check (char_length(text) <= 60000),
  published_at timestamptz,
  -- [{ "url": "https://…", "width": 1200, "height": 630, "alt": "…", "from": "og" }]
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 16),
  -- [{ "url": "https://…", "text": "…" }]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 120),
  fetched_at timestamptz not null default now()
);

create index if not exists news_pages_fetched_idx on public.news_pages (fetched_at desc);

alter table public.news_pages enable row level security;
create policy "Editors read cached pages" on public.news_pages for select to authenticated using (public.has_cap('news.write'));
create policy "Editors cache pages" on public.news_pages for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors refresh cached pages" on public.news_pages for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_pages from anon;

-- Runs

alter table public.news_runs add column if not exists deep integer not null default 0;
