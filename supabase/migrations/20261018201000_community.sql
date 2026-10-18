-- Community: what turns the forum into a place people come back to. Thread tags, edits and mentions on posts,
-- emoji reactions, polls on new threads, events with RSVPs, curated collections, and reputation derived from
-- all of it. Everything public is readable by anyone; members write only their own rows. Notifications are
-- still written by triggers only (see 20261018191000_social.sql).

-- ─── Posts: tags, edits, mentions, when an answer was accepted ─────────────────────────────────────────────

-- Up to five lowercase tags per thread ("lora", "fine-tuning"). Members mentioned in a post are listed by id;
-- the trigger below only notifies the ones whose name really appears in the text as "@Name".
alter table public.questions
  add column tags text[] not null default '{}'
    check (cardinality(tags) <= 5 and (cardinality(tags) = 0 or array_to_string(tags, ',') ~ '^[a-z0-9][a-z0-9-]{0,23}(,[a-z0-9][a-z0-9-]{0,23})*$')),
  add column mentions uuid[] not null default '{}' check (cardinality(mentions) <= 10),
  add column edited_at timestamptz,
  add column accepted_at timestamptz;

alter table public.answers
  add column mentions uuid[] not null default '{}' check (cardinality(mentions) <= 10),
  add column edited_at timestamptz;

create index questions_tags_idx on public.questions using gin (tags);

-- Writing a post never sets its own edit stamp; changing its text later does. Accepting an answer stamps when.
create function public.post_edit_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.edited_at := null;
    if tg_table_name = 'questions' then
      new.accepted_at := null;
    end if;
    return new;
  end if;
  -- Separate branches: an answer has no title, and PL/pgSQL resolves fields only when a line runs.
  if tg_table_name = 'questions' then
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create function public.question_accepted_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.accepted_answer_id is distinct from old.accepted_answer_id then
    new.accepted_at := case when new.accepted_answer_id is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger questions_edit_rules before insert or update on public.questions
  for each row execute function public.post_edit_rules();
create trigger answers_edit_rules before insert or update on public.answers
  for each row execute function public.post_edit_rules();
create trigger questions_accepted_at before update of accepted_answer_id on public.questions
  for each row execute function public.question_accepted_at();

-- Authors may now fix their replies, and set tags and mentions on their threads.
create policy "Members edit their answers" on public.answers for update
  to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
grant update (body, mentions) on public.answers to authenticated;
grant update (tags, mentions) on public.questions to authenticated;

-- Tells each newly mentioned member, once per post, when their "@Name" is in the text.
create function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  added uuid[];
  about text;
  m record;
begin
  if tg_op = 'INSERT' then
    added := array(select distinct x from unnest(new.mentions) as x);
  else
    added := array(select distinct x from unnest(new.mentions) as x where not (x = any (old.mentions)));
  end if;
  if cardinality(added) = 0 then
    return new;
  end if;
  if tg_table_name = 'questions' then
    about := 'thread:' || new.id::text;
  else
    about := 'thread:' || coalesce(new.question_id::text, new.sample_thread);
  end if;
  for m in
    select p.id from public.profiles p
    where p.id = any (added) and position(lower('@' || p.name) in lower(new.body)) > 0
  loop
    perform public.notify(m.id, 'mention', new.author_id, about, new.body);
  end loop;
  return new;
end;
$$;

create trigger questions_notify_mentions after insert or update of mentions on public.questions
  for each row execute function public.notify_mentions();
create trigger answers_notify_mentions after insert or update of mentions on public.answers
  for each row execute function public.notify_mentions();

-- ─── Reactions on forum posts ───────────────────────────────────────────────────────────────────────────────

-- A post is "thread:<id>" (a thread's first post), "answer:<uuid>" (a member's reply) or
-- "reply:<thread-slug>-<reply-id>" (a reply in a sample thread).
create table public.post_reactions (
  target text not null check (target ~ '^(thread|answer|reply):[a-z0-9-]{1,80}$'),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '🚀', '👀', '🤔')),
  created_at timestamptz not null default now(),
  primary key (target, user_id, emoji)
);

create index post_reactions_user_idx on public.post_reactions (user_id);
create index post_reactions_created_idx on public.post_reactions (created_at desc);

alter table public.post_reactions enable row level security;

create policy "Post reactions are public" on public.post_reactions for select using (true);
create policy "Members react to posts as themselves" on public.post_reactions for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members remove their post reactions" on public.post_reactions for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.post_reactions from anon, authenticated;

-- ─── Polls on threads ───────────────────────────────────────────────────────────────────────────────────────

