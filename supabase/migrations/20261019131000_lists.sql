-- Admin-editable curated lists (round 9, /admin/lists). Every list is one row of public.site_content
-- (key 'lists.*', value = a JSON array of flat objects), the table of the site's editable content created by
-- the CMS migration. Most lists only change what pages show; two of them change rules the database enforces,
-- so the database reads them too:
--   lists.rep.points        points per contribution, used by reputation_ledger() (leaderboard, tiers, profiles)
--   lists.bench.benchmarks  benchmark slugs and reproduction tolerances, used by benchmark_tolerance(), and
--                           which benchmarks are retired (no new results)
-- Lists change site-wide rules and what every page offers, so only admins (or holders of settings.manage) write
-- them; other page editors keep editing copy. Additive only: functions are replaced with the same signatures,
-- one trigger and two restrictive policies are added. While site_content is
-- missing, or a list was never saved, everything behaves exactly as before (the built-in defaults).

-- ─── Reading a list ─────────────────────────────────────────────────────────────────────────────────────────

-- The saved rows of one list, or null when there are none (or the table is not there yet). Only 'lists.*'
-- keys, so this never exposes other site content.
create or replace function public.list_rows(k text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if k is null or k not like 'lists.%' then
    return null;
  end if;
  select c.value into v from public.site_content c where c.key = k;
  return case when jsonb_typeof(v) = 'array' then v else null end;
exception when undefined_table or undefined_column then
  return null;
end;
$$;

revoke execute on function public.list_rows(text) from public;
grant execute on function public.list_rows(text) to anon, authenticated;

-- ─── Reputation points ──────────────────────────────────────────────────────────────────────────────────────

-- Points for one kind of contribution: the admins' value (0 to 100) or the built-in default.
create or replace function public.rep_award(kind text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  pts numeric;
begin
  select (e->>'points')::numeric into pts
  from jsonb_array_elements(coalesce(public.list_rows('lists.rep.points'), '[]'::jsonb)) e
  where e->>'id' = kind and jsonb_typeof(e->'points') = 'number'
  limit 1;
  if pts is not null then
    return least(100, greatest(0, round(pts)))::integer;
  end if;
  return case kind when 'thread' then 5 when 'answer' then 2 when 'accepted' then 15 when 'like' then 2 when 'reaction' then 1 else 0 end;
end;
$$;

revoke execute on function public.rep_award(text) from public;
grant execute on function public.rep_award(text) to anon, authenticated;

-- The same ledger as 20261018221000_missions_launchpad.sql, with each contribution's points read once per
-- call from rep_award() instead of written in. Mission pledges and rewards keep their own amounts.
create or replace function public.reputation_ledger(since timestamptz default '-infinity')
returns table (member_id uuid, kind text, points integer, at timestamptz)
language sql stable set search_path = '' as $$
  with p as materialized (
    select public.rep_award('thread') as thread, public.rep_award('answer') as answer, public.rep_award('accepted') as accepted,
           public.rep_award('like') as liked, public.rep_award('reaction') as reaction
  )
  select q.author_id, 'thread', p.thread, q.created_at from public.questions q cross join p where q.created_at >= since
  union all
  select a.author_id, 'answer', p.answer, a.created_at from public.answers a cross join p where a.created_at >= since
  union all
  select a.author_id, 'accepted', p.accepted, coalesce(q.accepted_at, a.created_at)
  from public.questions q join public.answers a on a.id = q.accepted_answer_id cross join p
  where a.author_id <> q.author_id and coalesce(q.accepted_at, a.created_at) >= since
  union all
  select q.author_id, 'like', p.liked, l.created_at
  from public.likes l join public.questions q on l.target = 'thread:' || q.id::text cross join p
  where l.user_id <> q.author_id and l.created_at >= since
  union all
  select q.author_id, 'reaction', p.reaction, r.created_at
  from public.post_reactions r join public.questions q on r.target = 'thread:' || q.id::text cross join p
  where r.user_id <> q.author_id and r.created_at >= since
  union all
  select a.author_id, 'reaction', p.reaction, r.created_at
  from public.post_reactions r join public.answers a on r.target = 'answer:' || a.id::text cross join p
  where r.user_id <> a.author_id and r.created_at >= since
  union all
  select m.poster_id, 'mission-pledge', -m.reward, m.created_at
  from public.missions m
  where m.reward > 0 and m.created_at >= since and public.mission_state(m.status, m.deadline) <> 'expired'
  union all
  select m.winner_id, 'mission-reward', m.reward, m.completed_at
  from public.missions m
  where m.status = 'completed' and m.winner_id is not null and m.reward > 0 and m.completed_at >= since;
$$;

-- ─── Benchmarks ─────────────────────────────────────────────────────────────────────────────────────────────

-- How far a reproduction may land from the reported score: the admins' tolerance for any benchmark on their
-- list (new ones included), else the built-in value. Null means "not a benchmark", which the check on
-- benchmark_results.benchmark rejects. Was immutable; it now reads a table, so it is stable.
create or replace function public.benchmark_tolerance(benchmark text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  t numeric;
begin
  select (e->>'tolerance')::numeric into t
  from jsonb_array_elements(coalesce(public.list_rows('lists.bench.benchmarks'), '[]'::jsonb)) e
  where e->>'slug' = benchmark and jsonb_typeof(e->'tolerance') = 'number'
  limit 1;
  if t is not null and t > 0 then
    return least(t, 1000);
  end if;
  return case benchmark
    when 'mmlu' then 1.0
    when 'gsm8k' then 1.5
    when 'humaneval' then 2.0
    when 'mbpp' then 2.0
    when 'arc-challenge' then 1.0
    when 'hellaswag' then 0.5
    when 'truthfulqa' then 1.0
    when 'ifeval' then 1.5
    when 'belebele' then 1.0
    when 'flores-200' then 0.5
    when 'fleurs-wer' then 0.5
    when 'wikitext-ppl' then 0.1
  end;
end;
$$;

-- A retired benchmark keeps its results and reproductions, but takes no new results.
create or replace function public.benchmark_results_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from jsonb_array_elements(coalesce(public.list_rows('lists.bench.benchmarks'), '[]'::jsonb)) e
    where e->>'slug' = new.benchmark and e->'retired' = 'true'::jsonb
  ) then
    raise exception 'This benchmark is retired: its results stay up, but new ones are closed.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger benchmark_results_open
  before insert on public.benchmark_results
  for each row execute function public.benchmark_results_open();

-- ─── Who may write lists ────────────────────────────────────────────────────────────────────────────────────

-- On top of site_content's own policies (page editors write content): keys under 'lists.' need an admin.
do $$
begin
  if to_regclass('public.site_content') is null then
    raise notice 'public.site_content is missing: apply 20261019130000_site_content.sql, then this file again.';
    return;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_content' and policyname = 'Only admins add lists') then
    create policy "Only admins add lists" on public.site_content as restrictive for insert to authenticated
      with check (key not like 'lists.%' or public.is_admin() or public.cms_can('settings.manage'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_content' and policyname = 'Only admins change lists') then
    create policy "Only admins change lists" on public.site_content as restrictive for update to authenticated
      using (key not like 'lists.%' or public.is_admin() or public.cms_can('settings.manage'))
      with check (key not like 'lists.%' or public.is_admin() or public.cms_can('settings.manage'));
  end if;
end;
$$;
