-- Missions and the Launchpad. A mission is a challenge a member posts with a brief, acceptance criteria and a
-- reward in reputation points pledged from their own points; members join its crew, submit entries, and the
-- poster picks the winner, who receives the points. A launch is a scheduled day in the spotlight for a project
-- or a hub resource: a countdown, then 24 hours where members boost it once each, then the archive.
-- Everything is public to read; members write only their own rows; status changes and notifications happen in
-- triggers and security definer functions only (see 20261018201000_community.sql for the conventions).

-- ─── Missions ───────────────────────────────────────────────────────────────────────────────────────────────

-- "expired" is never stored: a mission expires on its own when its deadline passes with no entries, or 14 days
-- after the deadline when entries came in but the poster never picked a winner. The pledge is then returned.
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 8 and 120),
  brief text not null default '' check (char_length(brief) <= 8000),
  criteria text[] not null check (cardinality(criteria) between 1 and 12 and array_position(criteria, null) is null),
  difficulty text not null check (difficulty in ('cadet', 'pilot', 'commander')),
  reward integer not null default 0 check (reward between 0 and 1000),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 5 and (cardinality(tags) = 0 or array_to_string(tags, ',') ~ '^[a-z0-9][a-z0-9-]{0,23}(,[a-z0-9][a-z0-9-]{0,23})*$')),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open', 'in-progress', 'review', 'completed')),
  winner_id uuid references public.profiles (id) on delete set null,
  winner_entry uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status <> 'completed' or completed_at is not null)
);

create index missions_created_idx on public.missions (created_at desc);
create index missions_poster_idx on public.missions (poster_id, created_at desc);
create index missions_winner_idx on public.missions (winner_id) where winner_id is not null;
create index missions_tags_idx on public.missions using gin (tags);

-- Members who accepted a mission: its crew of pilots.
create table public.mission_crew (
  mission_id uuid not null references public.missions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create index mission_crew_user_idx on public.mission_crew (user_id, created_at desc);

-- One entry per pilot per mission: a project page on Nexverse, a GitHub repository or a paper, with notes.
create table public.mission_entries (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('project', 'repo', 'paper')),
  url text not null check (char_length(url) <= 500),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, author_id),
  check (
    (kind = 'project' and url ~ '^/p/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (kind = 'repo' and url ~ '^https://github\.com/[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}/?$')
    or (kind = 'paper' and url ~ '^https://[^\s]+$')
  )
);

create index mission_entries_mission_idx on public.mission_entries (mission_id, created_at);
create index mission_entries_author_idx on public.mission_entries (author_id);

alter table public.missions
  add constraint missions_winner_entry_fkey foreign key (winner_entry) references public.mission_entries (id) on delete set null;

-- What a mission is right now, with expiry worked out from the clock.
create function public.mission_state(status text, deadline timestamptz) returns text
language sql stable set search_path = '' as $$
  select case
    when status = 'completed' then 'completed'
    when status in ('open', 'in-progress') and deadline < now() then 'expired'
    when status = 'review' and deadline < now() - interval '14 days' then 'expired'
    else status
  end;
$$;

revoke execute on function public.mission_state(text, timestamptz) from public;
grant execute on function public.mission_state(text, timestamptz) to anon, authenticated;

-- ─── Reputation, now with missions ──────────────────────────────────────────────────────────────────────────

