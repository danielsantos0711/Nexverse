-- Round 11: the smarter AI layer.
--   1. ai_call_stats: per day, provider, model and job: successes, failures, latency, tokens and cost, plus the
--      last failure kind, so /admin/ai can show what each job really uses and how well it works.
--   2. ai_feedback: "was this useful" per member and AI moment.
--   3. ai_catalog: the live model lists fetched from each provider's public catalogue (admin refresh).
--   4. ai_search(): full-text search over public Nexverse content, so AI answers cite Nexverse items.
--   5. ai_provider_reserve(): same as before, with default daily caps for the new providers.
-- No drops. Every new table has row level security. Security definer functions set search_path = public.

-- 1. Call stats

create table if not exists public.ai_call_stats (
  day date not null default (now() at time zone 'utc')::date,
  provider text not null check (provider ~ '^[a-z]{2,20}$'),
  model text not null check (char_length(model) between 1 and 120),
  job text not null check (job ~ '^[a-z]{2,20}$'),
  ok integer not null default 0 check (ok >= 0),
  fail integer not null default 0 check (fail >= 0),
  ms_total bigint not null default 0 check (ms_total >= 0),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  last_error text check (last_error is null or last_error ~ '^[a-z_]{2,20}( [0-9]{3})?$'),
  last_at timestamptz not null default now(),
  primary key (day, provider, model, job)
);

alter table public.ai_call_stats enable row level security;
create policy "Staff read AI call stats" on public.ai_call_stats for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.ai_call_stats from anon, authenticated;

-- How many stats rows a member's requests have written today; capped so nobody can inflate the numbers
-- (or the premium spend) by calling the function directly.
alter table public.ai_usage add column if not exists recorded integer not null default 0;

create or replace function public.ai_call_record(
  p_provider text, p_model text, p_job text, p_ok boolean, p_ms integer,
  p_tokens_in integer, p_tokens_out integer, p_cost numeric, p_error text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  service boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  d date := (now() at time zone 'utc')::date;
begin
  if p_provider !~ '^[a-z]{2,20}$' or p_job !~ '^[a-z]{2,20}$' or char_length(coalesce(p_model, '')) not between 1 and 120 then
    return;
  end if;
  if me is null and not service then
    return;
  end if;
  if me is not null then
    update public.ai_usage u set recorded = u.recorded + 1
    where u.user_id = me and u.day = d and u.recorded < u.count * 8;
    if not found then
      return;
    end if;
  end if;
  insert into public.ai_call_stats as s (day, provider, model, job, ok, fail, ms_total, tokens_in, tokens_out, cost_usd, last_error, last_at)
  values (
    d, p_provider, p_model, p_job,
    case when p_ok then 1 else 0 end,
    case when p_ok then 0 else 1 end,
    least(greatest(coalesce(p_ms, 0), 0), 600000),
    least(greatest(coalesce(p_tokens_in, 0), 0), 2000000),
    least(greatest(coalesce(p_tokens_out, 0), 0), 500000),
    least(greatest(coalesce(p_cost, 0), 0), 5),
    case when p_ok or p_error !~ '^[a-z_]{2,20}( [0-9]{3})?$' then null else p_error end,
    now()
  )
  on conflict (day, provider, model, job) do update set
    ok = s.ok + excluded.ok,
    fail = s.fail + excluded.fail,
    ms_total = s.ms_total + excluded.ms_total,
    tokens_in = s.tokens_in + excluded.tokens_in,
    tokens_out = s.tokens_out + excluded.tokens_out,
    cost_usd = s.cost_usd + excluded.cost_usd,
    last_error = coalesce(excluded.last_error, s.last_error),
    last_at = now();
end;
$$;

revoke execute on function public.ai_call_record(text, text, text, boolean, integer, integer, integer, numeric, text) from public, anon;
grant execute on function public.ai_call_record(text, text, text, boolean, integer, integer, integer, numeric, text) to authenticated, service_role;

-- What the opt-in premium models have cost this calendar month (UTC). Readable by anyone who can use AI, so
-- the router can stop at the admin's monthly budget; it is one number, nothing per member.
create or replace function public.ai_premium_spent()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(s.cost_usd), 0)
  from public.ai_call_stats s
  where s.day >= date_trunc('month', (now() at time zone 'utc'))::date
    and s.provider in ('anthropic', 'openrouterpaid')
$$;

revoke execute on function public.ai_premium_spent() from public, anon;
grant execute on function public.ai_premium_spent() to authenticated, service_role;

-- 2. Feedback

create table if not exists public.ai_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z0-9_-]{1,39}$'),
  target text not null default '' check (char_length(target) <= 200),
  useful boolean not null,
  model text not null default '' check (char_length(model) <= 160),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature, target)
);

