-- The Nexverse research and editorial engine (round 11): the newsroom that investigates on its own, every hour.
--
-- news_desks             the editorial categories, as data: name, scope, audience, research methods, priority,
--                        auto-publish rule, leak track. Agents read them on every cycle, so a new desk works
--                        without a code change. Seeded from the six existing categories plus two new desks.
-- news_jobs              the durable job queue: cycles, scouts, triage, research, updates, leak watches,
--                        backfills. Leases, retries with exponential backoff, dead letters.
-- news_locks             named locks with an expiry, so two ticks never run the engine at the same time.
-- news_leads             discoveries: every candidate the triage looked at, with its evidence, score, decision
--                        and the reason, accepted or rejected.
-- news_decisions         the agents' decision log (planner, scouts, triage, researcher, writer, checker,
--                        editor, publisher, updater, leak desk).
-- news_usage             every model call: stage, provider, model, tokens (measured or estimated), cost.
-- news_watch             leak and change watchers: public files (SDK model lists, docs) and pages whose
--                        changes are tracked between snapshots.
-- news_story_revisions   the edit history of every story, written by a trigger.
-- news_reads             reads per story per day, for "Rising in Nexverse news".
--
-- Scheduling: pg_cron calls public.news_engine_tick() every 10 minutes; it posts to the site's
-- /api/newsroom/tick with the shared secret read from Supabase Vault (never stored in the repository).
-- Until the two Vault secrets exist the function does nothing and says so in the cron log.
--
-- Capabilities: news.write (editors) read and work the queue; news.publish (publishers) change desks, rules
-- and watchers. The service role (the scheduled tick) bypasses row level security as before.

