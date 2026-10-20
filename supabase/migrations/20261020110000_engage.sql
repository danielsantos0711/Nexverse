-- Round 10, "engage": many more ways to earn reputation, richer missions, and members' own spaces.
--
--   1. Reputation. Points per contribution now come from one table of rules (rep_rules(): the built-in defaults
--      in rep_rule_defaults(), overridden by the admins' list "lists.rep.points"), each with a daily cap. The
--      ledger keeps its signature and every source it had, and adds publishing, releases, stars, forks,
--      downloads, followers, events, missions, duels, benchmarks, helpful chat replies, crew milestones,
--      collection follows, launch boosts, a 7-day streak, a first contribution and every badge collected.
--      Anti-abuse: nothing a member does to their own work counts, hidden content earns nothing, events count
--      only once they happened with someone else going, and each kind stops earning after its daily cap.
--      New sources read private tables (downloads, chat), so they are gathered by one security definer function
--      that only ever returns public facts (who earned what, when) for public, visible things.
--   2. Missions. Types (bounty, challenge, quest chain), a cover and an accent colour, milestones pilots tick off,
--      a prize line, team entries, a host crew, followers, updates from the poster, a discussion and reviews
--      of entries. Status rules and the pledge stay exactly as in 20261018221000_missions_launchpad.sql.
--   3. Member spaces. A profile's cover, accent, planet, tagline, pinned items and badges on display, and each
--      member's private tuning of their "For you" feed.
--
-- Additive only: new tables (RLS on each), new columns with defaults, functions replaced with the same
-- signatures, new triggers and policies. No drops and no deletes.

-- ─── 0. New mission columns (the ledger below reads teammates) ──────────────────────────────────────────────

-- The look and shape of a mission. cover: 'pattern:<name>' (drawn by the site) or an https image. accent: one of
-- the site's colours (as for crews). milestones: steps pilots tick off. prize: anything beyond the points, in
-- words. team: entries may name teammates from the crew. crew_id: the crew hosting it. chain_prev: the previous
-- mission of a quest chain, by the same poster.
alter table public.missions add column if not exists kind text not null default 'bounty'
  check (kind in ('bounty', 'challenge', 'quest'));
alter table public.missions add column if not exists cover text
  check (cover is null or cover ~ '^pattern:[a-z-]{2,20}$' or (char_length(cover) <= 500 and cover ~ '^https://[^\s]+$'));
alter table public.missions add column if not exists accent text not null default 'ion'
  check (accent in ('ion', 'gold', 'ok', 'violet', 'rose', 'teal', 'amber', 'sky'));
alter table public.missions add column if not exists milestones text[] not null default '{}'
  check (cardinality(milestones) <= 12 and array_position(milestones, null) is null);
alter table public.missions add column if not exists prize text not null default '' check (char_length(prize) <= 200);
alter table public.missions add column if not exists team boolean not null default false;
alter table public.missions add column if not exists crew_id uuid references public.crews (id) on delete set null;
alter table public.missions add column if not exists chain_prev uuid references public.missions (id) on delete set null;

create index if not exists missions_kind_idx on public.missions (kind, created_at desc);
create index if not exists missions_crew_idx on public.missions (crew_id) where crew_id is not null;
create index if not exists missions_chain_idx on public.missions (chain_prev) where chain_prev is not null;

-- Teammates named on a team entry (members of the mission's crew).
alter table public.mission_entries add column if not exists teammates uuid[] not null default '{}'
  check (cardinality(teammates) <= 5 and array_position(teammates, null) is null);

-- ─── 1. Reputation rules ────────────────────────────────────────────────────────────────────────────────────

-- Every kind of contribution with its built-in points and daily cap (how many times a day it can earn; 0 means
-- no cap). The ids match POINT_RULES in src/lib/community.ts and the admins' list in /admin/lists.
create or replace function public.rep_rule_defaults()
returns table (kind text, points integer, cap integer)
language sql immutable set search_path = '' as $$
  values
    ('thread'::text, 5, 10),
    ('answer', 2, 30),
    ('accepted', 15, 0),
    ('like', 2, 50),
    ('reaction', 1, 50),
    ('project', 10, 3),
    ('release', 5, 5),
    ('project-like', 2, 25),
    ('star', 2, 25),
    ('fork', 3, 10),
    ('download', 1, 25),
    ('follower', 1, 20),
    ('event-hosted', 10, 2),
    ('event-attended', 2, 3),
    ('mission-entry', 3, 3),
    ('mission-won', 20, 0),
    ('mission-hosted', 5, 0),
    ('duel', 3, 5),
    ('benchmark', 3, 5),
    ('reproduced', 5, 5),
    ('confirmed', 5, 10),
    ('chat-helpful', 1, 10),
    ('crew-milestone', 10, 0),
    ('collection-follow', 2, 20),
    ('launch-boost', 1, 25),
    ('streak', 10, 0),
    ('first', 10, 0),
    ('badge', 5, 0);
$$;

revoke execute on function public.rep_rule_defaults() from public;
grant execute on function public.rep_rule_defaults() to anon, authenticated;

-- The rules in force: the admins' points (0 to 100) and caps (0 to 1000) where they saved one, else the defaults.
create or replace function public.rep_rules()
returns table (kind text, points integer, cap integer)
language sql stable security definer set search_path = public as $$
  with saved as (
    select e from jsonb_array_elements(coalesce(public.list_rows('lists.rep.points'), '[]'::jsonb)) e
  )
  select d.kind,
    coalesce((
      select least(100, greatest(0, round((s.e->>'points')::numeric)))::integer
      from saved s where s.e->>'id' = d.kind and jsonb_typeof(s.e->'points') = 'number' limit 1
    ), d.points),
    coalesce((
      select least(1000, greatest(0, round((s.e->>'cap')::numeric)))::integer
      from saved s where s.e->>'id' = d.kind and jsonb_typeof(s.e->'cap') = 'number' limit 1
    ), d.cap)
  from public.rep_rule_defaults() d;
$$;

revoke execute on function public.rep_rules() from public;
grant execute on function public.rep_rules() to anon, authenticated;

-- Same signature as 20261019131000_lists.sql: points for one kind, now from the full set of rules.
create or replace function public.rep_award(kind text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  pts integer;
begin
  select r.points into pts from public.rep_rules() r where r.kind = rep_award.kind limit 1;
  return coalesce(pts, 0);
end;
$$;

revoke execute on function public.rep_award(text) from public;
grant execute on function public.rep_award(text) to anon, authenticated;

-- The new sources, one row per thing that earns: (who, kind, when). Runs as the owner because some sources are
-- private tables (downloads, chat rooms), and returns only public facts about public, visible things. Nothing
-- a member does to their own work is counted.
create or replace function public.rep_extra_events()
returns table (member_id uuid, kind text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  -- Publishing a public project.
  select p.owner_id, 'project'::text, coalesce(p.published_at, p.created_at)
  from public.projects p
  where p.status = 'published' and p.visibility = 'public' and p.hidden_at is null and coalesce(p.published_at, p.created_at) <= now()
  union all
  -- A new version of a public project.
  select p.owner_id, 'release', v.created_at
  from public.project_versions v join public.projects p on p.id = v.project_id
  where p.status = 'published' and p.visibility = 'public' and p.hidden_at is null
  union all
  -- A release of a public code repository.
  select r.author_id, 'release', r.created_at
  from public.code_releases r join public.code_repos c on c.id = r.repo_id
  where c.visibility = 'public' and c.hidden_at is null and c.deleted_at is null
  union all
  -- Likes on a public project, from someone else.
  select p.owner_id, 'project-like', l.created_at
  from public.likes l join public.projects p on l.target = 'project:' || p.id::text
  where l.user_id <> p.owner_id and p.visibility = 'public' and p.hidden_at is null
  union all
  -- Stars on a public repository, from someone else.
  select c.owner_id, 'star', s.created_at
  from public.code_stars s join public.code_repos c on c.id = s.repo_id
  where s.member_id <> c.owner_id and c.visibility = 'public' and c.hidden_at is null and c.deleted_at is null
  union all
  -- Public forks of a public repository, by someone else.
  select o.owner_id, 'fork', f.created_at
  from public.code_repos f join public.code_repos o on o.id = f.forked_from
  where f.owner_id <> o.owner_id and o.visibility = 'public' and f.visibility = 'public'
    and o.deleted_at is null and f.deleted_at is null and f.hidden_at is null
  union all
  -- Downloads of your files by signed-in members (one a day per member and file, by the downloads table).
  select f.owner_id, 'download', (d.day::timestamp at time zone 'utc')
  from public.file_downloads d join public.files f on f.id = d.file_id
  where d.member_id is not null and d.member_id <> f.owner_id
    and (f.target_kind <> 'project' or exists (
      select 1 from public.projects p where p.id = f.target_id and p.visibility = 'public' and p.status = 'published' and p.hidden_at is null
    ))
  union all
  -- New followers.
  select p.id, 'follower', f.created_at
  from public.follows f join public.profiles p on f.followee = 'member:' || p.id::text
  where f.follower_id <> p.id
  union all
  -- Hosting an event, once it has happened with at least one other member going.
  select e.host_id, 'event-hosted', coalesce(e.ends_at, e.starts_at)
  from public.events e
  where e.hidden_at is null and coalesce(e.ends_at, e.starts_at) <= now()
    and exists (select 1 from public.event_rsvps r where r.event = e.id::text and r.status = 'going' and r.user_id <> e.host_id)
  union all
  -- Going to someone else's event, counted when it starts (RSVPs made after it ended do not count).
  select r.user_id, 'event-attended', e.starts_at
  from public.event_rsvps r join public.events e on r.event = e.id::text
  where r.status = 'going' and r.user_id <> e.host_id and e.hidden_at is null and e.starts_at <= now()
    and r.created_at <= coalesce(e.ends_at, e.starts_at + interval '1 day')
  union all
  -- Submitting a mission entry.
  select x.author_id, 'mission-entry', x.created_at
  from public.mission_entries x join public.missions m on m.id = x.mission_id
  where x.author_id <> m.poster_id
  union all
  -- Winning a mission (on top of its reward), and each teammate on the winning entry.
  select m.winner_id, 'mission-won', m.completed_at
  from public.missions m
  where m.status = 'completed' and m.winner_id is not null and m.winner_id <> m.poster_id
  union all
  select t.id, 'mission-won', m.completed_at
  from public.missions m join public.mission_entries x on x.id = m.winner_entry
  cross join lateral unnest(x.teammates) as t(id)
  where m.status = 'completed' and t.id <> m.poster_id and t.id <> x.author_id
  union all
  -- Posting a mission that found its winner.
  select m.poster_id, 'mission-hosted', m.completed_at
  from public.missions m
  where m.status = 'completed' and m.winner_id is not null and m.winner_id <> m.poster_id
  union all
  -- An arena duel others voted on: counted at the third vote from someone else.
  select d.author_id, 'duel', v.created_at
  from public.duels d
  cross join lateral (
    select x.created_at from public.duel_votes x where x.duel_id = d.id and x.user_id <> d.author_id order by x.created_at offset 2 limit 1
  ) v
  union all
  -- Posting a benchmark result.
  select b.author_id, 'benchmark', b.created_at from public.benchmark_results b
  union all
  -- Reproducing someone else's result, and having yours reproduced.
  select r.user_id, 'reproduced', r.created_at
  from public.benchmark_repros r join public.benchmark_results b on b.id = r.result_id
  where r.user_id <> b.author_id
  union all
  select b.author_id, 'confirmed', r.created_at
  from public.benchmark_repros r join public.benchmark_results b on b.id = r.result_id
  where r.user_id <> b.author_id and r.outcome = 'reproduced'
  union all
  -- A reply in a public chat room, to someone else, that others reacted to: counted at the first reaction.
  select msg.author_id, 'chat-helpful', h.at
  from public.room_messages msg
  join public.rooms ro on ro.slug = msg.room
  cross join lateral (
    select min(x.created_at) as at from public.message_reactions x where x.message_id = msg.id and x.user_id <> msg.author_id
  ) h
  where ro.kind = 'public' and not ro.staff_only and msg.hidden_at is null and h.at is not null and msg.reply_to is not null
    and exists (select 1 from public.room_messages q where q.id = msg.reply_to and q.author_id <> msg.author_id)
  union all
  -- Your crew reaching 5, 10, 25, 50 and 100 members.
  select c.owner_id, 'crew-milestone', cm.joined_at
  from (
    select y.crew_id, y.joined_at, row_number() over (partition by y.crew_id order by y.joined_at) as n from public.crew_members y
  ) cm join public.crews c on c.id = cm.crew_id
  where cm.n in (5, 10, 25, 50, 100)
  union all
  -- Someone following your public collection.
  select c.owner_id, 'collection-follow', f.created_at
  from public.collection_follows f join public.collections c on f.collection = c.id::text
  where c.is_public and f.user_id <> c.owner_id
  union all
  -- A boost on your launch.
  select l.owner_id, 'launch-boost', b.created_at
  from public.launch_boosts b join public.launches l on l.id = b.launch_id
  where b.user_id <> l.owner_id;
$$;

revoke execute on function public.rep_extra_events() from public;
grant execute on function public.rep_extra_events() to anon, authenticated;

-- Same signature as before. Rows of every kind, each capped per member per UTC day, plus three kinds worked out
-- from the rest: "first" (your first own contribution), "streak" (every 7th day in a row with one) and "badge"
-- (each badge in lists.rep.badges, or the defaults, the moment its count is reached; "points" badges are left
-- out, since points cannot earn points). Mission pledges and rewards keep their own amounts and no cap.
create or replace function public.reputation_ledger(since timestamptz default '-infinity')
returns table (member_id uuid, kind text, points integer, at timestamptz)
language sql stable set search_path = '' as $$
  with rules as materialized (
    select r.kind, r.points, r.cap from public.rep_rules() r
  ),
  base as materialized (
    select q.author_id as m, 'thread'::text as k, q.created_at as at from public.questions q where q.hidden_at is null
    union all
    select a.author_id, 'answer', a.created_at from public.answers a where a.hidden_at is null
    union all
    select a.author_id, 'accepted', coalesce(q.accepted_at, a.created_at)
    from public.questions q join public.answers a on a.id = q.accepted_answer_id
    where a.author_id <> q.author_id and a.hidden_at is null
    union all
    select q.author_id, 'like', l.created_at
    from public.likes l join public.questions q on l.target = 'thread:' || q.id::text
    where l.user_id <> q.author_id
    union all
    select q.author_id, 'reaction', r.created_at
    from public.post_reactions r join public.questions q on r.target = 'thread:' || q.id::text
    where r.user_id <> q.author_id
    union all
    select a.author_id, 'reaction', r.created_at
    from public.post_reactions r join public.answers a on r.target = 'answer:' || a.id::text
    where r.user_id <> a.author_id
    union all
    select e.member_id, e.kind, e.at from public.rep_extra_events() e
  ),
  ranked as (
    select b.m, b.k, b.at, r.points, r.cap,
      row_number() over (partition by b.m, b.k, (b.at at time zone 'utc')::date order by b.at) as n
    from base b join rules r on r.kind = b.k
    where b.m is not null and b.at is not null and b.at <= now() + interval '1 minute'
  ),
  earned as (
    select x.m, x.k, x.points, x.at from ranked x where x.cap = 0 or x.n <= x.cap
  ),
  own as (
    select b.m, b.at from base b
    where b.m is not null and b.at <= now() + interval '1 minute'
      and b.k in ('thread', 'answer', 'project', 'release', 'benchmark', 'reproduced', 'mission-entry', 'event-hosted', 'event-attended')
  ),
  days as (
    select o.m, (o.at at time zone 'utc')::date as d, min(o.at) as first_at from own o group by 1, 2
  ),
  runs as (
    select y.m, y.d, y.first_at, y.d - (row_number() over (partition by y.m order by y.d))::integer as grp from days y
  ),
  streaks as (
    select s.m, s.first_at, row_number() over (partition by s.m, s.grp order by s.d) as len from runs s
  ),
  badge_rules as (
    select x.e->>'stat' as stat, greatest(1, round((x.e->>'min')::numeric))::bigint as goal
    from jsonb_array_elements(coalesce(public.list_rows('lists.rep.badges'), '[
      {"stat": "threads", "min": 1}, {"stat": "answers", "min": 10}, {"stat": "accepted", "min": 1},
      {"stat": "accepted", "min": 10}, {"stat": "appreciation", "min": 50}, {"stat": "eventsHosted", "min": 1},
      {"stat": "collections", "min": 1}
    ]'::jsonb)) x(e)
    where jsonb_typeof(x.e->'min') = 'number' and x.e->>'stat' is distinct from 'points'
  ),
  stat_rows as (
    select b.m,
      case b.k when 'thread' then 'threads' when 'answer' then 'answers' when 'accepted' then 'accepted'
        when 'event-hosted' then 'eventsHosted' else 'appreciation' end as stat,
      b.at
    from base b where b.k in ('thread', 'answer', 'accepted', 'like', 'reaction', 'event-hosted')
    union all
    select c.owner_id, 'collections', c.created_at from public.collections c where c.is_public
  ),
  stat_ranked as (
    select s.m, s.stat, s.at, row_number() over (partition by s.m, s.stat order by s.at) as n from stat_rows s
  ),
  derived as (
    select o.m, 'first'::text as k, min(o.at) as at from own o group by o.m
    union all
    select s.m, 'streak', s.first_at from streaks s where s.len % 7 = 0
    union all
    select sr.m, 'badge', sr.at from stat_ranked sr join badge_rules br on br.stat = sr.stat and br.goal = sr.n
  ),
  everything as (
    select e.m, e.k, e.points, e.at from earned e
    union all
    select d.m, d.k, r.points, d.at from derived d join rules r on r.kind = d.k
    union all
    select m.poster_id, 'mission-pledge', -m.reward, m.created_at
    from public.missions m
    where m.reward > 0 and public.mission_state(m.status, m.deadline) <> 'expired'
    union all
    select m.winner_id, 'mission-reward', m.reward, m.completed_at
    from public.missions m
    where m.status = 'completed' and m.winner_id is not null and m.reward > 0
  )
  select e.m, e.k, e.points, e.at from everything e where e.at >= since;
$$;

revoke execute on function public.reputation_ledger(timestamptz) from public;
grant execute on function public.reputation_ledger(timestamptz) to anon, authenticated;

-- A member's points, newest first: what earned them, how many, when. `before` pages back.
create or replace function public.points_history(member uuid, max_rows integer default 60, older_than timestamptz default null)
returns table (kind text, points integer, at timestamptz)
language sql stable set search_path = '' as $$
  select l.kind, l.points, l.at
  from public.reputation_ledger() l
  where l.member_id = member and (older_than is null or l.at < older_than)
  order by l.at desc
  limit least(greatest(coalesce(max_rows, 60), 1), 200);
$$;

-- A member's points per kind: how many times, how many points, how many times today (UTC, for the daily caps)
-- and points in the last 7 days.
create or replace function public.points_breakdown(member uuid)
returns table (kind text, times bigint, points bigint, today bigint, week bigint)
language sql stable set search_path = '' as $$
  select l.kind, count(*), coalesce(sum(l.points), 0)::bigint,
    count(*) filter (where l.at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
    coalesce(sum(l.points) filter (where l.at >= now() - interval '7 days'), 0)::bigint
  from public.reputation_ledger() l
  where l.member_id = member
  group by l.kind;
$$;

revoke execute on function public.points_history(uuid, integer, timestamptz), public.points_breakdown(uuid) from public;
grant execute on function public.points_history(uuid, integer, timestamptz), public.points_breakdown(uuid) to anon, authenticated;

-- ─── 2. Missions ────────────────────────────────────────────────────────────────────────────────────────────

-- Checks the new mission fields: milestone lengths, a quest's previous mission, the host crew.
create or replace function public.mission_look_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.milestones) s where char_length(trim(s)) not between 1 and 120) then
    raise exception 'Each milestone is 1 to 120 characters.' using errcode = 'P0001';
  end if;
  if new.chain_prev is not null and (tg_op = 'INSERT' or new.chain_prev is distinct from old.chain_prev) then
    if new.chain_prev = new.id or not exists (select 1 from public.missions p where p.id = new.chain_prev and p.poster_id = new.poster_id) then
      raise exception 'A quest continues one of your own missions.' using errcode = 'P0001';
    end if;
  end if;
  if new.crew_id is not null and (tg_op = 'INSERT' or new.crew_id is distinct from old.crew_id) then
    if not exists (select 1 from public.crew_members c where c.crew_id = new.crew_id and c.user_id = new.poster_id) then
      raise exception 'Host a mission only for a crew you are in.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger missions_look before insert or update on public.missions
  for each row execute function public.mission_look_rules();

-- Teammates: only on team missions, at most five, from the crew, never the author or the poster.
create or replace function public.mission_entry_team_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
begin
  new.teammates := coalesce(array(select distinct u.id from unnest(new.teammates) as u(id) where u.id <> new.author_id), '{}');
  if cardinality(new.teammates) = 0 then
    return new;
  end if;
  select * into m from public.missions where id = new.mission_id;
  if not coalesce(m.team, false) then
    raise exception 'This mission takes solo entries only.' using errcode = 'P0001';
  end if;
  if m.poster_id = any (new.teammates) then
    raise exception 'The member who posted the mission cannot be on a team.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(new.teammates) as u(id)
    where not exists (select 1 from public.mission_crew c where c.mission_id = new.mission_id and c.user_id = u.id)
  ) then
    raise exception 'Teammates must be on this mission''s crew first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger mission_entries_team before insert or update on public.mission_entries
  for each row execute function public.mission_entry_team_rules();

-- Members following a mission: they hear about updates and the result.
create table if not exists public.mission_follows (
  mission_id uuid not null references public.missions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create index if not exists mission_follows_user_idx on public.mission_follows (user_id, created_at desc);
alter table public.mission_follows enable row level security;

-- Updates the poster posts on a mission (a changed brief, a hint, a shout-out).
create table if not exists public.mission_updates (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists mission_updates_mission_idx on public.mission_updates (mission_id, created_at desc);
alter table public.mission_updates enable row level security;

-- The mission's discussion: questions to the poster, ideas, finding teammates. One level of replies.
create table if not exists public.mission_comments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reply_to uuid references public.mission_comments (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  hidden_at timestamptz
);

create index if not exists mission_comments_mission_idx on public.mission_comments (mission_id, created_at);
alter table public.mission_comments enable row level security;

-- The poster's review of an entry before the pick: a verdict and a note the pilot sees.
create table if not exists public.mission_reviews (
  entry_id uuid primary key references public.mission_entries (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  verdict text not null check (verdict in ('promising', 'changes', 'not-eligible')),
  note text not null default '' check (char_length(note) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists mission_reviews_mission_idx on public.mission_reviews (mission_id);
alter table public.mission_reviews enable row level security;

-- Milestones a pilot has ticked off (by position in missions.milestones).
create table if not exists public.mission_progress (
  mission_id uuid not null references public.missions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  step smallint not null check (step between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id, step)
);

alter table public.mission_progress enable row level security;

do $$
begin
  -- Follows, updates, progress: public to read (counts and progress bars), members write their own.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_follows' and policyname = 'Mission follows are public') then
    create policy "Mission follows are public" on public.mission_follows for select using (true);
    create policy "Members follow missions as themselves" on public.mission_follows for insert to authenticated
      with check (user_id = (select auth.uid()) and not public.is_suspended());
    create policy "Members unfollow missions" on public.mission_follows for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_updates' and policyname = 'Mission updates are public') then
    create policy "Mission updates are public" on public.mission_updates for select using (true);
    create policy "Posters post updates" on public.mission_updates for insert to authenticated
      with check (
        author_id = (select auth.uid()) and not public.is_suspended()
        and exists (select 1 from public.missions m where m.id = mission_updates.mission_id and m.poster_id = (select auth.uid()))
      );
    create policy "Posters remove their updates" on public.mission_updates for delete to authenticated
      using (author_id = (select auth.uid()) or public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_comments' and policyname = 'Visible mission comments are public') then
    create policy "Visible mission comments are public" on public.mission_comments for select
      using (hidden_at is null or author_id = (select auth.uid()) or public.is_staff());
    create policy "Members comment as themselves" on public.mission_comments for insert to authenticated
      with check (author_id = (select auth.uid()) and public.has_cap('reply.create') and hidden_at is null and edited_at is null);
    create policy "Authors edit and staff hide comments" on public.mission_comments for update to authenticated
      using (author_id = (select auth.uid()) or public.is_staff())
      with check (author_id = (select auth.uid()) or public.is_staff());
    create policy "Authors and staff remove comments" on public.mission_comments for delete to authenticated
      using (author_id = (select auth.uid()) or public.is_staff());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_reviews' and policyname = 'Reviews for the poster and the pilot') then
    -- A review is between the poster and the pilot (and the teammates of the entry).
    create policy "Reviews for the poster and the pilot" on public.mission_reviews for select
      using (
        reviewer_id = (select auth.uid())
        or exists (
          select 1 from public.mission_entries e
          where e.id = mission_reviews.entry_id and (e.author_id = (select auth.uid()) or (select auth.uid()) = any (e.teammates))
        )
      );
    create policy "Posters review entries" on public.mission_reviews for insert to authenticated
      with check (
        reviewer_id = (select auth.uid()) and not public.is_suspended()
        and exists (
          select 1 from public.missions m join public.mission_entries e on e.mission_id = m.id
          where m.id = mission_reviews.mission_id and e.id = mission_reviews.entry_id and m.poster_id = (select auth.uid()) and m.status <> 'completed'
        )
      );
    create policy "Posters change their reviews" on public.mission_reviews for update to authenticated
      using (reviewer_id = (select auth.uid()))
      with check (reviewer_id = (select auth.uid()) and not public.is_suspended());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mission_progress' and policyname = 'Mission progress is public') then
    create policy "Mission progress is public" on public.mission_progress for select using (true);
    create policy "Pilots tick their milestones" on public.mission_progress for insert to authenticated
      with check (
        user_id = (select auth.uid()) and not public.is_suspended()
        and exists (select 1 from public.mission_crew c where c.mission_id = mission_progress.mission_id and c.user_id = (select auth.uid()))
        and exists (select 1 from public.missions m where m.id = mission_progress.mission_id and mission_progress.step < cardinality(m.milestones))
      );
    create policy "Pilots untick their milestones" on public.mission_progress for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end;
$$;

-- An update tells everyone following the mission and everyone on its crew.
create or replace function public.mission_update_posted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
  r record;
begin
  select * into m from public.missions where id = new.mission_id;
  for r in
    select f.user_id as id from public.mission_follows f where f.mission_id = new.mission_id
    union
    select c.user_id from public.mission_crew c where c.mission_id = new.mission_id
  loop
    perform public.notify(r.id, 'system', new.author_id, 'mission:' || new.mission_id::text, 'Update on ' || m.title || ': ' || left(new.body, 200));
  end loop;
  return new;
end;
$$;

create or replace trigger mission_updates_posted after insert on public.mission_updates
  for each row execute function public.mission_update_posted();

-- A comment tells the poster, and a reply tells the comment's author. Up to 30 comments a day per member.
create or replace function public.mission_comment_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent public.mission_comments;
begin
  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    new.created_at := old.created_at;
    new.mission_id := old.mission_id;
    new.author_id := old.author_id;
    new.reply_to := old.reply_to;
    return new;
  end if;
  if (select count(*) from public.mission_comments c where c.author_id = new.author_id and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You can post up to 30 mission comments a day.' using errcode = 'P0001';
  end if;
  if new.reply_to is not null then
    select * into parent from public.mission_comments where id = new.reply_to;
    if parent.id is null or parent.mission_id <> new.mission_id then
      raise exception 'That comment is not on this mission.' using errcode = 'P0001';
    end if;
    -- One level of replies: a reply to a reply hangs under the same first comment.
    if parent.reply_to is not null then
      new.reply_to := parent.reply_to;
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create or replace trigger mission_comments_rules before insert or update on public.mission_comments
  for each row execute function public.mission_comment_rules();

create or replace function public.mission_comment_posted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
  parent_author uuid;
begin
  select * into m from public.missions where id = new.mission_id;
  perform public.notify(m.poster_id, 'reply', new.author_id, 'mission:' || new.mission_id::text, left(new.body, 200));
  if new.reply_to is not null then
    select c.author_id into parent_author from public.mission_comments c where c.id = new.reply_to;
    if parent_author is distinct from m.poster_id then
      perform public.notify(parent_author, 'reply', new.author_id, 'mission:' || new.mission_id::text, left(new.body, 200));
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger mission_comments_posted after insert on public.mission_comments
  for each row execute function public.mission_comment_posted();

-- A review tells the pilot what the poster thinks (the note stays between them).
create or replace function public.mission_review_posted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
  title text;
begin
  new.updated_at := now();
  select e.author_id, m.title into author, title
  from public.mission_entries e join public.missions m on m.id = e.mission_id where e.id = new.entry_id;
  perform public.notify(
    author, 'system', new.reviewer_id, 'mission:' || new.mission_id::text,
    case new.verdict when 'promising' then 'Your entry looks promising: ' when 'changes' then 'Changes asked on your entry: ' else 'Your entry does not meet the criteria: ' end
      || title || coalesce(': ' || nullif(trim(new.note), ''), '')
  );
  return new;
end;
$$;

create or replace trigger mission_reviews_posted before insert or update on public.mission_reviews
  for each row execute function public.mission_review_posted();

-- Live updates for the mission page.
do $$
declare
  t text;
begin
  foreach t in array array['mission_follows', 'mission_updates', 'mission_comments', 'mission_progress'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null;
    end;
  end loop;
end;
$$;

-- ─── 3. Member spaces ───────────────────────────────────────────────────────────────────────────────────────

-- What a member chose for their profile. cover: 'pattern:<name>' or an https image; accent: a site colour;
-- planet: one of the seven worlds the profile planet is drawn from; pinned: up to six things they made or
-- curated ('project:<id>', 'thread:<id>', 'collection:<id>', 'share:<id>', 'mission:<id>', 'repo:<id>');
-- badges: up to six badge ids to put on display; layout: how the profile lays out what they made.
create table if not exists public.member_spaces (
  member_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  cover text check (cover is null or cover ~ '^pattern:[a-z-]{2,20}$' or (char_length(cover) <= 500 and cover ~ '^https://[^\s]+$')),
  accent text not null default 'ion' check (accent in ('ion', 'gold', 'ok', 'violet', 'rose', 'teal', 'amber', 'sky')),
  planet text check (planet is null or planet in ('ion', 'tide', 'champagne', 'violet', 'ice', 'ember', 'moss')),
  tagline text not null default '' check (char_length(tagline) <= 80),
  status text not null default '' check (char_length(status) <= 60),
  pinned text[] not null default '{}'
    check (cardinality(pinned) <= 6 and (cardinality(pinned) = 0 or array_to_string(pinned, ' ') ~ '^[a-z]{2,16}:[a-z0-9-]{1,80}( [a-z]{2,16}:[a-z0-9-]{1,80})*$')),
  badges text[] not null default '{}'
    check (cardinality(badges) <= 6 and (cardinality(badges) = 0 or array_to_string(badges, ' ') ~ '^[a-z0-9][a-z0-9-]{0,39}( [a-z0-9][a-z0-9-]{0,39})*$')),
  layout text not null default 'grid' check (layout in ('grid', 'list', 'orbit')),
  updated_at timestamptz not null default now()
);

alter table public.member_spaces enable row level security;

-- Each member's tuning of their "For you" feed. Private.
create table if not exists public.feed_tuning (
  member_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  hidden_kinds text[] not null default '{}' check (cardinality(hidden_kinds) <= 12),
  muted text[] not null default '{}' check (cardinality(muted) <= 200),
  hidden text[] not null default '{}' check (cardinality(hidden) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.feed_tuning enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'member_spaces' and policyname = 'Member spaces are public') then
    create policy "Member spaces are public" on public.member_spaces for select using (true);
    create policy "Members set up their space" on public.member_spaces for insert to authenticated
      with check (member_id = (select auth.uid()) and not public.is_suspended());
    create policy "Members change their space" on public.member_spaces for update to authenticated
      using (member_id = (select auth.uid()))
      with check (member_id = (select auth.uid()) and not public.is_suspended());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feed_tuning' and policyname = 'Members read their feed tuning') then
    create policy "Members read their feed tuning" on public.feed_tuning for select to authenticated
      using (member_id = (select auth.uid()));
    create policy "Members save their feed tuning" on public.feed_tuning for insert to authenticated
      with check (member_id = (select auth.uid()));
    create policy "Members change their feed tuning" on public.feed_tuning for update to authenticated
      using (member_id = (select auth.uid()))
      with check (member_id = (select auth.uid()));
  end if;
end;
$$;

create or replace function public.engage_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger member_spaces_touch before update on public.member_spaces
  for each row execute function public.engage_touch_updated_at();
create or replace trigger feed_tuning_touch before update on public.feed_tuning
  for each row execute function public.engage_touch_updated_at();
