-- Social, round 10: a much richer chat, direct messages with groups, and crews with a home of their own.
--
-- Chat: threads (replies that open beside the room), pins, saved messages, any emoji as a reaction, polls,
-- /me lines, stickers, picture attachments, @mentions that notify, read marks that follow you between devices,
-- and a look for each room (accent colour, emoji, rules banner) set by chat managers, or by a crew's captain and
-- officers for the crew's own room.
-- Direct messages: replies, reactions, pictures, edits, group conversations (up to 20 people), muting, pinning,
-- archiving, and message requests: a first message from someone you do not follow waits in Requests.
-- Crews: a banner, a sigil (an emoji), a custom accent colour, a motto and rules; events with RSVPs; a project
-- board; a leaderboard and an activity feed. Crew roles stay owner / admin / member in the database; the site
-- calls them Captain, Officer and Crew.
--
-- Everything is additive: no drops, no deletes. Members write only their own rows; counts, timestamps and pins
-- are set by triggers and security definer functions, which check who is asking. Guests read nothing here.

-- ─── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────

-- A picture a member uploaded to the post-media bucket (src/lib/editor/media.ts names them <uid>/<24 hex>.<ext>).
-- Attachments and banners may only point there, so nobody can hotlink a tracking pixel into a conversation.
create or replace function public.social_media_url(url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select url is not null
    and char_length(url) <= 600
    and url ~ '^https://[^\s/]+/storage/v1/object/public/post-media/[0-9a-f-]{36}/[0-9a-f]{24}\.(png|jpg|webp|gif|avif)$'
$$;

-- Up to four pictures: [{ "url": …, "alt": …, "w": 1200, "h": 800 }].
create or replace function public.social_attachments_ok(list jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(list) = 'array'
    and jsonb_array_length(list) <= 4
    and not exists (
      select 1 from jsonb_array_elements(list) a
      where jsonb_typeof(a) <> 'object'
        or not public.social_media_url(a ->> 'url')
        or char_length(coalesce(a ->> 'alt', '')) > 200
    )
$$;

-- An emoji, not a word: 1 to 16 characters with no letters, digits, spaces or angle brackets.
create or replace function public.social_emoji_ok(e text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select e is not null and char_length(e) between 1 and 16 and e !~ '[A-Za-z0-9[:space:]<>]'
$$;

-- ─── Chat: messages ─────────────────────────────────────────────────────────────────────────────────────────

alter table public.room_messages add column if not exists thread_root uuid references public.room_messages (id) on delete cascade;
alter table public.room_messages add column if not exists kind text not null default 'text';
alter table public.room_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.room_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.room_messages add column if not exists pinned_at timestamptz;
alter table public.room_messages add column if not exists pinned_by uuid references public.profiles (id) on delete set null;
alter table public.room_messages add column if not exists reply_count integer not null default 0;
alter table public.room_messages add column if not exists last_reply_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'room_messages_kind_check') then
    alter table public.room_messages add constraint room_messages_kind_check check (kind in ('text', 'me', 'poll', 'sticker'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'room_messages_attachments_check') then
    alter table public.room_messages add constraint room_messages_attachments_check check (public.social_attachments_ok(attachments));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'room_messages_mentions_check') then
    alter table public.room_messages add constraint room_messages_mentions_check check (cardinality(mentions) <= 20);
  end if;
end $$;

create index if not exists room_messages_thread_idx on public.room_messages (thread_root, created_at) where thread_root is not null;
create index if not exists room_messages_pinned_idx on public.room_messages (room, pinned_at desc) where pinned_at is not null;
create index if not exists room_messages_room_time_idx on public.room_messages (room, created_at desc);

-- Threads are one level deep and stay in their room. Pins, reply counts, the room, the author and the kind of a
-- message only change through the functions below (they set nexverse.chat_system for the one statement).
create or replace function public.chat_message_extras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  root public.room_messages;
  system boolean := coalesce(current_setting('nexverse.chat_system', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.thread_root is not null then
      select * into root from public.room_messages where id = new.thread_root;
      if not found or root.room <> new.room then
        raise exception 'A thread reply belongs to a message in the same room.' using errcode = 'P0001';
      end if;
      if root.thread_root is not null then
        new.thread_root := root.thread_root;
      end if;
    end if;
    new.mentions := coalesce((select array_agg(distinct x) from unnest(new.mentions) x where x is not null and x <> new.author_id), '{}');
    new.pinned_at := null;
    new.pinned_by := null;
    new.reply_count := 0;
    new.last_reply_at := null;
    return new;
  end if;
  if system then
    return new;
  end if;
  if new.room is distinct from old.room or new.author_id is distinct from old.author_id or new.kind is distinct from old.kind
    or new.thread_root is distinct from old.thread_root then
    raise exception 'A message stays where and how it was written.' using errcode = 'P0001';
  end if;
  if new.pinned_at is distinct from old.pinned_at or new.pinned_by is distinct from old.pinned_by then
    raise exception 'Use the pin button to pin messages.' using errcode = 'P0001';
  end if;
  new.reply_count := old.reply_count;
  new.last_reply_at := old.last_reply_at;
  if new.mentions is distinct from old.mentions then
    new.mentions := coalesce((select array_agg(distinct x) from unnest(new.mentions) x where x is not null and x <> new.author_id), '{}');
  end if;
  return new;
end;
$$;

create or replace trigger room_messages_extras
  before insert or update on public.room_messages
  for each row execute function public.chat_message_extras();

-- Can this member read this room? (Used to decide who a mention may notify.)
create or replace function public.chat_member_can_read(member uuid, room_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms r
    where r.slug = room_slug
      and (
        (r.kind = 'public' and (not r.staff_only or exists (select 1 from public.profiles p where p.id = member and p.role in ('moderator', 'admin'))))
        or (r.kind = 'crew' and exists (select 1 from public.crew_members m where m.crew_id = r.crew_id and m.user_id = member))
      )
  )
$$;

-- After a message: count it on its thread, tell the thread's author, and tell the people it mentions.
create or replace function public.chat_message_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  root public.room_messages;
  who uuid;
  told uuid[] := '{}';
  target text := left('chat:' || new.room, 80);
begin
  if tg_op = 'DELETE' then
    if old.thread_root is not null then
      perform set_config('nexverse.chat_system', 'on', true);
      update public.room_messages set reply_count = greatest(reply_count - 1, 0) where id = old.thread_root;
      perform set_config('nexverse.chat_system', 'off', true);
    end if;
    return old;
  end if;
  if new.thread_root is not null then
    perform set_config('nexverse.chat_system', 'on', true);
    update public.room_messages set reply_count = reply_count + 1, last_reply_at = new.created_at
    where id = new.thread_root
    returning * into root;
    perform set_config('nexverse.chat_system', 'off', true);
    if root.author_id is not null and root.author_id <> new.author_id then
      perform public.notify(root.author_id, 'reply', new.author_id, target, new.body);
      told := told || root.author_id;
    end if;
  end if;
  foreach who in array coalesce(new.mentions, '{}') loop
    exit when cardinality(told) >= 20;
    if not (who = any (told)) and public.chat_member_can_read(who, new.room) then
      perform public.notify(who, 'mention', new.author_id, target, new.body);
      told := told || who;
    end if;
  end loop;
  return new;
end;
$$;

create or replace trigger room_messages_after_insert
  after insert on public.room_messages
  for each row execute function public.chat_message_after();

create or replace trigger room_messages_after_delete
  after delete on public.room_messages
  for each row execute function public.chat_message_after();

-- Pin or unpin a message. Public rooms: chat managers and staff (written to the moderation log). Crew rooms: the
-- crew's captain and officers. Up to 25 pins a room.
create or replace function public.chat_pin(message uuid, pin boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.room_messages;
  r public.rooms;
  stamp timestamptz := case when pin then now() else null end;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into m from public.room_messages where id = message;
  if not found then
    raise exception 'That message is gone.' using errcode = 'P0001';
  end if;
  select * into r from public.rooms where slug = m.room;
  if r.kind = 'crew' then
    if not public.is_crew_admin(r.crew_id) then
      raise exception 'Only the crew''s captain and officers pin messages.' using errcode = 'P0001';
    end if;
  elsif not (public.is_staff() or public.cms_can('chat.manage')) then
    raise exception 'Only chat managers pin messages in this room.' using errcode = 'P0001';
  end if;
  if pin and m.pinned_at is null and (select count(*) from public.room_messages x where x.room = m.room and x.pinned_at is not null) >= 25 then
    raise exception 'A room pins up to 25 messages. Unpin one first.' using errcode = 'P0001';
  end if;
  perform set_config('nexverse.chat_system', 'on', true);
  update public.room_messages set pinned_at = stamp, pinned_by = case when pin then auth.uid() else null end where id = message;
  perform set_config('nexverse.chat_system', 'off', true);
  if r.kind = 'public' then
    insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
    values (auth.uid(), case when pin then 'chat.pin' else 'chat.unpin' end, 'room_message', message::text, left(m.room || ': ' || m.body, 500));
  end if;
  return stamp;
end;
$$;

revoke all on function public.chat_pin(uuid, boolean) from public, anon;
grant execute on function public.chat_pin(uuid, boolean) to authenticated;

-- ─── Chat: a look for each room ─────────────────────────────────────────────────────────────────────────────

alter table public.rooms add column if not exists accent text;
alter table public.rooms add column if not exists emoji text;
alter table public.rooms add column if not exists rules text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_accent_check') then
    alter table public.rooms add constraint rooms_accent_check check (accent is null or accent in ('ion', 'gold', 'ok', 'violet', 'rose', 'teal', 'amber', 'sky'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_emoji_check') then
    alter table public.rooms add constraint rooms_emoji_check check (emoji is null or public.social_emoji_ok(emoji));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_rules_check') then
    alter table public.rooms add constraint rooms_rules_check check (char_length(rules) <= 1500);
  end if;
end $$;

-- Sets a room's accent, emoji, rules banner and topic. Chat managers for public rooms (the rooms trigger writes
-- the change to the moderation log); the captain and officers for their crew's room.
create or replace function public.chat_room_style(room_slug text, new_accent text, new_emoji text, new_rules text, new_topic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into r from public.rooms where slug = room_slug;
  if not found then
    raise exception 'There is no such room.' using errcode = 'P0001';
  end if;
  if r.kind = 'crew' then
    if not public.is_crew_admin(r.crew_id) then
      raise exception 'Only the crew''s captain and officers change its room.' using errcode = 'P0001';
    end if;
  elsif not (public.is_staff() or public.cms_can('chat.manage')) then
    raise exception 'Only chat managers change how this room looks.' using errcode = 'P0001';
  end if;
  update public.rooms set
    accent = nullif(new_accent, ''),
    emoji = nullif(trim(new_emoji), ''),
    rules = left(coalesce(trim(new_rules), ''), 1500),
    topic = left(coalesce(trim(new_topic), r.topic), 200)
  where slug = room_slug;
end;
$$;

revoke all on function public.chat_room_style(text, text, text, text, text) from public, anon;
grant execute on function public.chat_room_style(text, text, text, text, text) to authenticated;

-- ─── Chat: any emoji as a reaction ──────────────────────────────────────────────────────────────────────────
-- The first eight still go to message_reactions (its check lists them); every other emoji goes here.

create table if not exists public.room_reactions (
  message_id uuid not null references public.room_messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (public.social_emoji_ok(emoji)),
  room text not null default '',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists room_reactions_room_idx on public.room_reactions (room);

create or replace function public.room_reaction_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select m.room into new.room from public.room_messages m where m.id = new.message_id;
  new.created_at := now();
  if (select count(distinct x.emoji) from public.room_reactions x where x.message_id = new.message_id and x.emoji <> new.emoji) >= 20 then
    raise exception 'That message already has 20 kinds of reaction.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.room_reactions x where x.user_id = new.user_id and x.created_at > now() - interval '1 minute') >= 40 then
    raise exception 'You are reacting very quickly. Wait a moment.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger room_reactions_rules
  before insert on public.room_reactions
  for each row execute function public.room_reaction_rules();

alter table public.room_reactions enable row level security;

-- ─── Chat: polls ────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.chat_polls (
  message_id uuid primary key references public.room_messages (id) on delete cascade,
  room text not null default '',
  question text not null check (char_length(trim(question)) between 1 and 300),
  options text[] not null check (cardinality(options) between 2 and 10),
  multi boolean not null default false,
  closes_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_poll_votes (
  message_id uuid not null references public.chat_polls (message_id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, choice)
);

create or replace function public.chat_poll_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.room_messages;
begin
  if tg_op = 'INSERT' then
    select * into m from public.room_messages where id = new.message_id;
    if not found or m.author_id is distinct from new.created_by or m.kind <> 'poll' then
      raise exception 'A poll belongs to a poll message you wrote.' using errcode = 'P0001';
    end if;
    new.room := m.room;
    new.created_at := now();
  else
    if new.message_id <> old.message_id or new.created_by <> old.created_by or new.room <> old.room
      or new.question is distinct from old.question or new.options is distinct from old.options then
      raise exception 'A poll keeps its question and options. Close it and start a new one.' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from unnest(new.options) o where char_length(trim(o)) not between 1 and 80) then
    raise exception 'Each option is 1 to 80 characters.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger chat_polls_rules
  before insert or update on public.chat_polls
  for each row execute function public.chat_poll_rules();

create or replace function public.chat_vote_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.chat_polls;
begin
  select * into p from public.chat_polls where message_id = new.message_id;
  if p.closes_at is not null and p.closes_at <= now() then
    raise exception 'This poll is closed.' using errcode = 'P0001';
  end if;
  if new.choice >= cardinality(p.options) then
    raise exception 'That is not one of the options.' using errcode = 'P0001';
  end if;
  if not p.multi and exists (select 1 from public.chat_poll_votes v where v.message_id = new.message_id and v.user_id = new.user_id) then
    raise exception 'This poll takes one answer. Take back your vote first.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create or replace trigger chat_poll_votes_rules
  before insert on public.chat_poll_votes
  for each row execute function public.chat_vote_rules();

alter table public.chat_polls enable row level security;
alter table public.chat_poll_votes enable row level security;

-- ─── Chat: saved messages, read marks, personal settings ────────────────────────────────────────────────────

create table if not exists public.chat_saved (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id uuid not null references public.room_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table if not exists public.chat_reads (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  room text not null check (room ~ '^[a-z0-9-]{2,40}$'),
  read_at timestamptz not null,
  primary key (user_id, room)
);

-- One row per member: chat and messages preferences (density, starred and muted rooms, sounds, …) as JSON.
create table if not exists public.social_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  chat jsonb not null default '{}'::jsonb check (jsonb_typeof(chat) = 'object' and pg_column_size(chat) < 8000),
  dm jsonb not null default '{}'::jsonb check (jsonb_typeof(dm) = 'object' and pg_column_size(dm) < 8000),
  updated_at timestamptz not null default now()
);

alter table public.chat_saved enable row level security;
alter table public.chat_reads enable row level security;
alter table public.social_prefs enable row level security;

-- ─── Direct messages: replies, pictures, edits ──────────────────────────────────────────────────────────────

alter table public.dm_messages add column if not exists reply_to uuid references public.dm_messages (id) on delete set null;
alter table public.dm_messages add column if not exists kind text not null default 'text';
alter table public.dm_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.dm_messages add column if not exists edited_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dm_messages_kind_check') then
    alter table public.dm_messages add constraint dm_messages_kind_check check (kind in ('text', 'me', 'sticker'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dm_messages_attachments_check') then
    alter table public.dm_messages add constraint dm_messages_attachments_check check (public.social_attachments_ok(attachments));
  end if;
end $$;

create or replace function public.dm_message_extras()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reply_to is not null and not exists (select 1 from public.dm_messages p where p.id = new.reply_to and p.thread_id = new.thread_id) then
      raise exception 'A reply quotes a message in the same conversation.' using errcode = 'P0001';
    end if;
    new.edited_at := null;
    return new;
  end if;
  if new.thread_id is distinct from old.thread_id or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at or new.kind is distinct from old.kind then
    raise exception 'A message stays where it was written.' using errcode = 'P0001';
  end if;
  if new.body is distinct from old.body or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger dm_messages_extras
  before insert or update on public.dm_messages
  for each row execute function public.dm_message_extras();

do $$
begin
  create policy "Authors edit their direct messages" on public.dm_messages for update to authenticated
    using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and public.dm_participant(thread_id));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Suspended members cannot edit" on public.dm_messages as restrictive for update to authenticated
    using (not public.is_suspended());
exception when duplicate_object then null;
end $$;

-- ─── Direct messages: groups ────────────────────────────────────────────────────────────────────────────────

create table if not exists public.dm_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 60),
  emoji text check (emoji is null or public.social_emoji_ok(emoji)),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.dm_group_members (
  group_id uuid not null references public.dm_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists dm_group_members_user_idx on public.dm_group_members (user_id);

create table if not exists public.dm_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.dm_groups (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000 and body ~ '\S'),
  kind text not null default 'text' check (kind in ('text', 'me', 'sticker', 'system')),
  reply_to uuid references public.dm_group_messages (id) on delete set null,
  attachments jsonb not null default '[]'::jsonb check (public.social_attachments_ok(attachments)),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists dm_group_messages_group_idx on public.dm_group_messages (group_id, created_at desc);

create or replace function public.dm_group_member(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.dm_group_members m where m.group_id = g and m.user_id = (select auth.uid()))
$$;

create or replace function public.dm_group_owner(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.dm_group_members m where m.group_id = g and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;

-- Starts a group conversation with 2 to 19 other members. Nobody who blocked you (or whom you blocked) can be
-- added. Up to 5 new groups a day.
create or replace function public.start_dm_group(group_title text, members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  others uuid[];
  g uuid;
  who uuid;
  my_name text;
begin
  if me is null then
    raise exception 'Sign in to send messages.' using errcode = 'P0001';
  end if;
  if not public.cms_can('message.send') or public.is_suspended() then
    raise exception 'Your account cannot send messages right now.' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into others from unnest(members) x
  where x is not null and x <> me and exists (select 1 from public.profiles p where p.id = x);
  if cardinality(others) < 2 then
    raise exception 'A group needs at least two other members.' using errcode = 'P0001';
  end if;
  if cardinality(others) > 19 then
    raise exception 'A group holds up to 20 people.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(others) x where public.dm_blocked(me, x)) then
    raise exception 'One of those members cannot be messaged.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_groups d where d.created_by = me and d.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can start up to 5 groups a day.' using errcode = 'P0001';
  end if;
  insert into public.dm_groups (title, created_by) values (left(trim(coalesce(nullif(group_title, ''), 'Group')), 60), me) returning id into g;
  insert into public.dm_group_members (group_id, user_id, role, read_at) values (g, me, 'owner', now());
  select name into my_name from public.profiles where id = me;
  foreach who in array others loop
    insert into public.dm_group_members (group_id, user_id) values (g, who);
    perform public.notify(who, 'system', me, 'dm:' || g::text, coalesce(my_name, 'A member') || ' added you to a group: ' || left(trim(group_title), 60));
  end loop;
  return g;
end;
$$;

revoke all on function public.start_dm_group(text, uuid[]) from public, anon;
grant execute on function public.start_dm_group(text, uuid[]) to authenticated;

-- Any member of a group adds someone (up to 20 people, nobody blocked either way).
create or replace function public.dm_group_add(g uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t text;
begin
  if not public.dm_group_member(g) then
    raise exception 'You are not in this group.' using errcode = 'P0001';
  end if;
  if public.is_suspended() then
    raise exception 'Your account is paused.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = member) then
    raise exception 'That member could not be found.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.dm_group_members m where m.group_id = g and m.user_id = member) then
    return;
  end if;
  if (select count(*) from public.dm_group_members m where m.group_id = g) >= 20 then
    raise exception 'A group holds up to 20 people.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.dm_group_members m where m.group_id = g and public.dm_blocked(m.user_id, member)) then
    raise exception 'That member cannot be added to this group.' using errcode = 'P0001';
  end if;
  insert into public.dm_group_members (group_id, user_id) values (g, member);
  select title into t from public.dm_groups where id = g;
  perform public.notify(member, 'system', me, 'dm:' || g::text, 'You were added to a group: ' || t);
end;
$$;

revoke all on function public.dm_group_add(uuid, uuid) from public, anon;
grant execute on function public.dm_group_add(uuid, uuid) to authenticated;

create or replace function public.mark_dm_group_read(g uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.dm_group_members set read_at = now() where group_id = g and user_id = (select auth.uid())
$$;

revoke all on function public.mark_dm_group_read(uuid) from public, anon;
grant execute on function public.mark_dm_group_read(uuid) to authenticated;

create or replace function public.dm_group_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'dm_groups' then
    if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'A group keeps who started it.' using errcode = 'P0001';
    end if;
    new.title := trim(new.title);
    return new;
  end if;
  -- dm_group_messages
  if tg_op = 'INSERT' then
    if new.reply_to is not null and not exists (select 1 from public.dm_group_messages p where p.id = new.reply_to and p.group_id = new.group_id) then
      raise exception 'A reply quotes a message in the same group.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.dm_group_messages m where m.author_id = new.author_id and m.created_at > now() - interval '10 seconds') >= 10 then
      raise exception 'You are sending messages too quickly. Wait a few seconds and try again.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.dm_group_messages m where m.author_id = new.author_id and m.created_at > now() - interval '1 day') >= 500 then
      raise exception 'You sent 500 group messages today. Try again tomorrow.' using errcode = 'P0001';
    end if;
    if new.kind = 'system' then
      new.kind := 'text';
    end if;
    new.created_at := now();
    new.edited_at := null;
    return new;
  end if;
  if new.group_id is distinct from old.group_id or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at or new.kind is distinct from old.kind then
    raise exception 'A message stays where it was written.' using errcode = 'P0001';
  end if;
  if new.body is distinct from old.body or new.attachments is distinct from old.attachments then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger dm_groups_rules
  before update on public.dm_groups
  for each row execute function public.dm_group_rules();

create or replace trigger dm_group_messages_rules
  before insert or update on public.dm_group_messages
  for each row execute function public.dm_group_rules();

-- After a group message: move the group up the inbox, mark it read for its author, and notify the others once
-- per unread stretch (not those who muted the group).
create or replace function public.dm_group_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who uuid;
begin
  update public.dm_groups set last_message_at = new.created_at where id = new.group_id;
  update public.dm_group_members set read_at = new.created_at where group_id = new.group_id and user_id = new.author_id;
  for who in
    select m.user_id from public.dm_group_members m
    where m.group_id = new.group_id and m.user_id <> new.author_id
      and not exists (select 1 from public.dm_prefs p where p.user_id = m.user_id and p.conversation = new.group_id and p.muted)
      and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.target = 'dm:' || new.group_id::text and n.read_at is null)
    limit 25
  loop
    perform public.notify(who, 'mention', new.author_id, 'dm:' || new.group_id::text, new.body);
  end loop;
  return new;
end;
$$;

-- dm_prefs is created below; the trigger body only resolves it when a message is sent.
create or replace trigger dm_group_messages_sent
  after insert on public.dm_group_messages
  for each row execute function public.dm_group_message_sent();

alter table public.dm_groups enable row level security;
alter table public.dm_group_members enable row level security;
alter table public.dm_group_messages enable row level security;

-- ─── Direct messages: reactions, per-conversation settings, requests ────────────────────────────────────────

-- For one-to-one and group messages alike. conversation_id is filled in from the message, for live updates.
create table if not exists public.dm_reactions (
  message_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (public.social_emoji_ok(emoji)),
  conversation_id uuid,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists dm_reactions_conversation_idx on public.dm_reactions (conversation_id);

create or replace function public.dm_message_visible(message uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.dm_messages m where m.id = message and public.dm_participant(m.thread_id))
    or exists (select 1 from public.dm_group_messages g where g.id = message and public.dm_group_member(g.group_id))
$$;

create or replace function public.dm_reaction_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(
    (select m.thread_id from public.dm_messages m where m.id = new.message_id),
    (select g.group_id from public.dm_group_messages g where g.id = new.message_id)
  ) into new.conversation_id;
  if new.conversation_id is null then
    raise exception 'That message is gone.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_reactions x where x.user_id = new.user_id and x.created_at > now() - interval '1 minute') >= 40 then
    raise exception 'You are reacting very quickly. Wait a moment.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create or replace trigger dm_reactions_rules
  before insert on public.dm_reactions
  for each row execute function public.dm_reaction_rules();

-- conversation is a dm_threads id or a dm_groups id.
create table if not exists public.dm_prefs (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  conversation uuid not null,
  pinned boolean not null default false,
  muted boolean not null default false,
  archived boolean not null default false,
  accepted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation)
);

alter table public.dm_reactions enable row level security;
alter table public.dm_prefs enable row level security;

-- A one-to-one message no longer notifies someone who muted the conversation. Otherwise unchanged.
create or replace function public.dm_message_sent()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  t public.dm_threads;
  other uuid;
begin
  update public.dm_threads set
    last_message_at = new.created_at,
    a_read_at = case when user_a = new.author_id then new.created_at else a_read_at end,
    b_read_at = case when user_b = new.author_id then new.created_at else b_read_at end
  where id = new.thread_id
  returning * into t;
  other := case when t.user_a = new.author_id then t.user_b else t.user_a end;
  if exists (select 1 from public.dm_prefs p where p.user_id = other and p.conversation = t.id and p.muted) then
    return new;
  end if;
  if not exists (
    select 1 from public.notifications n
    where n.user_id = other and n.target = 'dm:' || t.id::text and n.read_at is null
  ) then
    perform public.notify(other, 'mention', new.author_id, 'dm:' || t.id::text, new.body);
  end if;
  return new;
end;
$$;

-- Every conversation you are in, one-to-one and group, newest first, with your settings for each. A one-to-one
-- conversation is a request when someone you do not follow started it, you have not written in it, and you have
-- not accepted it.
create or replace function public.dm_inbox_v2()
returns table (
  id uuid,
  kind text,
  title text,
  emoji text,
  other_id uuid,
  other_name text,
  other_handle text,
  other_avatar text,
  member_count integer,
  last_message_at timestamptz,
  last_body text,
  last_author uuid,
  last_author_name text,
  unread bigint,
  other_read_at timestamptz,
  blocked boolean,
  pinned boolean,
  muted boolean,
  archived boolean,
  request boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id)
  select t.id, 'direct', o.name, null::text, o.id, o.name, o.handle, o.avatar_url, 2,
    coalesce(t.last_message_at, t.created_at), lm.body, lm.author_id, la.name,
    (select count(*) from public.dm_messages m
       where m.thread_id = t.id and m.author_id <> (select id from me)
         and m.created_at > coalesce(case when t.user_a = (select id from me) then t.a_read_at else t.b_read_at end, '-infinity')),
    case when t.user_a = (select id from me) then t.b_read_at else t.a_read_at end,
    exists (select 1 from public.member_blocks b where b.blocker_id = (select id from me) and b.blocked_id = o.id),
    coalesce(p.pinned, false), coalesce(p.muted, false), coalesce(p.archived, false),
    t.created_by is distinct from (select id from me)
      and not coalesce(p.accepted, false)
      and not exists (select 1 from public.follows f where f.follower_id = (select id from me) and o.handle is not null and f.followee = 'person:' || o.handle)
      and not exists (select 1 from public.dm_messages m where m.thread_id = t.id and m.author_id = (select id from me))
  from public.dm_threads t
  join public.profiles o on o.id = case when t.user_a = (select id from me) then t.user_b else t.user_a end
  left join public.dm_prefs p on p.user_id = (select id from me) and p.conversation = t.id
  left join lateral (select m.body, m.author_id from public.dm_messages m where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
  left join public.profiles la on la.id = lm.author_id
  where (select id from me) in (t.user_a, t.user_b)
  union all
  select g.id, 'group', g.title, g.emoji, null::uuid, null::text, null::text, null::text,
    (select count(*)::integer from public.dm_group_members x where x.group_id = g.id),
    coalesce(g.last_message_at, g.created_at), lm.body, lm.author_id, la.name,
    (select count(*) from public.dm_group_messages m
       where m.group_id = g.id and m.author_id <> (select id from me) and m.created_at > coalesce(gm.read_at, '-infinity')),
    null::timestamptz, false,
    coalesce(p.pinned, false), coalesce(p.muted, false), coalesce(p.archived, false), false
  from public.dm_group_members gm
  join public.dm_groups g on g.id = gm.group_id
  left join public.dm_prefs p on p.user_id = (select id from me) and p.conversation = g.id
  left join lateral (select m.body, m.author_id from public.dm_group_messages m where m.group_id = g.id order by m.created_at desc limit 1) lm on true
  left join public.profiles la on la.id = lm.author_id
  where gm.user_id = (select id from me)
  order by 10 desc
  limit 300
$$;

revoke all on function public.dm_inbox_v2() from public, anon;
grant execute on function public.dm_inbox_v2() to authenticated;

-- ─── Crews: identity ────────────────────────────────────────────────────────────────────────────────────────

alter table public.crews add column if not exists banner_url text;
alter table public.crews add column if not exists sigil text;
alter table public.crews add column if not exists accent text;
alter table public.crews add column if not exists motto text not null default '';
alter table public.crews add column if not exists rules text not null default '';
alter table public.crews add column if not exists home_sections text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crews_banner_check') then
    alter table public.crews add constraint crews_banner_check check (banner_url is null or public.social_media_url(banner_url));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crews_sigil_check') then
    alter table public.crews add constraint crews_sigil_check check (sigil is null or public.social_emoji_ok(sigil));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crews_accent_check') then
    alter table public.crews add constraint crews_accent_check check (accent is null or accent ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crews_motto_check') then
    alter table public.crews add constraint crews_motto_check check (char_length(motto) <= 140);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crews_rules_check') then
    alter table public.crews add constraint crews_rules_check check (char_length(rules) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crews_home_sections_check') then
    alter table public.crews add constraint crews_home_sections_check check (
      cardinality(home_sections) <= 8
      and home_sections <@ array['pinned', 'events', 'projects', 'leaderboard', 'feed', 'galaxy', 'rules', 'collections']::text[]
    );
  end if;
end $$;

-- ─── Crews: events ──────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.crew_events (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  place text not null default '' check (char_length(place) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists crew_events_crew_idx on public.crew_events (crew_id, starts_at);

create table if not exists public.crew_event_rsvps (
  event_id uuid not null references public.crew_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create or replace function public.crew_event_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.crew_events e where e.crew_id = new.crew_id and e.created_at > now() - interval '1 day') >= 10 then
      raise exception 'A crew can add up to 10 events a day.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
    return new;
  end if;
  if new.crew_id is distinct from old.crew_id or new.created_by is distinct from old.created_by then
    raise exception 'An event stays with its crew.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace trigger crew_events_rules
  before insert or update on public.crew_events
  for each row execute function public.crew_event_rules();

-- A new event tells the crew (up to 200 members).
create or replace function public.crew_event_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.crews;
  who uuid;
begin
  select * into c from public.crews where id = new.crew_id;
  for who in select m.user_id from public.crew_members m where m.crew_id = new.crew_id and m.user_id <> new.created_by limit 200 loop
    perform public.notify(who, 'system', new.created_by, 'crew:' || c.slug, 'New crew event: ' || new.title);
  end loop;
  return new;
end;
$$;

create or replace trigger crew_events_created
  after insert on public.crew_events
  for each row execute function public.crew_event_created();

alter table public.crew_events enable row level security;
alter table public.crew_event_rsvps enable row level security;

-- ─── Crews: project board ───────────────────────────────────────────────────────────────────────────────────

create table if not exists public.crew_projects (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 100),
  blurb text not null default '' check (char_length(blurb) <= 500),
  status text not null default 'idea' check (status in ('idea', 'building', 'shipped')),
  -- A page on Nexverse (a project, a repo, a collection), as a path.
  href text check (href is null or (char_length(href) <= 300 and href ~ '^/[A-Za-z0-9/_.~%?=&#-]*$')),
  position double precision not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shipped_at timestamptz
);

create index if not exists crew_projects_crew_idx on public.crew_projects (crew_id, status, position);

-- Any crew member moves a card between columns; only its author and officers change what it says.
create or replace function public.crew_project_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.crew_projects p where p.crew_id = new.crew_id) >= 200 then
      raise exception 'A crew board holds up to 200 cards.' using errcode = 'P0001';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.shipped_at := case when new.status = 'shipped' then now() end;
  else
    if new.crew_id is distinct from old.crew_id or new.created_by is distinct from old.created_by then
      raise exception 'A card stays with its crew.' using errcode = 'P0001';
    end if;
    if (new.title is distinct from old.title or new.blurb is distinct from old.blurb or new.href is distinct from old.href)
      and auth.uid() is distinct from old.created_by and not public.is_crew_admin(old.crew_id) then
      raise exception 'Only the card''s author and the officers edit it.' using errcode = 'P0001';
    end if;
    if new.status = 'shipped' and old.status <> 'shipped' then
      new.shipped_at := now();
    elsif new.status <> 'shipped' then
      new.shipped_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger crew_projects_rules
  before insert or update on public.crew_projects
  for each row execute function public.crew_project_rules();

alter table public.crew_projects enable row level security;

-- ─── Crews: leaderboard and activity feed ───────────────────────────────────────────────────────────────────

-- Who did the most in the crew over the last `days` days: posts (5), chat messages (1), reactions their posts got
-- (2) and cards they shipped (10). Readable by whoever can read the crew.
create or replace function public.crew_leaderboard(crew uuid, days integer default 30)
returns table (user_id uuid, name text, role text, posts bigint, messages bigint, reactions bigint, shipped bigint, score bigint)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - make_interval(days => least(greatest(coalesce(days, 30), 1), 365)) as at),
  room as (select r.slug from public.rooms r where r.crew_id = crew),
  s as (
    select m.user_id, m.role,
      (select count(*) from public.crew_posts p where p.crew_id = crew and p.author_id = m.user_id and p.created_at > (select at from since)) as posts,
      (select count(*) from public.room_messages x where x.room = (select slug from room) and x.author_id = m.user_id and x.created_at > (select at from since)) as messages,
      (select count(*) from public.crew_post_reactions r join public.crew_posts p on p.id = r.post_id
         where p.crew_id = crew and p.author_id = m.user_id and r.user_id <> m.user_id and r.created_at > (select at from since)) as reactions,
      (select count(*) from public.crew_projects c where c.crew_id = crew and c.created_by = m.user_id and c.shipped_at > (select at from since)) as shipped
    from public.crew_members m
    where m.crew_id = crew
  )
  select s.user_id, p.name, s.role, s.posts, s.messages, s.reactions, s.shipped,
    s.posts * 5 + s.messages + s.reactions * 2 + s.shipped * 10
  from s join public.profiles p on p.id = s.user_id
  where public.can_read_crew(crew)
  order by 8 desc, p.name
  limit 50
$$;

-- What happened in the crew lately: people joining, posts, events and cards started or shipped.
create or replace function public.crew_feed(crew uuid, max_rows integer default 30)
returns table (kind text, happened_at timestamptz, actor_id uuid, actor_name text, title text, ref text)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'join'::text, m.joined_at, m.user_id, p.name, ''::text, null::text
      from public.crew_members m join public.profiles p on p.id = m.user_id where m.crew_id = crew
    union all
    select 'post', x.created_at, x.author_id, p.name, left(regexp_replace(x.body, '\s+', ' ', 'g'), 140), x.id::text
      from public.crew_posts x left join public.profiles p on p.id = x.author_id where x.crew_id = crew
    union all
    select 'event', e.created_at, e.created_by, p.name, e.title, e.id::text
      from public.crew_events e left join public.profiles p on p.id = e.created_by where e.crew_id = crew
    union all
    select 'project', c.created_at, c.created_by, p.name, c.title, c.id::text
      from public.crew_projects c left join public.profiles p on p.id = c.created_by where c.crew_id = crew
    union all
    select 'shipped', c.shipped_at, c.created_by, p.name, c.title, c.id::text
      from public.crew_projects c left join public.profiles p on p.id = c.created_by where c.crew_id = crew and c.shipped_at is not null
  ) f
  where public.can_read_crew(crew)
  order by 2 desc
  limit least(greatest(coalesce(max_rows, 30), 1), 100)
$$;

-- ─── Row level security ─────────────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  -- Guests (the anon role) read none of these tables.
  foreach t in array array['room_reactions', 'chat_polls', 'chat_poll_votes', 'chat_saved', 'chat_reads', 'social_prefs',
    'dm_groups', 'dm_group_members', 'dm_group_messages', 'dm_reactions', 'dm_prefs', 'crew_events', 'crew_event_rsvps', 'crew_projects'] loop
    begin
      execute format('create policy "Guests cannot read this" on public.%I as restrictive for select to anon using (false)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Chat: extra reactions, polls and votes, and your own saved messages, read marks and settings.
do $$
declare
  s text;
begin
  foreach s in array array[
    $p$create policy "Reactions in rooms you can open" on public.room_reactions for select to authenticated using (public.can_use_room(room) and public.chat_room_open_to_me(room))$p$,
    $p$create policy "Members react as themselves" on public.room_reactions for insert to authenticated with check (user_id = (select auth.uid()) and public.can_use_room(room) and public.chat_room_open_to_me(room))$p$,
    $p$create policy "Members remove their reactions" on public.room_reactions for delete to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Suspended members cannot react" on public.room_reactions as restrictive for insert to authenticated with check (not public.is_suspended() and public.cms_can('room.post'))$p$,
    $p$create policy "Polls in rooms you can open" on public.chat_polls for select to authenticated using (public.can_use_room(room) and public.chat_room_open_to_me(room))$p$,
    $p$create policy "Authors attach polls to their messages" on public.chat_polls for insert to authenticated with check (created_by = (select auth.uid()))$p$,
    $p$create policy "Authors close their polls" on public.chat_polls for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()))$p$,
    $p$create policy "Votes in rooms you can open" on public.chat_poll_votes for select to authenticated using (exists (select 1 from public.chat_polls p where p.message_id = chat_poll_votes.message_id and public.can_use_room(p.room) and public.chat_room_open_to_me(p.room)))$p$,
    $p$create policy "Members vote as themselves" on public.chat_poll_votes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.chat_polls p where p.message_id = chat_poll_votes.message_id and public.can_use_room(p.room) and public.chat_room_open_to_me(p.room)))$p$,
    $p$create policy "Members take back their votes" on public.chat_poll_votes for delete to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Suspended members cannot vote" on public.chat_poll_votes as restrictive for insert to authenticated with check (not public.is_suspended())$p$,
    $p$create policy "Your saved messages" on public.chat_saved for select to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Save as yourself" on public.chat_saved for insert to authenticated with check (user_id = (select auth.uid()))$p$,
    $p$create policy "Unsave" on public.chat_saved for delete to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Your read marks" on public.chat_reads for select to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Mark as yourself" on public.chat_reads for insert to authenticated with check (user_id = (select auth.uid()))$p$,
    $p$create policy "Move your read marks" on public.chat_reads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$,
    $p$create policy "Your settings" on public.social_prefs for select to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Save your settings" on public.social_prefs for insert to authenticated with check (user_id = (select auth.uid()))$p$,
    $p$create policy "Change your settings" on public.social_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$
  ] loop
    begin
      execute s;
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Groups: members see the group, each other and the messages; anyone in it renames it; you leave by removing
-- yourself and the owner removes others. Reactions on messages you can read; conversation settings are yours.
do $$
declare
  s text;
begin
  foreach s in array array[
    $p$create policy "Groups you are in" on public.dm_groups for select to authenticated using (public.dm_group_member(id))$p$,
    $p$create policy "Members rename their group" on public.dm_groups for update to authenticated using (public.dm_group_member(id)) with check (public.dm_group_member(id))$p$,
    $p$create policy "People in your groups" on public.dm_group_members for select to authenticated using (public.dm_group_member(group_id))$p$,
    $p$create policy "Leave, or the owner removes" on public.dm_group_members for delete to authenticated using ((user_id = (select auth.uid()) and role <> 'owner') or (public.dm_group_owner(group_id) and user_id <> (select auth.uid())))$p$,
    $p$create policy "Messages in your groups" on public.dm_group_messages for select to authenticated using (public.dm_group_member(group_id))$p$,
    $p$create policy "Write in your groups as yourself" on public.dm_group_messages for insert to authenticated with check (author_id = (select auth.uid()) and public.dm_group_member(group_id))$p$,
    $p$create policy "Needs message.send" on public.dm_group_messages as restrictive for insert to authenticated with check (public.cms_can('message.send') and not public.is_suspended())$p$,
    $p$create policy "Edit your group messages" on public.dm_group_messages for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and public.dm_group_member(group_id))$p$,
    $p$create policy "Suspended members cannot edit" on public.dm_group_messages as restrictive for update to authenticated using (not public.is_suspended())$p$,
    $p$create policy "Delete your group messages" on public.dm_group_messages for delete to authenticated using (author_id = (select auth.uid()))$p$,
    $p$create policy "Reactions on messages you can read" on public.dm_reactions for select to authenticated using (public.dm_message_visible(message_id))$p$,
    $p$create policy "React as yourself" on public.dm_reactions for insert to authenticated with check (user_id = (select auth.uid()) and public.dm_message_visible(message_id))$p$,
    $p$create policy "Remove your reactions" on public.dm_reactions for delete to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Suspended members cannot react" on public.dm_reactions as restrictive for insert to authenticated with check (not public.is_suspended())$p$,
    $p$create policy "Your conversation settings" on public.dm_prefs for select to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Save your conversation settings" on public.dm_prefs for insert to authenticated with check (user_id = (select auth.uid()) and (public.dm_participant(conversation) or public.dm_group_member(conversation)))$p$,
    $p$create policy "Change your conversation settings" on public.dm_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$
  ] loop
    begin
      execute s;
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Crews: events are readable with the crew, planned by the captain and officers, answered by members; on the
-- board members add and move cards, authors and officers remove them.
do $$
declare
  s text;
begin
  foreach s in array array[
    $p$create policy "Events of readable crews" on public.crew_events for select to authenticated using (public.can_read_crew(crew_id))$p$,
    $p$create policy "Officers plan events" on public.crew_events for insert to authenticated with check (public.is_crew_admin(crew_id))$p$,
    $p$create policy "Officers change events" on public.crew_events for update to authenticated using (public.is_crew_admin(crew_id)) with check (public.is_crew_admin(crew_id))$p$,
    $p$create policy "Officers cancel events" on public.crew_events for delete to authenticated using (public.is_crew_admin(crew_id))$p$,
    $p$create policy "Suspended members cannot plan" on public.crew_events as restrictive for insert to authenticated with check (not public.is_suspended())$p$,
    $p$create policy "Answers to readable events" on public.crew_event_rsvps for select to authenticated using (exists (select 1 from public.crew_events e where e.id = crew_event_rsvps.event_id and public.can_read_crew(e.crew_id)))$p$,
    $p$create policy "Members answer for themselves" on public.crew_event_rsvps for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.crew_events e where e.id = crew_event_rsvps.event_id and public.is_crew_member(e.crew_id)))$p$,
    $p$create policy "Members change their answer" on public.crew_event_rsvps for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$,
    $p$create policy "Members take back their answer" on public.crew_event_rsvps for delete to authenticated using (user_id = (select auth.uid()))$p$,
    $p$create policy "Cards of readable crews" on public.crew_projects for select to authenticated using (public.can_read_crew(crew_id))$p$,
    $p$create policy "Members add cards" on public.crew_projects for insert to authenticated with check (public.is_crew_member(crew_id))$p$,
    $p$create policy "Members move cards" on public.crew_projects for update to authenticated using (public.is_crew_member(crew_id)) with check (public.is_crew_member(crew_id))$p$,
    $p$create policy "Authors and officers remove cards" on public.crew_projects for delete to authenticated using (created_by = (select auth.uid()) or public.is_crew_admin(crew_id))$p$,
    $p$create policy "Suspended members cannot add cards" on public.crew_projects as restrictive for insert to authenticated with check (not public.is_suspended())$p$,
    $p$create policy "Suspended members cannot move cards" on public.crew_projects as restrictive for update to authenticated using (not public.is_suspended())$p$
  ] loop
    begin
      execute s;
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Guests get nothing; members get the rows the policies allow, and may change only these columns.
revoke all on public.room_reactions, public.chat_polls, public.chat_poll_votes, public.chat_saved, public.chat_reads, public.social_prefs,
  public.dm_groups, public.dm_group_members, public.dm_group_messages, public.dm_reactions, public.dm_prefs,
  public.crew_events, public.crew_event_rsvps, public.crew_projects from anon, authenticated;
grant select, insert, delete on public.room_reactions to authenticated;
grant select, insert on public.chat_polls to authenticated;
grant update (closes_at) on public.chat_polls to authenticated;
grant select, insert, delete on public.chat_poll_votes to authenticated;
grant select, insert, delete on public.chat_saved to authenticated;
grant select, insert on public.chat_reads to authenticated;
grant update (read_at) on public.chat_reads to authenticated;
grant select, insert on public.social_prefs to authenticated;
grant update (chat, dm, updated_at) on public.social_prefs to authenticated;
grant select on public.dm_groups to authenticated;
grant update (title, emoji) on public.dm_groups to authenticated;
grant select, delete on public.dm_group_members to authenticated;
grant select, insert, delete on public.dm_group_messages to authenticated;
grant update (body, attachments) on public.dm_group_messages to authenticated;
grant select, insert, delete on public.dm_reactions to authenticated;
grant select, insert on public.dm_prefs to authenticated;
grant update (pinned, muted, archived, accepted, updated_at) on public.dm_prefs to authenticated;
grant select, insert, delete on public.crew_events to authenticated;
grant update (title, body, place, starts_at, ends_at) on public.crew_events to authenticated;
grant select, insert, delete on public.crew_event_rsvps to authenticated;
grant update (status) on public.crew_event_rsvps to authenticated;
grant select, insert, delete on public.crew_projects to authenticated;
grant update (title, blurb, status, href, position) on public.crew_projects to authenticated;

-- New columns members may change on existing tables (the earlier migrations grant updates column by column).
grant update (attachments, mentions) on public.room_messages to authenticated;
grant update (body, attachments) on public.dm_messages to authenticated;
grant update (banner_url, sigil, accent, motto, rules, home_sections) on public.crews to authenticated;

revoke all on function public.crew_leaderboard(uuid, integer) from public, anon;
grant execute on function public.crew_leaderboard(uuid, integer) to authenticated;
revoke all on function public.crew_feed(uuid, integer) from public, anon;
grant execute on function public.crew_feed(uuid, integer) to authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['room_reactions', 'chat_polls', 'chat_poll_votes', 'dm_group_messages', 'dm_group_members', 'dm_groups',
    'dm_reactions', 'crew_events', 'crew_event_rsvps', 'crew_projects'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;