-- ─── Extensions ───────────────────────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ─── Desks ────────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_desks (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  label text not null check (char_length(label) between 2 and 40),
  one text not null default '' check (char_length(one) <= 30),
  blurb text not null default '' check (char_length(blurb) <= 240),
  -- The desk's editorial brief for the agents: what belongs here, what matters, what to ignore.
  scope text not null default '' check (char_length(scope) <= 2000),
  -- Who reads it ("people who build with AI", "security engineers").
  audience text not null default '' check (char_length(audience) <= 200),
  -- The story format it files under (the stories table keeps its six formats).
  kind text not null default 'industry' check (kind in ('launch', 'research', 'policy', 'industry', 'tools', 'rumor')),
  priority smallint not null default 3 check (priority between 0 and 5),
  enabled boolean not null default true,
  hidden boolean not null default false,
  leak_track boolean not null default false,
  auto_publish boolean not null default false,
  min_score smallint not null default 60 check (min_score between 0 and 100),
  -- Research methods: { github: {topics, queries, watchRepos}, arxiv: {categories, queries}, hf: {models, datasets, tasks},
  -- federal: {terms}, gdelt: {queries}, hn: {enabled, minPoints}, keywords: [...] }.
  methods jsonb not null default '{}'::jsonb check (jsonb_typeof(methods) = 'object' and octet_length(methods::text) <= 20000),
  tint text check (tint ~ '^#[0-9a-f]{6}$'),
  sort smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_desks enable row level security;
create policy "News desks are public" on public.news_desks for select using (true);
create policy "Publishers add desks" on public.news_desks for insert to authenticated with check (public.has_cap('news.publish'));
create policy "Publishers change desks" on public.news_desks for update to authenticated
  using (public.has_cap('news.publish')) with check (public.has_cap('news.publish'));
revoke insert, update on public.news_desks from anon;

create or replace function public.news_desks_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger news_desks_touch before update on public.news_desks
  for each row execute function public.news_desks_touch();

insert into public.news_desks (id, label, one, blurb, scope, audience, kind, priority, leak_track, min_score, tint, sort, methods) values
  ('launch', 'Launches', 'Launch', 'New models, products and features that shipped.',
   'Models, products, APIs and features that are actually available to use, from the companies and labs that made them. Prefer things people can use today over announcements; say plainly when something is only announced or planned. A small team shipping something remarkable can matter more than a big company''s minor update.',
   'people who build with AI', 'launch', 4, false, 62, '#8fb4ff', 10,
   '{"github":{"queries":["topic:llm","topic:large-language-models"]},"hf":{"models":true},"gdelt":{"queries":["\"new AI model\" launch"]}}'),
  ('research', 'Research', 'Research', 'Results and methods from labs and universities.',
   'Papers, results and methods from labs and universities that change what is possible or how it is done: new architectures, training methods, evaluations, safety findings. Prefer work with code, data or reproducible numbers. A single paper is a lead, not a story, unless its result is significant and clearly stated.',
   'researchers and engineers working with AI', 'research', 3, false, 66, '#9fe3cf', 20,
   '{"arxiv":{"categories":["cs.CL","cs.LG","cs.AI","cs.CV"],"queries":[]},"hf":{"datasets":true},"github":{"queries":["paper code language:Python"]}}'),
  ('policy', 'Policy', 'Policy', 'Rules, safety commitments and what governments decided.',
   'Laws, regulations, official guidance, standards, court decisions and safety commitments that affect how AI is built and used. Use the official record (the regulator, the court, the official journal) as the source. Report what was decided, when it applies and to whom.',
   'people who build with AI and need to know the rules', 'policy', 3, false, 62, '#d8c59e', 30,
   '{"federal":{"terms":["artificial intelligence"]},"gdelt":{"queries":["AI regulation","\"AI Act\""]}}'),
  ('industry', 'Industry', 'Industry', 'Deals, partnerships, offices and the business of AI.',
   'Deals, funding, partnerships, acquisitions, new offices, leadership changes and results of companies working on AI, from their own announcements and filings. Skip routine marketing and customer stories.',
   'founders, engineers and investors in AI', 'industry', 2, false, 68, '#d3b4ff', 40,
   '{"gdelt":{"queries":["AI acquisition","AI startup funding round"]}}'),
  ('tools', 'Tools', 'Tools', 'Releases of the frameworks and runtimes people build with.',
   'Releases of libraries, frameworks, runtimes, SDKs and developer tools for AI. Report what changed for the people who use them: new features, breaking changes, performance numbers from the release notes. Patch releases and pre-releases are not stories unless they change something important.',
   'developers using AI frameworks and tools', 'tools', 3, false, 64, '#e9c79a', 50,
   '{"github":{"queries":["topic:ai-agents","topic:llm-inference"],"watchRepos":[]},"hn":{"enabled":true,"minPoints":150}}'),
  ('rumor', 'Leaks & early signals', 'Leak', 'Reported or spotted early, not confirmed. Always labelled, always sourced.',
   'Early signals found in public, original sources: new model names in official SDKs and documentation, changes in public repositories, product pages that appear before an announcement. Never private information, never anything behind a login, never speculation presented as fact. One isolated mention is a lead to investigate, not a story. Every story here is reviewed by an editor before it is published.',
   'people who follow AI closely', 'rumor', 3, true, 75, '#f0a3a3', 60,
   '{"watch":true}'),
  ('open-source', 'Open source', 'Open source', 'New and fast-rising open projects, from the repositories themselves.',
   'Open-source projects for AI that are new or rising quickly: agents, frameworks, applications, models with code. Judge them by what they do and how well, not only by stars. An unknown independent project can deserve more attention than a big company''s announcement. Read the repository, its README and its releases.',
   'developers who build with open-source AI', 'tools', 4, false, 60, '#9ad0ff', 15,
   '{"github":{"rising":true,"queries":["topic:llm","topic:ai-agents","topic:rag","topic:mcp"]},"hn":{"enabled":true,"minPoints":200}}'),
  ('models', 'Models & datasets', 'Models', 'New open models and datasets worth knowing, with their numbers.',
   'New open-weight models and datasets that are notable for their size, quality, licence or a new capability, read from their papers, repositories and official posts. Report parameters, licence, context length and published evaluation numbers only when the sources state them.',
   'people who train, fine-tune and run models', 'launch', 3, false, 64, '#ffd08a', 25,
   '{"hf":{"models":true,"datasets":true},"arxiv":{"categories":["cs.CL"],"queries":[]}}')
on conflict (id) do nothing;

-- ─── Stories: the engine's columns ────────────────────────────────────────────────────────────────────────────

alter table public.news_stories add column if not exists desk text references public.news_desks (id) on update cascade on delete set null;
-- Daniel's five evidence levels, strongest first.
alter table public.news_stories add column if not exists evidence text
  check (evidence in ('confirmed', 'observed', 'technical', 'plausible', 'rumor'));
alter table public.news_stories add column if not exists leak_confidence smallint check (leak_confidence between 0 and 100);
alter table public.news_stories add column if not exists impact smallint check (impact between 0 and 100);
alter table public.news_stories add column if not exists availability text check (availability in ('available', 'announced', 'planned', 'unknown'));
alter table public.news_stories add column if not exists seo jsonb check (seo is null or (jsonb_typeof(seo) = 'object' and octet_length(seo::text) <= 4000));
alter table public.news_stories add column if not exists media jsonb not null default '[]'::jsonb
  check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 12 and octet_length(media::text) <= 30000);