alter table public.ai_feedback enable row level security;
create policy "Members read their own AI feedback" on public.ai_feedback for select to authenticated using (user_id = (select auth.uid()) or public.is_staff());
create policy "Members give AI feedback" on public.ai_feedback for insert to authenticated with check (user_id = (select auth.uid()) and not public.is_suspended());
create policy "Members change their AI feedback" on public.ai_feedback for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke delete on public.ai_feedback from anon, authenticated;

create index if not exists ai_feedback_feature_idx on public.ai_feedback (feature, created_at desc);

-- 3. Live model catalogue (no secrets: model ids, context sizes and prices from public catalogues)

create table if not exists public.ai_catalog (
  provider text primary key check (provider ~ '^[a-z]{2,20}$'),
  models jsonb not null default '[]'::jsonb check (jsonb_typeof(models) = 'array' and pg_column_size(models) <= 1048576),
  fetched_at timestamptz not null default now()
);

alter table public.ai_catalog enable row level security;
create policy "Anyone reads the AI catalogue" on public.ai_catalog for select using (true);
create policy "Admins refresh the AI catalogue" on public.ai_catalog for insert to authenticated with check (public.is_admin());
create policy "Admins update the AI catalogue" on public.ai_catalog for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4. Search over public Nexverse content. Security invoker: row level security decides what each caller sees,
-- so guests and members only ever get what they could already read.

create or replace function public.ai_search(q text, lim integer default 8)
returns table (kind text, id text, title text, snippet text, url text, at timestamptz, rank real)
language sql stable security invoker set search_path = public as $$
  with query as (
    -- Any of the words, not all of them: a member's question rarely matches every word of an item. Ranking
    -- still puts items that match more words first.
    select coalesce(nullif(replace(websearch_to_tsquery('english', left(coalesce(q, ''), 200))::text, ' & ', ' | '), ''), 'nexverse_no_match')::tsquery as tsq
  ),
  hits as (
    select 'thread'::text as kind, x.id::text, x.title, left(coalesce(x.body, ''), 600) as body, '/forum/' || x.id as url, x.created_at as at,
      ts_rank(setweight(to_tsvector('english', coalesce(x.title, '')), 'A') || setweight(to_tsvector('english', coalesce(x.body, '')), 'C') || setweight(to_tsvector('english', array_to_string(coalesce(x.tags, '{}'), ' ')), 'B'), query.tsq) as rank
    from public.questions x, query
    where x.hidden_at is null
      and (to_tsvector('english', coalesce(x.title, '') || ' ' || coalesce(x.body, '') || ' ' || array_to_string(coalesce(x.tags, '{}'), ' ')) @@ query.tsq)
    union all
    select 'news', x.id::text, x.title, left(coalesce(x.dek, '') || ' ' || coalesce(x.body, ''), 600), '/news/' || x.id, coalesce(x.published_at, x.created_at),
      ts_rank(setweight(to_tsvector('english', coalesce(x.title, '')), 'A') || setweight(to_tsvector('english', coalesce(x.dek, '')), 'B') || setweight(to_tsvector('english', coalesce(x.body, '')), 'C'), query.tsq)
    from public.news_stories x, query
    where x.status = 'published'
      and to_tsvector('english', coalesce(x.title, '') || ' ' || coalesce(x.dek, '') || ' ' || coalesce(x.body, '')) @@ query.tsq
    union all
    select x.kind, x.id::text, x.name, left(coalesce(x.summary, '') || ' ' || coalesce(x.readme, ''), 600), '/p/' || x.id, coalesce(x.published_at, x.created_at),
      ts_rank(setweight(to_tsvector('english', coalesce(x.name, '')), 'A') || setweight(to_tsvector('english', coalesce(x.summary, '')), 'B') || setweight(to_tsvector('english', array_to_string(coalesce(x.tags, '{}'), ' ')), 'B') || setweight(to_tsvector('english', coalesce(x.readme, '')), 'D'), query.tsq)
    from public.projects x, query
    where x.hidden_at is null and coalesce(x.visibility, 'public') = 'public' and x.published_at is not null
      and to_tsvector('english', coalesce(x.name, '') || ' ' || coalesce(x.summary, '') || ' ' || array_to_string(coalesce(x.tags, '{}'), ' ') || ' ' || coalesce(x.readme, '')) @@ query.tsq
    union all
    select 'repo', x.id::text, x.name, left(coalesce(x.description, '') || ' ' || coalesce(x.readme, ''), 600), '/code/go/' || x.id, coalesce(x.pushed_at, x.created_at),
      ts_rank(setweight(to_tsvector('english', coalesce(x.name, '')), 'A') || setweight(to_tsvector('english', coalesce(x.description, '')), 'B') || setweight(to_tsvector('english', coalesce(x.readme, '')), 'D'), query.tsq)
    from public.code_repos x, query
    where x.visibility = 'public' and x.hidden_at is null and x.deleted_at is null
      and to_tsvector('english', coalesce(x.name, '') || ' ' || coalesce(x.description, '') || ' ' || array_to_string(coalesce(x.topics, '{}'), ' ') || ' ' || coalesce(x.readme, '')) @@ query.tsq
    union all
    select 'event', x.id::text, x.title, left(coalesce(x.description, ''), 600), '/events/' || x.id, x.starts_at,
      ts_rank(setweight(to_tsvector('english', coalesce(x.title, '')), 'A') || setweight(to_tsvector('english', coalesce(x.description, '')), 'C'), query.tsq)
    from public.events x, query
    where x.hidden_at is null
      and to_tsvector('english', coalesce(x.title, '') || ' ' || coalesce(x.description, '')) @@ query.tsq
    union all
    select 'page', x.id::text, x.title, left(coalesce(x.description, ''), 600), '/pages/' || x.slug, coalesce(x.published_at, x.updated_at),
      ts_rank(setweight(to_tsvector('english', coalesce(x.title, '')), 'A') || setweight(to_tsvector('english', coalesce(x.description, '')), 'B'), query.tsq)
    from public.site_pages x, query
    where x.status = 'published'
      and to_tsvector('english', coalesce(x.title, '') || ' ' || coalesce(x.description, '')) @@ query.tsq
    union all
    select 'room', x.slug, x.name, coalesce(x.topic, ''), '/chat/' || x.slug, x.created_at,
      ts_rank(to_tsvector('english', coalesce(x.name, '') || ' ' || coalesce(x.topic, '')), query.tsq)
    from public.rooms x, query
    where not coalesce(x.archived, false)
      and to_tsvector('english', coalesce(x.name, '') || ' ' || coalesce(x.topic, '')) @@ query.tsq
  )
  select h.kind, h.id, h.title, h.body, h.url, h.at,
    -- A light freshness boost, so this week's story beats a year-old one with the same words.
    (h.rank * (1 + 0.5 / (1 + greatest(extract(epoch from (now() - coalesce(h.at, now()))) / 86400, 0) / 30)))::real as rank
  from hits h
  order by 7 desc
  limit least(greatest(coalesce(lim, 8), 1), 20)