-- One poll per thread, added by the thread's author. Options are fixed once the poll exists.
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions (id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 3 and 200),
  options text[] not null check (
    cardinality(options) between 2 and 8
    and array_position(options, null) is null
    and array_position(options, '') is null
  ),
  multi boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  option smallint not null check (option between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);

create index poll_votes_user_idx on public.poll_votes (user_id);

-- Options are 1 to 80 characters and distinct; a vote names an option that exists, on an open poll, and a
-- single-choice poll takes one vote per member (change it by removing the old vote first).
create function public.poll_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.polls;
begin
  if tg_table_name = 'polls' then
    if exists (select 1 from unnest(new.options) o where char_length(trim(o)) not between 1 and 80)
      or (select count(distinct lower(trim(o))) from unnest(new.options) o) <> cardinality(new.options) then
      raise exception 'Poll options must be 1 to 80 characters and all different.' using errcode = 'P0001';
    end if;
    if new.closes_at is not null and new.closes_at <= now() then
      raise exception 'A poll must close in the future.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    return new;
  end if;
  select * into p from public.polls where id = new.poll_id;
  if p.id is null then
    raise exception 'This poll does not exist.' using errcode = 'P0001';
  end if;
  if new.option >= cardinality(p.options) then
    raise exception 'That option is not part of this poll.' using errcode = 'P0001';
  end if;
  if p.closes_at is not null and p.closes_at <= now() then
    raise exception 'This poll has closed.' using errcode = 'P0001';
  end if;
  if not p.multi and exists (select 1 from public.poll_votes v where v.poll_id = new.poll_id and v.user_id = new.user_id) then
    raise exception 'You already voted in this poll.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger polls_rules before insert on public.polls
  for each row execute function public.poll_rules();
create trigger poll_votes_rules before insert on public.poll_votes
  for each row execute function public.poll_rules();

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

create policy "Polls are public" on public.polls for select using (true);
create policy "Thread authors add a poll" on public.polls for insert to authenticated with check (
  exists (select 1 from public.questions q where q.id = question_id and q.author_id = (select auth.uid()))
);
create policy "Thread authors remove their poll" on public.polls for delete to authenticated using (
  exists (select 1 from public.questions q where q.id = question_id and q.author_id = (select auth.uid()))
);

-- Ballots are secret: members see only their own votes; everyone sees the totals through poll_counts().
create policy "Members see their own votes" on public.poll_votes for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Members vote as themselves" on public.poll_votes for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members take back their votes" on public.poll_votes for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.polls from anon, authenticated;
revoke update on public.poll_votes from anon, authenticated;

-- Votes per option and how many members voted, without revealing who.
create function public.poll_counts(poll uuid) returns table (option smallint, votes bigint, voters bigint)
language sql stable security definer set search_path = '' as $$
  select o.i::smallint, count(v.user_id), (select count(distinct v2.user_id) from public.poll_votes v2 where v2.poll_id = poll)
  from public.polls p
  cross join lateral generate_series(0, cardinality(p.options) - 1) as o(i)
  left join public.poll_votes v on v.poll_id = p.id and v.option = o.i
  where p.id = poll
  group by o.i
  order by o.i;
$$;

revoke execute on function public.poll_counts(uuid) from public;
grant execute on function public.poll_counts(uuid) to anon, authenticated;

-- ─── Events and RSVPs ───────────────────────────────────────────────────────────────────────────────────────

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  kind text not null check (kind in ('paper-club', 'meetup', 'office-hours', 'ama')),
  mode text not null check (mode in ('online', 'in-person')),
  -- A https link for online events, a place for in-person ones.
  location text not null check (char_length(trim(location)) between 2 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC' check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  capacity integer check (capacity is null or capacity between 1 and 10000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '3 days'),
  check (mode <> 'online' or location ~ '^https://')
);

create index events_starts_idx on public.events (starts_at);
create index events_host_idx on public.events (host_id);

-- An RSVP points at a member's event by its id, or at one of the sample events by its slug.
create table public.event_rsvps (
  event text not null check (event ~ '^[a-z0-9-]{1,80}$'),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event, user_id)
);

create index event_rsvps_user_idx on public.event_rsvps (user_id);

-- No more than 5 new events a day from one member; new events start in the future.
create function public.event_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.events e where e.host_id = new.host_id and e.created_at > now() - interval '1 day') >= 5 then
      raise exception 'You can create up to 5 events a day.' using errcode = 'P0001';
    end if;
    if new.starts_at < now() then
      raise exception 'An event must start in the future.' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger events_rules before insert on public.events
  for each row execute function public.event_rules();