-- Same as before, plus two mission rows: posting a mission holds its reward from the poster (negative, until it
-- expires and the pledge is returned), and winning one pays the reward to the winner.
create or replace function public.reputation_ledger(since timestamptz default '-infinity')
returns table (member_id uuid, kind text, points integer, at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select q.author_id, 'thread', 5, q.created_at from public.questions q where q.created_at >= since
  union all
  select a.author_id, 'answer', 2, a.created_at from public.answers a where a.created_at >= since
  union all
  select a.author_id, 'accepted', 15, coalesce(q.accepted_at, a.created_at)
  from public.questions q join public.answers a on a.id = q.accepted_answer_id
  where a.author_id <> q.author_id and coalesce(q.accepted_at, a.created_at) >= since
  union all
  select q.author_id, 'like', 2, l.created_at
  from public.likes l join public.questions q on l.target = 'thread:' || q.id::text
  where l.user_id <> q.author_id and l.created_at >= since
  union all
  select q.author_id, 'reaction', 1, r.created_at
  from public.post_reactions r join public.questions q on r.target = 'thread:' || q.id::text
  where r.user_id <> q.author_id and r.created_at >= since
  union all
  select a.author_id, 'reaction', 1, r.created_at
  from public.post_reactions r join public.answers a on r.target = 'answer:' || a.id::text
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

-- Same columns as before; members whose period total is zero or below (a pledge and nothing else) are left out.
create or replace function public.leaderboard(period text default 'all', max_rows integer default 50)
returns table (member_id uuid, name text, points bigint, threads bigint, answers bigint, accepted bigint, likes bigint, reactions bigint)
language sql stable security invoker set search_path = '' as $$
  select l.member_id, p.name,
    sum(l.points)::bigint,
    count(*) filter (where l.kind = 'thread'),
    count(*) filter (where l.kind = 'answer'),
    count(*) filter (where l.kind = 'accepted'),
    count(*) filter (where l.kind = 'like'),
    count(*) filter (where l.kind = 'reaction')
  from public.reputation_ledger(
    case period when 'week' then now() - interval '7 days' when 'month' then now() - interval '30 days' else '-infinity'::timestamptz end
  ) l
  join public.profiles p on p.id = l.member_id
  group by l.member_id, p.name
  having sum(l.points) > 0
  order by 3 desc, p.name
  limit least(greatest(coalesce(max_rows, 50), 1), 100);
$$;

-- Same columns as before. Points now include mission pledges and rewards (they come from the ledger above).
create or replace function public.member_reputation(member uuid)
returns table (points bigint, threads bigint, answers bigint, accepted bigint, likes bigint, reactions bigint, events_hosted bigint, collections bigint)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce(sum(l.points), 0)::bigint,
    count(*) filter (where l.kind = 'thread'),
    count(*) filter (where l.kind = 'answer'),
    count(*) filter (where l.kind = 'accepted'),
    count(*) filter (where l.kind = 'like'),
    count(*) filter (where l.kind = 'reaction'),
    (select count(*) from public.events e where e.host_id = member),
    (select count(*) from public.collections c where c.owner_id = member and c.is_public)
  from public.reputation_ledger() l
  where l.member_id = member;
$$;

-- A member's mission record, for badges: missions won, Commander missions won, points won, and missions they
-- posted that ended with a winner.
create function public.mission_record(member uuid)
returns table (won bigint, won_commander bigint, points_won bigint, posted_completed bigint)
language sql stable security invoker set search_path = '' as $$
  select
    count(*) filter (where m.winner_id = member),
    count(*) filter (where m.winner_id = member and m.difficulty = 'commander'),
    coalesce(sum(m.reward) filter (where m.winner_id = member), 0)::bigint,
    count(*) filter (where m.poster_id = member)
  from public.missions m
  where m.status = 'completed' and (m.winner_id = member or m.poster_id = member);
$$;

revoke execute on function public.mission_record(uuid) from public;
grant execute on function public.mission_record(uuid) to anon, authenticated;

-- Points a member can still pledge: everything they earned, minus what is already held by their open missions.
create function public.mission_points_available(member uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.points), 0)::bigint from public.reputation_ledger() l where l.member_id = member;
$$;

revoke execute on function public.mission_points_available(uuid) from public;
grant execute on function public.mission_points_available(uuid) to anon, authenticated;

-- ─── Mission rules ──────────────────────────────────────────────────────────────────────────────────────────