$$;

grant execute on function public.ai_search(text, integer) to anon, authenticated, service_role;

-- 5. Provider reservation with default caps for the new providers (Cerebras free tier; the opt-in premium
-- providers are bounded by the admin's monthly budget instead, so their request caps are generous).

create or replace function public.ai_provider_reserve(p_provider text, p_model text, p_job text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  service boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  d date := (now() at time zone 'utc')::date;
  cap integer;
  total integer;
begin
  if p_provider !~ '^[a-z]{2,20}$' or p_job !~ '^[a-z]{2,20}$' or char_length(coalesce(p_model, '')) not between 1 and 120 then
    raise exception 'Bad provider, model or job';
  end if;
  if not public.ai_enabled() then
    return -3;
  end if;
  if me is null and not service then
    return -2;
  end if;

  cap := public.ai_setting_int(array['caps', p_provider], case p_provider
    when 'gemini' then 300
    when 'groq' then 400
    when 'openrouter' then 45
    when 'cloudflare' then 80
    when 'mistral' then 200
    when 'cerebras' then 600
    when 'anthropic' then 2000
    when 'openrouterpaid' then 2000
    else 0
  end);

  perform pg_advisory_xact_lock(hashtext('ai_provider:' || p_provider));
  select coalesce(sum(u.requests), 0) into total from public.ai_provider_usage u where u.day = d and u.provider = p_provider;
  if total >= cap then
    return -1;
  end if;

  if me is not null then
    update public.ai_usage u set attempts = u.attempts + 1
    where u.user_id = me and u.day = d and u.attempts < u.count * 6;
    if not found then
      return -2;
    end if;
  end if;

  insert into public.ai_provider_usage as u (day, provider, model, job, requests)
  values (d, p_provider, p_model, p_job, 1)
  on conflict (day, provider, model, job) do update set requests = u.requests + 1, updated_at = now();
  return total + 1;
end;
$$;

revoke execute on function public.ai_provider_reserve(text, text, text) from public, anon;
grant execute on function public.ai_provider_reserve(text, text, text) to authenticated, service_role;