-- A member's event must exist, must not have ended, and "going" stops at the event's capacity.
create function public.rsvp_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  was_going boolean := false;
begin
  if tg_op = 'UPDATE' then
    was_going := old.status = 'going';
  end if;
  if new.event ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into e from public.events where id = new.event::uuid;
    if e.id is null then
      raise exception 'This event does not exist.' using errcode = 'P0001';
    end if;
    if e.ends_at < now() then
      raise exception 'This event has already happened.' using errcode = 'P0001';
    end if;
    if new.status = 'going' and e.capacity is not null and not was_going and (
      select count(*) from public.event_rsvps r where r.event = new.event and r.status = 'going'
    ) >= e.capacity then
      raise exception 'This event is full. Mark yourself as interested to hear if a place opens.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_rsvps_rules before insert or update on public.event_rsvps
  for each row execute function public.rsvp_rules();

-- Deleting an event takes its RSVPs with it.
create function public.event_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.event_rsvps where event = old.id::text;
  return old;
end;
$$;

create trigger events_cleanup after delete on public.events
  for each row execute function public.event_cleanup();

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

create policy "Events are public" on public.events for select using (true);
create policy "Members host as themselves" on public.events for insert
  to authenticated with check (host_id = (select auth.uid()));
create policy "Hosts edit their events" on public.events for update
  to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "Hosts cancel their events" on public.events for delete
  to authenticated using (host_id = (select auth.uid()));

-- Who is going is part of an event page, like any meetup.
create policy "RSVPs are public" on public.event_rsvps for select using (true);
create policy "Members RSVP as themselves" on public.event_rsvps for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members change their RSVP" on public.event_rsvps for update
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members withdraw their RSVP" on public.event_rsvps for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.events from anon, authenticated;
grant update (title, description, location, starts_at, ends_at, timezone, capacity) on public.events to authenticated;
revoke update on public.event_rsvps from anon, authenticated;
grant update (status) on public.event_rsvps to authenticated;

-- ─── Collections ────────────────────────────────────────────────────────────────────────────────────────────

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collections_owner_idx on public.collections (owner_id, updated_at desc);
create index collections_public_idx on public.collections (updated_at desc) where is_public;

-- An item is anything with a like/save key: "model:orbit-8b", "paper:2610-d21601", "ghrepo:…", "thread:…".
create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  target text not null check (target ~ '^[a-z]{2,16}:[a-z0-9-]{1,80}$'),
  note text not null default '' check (char_length(note) <= 500),
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, target)
);

create index collection_items_order_idx on public.collection_items (collection_id, position);

-- Following points at a member's collection by id or a sample collection by slug.
create table public.collection_follows (
  collection text not null check (collection ~ '^[a-z0-9-]{1,80}$'),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection, user_id)
);

create index collection_follows_user_idx on public.collection_follows (user_id, created_at desc);

-- No more than 50 collections per member and 200 items per collection; any change bumps updated_at.
create function public.collection_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if tg_table_name = 'collections' then
    if tg_op = 'INSERT' and (select count(*) from public.collections c where c.owner_id = new.owner_id) >= 50 then
      raise exception 'You can keep up to 50 collections.' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    return new;
  end if;
  cid := case when tg_op = 'DELETE' then old.collection_id else new.collection_id end;
  if tg_op = 'INSERT' and (select count(*) from public.collection_items i where i.collection_id = cid) >= 200 then
    raise exception 'A collection holds up to 200 items.' using errcode = 'P0001';
  end if;
  update public.collections set updated_at = now() where id = cid;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger collections_rules before insert or update on public.collections
  for each row execute function public.collection_rules();
create trigger collection_items_rules before insert or update or delete on public.collection_items
  for each row execute function public.collection_rules();

-- Removing a collection removes its follows.
create function public.collection_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.collection_follows where collection = old.id::text;
  return old;
end;
$$;

create trigger collections_cleanup after delete on public.collections
  for each row execute function public.collection_cleanup();

-- Someone followed a member's collection: tell its owner.
create function public.notify_collection_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.collections;
begin
  if new.collection ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into c from public.collections where id = new.collection::uuid;
    if c.id is not null then
      perform public.notify(c.owner_id, 'follow', new.user_id, 'collection:' || c.id::text, c.title);
    end if;
  end if;
  return new;
end;
$$;

create trigger collection_follows_notify after insert on public.collection_follows
  for each row execute function public.notify_collection_follow();

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.collection_follows enable row level security;

create policy "Public collections, and your own" on public.collections for select
  using (is_public or owner_id = (select auth.uid()));
