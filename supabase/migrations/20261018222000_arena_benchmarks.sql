-- Arena and benchmarks: the community measures models itself. In the arena a member posts a prompt with two
-- outputs from two different models and everyone else votes blind; an Elo rating per model is computed from
-- every vote. In benchmarks members submit evaluation results with their settings and a link to the logs, and
-- other members say whether they could reproduce them. Members write only their own rows; notifications are
-- written by triggers through public.notify (see 20261018191000_social.sql).

-- ─── Duels ──────────────────────────────────────────────────────────────────────────────────────────────────

-- A model is named in free text ("Orbit 8B") and may point at a hub resource by its slug ("orbit-8b").
create table public.duels (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 10 and 4000),
  output_a text not null check (char_length(trim(output_a)) between 1 and 12000),
  output_b text not null check (char_length(trim(output_b)) between 1 and 12000),
  model_a text not null check (char_length(trim(model_a)) between 1 and 80),
  model_b text not null check (char_length(trim(model_b)) between 1 and 80),
  model_a_slug text check (model_a_slug ~ '^[a-z0-9-]{1,80}$'),
  model_b_slug text check (model_b_slug ~ '^[a-z0-9-]{1,80}$'),
  task text not null check (task in ('code', 'writing', 'reasoning', 'translation', 'other')),
  langs text[] not null check (
    cardinality(langs) between 1 and 4 and array_to_string(langs, ',') ~ '^[a-z]{2}(,[a-z]{2}){0,3}$'
  ),
  created_at timestamptz not null default now(),
  check (lower(btrim(model_a)) <> lower(btrim(model_b))),
  check (output_a <> output_b)
);

create index duels_created_idx on public.duels (created_at desc);
create index duels_author_idx on public.duels (author_id);

