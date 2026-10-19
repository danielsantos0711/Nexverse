-- Free AI router: role-based daily quotas, per-provider daily caps, and a response cache.
--
-- The admin's settings live in site_settings under the key 'ai' (public, no secrets):
--   { "enabled": true, "chains": { "<job>": ["provider:model", ...] },
--     "quotas": { "member": 30, "moderator": 150, ... }, "caps": { "gemini": 300, "groq": 400, ... } }
-- Every write below goes through a security definer function that reads limits from those settings, so a
-- member calling the functions directly with made-up numbers cannot raise their quota or the site's caps.
-- Server jobs without a member (cron) may call them with the service role key; members' calls run as
-- themselves. No secrets are stored anywhere in these tables.

-- Settings

create or replace function public.ai_setting()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select s.value from public.site_settings s where s.key = 'ai'), '{}'::jsonb)
$$;

revoke execute on function public.ai_setting() from public;
grant execute on function public.ai_setting() to anon, authenticated, service_role;

-- A number from the settings, or the fallback when it is missing or not a number.
create or replace function public.ai_setting_int(path text[], fallback integer)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := public.ai_setting() #> path;
begin
  if v is null or jsonb_typeof(v) <> 'number' then
    return fallback;
  end if;
  return greatest(0, least((v #>> '{}')::numeric, 1000000)::integer);
end;
$$;

revoke execute on function public.ai_setting_int(text[], integer) from public, anon;
grant execute on function public.ai_setting_int(text[], integer) to authenticated, service_role;

-- Whether the admin switched AI off.
create or replace function public.ai_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(public.ai_setting() -> 'enabled') = 'boolean' then (public.ai_setting() ->> 'enabled')::boolean else true end
$$;

revoke execute on function public.ai_enabled() from public;
grant execute on function public.ai_enabled() to anon, authenticated, service_role;

-- The caller's daily allowance from their role. Defaults match src/lib/ai/models.ts (DEFAULT_QUOTAS).
create or replace function public.ai_daily_limit()
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  r text := public.site_role();
  fallback integer;
begin
  fallback := case r
    when 'admin' then 300
    when 'moderator' then 150
    when 'editor' then 150
    when 'contributor' then 60
    else case when public.is_staff() then 150 else 30 end
  end;
  if r is null or r = 'guest' then
    return 0;
  end if;
  return least(public.ai_setting_int(array['quotas', r], fallback), 5000);
end;
$$;

revoke execute on function public.ai_daily_limit() from public, anon;
grant execute on function public.ai_daily_limit() to authenticated;

-- Whether the caller may use AI at all: signed in, not suspended, AI on, and the 'ai.use' capability once
-- has_cap() exists (it is added by the roles migration; until then every member may).
create or replace function public.ai_allowed()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  ok boolean := true;
begin
  if (select auth.uid()) is null or public.is_suspended() or not public.ai_enabled() then
    return false;
  end if;
  if to_regprocedure('public.has_cap(text)') is not null then
    execute 'select public.has_cap($1)' into ok using 'ai.use';
  end if;
  return coalesce(ok, false);
end;
$$;

revoke execute on function public.ai_allowed() from public, anon;
grant execute on function public.ai_allowed() to authenticated;

-- Member quotas (ai_usage from 20261019075000_ai_usage.sql)

-- How many provider calls a member's requests have started today. Each request may fall back through a few
-- models, so it may start up to four calls; this stops anyone from burning the site's caps without spending
-- their own allowance.
alter table public.ai_usage add column if not exists attempts integer not null default 0 check (attempts >= 0);

create policy "Staff read AI usage" on public.ai_usage for select to authenticated using (public.is_staff());

-- Same signature as before, so existing callers keep working. The limit sent by the caller can only lower
-- the allowance: the database clamps it to the quota for the caller's role.
-- Returns the new count for today, -1 when the limit is reached, -2 when the caller may not use AI.
create or replace function public.ai_consume(daily_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  lim integer;
  d date := (now() at time zone 'utc')::date;
  used integer;
begin
  if me is null then
    raise exception 'Sign in to use AI assist.';
  end if;
  if not public.ai_allowed() then
    return -2;
  end if;
  lim := least(greatest(coalesce(daily_limit, 30), 1), public.ai_daily_limit());
  if lim <= 0 then
    return -2;
  end if;
  insert into public.ai_usage as u (user_id, day, count) values (me, d, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < lim
  returning u.count into used;
  return coalesce(used, -1);
end;
$$;

revoke execute on function public.ai_consume(integer) from public, anon;
grant execute on function public.ai_consume(integer) to authenticated;

-- Per-provider daily counters

create table if not exists public.ai_provider_usage (
  day date not null default (now() at time zone 'utc')::date,
  provider text not null check (provider ~ '^[a-z]{2,20}$'),
  model text not null check (char_length(model) between 1 and 120),
  job text not null check (job ~ '^[a-z]{2,20}$'),
  requests integer not null default 0 check (requests >= 0),
  failures integer not null default 0 check (failures >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, provider, model, job)
);

alter table public.ai_provider_usage enable row level security;
create policy "Staff read AI provider usage" on public.ai_provider_usage for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.ai_provider_usage from anon, authenticated;

-- Count one call against a provider's daily cap before it is made.
-- Returns today's total for the provider, -1 when the provider is at its cap, -2 when the caller has no
-- request in progress to spend it on, -3 when AI is switched off.
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
    else 0
  end);

  -- One caller at a time per provider, so two requests cannot both take the last call under the cap.
  perform pg_advisory_xact_lock(hashtext('ai_provider:' || p_provider));
  select coalesce(sum(u.requests), 0) into total from public.ai_provider_usage u where u.day = d and u.provider = p_provider;
  if total >= cap then
    return -1;
  end if;

  if me is not null then
    update public.ai_usage u set attempts = u.attempts + 1
    where u.user_id = me and u.day = d and u.attempts < u.count * 4;
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

-- Note that a reserved call failed, for the admin's usage table. Only counts against a row already reserved today.
create or replace function public.ai_provider_fail(p_provider text, p_model text, p_job text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null and coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    return;
  end if;
  update public.ai_provider_usage u set failures = u.failures + 1, updated_at = now()
  where u.day = (now() at time zone 'utc')::date and u.provider = p_provider and u.model = p_model and u.job = p_job
    and u.failures < u.requests;
end;
$$;

revoke execute on function public.ai_provider_fail(text, text, text) from public, anon;
grant execute on function public.ai_provider_fail(text, text, text) to authenticated, service_role;

-- Response cache

-- Keys are HMAC-SHA256 values computed on the server with a secret, so nobody can derive the key of someone
-- else's prompt to read or plant an answer. Nobody reads the table directly; staff can count rows.
create table if not exists public.ai_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  job text not null check (job ~ '^[a-z]{2,20}$'),
  value jsonb not null check (pg_column_size(value) <= 65536),
  model text not null default '' check (char_length(model) <= 120),
  provider text not null default '' check (char_length(provider) <= 20),
  created_by uuid references public.profiles (id) on delete set null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists ai_cache_expires_at on public.ai_cache (expires_at);
create index if not exists ai_cache_created_by on public.ai_cache (created_by, created_at);

alter table public.ai_cache enable row level security;
create policy "Staff see the AI cache" on public.ai_cache for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.ai_cache from anon, authenticated;

-- A cached answer that has not expired, or null.
create or replace function public.ai_cache_get(k text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  hit public.ai_cache;
begin
  if (select auth.uid()) is null and coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    return null;
  end if;
  update public.ai_cache c set hits = c.hits + 1 where c.key = k and c.expires_at > now() returning * into hit;
  if hit.key is null then
    return null;
  end if;
  return jsonb_build_object('value', hit.value, 'model', hit.model, 'provider', hit.provider);
end;
$$;

revoke execute on function public.ai_cache_get(text) from public, anon;
grant execute on function public.ai_cache_get(text) to authenticated, service_role;

-- Store an answer. A member can store at most as many answers a day as calls they started, so the cache
-- cannot be used as free storage. Each write also clears a few expired rows.
create or replace function public.ai_cache_put(k text, p_job text, p_value jsonb, p_model text, p_provider text, ttl_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  d date := (now() at time zone 'utc')::date;
  budget integer;
begin
  if me is null and coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    return;
  end if;
  if me is not null then
    select coalesce(max(u.attempts), 0) into budget from public.ai_usage u where u.user_id = me and u.day = d;
    if (select count(*) from public.ai_cache c where c.created_by = me and c.created_at >= d::timestamptz) >= budget then
      return;
    end if;
  end if;
  insert into public.ai_cache (key, job, value, model, provider, created_by, expires_at)
  values (k, p_job, p_value, left(coalesce(p_model, ''), 120), left(coalesce(p_provider, ''), 20), me,
          now() + make_interval(secs => least(greatest(coalesce(ttl_seconds, 86400), 60), 60 * 86400)))
  on conflict (key) do update set value = excluded.value, model = excluded.model, provider = excluded.provider,
    created_by = excluded.created_by, created_at = now(), expires_at = excluded.expires_at, hits = 0;
  delete from public.ai_cache c where c.key in (select x.key from public.ai_cache x where x.expires_at < now() limit 20);
end;
$$;

revoke execute on function public.ai_cache_put(text, text, jsonb, text, text, integer) from public, anon;
grant execute on function public.ai_cache_put(text, text, jsonb, text, text, integer) to authenticated, service_role;