-- New missions: up to 5 a day and 10 still running per member, criteria 1 to 200 characters each, a deadline
-- from one day to 180 days away, and a reward the poster can cover. Status and timestamps are the server's.
-- Edits: only the brief, criteria, tags and a later deadline, and only while the mission is still running.
create function public.mission_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  available bigint;
begin
  if exists (select 1 from unnest(new.criteria) c where char_length(trim(c)) not between 1 and 200) then
    raise exception 'Each acceptance criterion is 1 to 200 characters.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    -- One pledge at a time per member, so two missions posted at once cannot spend the same points.
    perform pg_advisory_xact_lock(hashtext('mission-pledge:' || new.poster_id::text));
    if (select count(*) from public.missions m where m.poster_id = new.poster_id and m.created_at > now() - interval '1 day') >= 5 then
      raise exception 'You can post up to 5 missions a day.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.missions m where m.poster_id = new.poster_id and public.mission_state(m.status, m.deadline) in ('open', 'in-progress', 'review')) >= 10 then
      raise exception 'You can have up to 10 missions running at once. Pick a winner or let one finish first.' using errcode = 'P0001';
    end if;
    if new.deadline < now() + interval '1 day' or new.deadline > now() + interval '180 days' then
      raise exception 'Set a deadline between one day and six months from now.' using errcode = 'P0001';
    end if;
    if new.reward > 0 then
      available := public.mission_points_available(new.poster_id);
      if available < new.reward then
        raise exception 'You have % reputation points free to pledge. Lower the reward or earn more first.', greatest(available, 0) using errcode = 'P0001';
      end if;
    end if;
    new.status := 'open';
    new.winner_id := null;
    new.winner_entry := null;
    new.completed_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- Status changes come from the triggers and pick_mission_winner() below, which run as the table owner.
  if new.status is distinct from old.status or new.winner_id is distinct from old.winner_id then
    new.updated_at := now();
    return new;
  end if;
  if public.mission_state(old.status, old.deadline) in ('completed', 'expired') then
    raise exception 'This mission has finished and can no longer be edited.' using errcode = 'P0001';
  end if;
  if new.deadline < old.deadline then
    raise exception 'A deadline can be moved later, not earlier: pilots have planned around it.' using errcode = 'P0001';
  end if;
  if new.deadline > old.created_at + interval '180 days' then
    raise exception 'A mission can run for up to six months.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger missions_rules before insert or update on public.missions
  for each row execute function public.mission_rules();

-- Joining a crew: the mission is still open or in progress, you did not post it, and a crew is up to 50 pilots.
-- Leaving: not once you have submitted an entry (withdraw it first).
create function public.mission_crew_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.mission_entries e where e.mission_id = old.mission_id and e.author_id = old.user_id)
      and exists (select 1 from public.missions x where x.id = old.mission_id)
      and exists (select 1 from public.profiles p where p.id = old.user_id) then
      raise exception 'You have an entry in this mission. Withdraw it before leaving the crew.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  select * into m from public.missions where id = new.mission_id;
  if m.id is null then
    raise exception 'This mission does not exist.' using errcode = 'P0001';
  end if;
  if m.poster_id = new.user_id then
    raise exception 'You posted this mission, so you review it instead of flying it.' using errcode = 'P0001';
  end if;
  if public.mission_state(m.status, m.deadline) not in ('open', 'in-progress', 'review') or m.deadline < now() then
    raise exception 'This mission is no longer taking pilots.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.mission_crew c where c.mission_id = new.mission_id) >= 50 then
    raise exception 'This crew is full (50 pilots).' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger mission_crew_rules before insert or delete on public.mission_crew
  for each row execute function public.mission_crew_rules();

-- A new pilot moves an open mission to "in progress" and tells the poster; the last pilot leaving moves it back.
create function public.mission_crew_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
begin
  if tg_op = 'INSERT' then
    select * into m from public.missions where id = new.mission_id;
    if m.status = 'open' then
      update public.missions set status = 'in-progress' where id = m.id;
    end if;
    perform public.notify(m.poster_id, 'system', new.user_id, 'mission:' || m.id::text, 'Joined the crew of your mission: ' || m.title);
    return new;
  end if;
  update public.missions x set status = 'open'
  where x.id = old.mission_id and x.status = 'in-progress'
    and not exists (select 1 from public.mission_crew c where c.mission_id = old.mission_id);
  return old;
end;
$$;

create trigger mission_crew_changed after insert or delete on public.mission_crew
  for each row execute function public.mission_crew_changed();