alter table public.news_stories add column if not exists timeline jsonb not null default '[]'::jsonb
  check (jsonb_typeof(timeline) = 'array' and jsonb_array_length(timeline) <= 40 and octet_length(timeline::text) <= 40000);
alter table public.news_stories add column if not exists story_key text check (char_length(story_key) <= 200);
alter table public.news_stories add column if not exists review_reason text check (char_length(review_reason) <= 600);
-- An AI illustration (not a photo of the event): the reader page always labels it as such.
alter table public.news_stories add column if not exists cover_ai boolean not null default false;
-- Why the last change was made, copied into the edit history.
alter table public.news_stories add column if not exists edit_reason text check (char_length(edit_reason) <= 300);
alter table public.news_stories add column if not exists reads integer not null default 0;

update public.news_stories set desk = category where desk is null and category in (select id from public.news_desks);

create index if not exists news_stories_desk_idx on public.news_stories (desk, status, published_at desc);
create index if not exists news_stories_key_idx on public.news_stories (story_key);

-- ─── Signals and sources: which desk they feed ────────────────────────────────────────────────────────────────

alter table public.news_sources add column if not exists desk text references public.news_desks (id) on update cascade on delete set null;
update public.news_sources set desk = category_hint where desk is null and category_hint in (select id from public.news_desks);

alter table public.news_signals add column if not exists desk text references public.news_desks (id) on update cascade on delete set null;
-- Which scout found it (rss, github_rising, hf_models, arxiv_search, federal_register, …).
alter table public.news_signals add column if not exists scout text check (char_length(scout) <= 40);
-- Numbers the scout saw: stars, stars per day, downloads, likes, points.
alter table public.news_signals add column if not exists metrics jsonb check (metrics is null or (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 4000));
-- Found through a discovery platform that is never linked or cited (Hugging Face, community front pages).
alter table public.news_signals add column if not exists via text check (char_length(via) <= 120);

create index if not exists news_signals_desk_idx on public.news_signals (desk, used, created_at desc);