create policy "Members curate as themselves" on public.collections for insert
  to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners edit their collections" on public.collections for update
  to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete their collections" on public.collections for delete
  to authenticated using (owner_id = (select auth.uid()));

-- Items are as visible as their collection; only its owner changes them.
create policy "Items of visible collections" on public.collection_items for select using (
  exists (select 1 from public.collections c where c.id = collection_id and (c.is_public or c.owner_id = (select auth.uid())))
);
create policy "Owners add items" on public.collection_items for insert to authenticated with check (
  exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid()))
);
create policy "Owners edit items" on public.collection_items for update to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));
create policy "Owners remove items" on public.collection_items for delete to authenticated using (
  exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid()))
);

-- Follows of a member's collection are visible while the collection is; sample collections are always visible.
create policy "Collection follows are public" on public.collection_follows for select using (
  collection !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or exists (select 1 from public.collections c where c.id::text = collection)
);
create policy "Members follow visible collections, not their own" on public.collection_follows for insert to authenticated with check (
  user_id = (select auth.uid())
  and (
    collection !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or exists (select 1 from public.collections c where c.id::text = collection and c.is_public and c.owner_id <> (select auth.uid()))
  )
);
create policy "Members unfollow collections" on public.collection_follows for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.collections from anon, authenticated;
grant update (title, description, is_public) on public.collections to authenticated;
revoke update on public.collection_items from anon, authenticated;
grant update (note, position) on public.collection_items to authenticated;
revoke update on public.collection_follows from anon, authenticated;

-- Puts a collection's items in the given order in one call (row level security still applies).
create function public.reorder_collection(collection uuid, targets text[]) returns void
language sql security invoker set search_path = '' as $$
  update public.collection_items i
  set position = t.ord::integer
  from unnest(targets) with ordinality as t(target, ord)
  where i.collection_id = collection and i.target = t.target;
$$;

revoke execute on function public.reorder_collection(uuid, text[]) from public, anon;
grant execute on function public.reorder_collection(uuid, text[]) to authenticated;

-- ─── Reputation ─────────────────────────────────────────────────────────────────────────────────────────────

-- Every point a member earned since a moment, one row each: starting a thread (5), replying (2), a reply of
-- theirs accepted by someone else (15), a like on their thread (2), a reaction to one of their posts (1).
-- Liking or reacting to yourself earns nothing.
create function public.reputation_ledger(since timestamptz default '-infinity')
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
  where r.user_id <> a.author_id and r.created_at >= since;
$$;

-- All-time totals per member.
create view public.reputation with (security_invoker = on) as
  select l.member_id,
    sum(l.points)::bigint as points,
    count(*) filter (where l.kind = 'thread') as threads,
    count(*) filter (where l.kind = 'answer') as answers,
    count(*) filter (where l.kind = 'accepted') as accepted,
    count(*) filter (where l.kind = 'like') as likes,
    count(*) filter (where l.kind = 'reaction') as reactions
  from public.reputation_ledger() l
  group by l.member_id;

-- The top members for "week", "month" or "all" time.
create function public.leaderboard(period text default 'all', max_rows integer default 50)
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
  order by 3 desc, p.name
  limit least(greatest(coalesce(max_rows, 50), 1), 100);
$$;

-- One member's all-time totals, plus what their badges need.
create function public.member_reputation(member uuid)
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

grant select on public.reputation to anon, authenticated;
revoke execute on function public.reputation_ledger(timestamptz) from public;
grant execute on function public.reputation_ledger(timestamptz) to anon, authenticated;
revoke execute on function public.leaderboard(text, integer) from public;
grant execute on function public.leaderboard(text, integer) to anon, authenticated;
revoke execute on function public.member_reputation(uuid) from public;
grant execute on function public.member_reputation(uuid) to anon, authenticated;

-- Trigger functions are not part of the API.
revoke execute on function public.post_edit_rules() from public, anon, authenticated;
revoke execute on function public.question_accepted_at() from public, anon, authenticated;
revoke execute on function public.notify_mentions() from public, anon, authenticated;
revoke execute on function public.poll_rules() from public, anon, authenticated;
revoke execute on function public.event_rules() from public, anon, authenticated;
revoke execute on function public.rsvp_rules() from public, anon, authenticated;
revoke execute on function public.event_cleanup() from public, anon, authenticated;
revoke execute on function public.collection_rules() from public, anon, authenticated;
revoke execute on function public.collection_cleanup() from public, anon, authenticated;
revoke execute on function public.notify_collection_follow() from public, anon, authenticated;