-- Entries: before the deadline, on a mission without a winner, not by the poster. A project entry must be one of
-- your published projects. Submitting puts you on the crew if you were not already.
create function public.mission_entry_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
begin
  select * into m from public.missions where id = new.mission_id;
  if m.id is null then
    raise exception 'This mission does not exist.' using errcode = 'P0001';
  end if;
  if m.status = 'completed' then
    raise exception 'A winner has been picked, so entries are closed.' using errcode = 'P0001';
  end if;
  if m.deadline < now() then
    raise exception 'The deadline has passed, so entries are closed.' using errcode = 'P0001';
  end if;
  if m.poster_id = new.author_id then
    raise exception 'You posted this mission, so you cannot enter it.' using errcode = 'P0001';
  end if;
  if new.kind = 'project' and not exists (
    select 1 from public.projects p
    where p.id = substr(new.url, 4)::uuid and p.owner_id = new.author_id and p.status = 'published'
  ) then
    raise exception 'Pick one of your own published projects.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    insert into public.mission_crew (mission_id, user_id) values (new.mission_id, new.author_id) on conflict do nothing;
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger mission_entries_rules before insert or update on public.mission_entries
  for each row execute function public.mission_entry_rules();

-- A first entry moves the mission to "review"; every entry tells the poster.
create function public.mission_entry_added() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
begin
  select * into m from public.missions where id = new.mission_id;
  if m.status in ('open', 'in-progress') then
    update public.missions set status = 'review' where id = m.id;
  end if;
  perform public.notify(m.poster_id, 'reply', new.author_id, 'mission:' || m.id::text, 'New entry for ' || m.title || coalesce(': ' || nullif(trim(new.notes), ''), ''));
  return new;
end;
$$;

create trigger mission_entries_added after insert on public.mission_entries
  for each row execute function public.mission_entry_added();

-- Withdrawing the last entry sends a mission in review back to "in progress" (or "open" without a crew).
create function public.mission_entry_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.missions x
  set status = case when exists (select 1 from public.mission_crew c where c.mission_id = x.id) then 'in-progress' else 'open' end
  where x.id = old.mission_id and x.status = 'review'
    and not exists (select 1 from public.mission_entries e where e.mission_id = old.mission_id);
  return old;
end;
$$;

create trigger mission_entries_removed after delete on public.mission_entries
  for each row execute function public.mission_entry_removed();