-- One vote per member per duel, final once cast (the model names are revealed right after).
-- 'a' and 'b' name the stored outputs, whatever order the voter saw them in.
create table public.duel_votes (
  duel_id uuid not null references public.duels (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choice text not null check (choice in ('a', 'b', 'tie', 'bad')),
  created_at timestamptz not null default now(),
  primary key (duel_id, user_id)
);

create index duel_votes_user_idx on public.duel_votes (user_id);
create index duel_votes_created_idx on public.duel_votes (created_at);

-- No more than 10 new duels a day per member.
create function public.duel_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.duels d where d.author_id = new.author_id and d.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can post up to 10 duels a day.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger duels_rules before insert on public.duels
  for each row execute function public.duel_rules();

-- You cannot vote on your own duel (you know which model is which), and no more than 600 votes an hour.
create function public.duel_vote_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d public.duels;
begin
  select * into d from public.duels where id = new.duel_id;
  if d.id is null then
    raise exception 'This duel does not exist.' using errcode = 'P0001';
  end if;
  if d.author_id = new.user_id then
    raise exception 'You posted this duel, so you already know which model is which.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.duel_votes v where v.user_id = new.user_id and v.created_at > now() - interval '1 hour') >= 600 then
    raise exception 'That is a lot of votes in one hour. Take a break and come back soon.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger duel_votes_rules before insert on public.duel_votes
  for each row execute function public.duel_vote_rules();

-- Tells a duel's author when it reaches 10 and 100 votes. No actor: ballots are secret.
create function public.notify_duel_milestone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n bigint;
  d public.duels;
begin
  select count(*) into n from public.duel_votes v where v.duel_id = new.duel_id;
  if n in (10, 100) then
    select * into d from public.duels where id = new.duel_id;
    perform public.notify(d.author_id, 'system', null, 'duel:' || d.id::text,
      'Your duel has ' || n || ' votes: ' || left(d.prompt, 120));
  end if;
  return new;
end;
$$;

create trigger duel_votes_notify after insert on public.duel_votes
  for each row execute function public.notify_duel_milestone();

alter table public.duels enable row level security;
alter table public.duel_votes enable row level security;

-- Duels are public, but the model names are not part of what anyone can select: they come back from
-- duel_reveal() only to the author and to members who already voted. That keeps the vote blind.
create policy "Duels are public" on public.duels for select using (true);
create policy "Members post duels as themselves" on public.duels for insert
  to authenticated with check (author_id = (select auth.uid()));
create policy "Authors delete their duels" on public.duels for delete
  to authenticated using (author_id = (select auth.uid()));

revoke select, update on public.duels from anon, authenticated;
grant select (id, author_id, prompt, output_a, output_b, task, langs, created_at) on public.duels to anon, authenticated;

-- Ballots are secret: members see only their own; totals come from duel_counts() and duel_totals().
create policy "Members see their own duel votes" on public.duel_votes for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Members vote as themselves" on public.duel_votes for insert
  to authenticated with check (user_id = (select auth.uid()));

revoke update, delete on public.duel_votes from anon, authenticated;

-- The model names and the full tally of the given duels, for the ones the caller posted or voted on.
create function public.duel_reveal(ids uuid[])
returns table (
  duel_id uuid, model_a text, model_b text, model_a_slug text, model_b_slug text,
  a bigint, b bigint, tie bigint, bad bigint, mine text
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.model_a, d.model_b, d.model_a_slug, d.model_b_slug,
    count(v.user_id) filter (where v.choice = 'a'),
    count(v.user_id) filter (where v.choice = 'b'),
    count(v.user_id) filter (where v.choice = 'tie'),
    count(v.user_id) filter (where v.choice = 'bad'),
    (select m.choice from public.duel_votes m where m.duel_id = d.id and m.user_id = (select auth.uid()))
  from public.duels d
  left join public.duel_votes v on v.duel_id = d.id
  where d.id = any (ids[1:200])
    and (
      d.author_id = (select auth.uid())
      or exists (select 1 from public.duel_votes m where m.duel_id = d.id and m.user_id = (select auth.uid()))
    )
  group by d.id;
$$;

-- How many votes each duel has, without the split (showing the split before voting would sway it).
create function public.duel_totals(ids uuid[]) returns table (duel_id uuid, votes bigint)
language sql stable security definer set search_path = '' as $$
  select v.duel_id, count(*) from public.duel_votes v where v.duel_id = any (ids[1:500]) group by v.duel_id;
$$;

-- Elo ratings per model name from every vote, oldest first: everyone starts at 1000, K is 32, a tie or
-- "both bad" counts as a draw. Optionally only duels of one task and/or one language. history holds the
-- model's rating after each of its last 40 games, for a sparkline.
create function public.arena_ratings(task_filter text default null, lang_filter text default null)
returns table (
  model text, slug text, rating integer, votes integer, wins integer, losses integer, ties integer,
  history integer[], last_vote timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  st jsonb := '{}'::jsonb;
  r record;
  ka text;
  kb text;
  ra double precision;
  rb double precision;
  ea double precision;
  sa double precision;
  ga jsonb;
  gb jsonb;
begin
  for r in
    select d.model_a, d.model_b, d.model_a_slug, d.model_b_slug, v.choice, v.created_at
    from public.duel_votes v
    join public.duels d on d.id = v.duel_id
    where (task_filter is null or d.task = task_filter)
      and (lang_filter is null or lang_filter = any (d.langs))
    order by v.created_at, v.duel_id, v.user_id
  loop
    ka := lower(btrim(r.model_a));
    kb := lower(btrim(r.model_b));
    ga := coalesce(st -> ka, jsonb_build_object('n', btrim(r.model_a), 's', r.model_a_slug, 'r', 1000, 'w', 0, 'l', 0, 't', 0, 'h', '[]'::jsonb));
    gb := coalesce(st -> kb, jsonb_build_object('n', btrim(r.model_b), 's', r.model_b_slug, 'r', 1000, 'w', 0, 'l', 0, 't', 0, 'h', '[]'::jsonb));
    ra := (ga ->> 'r')::double precision;
    rb := (gb ->> 'r')::double precision;
    ea := 1 / (1 + power(10, (rb - ra) / 400));
    sa := case r.choice when 'a' then 1 when 'b' then 0 else 0.5 end;
    ra := ra + 32 * (sa - ea);
    rb := rb + 32 * ((1 - sa) - (1 - ea));
    ga := ga || jsonb_build_object(
      'r', ra,
      's', coalesce(ga ->> 's', r.model_a_slug),
      'w', (ga ->> 'w')::int + (r.choice = 'a')::int,
      'l', (ga ->> 'l')::int + (r.choice = 'b')::int,
      't', (ga ->> 't')::int + (r.choice in ('tie', 'bad'))::int,
      'h', (case when jsonb_array_length(ga -> 'h') >= 40 then (ga -> 'h') - 0 else ga -> 'h' end) || to_jsonb(round(ra)::int),
      'at', r.created_at
    );
    gb := gb || jsonb_build_object(
      'r', rb,
      's', coalesce(gb ->> 's', r.model_b_slug),
      'w', (gb ->> 'w')::int + (r.choice = 'b')::int,
      'l', (gb ->> 'l')::int + (r.choice = 'a')::int,
      't', (gb ->> 't')::int + (r.choice in ('tie', 'bad'))::int,
      'h', (case when jsonb_array_length(gb -> 'h') >= 40 then (gb -> 'h') - 0 else gb -> 'h' end) || to_jsonb(round(rb)::int),
      'at', r.created_at
    );
    st := st || jsonb_build_object(ka, ga, kb, gb);
  end loop;

  return query
    select e.value ->> 'n', e.value ->> 's', round((e.value ->> 'r')::double precision)::int,
      ((e.value ->> 'w')::int + (e.value ->> 'l')::int + (e.value ->> 't')::int),
      (e.value ->> 'w')::int, (e.value ->> 'l')::int, (e.value ->> 't')::int,
      array(select x::int from jsonb_array_elements_text(e.value -> 'h') as x),
      (e.value ->> 'at')::timestamptz
    from jsonb_each(st) as e
    order by 3 desc, 4 desc;
end;
$$;

revoke execute on function public.duel_reveal(uuid[]) from public;
grant execute on function public.duel_reveal(uuid[]) to anon, authenticated;
revoke execute on function public.duel_totals(uuid[]) from public;
grant execute on function public.duel_totals(uuid[]) to anon, authenticated;
revoke execute on function public.arena_ratings(text, text) from public;
grant execute on function public.arena_ratings(text, text) to anon, authenticated;

-- ─── Benchmark results and reproductions ────────────────────────────────────────────────────────────────────

-- The curated benchmarks (src/lib/benchmarks.ts holds their names, metrics and directions) and how far a
-- reproduction may land from the reported score and still count, in the metric's own units.
create function public.benchmark_tolerance(benchmark text) returns numeric
language sql immutable set search_path = '' as $$
  select case benchmark
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
$$;

create table public.benchmark_results (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  benchmark text not null check (public.benchmark_tolerance(benchmark) is not null),
  model text not null check (char_length(trim(model)) between 1 and 80),
  model_slug text check (model_slug ~ '^[a-z0-9-]{1,80}$'),
  score numeric(10, 3) not null check (score >= 0 and score <= 100000),
  shots smallint check (shots between 0 and 64),
  quantisation text not null default '' check (char_length(quantisation) <= 40),
  hardware text not null default '' check (char_length(hardware) <= 80),
  harness text not null default '' check (char_length(harness) <= 80),
  logs_url text not null check (logs_url ~ '^https://[^\s/$.?#][^\s]*$' and char_length(logs_url) <= 500),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index benchmark_results_bench_idx on public.benchmark_results (benchmark, score desc);
create index benchmark_results_model_idx on public.benchmark_results (model_slug) where model_slug is not null;
create index benchmark_results_author_idx on public.benchmark_results (author_id);

-- One verdict per member per result. "reproduced" carries the score they measured, which must be within the
-- benchmark's tolerance of the reported one; "failed" may carry it.
create table public.benchmark_repros (
  result_id uuid not null references public.benchmark_results (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  outcome text not null check (outcome in ('reproduced', 'failed')),
  measured numeric(10, 3) check (measured >= 0 and measured <= 100000),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (result_id, user_id),
  check (outcome <> 'reproduced' or measured is not null)
);

create index benchmark_repros_user_idx on public.benchmark_repros (user_id);

-- No more than 20 results a day per member; plain numbers only (score scale is checked against the metric).
create function public.benchmark_result_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.benchmark_results b where b.author_id = new.author_id and b.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can submit up to 20 results a day.' using errcode = 'P0001';
  end if;
  if new.benchmark <> 'wikitext-ppl' and new.score > 100 then
    raise exception 'This benchmark is scored from 0 to 100.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger benchmark_results_rules before insert on public.benchmark_results
  for each row execute function public.benchmark_result_rules();

-- You cannot reproduce your own result, and "reproduced" must land within the tolerance.
create function public.benchmark_repro_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  res public.benchmark_results;
  tol numeric;
begin
  select * into res from public.benchmark_results where id = new.result_id;
  if res.id is null then
    raise exception 'This result does not exist.' using errcode = 'P0001';
  end if;
  if res.author_id = new.user_id then
    raise exception 'Someone else has to reproduce your result.' using errcode = 'P0001';
  end if;
  tol := public.benchmark_tolerance(res.benchmark);
  if new.outcome = 'reproduced' and abs(new.measured - res.score) > tol then
    raise exception 'That is more than ±% away from the reported score. Mark it as could not reproduce instead.', tol using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.benchmark_repros p where p.user_id = new.user_id and p.created_at > now() - interval '1 day') >= 50 then
    raise exception 'You can check up to 50 results a day.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger benchmark_repros_rules before insert or update on public.benchmark_repros
  for each row execute function public.benchmark_repro_rules();

-- Someone checked a member's result: tell its author.
create function public.notify_benchmark_repro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  res public.benchmark_results;
begin
  if tg_op = 'UPDATE' and new.outcome = old.outcome then
    return new;
  end if;
  select * into res from public.benchmark_results where id = new.result_id;
  perform public.notify(res.author_id, 'system', new.user_id, 'benchmark:' || res.benchmark,
    case new.outcome when 'reproduced' then 'Reproduced your ' else 'Could not reproduce your ' end
      || res.model || ' result (' || trim_scale(res.score)::text || ')');
  return new;
end;
$$;

create trigger benchmark_repros_notify after insert or update of outcome on public.benchmark_repros
  for each row execute function public.notify_benchmark_repro();

alter table public.benchmark_results enable row level security;
alter table public.benchmark_repros enable row level security;

create policy "Benchmark results are public" on public.benchmark_results for select using (true);
create policy "Members submit results as themselves" on public.benchmark_results for insert
  to authenticated with check (author_id = (select auth.uid()));
create policy "Authors withdraw their results" on public.benchmark_results for delete
  to authenticated using (author_id = (select auth.uid()));

-- Who reproduced what is part of a result, like a review.
create policy "Reproductions are public" on public.benchmark_repros for select using (true);
create policy "Members report reproductions as themselves" on public.benchmark_repros for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members change their reproduction" on public.benchmark_repros for update
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members take back their reproduction" on public.benchmark_repros for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.benchmark_results from anon, authenticated;
revoke update on public.benchmark_repros from anon, authenticated;
grant update (outcome, measured, note) on public.benchmark_repros to authenticated;

revoke execute on function public.benchmark_tolerance(text) from public;
grant execute on function public.benchmark_tolerance(text) to anon, authenticated;

-- Trigger functions are not part of the API.
revoke execute on function public.duel_rules() from public, anon, authenticated;
revoke execute on function public.duel_vote_rules() from public, anon, authenticated;
revoke execute on function public.notify_duel_milestone() from public, anon, authenticated;
revoke execute on function public.benchmark_result_rules() from public, anon, authenticated;
revoke execute on function public.benchmark_repro_rules() from public, anon, authenticated;
revoke execute on function public.notify_benchmark_repro() from public, anon, authenticated;