-- ─── Job queue ────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('cycle', 'collect', 'scout', 'watch', 'triage', 'research', 'update', 'corroborate', 'backfill')),
  desk text references public.news_desks (id) on update cascade on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead', 'cancelled')),
  -- Lower runs first.
  priority smallint not null default 50 check (priority between 0 and 100),
  attempts smallint not null default 0,
  max_attempts smallint not null default 4 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  locked_by text check (char_length(locked_by) <= 80),
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 600),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 20000)),
  -- One queued job per key at a time (a cycle, a lead's research), so nothing runs twice.
  dedupe text check (char_length(dedupe) <= 200),
  run_id bigint references public.news_runs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists news_jobs_ready_idx on public.news_jobs (status, priority, run_after);
create index if not exists news_jobs_recent_idx on public.news_jobs (created_at desc);
create unique index if not exists news_jobs_dedupe_idx on public.news_jobs (dedupe) where dedupe is not null and status in ('queued', 'running');

alter table public.news_jobs enable row level security;
create policy "Editors read jobs" on public.news_jobs for select to authenticated using (public.has_cap('news.write'));
create policy "Editors queue jobs" on public.news_jobs for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors work jobs" on public.news_jobs for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_jobs from anon;

-- Claim up to n ready jobs: queued and due, or running with an expired lease (a tick that died). Skips rows
-- another worker holds. Runs as the caller, so row level security decides who may claim.
create or replace function public.news_job_claim(worker text, n integer default 1, lease_seconds integer default 300, kinds text[] default null)
returns setof public.news_jobs language plpgsql set search_path = public as $$
begin
  return query
  with ready as (
    select j.id from public.news_jobs j
    where ((j.status = 'queued' and j.run_after <= now()) or (j.status = 'running' and j.locked_until < now()))
      and (kinds is null or j.kind = any (kinds))
    order by j.priority, j.run_after, j.id
    limit greatest(1, least(n, 20))
    for update skip locked
  )
  update public.news_jobs j
  set status = 'running', attempts = j.attempts + 1, locked_by = left(worker, 80),
      locked_until = now() + make_interval(secs => greatest(30, least(lease_seconds, 900))),
      started_at = coalesce(j.started_at, now())
  from ready where j.id = ready.id
  returning j.*;
end;
$$;

-- Finish a job. A failure is retried with exponential backoff (2, 4, 8, … minutes, at most six hours) until
-- max_attempts, then it becomes a dead letter for the editors. `retry_in` > 0 puts a job back without
-- counting it as a failure (it ran out of this tick's budget).
create or replace function public.news_job_finish(job bigint, ok boolean, outcome jsonb default null, err text default null, retry_in integer default 0)
returns void language plpgsql set search_path = public as $$
declare
  j public.news_jobs;
begin
  select * into j from public.news_jobs where id = job for update;
  if not found then return; end if;
  if retry_in > 0 then
    update public.news_jobs set status = 'queued', attempts = greatest(0, attempts - 1), locked_by = null, locked_until = null,
      run_after = now() + make_interval(secs => least(retry_in, 21600)), result = coalesce(outcome, result)
    where id = job;
  elsif ok then
    update public.news_jobs set status = 'done', locked_by = null, locked_until = null, finished_at = now(),
      result = outcome, last_error = null
    where id = job;
  elsif j.attempts >= j.max_attempts then
    update public.news_jobs set status = 'dead', locked_by = null, locked_until = null, finished_at = now(),
      last_error = left(coalesce(err, 'failed'), 600), result = coalesce(outcome, result)
    where id = job;
  else
    update public.news_jobs set status = 'queued', locked_by = null, locked_until = null,
      run_after = now() + make_interval(secs => least(21600, (60 * power(2, j.attempts))::integer)),
      last_error = left(coalesce(err, 'failed'), 600)
    where id = job;
  end if;
end;
$$;

revoke execute on function public.news_job_claim(text, integer, integer, text[]) from public, anon;
grant execute on function public.news_job_claim(text, integer, integer, text[]) to authenticated, service_role;
revoke execute on function public.news_job_finish(bigint, boolean, jsonb, text, integer) from public, anon;
grant execute on function public.news_job_finish(bigint, boolean, jsonb, text, integer) to authenticated, service_role;

-- ─── Locks ────────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_locks (
  name text primary key check (char_length(name) between 1 and 60),
  holder text not null check (char_length(holder) <= 80),
  expires_at timestamptz not null,
  taken_at timestamptz not null default now()
);

alter table public.news_locks enable row level security;
create policy "Editors read locks" on public.news_locks for select to authenticated using (public.has_cap('news.write'));
create policy "Editors take locks" on public.news_locks for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors renew locks" on public.news_locks for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_locks from anon;

-- True when the caller now holds the lock: it was free, expired, or already theirs.
create or replace function public.news_lock_take(lock_name text, who text, seconds integer)
returns boolean language plpgsql set search_path = public as $$
declare
  got text;
begin
  insert into public.news_locks as l (name, holder, expires_at, taken_at)
  values (lock_name, left(who, 80), now() + make_interval(secs => greatest(10, least(seconds, 1800))), now())
  on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at, taken_at = excluded.taken_at
    where l.expires_at < now() or l.holder = excluded.holder
  returning holder into got;
  return got is not null and got = left(who, 80);
end;
$$;

create or replace function public.news_lock_release(lock_name text, who text)
returns void language plpgsql set search_path = public as $$
begin
  update public.news_locks set expires_at = now() - interval '1 second' where name = lock_name and holder = left(who, 80);
end;
$$;

revoke execute on function public.news_lock_take(text, text, integer) from public, anon;
grant execute on function public.news_lock_take(text, text, integer) to authenticated, service_role;
revoke execute on function public.news_lock_release(text, text) from public, anon;
grant execute on function public.news_lock_release(text, text) to authenticated, service_role;

-- ─── Leads (discoveries) ──────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_leads (
  id bigint generated always as identity primary key,
  desk text references public.news_desks (id) on update cascade on delete set null,
  track text not null default 'news' check (track in ('news', 'leak')),
  scout text not null default '' check (char_length(scout) <= 40),
  title text not null check (char_length(title) between 1 and 300),
  url text check ((url ~ '^https://[^\s]{4,}$' and char_length(url) <= 1008)),
  summary text not null default '' check (char_length(summary) <= 2000),
  publisher text not null default '' check (char_length(publisher) <= 120),
  published_at timestamptz,
  evidence_level text check (evidence_level in ('confirmed', 'observed', 'technical', 'plausible', 'rumor')),
  leak_confidence smallint check (leak_confidence between 0 and 100),
  availability text check (availability in ('available', 'announced', 'planned', 'unknown')),
  score smallint not null default 0 check (score between 0 and 100),
  -- { freshness, authority, independence, momentum, novelty, priority, ai_impact, ai_originality, … }
  score_parts jsonb not null default '{}'::jsonb check (jsonb_typeof(score_parts) = 'object' and octet_length(score_parts::text) <= 4000),
  -- [{ url, kind, note, quote, observed_at }]
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 40 and octet_length(evidence::text) <= 40000),
  signal_ids bigint[] not null default '{}' check (cardinality(signal_ids) <= 40),
  story_key text check (char_length(story_key) <= 200),
  match_story uuid references public.news_stories (id) on delete set null,
  decision text not null default 'new' check (decision in ('new', 'queued', 'researching', 'review', 'accepted', 'published', 'rejected', 'duplicate', 'update', 'failed')),
  reason text not null default '' check (char_length(reason) <= 800),
  story_id uuid references public.news_stories (id) on delete set null,
  model text check (char_length(model) <= 200),
  -- A proposed change for a published story (an update awaiting review).
  proposal jsonb check (proposal is null or (jsonb_typeof(proposal) = 'object' and octet_length(proposal::text) <= 20000)),
  run_id bigint references public.news_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists news_leads_recent_idx on public.news_leads (created_at desc);
create index if not exists news_leads_decision_idx on public.news_leads (decision, score desc);
create index if not exists news_leads_key_idx on public.news_leads (story_key);

alter table public.news_leads enable row level security;
create policy "Editors read leads" on public.news_leads for select to authenticated using (public.has_cap('news.write'));
create policy "Editors add leads" on public.news_leads for insert to authenticated with check (public.has_cap('news.write'));
create policy "Editors decide leads" on public.news_leads for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_leads from anon;

create or replace trigger news_leads_touch before update on public.news_leads
  for each row execute function public.news_desks_touch();

-- ─── Decision log and model use ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_decisions (
  id bigint generated always as identity primary key,
  run_id bigint references public.news_runs (id) on delete set null,
  job_id bigint references public.news_jobs (id) on delete set null,
  lead_id bigint references public.news_leads (id) on delete set null,
  story_id uuid references public.news_stories (id) on delete set null,
  agent text not null check (agent in ('planner', 'scout', 'triage', 'researcher', 'writer', 'checker', 'editor', 'publisher', 'updater', 'leaks', 'illustrator', 'system', 'human')),
  action text not null check (char_length(action) between 1 and 60),
  outcome text not null default '' check (char_length(outcome) <= 40),
  reason text not null default '' check (char_length(reason) <= 1200),
  detail jsonb check (detail is null or (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 12000)),
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists news_decisions_recent_idx on public.news_decisions (created_at desc);
create index if not exists news_decisions_lead_idx on public.news_decisions (lead_id);
create index if not exists news_decisions_story_idx on public.news_decisions (story_id);

alter table public.news_decisions enable row level security;
create policy "Editors read decisions" on public.news_decisions for select to authenticated using (public.has_cap('news.write'));
create policy "Editors log decisions" on public.news_decisions for insert to authenticated with check (public.has_cap('news.write'));
revoke all on public.news_decisions from anon;

create table if not exists public.news_usage (
  id bigint generated always as identity primary key,
  run_id bigint references public.news_runs (id) on delete set null,
  job_id bigint references public.news_jobs (id) on delete set null,
  stage text not null check (char_length(stage) between 1 and 30),
  provider text not null default '' check (char_length(provider) <= 40),
  model text not null default '' check (char_length(model) <= 200),
  premium boolean not null default false,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  -- True when the provider reported the token counts; false when they were estimated from the text length.
  measured boolean not null default false,
  cost_usd numeric(12, 6) not null default 0,
  ms integer not null default 0,
  ok boolean not null default true,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists news_usage_recent_idx on public.news_usage (created_at desc);

alter table public.news_usage enable row level security;
create policy "Editors read model use" on public.news_usage for select to authenticated using (public.has_cap('news.write'));
create policy "Editors log model use" on public.news_usage for insert to authenticated with check (public.has_cap('news.write'));
revoke all on public.news_usage from anon;

-- ─── Watchers (leaks and quiet changes) ───────────────────────────────────────────────────────────────────────

create table if not exists public.news_watch (
  id uuid primary key default gen_random_uuid(),
  -- file: a public file in a GitHub repository (owner/name:branch:path), read raw. page: a public https page.
  kind text not null check (kind in ('file', 'page')),
  label text not null check (char_length(label) between 2 and 80),
  target text not null check (char_length(target) between 4 and 500),
  desk text references public.news_desks (id) on update cascade on delete set null,
  -- What to look for: a regular expression for identifiers (model names), or empty for "any change".
  pattern text not null default '' check (char_length(pattern) <= 300),
  publisher text not null default '' check (char_length(publisher) <= 80),
  enabled boolean not null default true,
  last_hash text check (char_length(last_hash) <= 80),
  last_tokens text[] not null default '{}' check (cardinality(last_tokens) <= 3000),
  last_checked timestamptz,
  last_changed timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kind, target)
);

alter table public.news_watch enable row level security;
create policy "Editors read watchers" on public.news_watch for select to authenticated using (public.has_cap('news.write'));
create policy "Publishers add watchers" on public.news_watch for insert to authenticated with check (public.has_cap('news.publish'));
create policy "Editors record watcher checks" on public.news_watch for update to authenticated
  using (public.has_cap('news.write')) with check (public.has_cap('news.write'));
revoke all on public.news_watch from anon;

-- Public files where model names appear before launch: official SDKs' model lists. Read-only, public, no login.
insert into public.news_watch (kind, label, target, desk, pattern, publisher) values
  ('file', 'OpenAI Python SDK: chat model names', 'openai/openai-python:main:src/openai/types/shared/chat_model.py', 'rumor', '"((?:gpt|o\d|chatgpt|codex)[a-z0-9.\-]*)"', 'OpenAI'),
  ('file', 'Anthropic Python SDK: model names', 'anthropics/anthropic-sdk-python:main:src/anthropic/types/model_param.py', 'rumor', '"(claude-[a-z0-9.\-]+)"', 'Anthropic'),
  ('file', 'Google Gen AI SDK: model names in docs', 'googleapis/python-genai:main:README.md', 'rumor', '(gemini-[0-9][a-z0-9.\-]*)', 'Google'),
  ('file', 'Mistral client: model names', 'mistralai/client-python:main:README.md', 'rumor', '((?:mistral|codestral|magistral|devstral|ministral|pixtral)-[a-z0-9.\-]+)', 'Mistral AI'),
  ('file', 'Ollama library index', 'ollama/ollama:main:README.md', 'models', '(?:ollama run )([a-z0-9][a-z0-9.:\-]+)', 'Ollama')
on conflict (kind, target) do nothing;

-- ─── Edit history ─────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.news_story_revisions (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.news_stories (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- 'editor' when a member made the change, 'agent' when the engine did.
  actor_kind text not null check (actor_kind in ('editor', 'agent')),
  reason text not null default '' check (char_length(reason) <= 300),
  title text not null,
  dek text not null default '',
  body text not null default '',
  status text not null,
  category text not null,
  desk text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists news_story_revisions_story_idx on public.news_story_revisions (story_id, created_at desc);

alter table public.news_story_revisions enable row level security;
create policy "Editors read edit history" on public.news_story_revisions for select to authenticated using (public.has_cap('news.write'));
revoke all on public.news_story_revisions from anon;
revoke insert, update on public.news_story_revisions from authenticated;

-- Keeps the version before every change to the text, the sources or the status.
create or replace function public.news_stories_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.title is distinct from new.title or old.dek is distinct from new.dek or old.body is distinct from new.body
     or old.status is distinct from new.status or old.sources is distinct from new.sources then
    insert into public.news_story_revisions (story_id, actor_id, actor_kind, reason, title, dek, body, status, category, desk, sources)
    values (old.id, (select auth.uid()), case when (select auth.uid()) is null then 'agent' else 'editor' end,
            left(coalesce(new.edit_reason, ''), 300), old.title, old.dek, old.body, old.status, old.category, old.desk, old.sources);
  end if;
  return new;
end;
$$;

create or replace trigger news_stories_history after update on public.news_stories
  for each row execute function public.news_stories_history();
revoke execute on function public.news_stories_history() from public, anon, authenticated;

-- ─── Reads, for "Rising in Nexverse news" ─────────────────────────────────────────────────────────────────────

create table if not exists public.news_reads (
  story_id uuid not null references public.news_stories (id) on delete cascade,
  day date not null default current_date,
  n integer not null default 0 check (n >= 0),
  primary key (story_id, day)
);

alter table public.news_reads enable row level security;
create policy "Read counts are public" on public.news_reads for select using (true);
revoke insert, update on public.news_reads from anon, authenticated;

-- One read of a published story. Anyone may count a read; the page sends at most one per story per visit.
create or replace function public.news_story_read(story uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.news_stories s where s.id = story and s.status = 'published' and s.published_at <= now()) then
    return;
  end if;
  insert into public.news_reads as r (story_id, day, n) values (story, current_date, 1)
  on conflict (story_id, day) do update set n = r.n + 1;
  update public.news_stories set reads = reads + 1 where id = story;
end;
$$;

revoke execute on function public.news_story_read(uuid) from public;
grant execute on function public.news_story_read(uuid) to anon, authenticated;

-- The read counter must not write an edit-history row or bump updated_at: the story guard and the history
-- trigger skip updates that only change `reads`.
create or replace function public.news_stories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'reads') = (to_jsonb(old) - 'reads') then
    return new;
  end if;
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
    new.reads := old.reads;
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

-- ─── Runs: the engine's columns, and a rate limit per kind ────────────────────────────────────────────────────

alter table public.news_runs add column if not exists kind text not null default 'collect' check (kind in ('collect', 'engine', 'backfill'));
alter table public.news_runs add column if not exists jobs_done integer not null default 0;
alter table public.news_runs add column if not exists ai_calls integer not null default 0;
alter table public.news_runs add column if not exists tokens integer not null default 0;
alter table public.news_runs add column if not exists cost_usd numeric(12, 6) not null default 0;
alter table public.news_runs add column if not exists detail jsonb check (detail is null or (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 12000));

-- The old "Collect now" runs stay at one every five minutes; engine ticks (every ten minutes from pg_cron,
-- or "Run now") may start once a minute, and the lock keeps two from overlapping.
create or replace function public.news_runs_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.kind, 'collect') = 'collect' then
    if exists (select 1 from public.news_runs r where coalesce(r.kind, 'collect') = 'collect' and r.started_at > now() - interval '5 minutes') then
      raise exception 'The newsroom collected less than five minutes ago. Try again in a few minutes.';
    end if;
  elsif exists (select 1 from public.news_runs r where r.kind <> 'collect' and r.started_at > now() - interval '50 seconds') then
    raise exception 'The research engine started less than a minute ago. Try again in a minute.';
  end if;
  new.started_at := now();
  new.actor_id := (select auth.uid());
  return new;
end;
$$;

-- ─── Engine settings ──────────────────────────────────────────────────────────────────────────────────────────
-- Stored in site_settings under "newsroom_engine": frequency, limits, per-stage models, editorial rules. Public
-- like every site setting, so it holds no secrets (API keys live in the server's environment only).

create policy "Publishers write engine settings" on public.site_settings for insert to authenticated
  with check (key = 'newsroom_engine' and public.has_cap('news.publish'));
create policy "Publishers change engine settings" on public.site_settings for update to authenticated
  using (key = 'newsroom_engine' and public.has_cap('news.publish')) with check (key = 'newsroom_engine' and public.has_cap('news.publish'));

-- ─── Media bucket (AI illustrations, saved once, served publicly) ─────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-media', 'news-media', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "News media is public" on storage.objects for select using (bucket_id = 'news-media');
create policy "Editors upload news media" on storage.objects for insert to authenticated
  with check (bucket_id = 'news-media' and public.has_cap('news.write'));

-- ─── Scheduling: pg_cron → pg_net → /api/newsroom/tick ────────────────────────────────────────────────────────

-- Posts one tick to the site. Reads the address and the shared secret from Vault; does nothing until both exist.
create or replace function public.news_engine_tick() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  tick_url text;
  secret text;
  req bigint;
begin
  select decrypted_secret into tick_url from vault.decrypted_secrets where name = 'newsroom_tick_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'newsroom_cron_secret' limit 1;
  if tick_url is null or secret is null or tick_url !~ '^https://' then
    raise notice 'newsroom tick skipped: store newsroom_tick_url and newsroom_cron_secret in Vault first';
    return null;
  end if;
  select net.http_post(
    url := tick_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || secret),
    body := jsonb_build_object('source', 'pg_cron', 'at', now()),
    timeout_milliseconds := 20000
  ) into req;
  return req;
end;
$$;

revoke execute on function public.news_engine_tick() from public, anon, authenticated;

-- What the scheduler did lately, for the admin's "Scheduler" card: the cron job and its last runs, and the
-- last answers the site gave to the ticks. Editors only.
create or replace function public.news_engine_scheduler() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  out jsonb := '{}'::jsonb;
begin
  if not public.has_cap('news.write') then
    raise exception 'Only news editors can do this';
  end if;
  out := out || jsonb_build_object('vault', jsonb_build_object(
    'url', exists (select 1 from vault.decrypted_secrets where name = 'newsroom_tick_url'),
    'secret', exists (select 1 from vault.decrypted_secrets where name = 'newsroom_cron_secret')));
  begin
    out := out || jsonb_build_object('jobs', coalesce((select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)) from cron.job where jobname like 'nexverse-newsroom%'), '[]'::jsonb));
    out := out || jsonb_build_object('runs', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('status', d.status, 'start', d.start_time, 'end', d.end_time, 'message', left(coalesce(d.return_message, ''), 200)) as x
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname like 'nexverse-newsroom%' order by d.start_time desc limit 12) t), '[]'::jsonb));
  exception when others then
    out := out || jsonb_build_object('jobs', '[]'::jsonb, 'runs', '[]'::jsonb, 'cronError', left(sqlerrm, 200));
  end;
  begin
    out := out || jsonb_build_object('responses', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('status', r.status_code, 'error', left(coalesce(r.error_msg, ''), 200), 'at', r.created) as x
      from net._http_response r order by r.created desc limit 8) t), '[]'::jsonb));
  exception when others then
    out := out || jsonb_build_object('responses', '[]'::jsonb);
  end;
  return out;
end;
$$;

revoke execute on function public.news_engine_scheduler() from public, anon;
grant execute on function public.news_engine_scheduler() to authenticated;

-- Every ten minutes, around the clock. The engine itself decides when a research cycle is due (hourly by
-- default, more often when the editors ask), so changing the frequency never needs a new cron job.
select cron.schedule('nexverse-newsroom-tick', '*/10 * * * *', $cron$select public.news_engine_tick()$cron$);