-- The poster picks the winning entry. The winner gets the reward (through the ledger) and a notification, and
-- everyone else on the crew hears that the mission is complete.
create function public.pick_mission_winner(mission uuid, entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.missions;
  e public.mission_entries;
  r record;
begin
  select * into m from public.missions where id = mission for update;
  if m.id is null then
    raise exception 'This mission does not exist.' using errcode = 'P0001';
  end if;
  if m.poster_id is distinct from (select auth.uid()) then
    raise exception 'Only the member who posted this mission picks its winner.' using errcode = 'P0001';
  end if;
  if m.status = 'completed' then
    raise exception 'A winner was already picked.' using errcode = 'P0001';
  end if;
  if public.mission_state(m.status, m.deadline) = 'expired' then
    raise exception 'This mission has expired and its pledge was returned.' using errcode = 'P0001';
  end if;
  select * into e from public.mission_entries x where x.id = entry and x.mission_id = mission;
  if e.id is null then
    raise exception 'That entry is not part of this mission.' using errcode = 'P0001';
  end if;
  update public.missions
  set status = 'completed', winner_id = e.author_id, winner_entry = e.id, completed_at = now()
  where id = mission;
  perform public.notify(
    e.author_id, 'system', m.poster_id, 'mission:' || mission::text,
    'You won the mission ' || m.title || case when m.reward > 0 then ' and ' || m.reward || ' reputation points.' else '.' end
  );
  for r in
    select distinct u.id from (
      select c.user_id as id from public.mission_crew c where c.mission_id = mission
      union
      select x.author_id from public.mission_entries x where x.mission_id = mission
    ) u
    where u.id <> e.author_id
  loop
    perform public.notify(r.id, 'system', m.poster_id, 'mission:' || mission::text, 'Mission complete: ' || m.title || '. The winner has been picked.');
  end loop;
end;
$$;

revoke execute on function public.pick_mission_winner(uuid, uuid) from public, anon;
grant execute on function public.pick_mission_winner(uuid, uuid) to authenticated;

alter table public.missions enable row level security;
alter table public.mission_crew enable row level security;
alter table public.mission_entries enable row level security;

create policy "Missions are public" on public.missions for select using (true);
create policy "Members post missions as themselves" on public.missions for insert
  to authenticated with check (poster_id = (select auth.uid()));
create policy "Posters edit their missions" on public.missions for update
  to authenticated using (poster_id = (select auth.uid())) with check (poster_id = (select auth.uid()));
-- Calling a mission off is possible until someone submits an entry; the pledge is returned with it.
create policy "Posters call off missions without entries" on public.missions for delete
  to authenticated using (
    poster_id = (select auth.uid()) and status <> 'completed'
    and not exists (select 1 from public.mission_entries e where e.mission_id = missions.id)
  );

create policy "Crews are public" on public.mission_crew for select using (true);
create policy "Members join crews as themselves" on public.mission_crew for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members leave crews" on public.mission_crew for delete
  to authenticated using (user_id = (select auth.uid()));

create policy "Entries are public" on public.mission_entries for select using (true);
create policy "Pilots submit entries as themselves" on public.mission_entries for insert
  to authenticated with check (author_id = (select auth.uid()));
create policy "Pilots edit their entries" on public.mission_entries for update
  to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Pilots withdraw entries before a winner is picked" on public.mission_entries for delete
  to authenticated using (
    author_id = (select auth.uid())
    and not exists (select 1 from public.missions m where m.id = mission_id and m.status = 'completed')
  );

revoke update on public.missions from anon, authenticated;
grant update (brief, criteria, tags, deadline) on public.missions to authenticated;
revoke update on public.mission_crew from anon, authenticated;
revoke update on public.mission_entries from anon, authenticated;
grant update (kind, url, notes) on public.mission_entries to authenticated;

-- ─── Launchpad ──────────────────────────────────────────────────────────────────────────────────────────────

-- A launch is for one of the owner's projects or for a hub resource ("tool:token-tax"). Its day is the 24 hours
-- from launch_at. Gallery pictures are files in the owner's own folder of the "avatars" bucket.
create table public.launches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  resource text check (resource ~ '^(model|dataset|tool|repo):[a-z0-9-]{1,80}$'),
  name text not null check (char_length(trim(name)) between 2 and 80),
  tagline text not null check (char_length(trim(tagline)) between 10 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  launch_at timestamptz not null,
  gallery text[] not null default '{}' check (
    cardinality(gallery) <= 6
    and array_position(gallery, null) is null
    and (cardinality(gallery) = 0 or array_to_string(gallery, ' ') ~ '^(https://[^/\s]+/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100})( https://[^/\s]+/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100})*$')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((project_id is null) <> (resource is null))
);

create index launches_at_idx on public.launches (launch_at);
create index launches_owner_idx on public.launches (owner_id, launch_at desc);
create index launches_project_idx on public.launches (project_id) where project_id is not null;

-- One boost per member per launch, only during its launch day, never on your own. Boosts are final.
create table public.launch_boosts (
  launch_id uuid not null references public.launches (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (launch_id, user_id)
);

create index launch_boosts_user_idx on public.launch_boosts (user_id);

-- New launches: up to 3 a day per member, from 10 minutes to 90 days ahead, for your own published project (one
-- scheduled or live launch per project at a time), gallery pictures from your own folder only. Once a launch
-- has started its time can no longer change.
create function public.launch_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.gallery) g where position('/avatars/' || new.owner_id::text || '/' in g) = 0) then
    raise exception 'Gallery pictures must be ones you uploaded.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.launches l where l.owner_id = new.owner_id and l.created_at > now() - interval '1 day') >= 3 then
      raise exception 'You can schedule up to 3 launches a day.' using errcode = 'P0001';
    end if;
    if new.launch_at < now() + interval '10 minutes' or new.launch_at > now() + interval '90 days' then
      raise exception 'Pick a launch time between 10 minutes and 90 days from now.' using errcode = 'P0001';
    end if;
    if new.project_id is not null then
      if not exists (select 1 from public.projects p where p.id = new.project_id and p.owner_id = new.owner_id and p.status = 'published') then
        raise exception 'Pick one of your own published projects.' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.launches l where l.project_id = new.project_id and l.launch_at > now() - interval '1 day') then
        raise exception 'This project already has a launch scheduled or live.' using errcode = 'P0001';
      end if;
    end if;
    new.created_at := now();
  elsif new.launch_at is distinct from old.launch_at then
    if old.launch_at <= now() then
      raise exception 'This launch has started, so its time is fixed.' using errcode = 'P0001';
    end if;
    if new.launch_at < now() + interval '10 minutes' or new.launch_at > now() + interval '90 days' then
      raise exception 'Pick a launch time between 10 minutes and 90 days from now.' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger launches_rules before insert or update on public.launches
  for each row execute function public.launch_rules();

create function public.launch_boost_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.launches;
begin
  select * into l from public.launches where id = new.launch_id;
  if l.id is null then
    raise exception 'This launch does not exist.' using errcode = 'P0001';
  end if;
  if l.owner_id = new.user_id then
    raise exception 'You cannot boost your own launch. Share it instead.' using errcode = 'P0001';
  end if;
  if now() < l.launch_at then
    raise exception 'This launch has not started yet. Boosting opens at launch time.' using errcode = 'P0001';
  end if;
  if now() >= l.launch_at + interval '1 day' then
    raise exception 'This launch day is over.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger launch_boosts_rules before insert on public.launch_boosts
  for each row execute function public.launch_boost_rules();

-- A boost tells the owner (folded into one unread notification per booster, like likes).
create function public.notify_launch_boost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.launches;
begin
  select * into l from public.launches where id = new.launch_id;
  perform public.notify(l.owner_id, 'like', new.user_id, 'launch:' || l.id::text, 'Boosted your launch: ' || l.name);
  return new;
end;
$$;

create trigger launch_boosts_notify after insert on public.launch_boosts
  for each row execute function public.notify_launch_boost();

-- Comments on a launch are replies in the thread "launch-<uuid>" (public.answers); they tell the launch's owner.
create function public.notify_launch_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lid uuid;
begin
  if new.sample_thread ~ '^launch-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    lid := substr(new.sample_thread, 8)::uuid;
    perform public.notify((select l.owner_id from public.launches l where l.id = lid), 'reply', new.author_id, 'launch:' || lid::text, new.body);
  end if;
  return new;
end;
$$;

create trigger answers_notify_launch_comment after insert on public.answers
  for each row execute function public.notify_launch_comment();

alter table public.launches enable row level security;
alter table public.launch_boosts enable row level security;

create policy "Launches are public" on public.launches for select using (true);
create policy "Members schedule launches as themselves" on public.launches for insert
  to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners edit their launches" on public.launches for update
  to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- A launch can be scrubbed until it starts.
create policy "Owners scrub launches before they start" on public.launches for delete
  to authenticated using (owner_id = (select auth.uid()) and launch_at > now());

create policy "Boosts are public" on public.launch_boosts for select using (true);
create policy "Members boost as themselves" on public.launch_boosts for insert
  to authenticated with check (user_id = (select auth.uid()));

revoke update on public.launches from anon, authenticated;
grant update (tagline, description, launch_at, gallery) on public.launches to authenticated;
revoke update, delete on public.launch_boosts from anon, authenticated;

-- ─── Live updates and housekeeping ──────────────────────────────────────────────────────────────────────────

-- Mission control counts, crews, entries and boost counters update live (Realtime applies the select policies).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
alter publication supabase_realtime add table public.missions, public.mission_crew, public.mission_entries, public.launches, public.launch_boosts;

-- Trigger functions are not part of the API.
revoke execute on function public.mission_rules() from public, anon, authenticated;
revoke execute on function public.mission_crew_rules() from public, anon, authenticated;
revoke execute on function public.mission_crew_changed() from public, anon, authenticated;
revoke execute on function public.mission_entry_rules() from public, anon, authenticated;
revoke execute on function public.mission_entry_added() from public, anon, authenticated;
revoke execute on function public.mission_entry_removed() from public, anon, authenticated;
revoke execute on function public.launch_rules() from public, anon, authenticated;
revoke execute on function public.launch_boost_rules() from public, anon, authenticated;
revoke execute on function public.notify_launch_boost() from public, anon, authenticated;
revoke execute on function public.notify_launch_comment() from public, anon, authenticated;
