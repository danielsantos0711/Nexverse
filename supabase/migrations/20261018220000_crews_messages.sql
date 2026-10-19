-- Crews and direct messages. A crew is a group of members (a lab, a study group, a project team) with a wall of
-- posts, its own chat room, shared collections and a members list. Direct messages are one-to-one conversations
-- between members, with read receipts and blocking. Members write only their own rows; roles, counts and
-- timestamps are set by triggers. Notifications still go through public.notify() only, as 'mention' or 'system'
-- with a target of 'crew:<slug>' or 'dm:<conversation id>'. Live presence needs no tables: it is a Realtime
-- presence channel that carries a member's id, name and the page they are on, and nothing else.

-- ─── Crews ──────────────────────────────────────────────────────────────────────────────────────────────────

-- The emblem is a lucide icon name and one of eight colours. Up to eight lowercase topic tags.
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,32}[a-z0-9])?$' and char_length(slug) >= 2),
  name text not null check (char_length(trim(name)) between 2 and 60),
  blurb text not null default '' check (char_length(blurb) <= 300),
  icon text not null default 'orbit' check (icon ~ '^[a-z0-9-]{2,40}$'),
  color text not null default 'ion' check (color in ('ion', 'gold', 'ok', 'violet', 'rose', 'teal', 'amber', 'sky')),
  visibility text not null default 'public' check (visibility in ('public', 'invite')),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 8 and (cardinality(tags) = 0 or array_to_string(tags, ',') ~ '^[a-z0-9][a-z0-9-]{0,23}(,[a-z0-9][a-z0-9-]{0,23})*$')),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  member_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crews_owner_idx on public.crews (owner_id);
create index crews_updated_idx on public.crews (updated_at desc);
create index crews_tags_idx on public.crews using gin (tags);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create index crew_members_user_idx on public.crew_members (user_id, joined_at desc);
create unique index crew_members_one_owner on public.crew_members (crew_id) where role = 'owner';

-- Asking to join an invite-only crew. The crew's owner and admins see the request and can let them in.
create table public.crew_requests (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create index crew_requests_user_idx on public.crew_requests (user_id);

-- An invite link is /crews/<slug>?invite=<token>. It runs out after a week or a set number of uses.
create table public.crew_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  crew_id uuid not null references public.crews (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  max_uses integer not null default 25 check (max_uses between 1 and 500),
  uses integer not null default 0,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create index crew_invites_crew_idx on public.crew_invites (crew_id, created_at desc);
create index crew_invites_created_by_idx on public.crew_invites (created_by);

-- The crew wall: Markdown posts, any member may write, admins pin up to three.
create table public.crew_posts (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000 and body ~ '\S'),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 10),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index crew_posts_crew_created_idx on public.crew_posts (crew_id, created_at desc);
create index crew_posts_author_idx on public.crew_posts (author_id, created_at desc);

create table public.crew_post_reactions (
  post_id uuid not null references public.crew_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '🚀', '👀', '🤔')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create index crew_post_reactions_user_idx on public.crew_post_reactions (user_id);

-- Shared collections point at a member's collection by id or a sample collection by slug, like follows do.
create table public.crew_collections (
  crew_id uuid not null references public.crews (id) on delete cascade,
  collection text not null check (collection ~ '^[a-z0-9-]{1,80}$'),
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (crew_id, collection)
);

create index crew_collections_added_by_idx on public.crew_collections (added_by);

-- A crew's chat room is a row in public.rooms tied to the crew (see "Crew chat rooms" below).
alter table public.rooms drop constraint rooms_kind_check;
alter table public.rooms add constraint rooms_kind_check check (kind in ('public', 'crew'));
alter table public.rooms add column crew_id uuid unique references public.crews (id) on delete cascade;
alter table public.rooms add constraint rooms_crew_kind_check check ((kind = 'crew') = (crew_id is not null));

-- ─── Who may do what in a crew ──────────────────────────────────────────────────────────────────────────────

-- Your role in a crew, or null. Security definer so policies on crew_members can ask without recursing.
create function public.crew_role(crew uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.crew_members m where m.crew_id = crew and m.user_id = (select auth.uid())
$$;

create function public.is_crew_member(crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.crew_role(crew) is not null
$$;

create function public.is_crew_admin(crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.crew_role(crew) in ('owner', 'admin'), false)
$$;

-- Public crews show their wall, members and collections to anyone; invite-only crews only to members.
create function public.can_read_crew(crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crews c where c.id = crew and c.visibility = 'public') or public.is_crew_member(crew)
$$;

-- ─── Crew rules ─────────────────────────────────────────────────────────────────────────────────────────────

-- New crews: three a day and twenty owned at once. The slug never changes (its chat room is named after it).
create function public.crew_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.crews c where c.owner_id = new.owner_id and c.created_at > now() - interval '1 day') >= 3 then
      raise exception 'You can start up to 3 crews a day.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.crews c where c.owner_id = new.owner_id) >= 20 then
      raise exception 'You can own up to 20 crews.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.member_count := 0;
  else
    if new.slug is distinct from old.slug or new.owner_id is distinct from old.owner_id then
      raise exception 'A crew keeps its address and its owner.' using errcode = 'P0001';
    end if;
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

create trigger crews_rules before insert or update on public.crews
  for each row execute function public.crew_rules();

-- A new crew: its founder becomes the owner and it gets a chat room of its own.
create function public.crew_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crew_members (crew_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.rooms (slug, name, topic, kind, created_by, crew_id)
  values ('crew-' || new.slug, left(new.name, 40), left(new.blurb, 200), 'crew', null, new.id);
  return new;
end;
$$;

create trigger crews_created after insert on public.crews
  for each row execute function public.crew_created();

-- Renaming a crew renames its room.
create function public.crew_renamed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms set name = left(new.name, 40), topic = left(new.blurb, 200) where crew_id = new.id;
  return new;
end;
$$;

create trigger crews_renamed after update of name, blurb on public.crews
  for each row execute function public.crew_renamed();

-- Membership. Joining is rate limited; only the owner hands out the admin role; the owner cannot leave (they
-- delete the crew instead); admins remove members but not other admins. Joining clears a pending request.
create function public.crew_member_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
begin
  if tg_op = 'INSERT' then
    new.joined_at := now();
    if actor is not null then
      if (select count(*) from public.crew_members m where m.user_id = new.user_id and m.joined_at > now() - interval '1 hour') >= 20 then
        raise exception 'You are joining crews very quickly. Try again in a while.' using errcode = 'P0001';
      end if;
      if (select count(*) from public.crew_members m where m.crew_id = new.crew_id) >= 500 then
        raise exception 'This crew is full (500 members).' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  -- Changes made by the database itself (a crew being deleted, a profile going away) are always allowed.
  if actor is null or not exists (select 1 from public.crews c where c.id = old.crew_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select m.role into actor_role from public.crew_members m where m.crew_id = old.crew_id and m.user_id = actor;
  if tg_op = 'UPDATE' then
    if new.crew_id <> old.crew_id or new.user_id <> old.user_id then
      raise exception 'Membership cannot move.' using errcode = 'P0001';
    end if;
    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'The owner stays the owner.' using errcode = 'P0001';
    end if;
    if actor_role is distinct from 'owner' then
      raise exception 'Only the crew owner changes roles.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- DELETE
  if old.role = 'owner' then
    if old.user_id <> actor then
      raise exception 'The owner cannot be removed.' using errcode = 'P0001';
    end if;
    raise exception 'The owner cannot leave. Delete the crew instead.' using errcode = 'P0001';
  end if;
  if old.user_id <> actor and old.role = 'admin' and actor_role is distinct from 'owner' then
    raise exception 'Only the owner removes admins.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger crew_members_rules before insert or update or delete on public.crew_members
  for each row execute function public.crew_member_rules();

-- Keeps the member count, clears the request, and tells someone they were let in.
create function public.crew_member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.crews;
begin
  if tg_op = 'INSERT' then
    update public.crews set member_count = member_count + 1 where id = new.crew_id returning * into c;
    delete from public.crew_requests r where r.crew_id = new.crew_id and r.user_id = new.user_id;
    if (select auth.uid()) is distinct from new.user_id and new.role <> 'owner' then
      perform public.notify(new.user_id, 'system', (select auth.uid()), 'crew:' || c.slug, 'You are now a member of ' || c.name);
    end if;
    return new;
  end if;
  update public.crews set member_count = greatest(member_count - 1, 0) where id = old.crew_id;
  return old;
end;
$$;

create trigger crew_members_changed after insert or delete on public.crew_members
  for each row execute function public.crew_member_changed();

-- Requests: only to invite-only crews you are not in, ten a day. The owner and admins hear about each one.
create function public.crew_request_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.crews;
  admin record;
begin
  select * into c from public.crews where id = new.crew_id;
  if c.visibility <> 'invite' then
    raise exception 'This crew is open. Join it directly.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crew_members m where m.crew_id = new.crew_id and m.user_id = new.user_id) then
    raise exception 'You are already a member.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.crew_requests r where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can ask to join up to 10 crews a day.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  for admin in select m.user_id from public.crew_members m where m.crew_id = new.crew_id and m.role in ('owner', 'admin') loop
    perform public.notify(admin.user_id, 'system', new.user_id, 'crew:' || c.slug, 'Asked to join ' || c.name);
  end loop;
  return new;
end;
$$;

create trigger crew_requests_rules before insert on public.crew_requests
  for each row execute function public.crew_request_rules();

-- Invites: twenty a day per crew, made by its owner or admins.
create function public.crew_invite_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.crew_invites i where i.crew_id = new.crew_id and i.created_at > now() - interval '1 day') >= 20 then
    raise exception 'This crew made 20 invite links today. Reuse one of them.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.uses := 0;
  if new.expires_at > now() + interval '30 days' then
    new.expires_at := now() + interval '30 days';
  end if;
  return new;
end;
$$;

create trigger crew_invites_rules before insert on public.crew_invites
  for each row execute function public.crew_invite_rules();

-- Posts: five a minute and fifty a day; authors edit their text, admins pin (three at most). Members mentioned
-- by name who are in the crew get a 'mention' notification.
create function public.crew_post_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.crew_posts p where p.author_id = new.author_id and p.created_at > now() - interval '1 minute') >= 5 then
      raise exception 'You are posting too quickly. Wait a minute and try again.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.crew_posts p where p.author_id = new.author_id and p.created_at > now() - interval '1 day') >= 50 then
      raise exception 'You can write up to 50 crew posts a day.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.edited_at := null;
    new.pinned := false;
    return new;
  end if;
  if new.crew_id <> old.crew_id or new.author_id <> old.author_id then
    raise exception 'A post stays where it was written.' using errcode = 'P0001';
  end if;
  if (new.body is distinct from old.body or new.mentions is distinct from old.mentions) then
    if actor is distinct from old.author_id then
      raise exception 'Only the author edits a post.' using errcode = 'P0001';
    end if;
    new.edited_at := now();
  end if;
  if new.pinned is distinct from old.pinned then
    if not public.is_crew_admin(old.crew_id) then
      raise exception 'Only the crew owner and admins pin posts.' using errcode = 'P0001';
    end if;
    if new.pinned and (select count(*) from public.crew_posts p where p.crew_id = old.crew_id and p.pinned) >= 3 then
      raise exception 'A crew pins up to 3 posts. Unpin one first.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger crew_posts_rules before insert or update on public.crew_posts
  for each row execute function public.crew_post_rules();

create function public.notify_crew_mentions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.crews;
  who record;
begin
  select * into c from public.crews where id = new.crew_id;
  for who in
    select p.id, p.name from public.profiles p
    join public.crew_members m on m.user_id = p.id and m.crew_id = new.crew_id
    where p.id = any (new.mentions)
      and (tg_op = 'INSERT' or not (p.id = any (old.mentions)))
      and position(lower('@' || p.name) in lower(new.body)) > 0
  loop
    perform public.notify(who.id, 'mention', new.author_id, 'crew:' || c.slug, new.body);
  end loop;
  return new;
end;
$$;

create trigger crew_posts_notify_mentions after insert or update of mentions on public.crew_posts
  for each row execute function public.notify_crew_mentions();

-- Shared collections: fifty per crew.
create function public.crew_collection_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.crew_collections x where x.crew_id = new.crew_id) >= 50 then
    raise exception 'A crew shares up to 50 collections.' using errcode = 'P0001';
  end if;
  new.added_at := now();
  return new;
end;
$$;

create trigger crew_collections_rules before insert on public.crew_collections
  for each row execute function public.crew_collection_rules();

-- Opening an invite link: checks it, makes you a member and counts the use. Returns the crew's slug.
create function public.accept_crew_invite(invite text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  i public.crew_invites;
  c public.crews;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  select * into i from public.crew_invites where token = invite for update;
  if i.token is null or i.expires_at < now() or i.uses >= i.max_uses then
    raise exception 'This invite link has run out. Ask for a new one.' using errcode = 'P0001';
  end if;
  select * into c from public.crews where id = i.crew_id;
  if not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.user_id = (select auth.uid())) then
    insert into public.crew_members (crew_id, user_id, role) values (c.id, (select auth.uid()), 'member');
    update public.crew_invites set uses = uses + 1 where token = i.token;
  end if;
  return c.slug;
end;
$$;

-- What happened in a crew on each of the last seven days: posts, chat messages and people joining.
create function public.crew_activity(crew uuid)
returns table (day date, posts bigint, messages bigint, joins bigint)
language sql stable security definer set search_path = '' as $$
  with days as (
    select (current_date - g)::date as day from generate_series(0, 6) g
  )
  select d.day,
    (select count(*) from public.crew_posts p where p.crew_id = crew and p.created_at::date = d.day),
    (select count(*) from public.room_messages m join public.rooms r on r.slug = m.room
       where r.crew_id = crew and m.created_at::date = d.day),
    (select count(*) from public.crew_members m where m.crew_id = crew and m.joined_at::date = d.day)
  from days d
  where public.can_read_crew(crew)
  order by d.day
$$;

-- ─── Crew permissions ───────────────────────────────────────────────────────────────────────────────────────

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_requests enable row level security;
alter table public.crew_invites enable row level security;
alter table public.crew_posts enable row level security;
alter table public.crew_post_reactions enable row level security;
alter table public.crew_collections enable row level security;

-- Every crew can be found (name, emblem, blurb); what happens inside an invite-only crew stays inside.
create policy "Crews can be found" on public.crews for select using (true);
create policy "Members start crews as themselves" on public.crews for insert
  to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners and admins edit their crew" on public.crews for update
  to authenticated using (public.is_crew_admin(id)) with check (public.is_crew_admin(id));
create policy "Owners delete their crew" on public.crews for delete
  to authenticated using (owner_id = (select auth.uid()));

create policy "Members of readable crews" on public.crew_members for select using (public.can_read_crew(crew_id));
-- You join an open crew as a plain member; admins let in people who asked.
create policy "Join open crews, or let in a request" on public.crew_members for insert to authenticated with check (
  role = 'member' and (
    (user_id = (select auth.uid()) and exists (select 1 from public.crews c where c.id = crew_id and c.visibility = 'public'))
    or (public.is_crew_admin(crew_id) and exists (select 1 from public.crew_requests r where r.crew_id = crew_members.crew_id and r.user_id = crew_members.user_id))
  )
);
create policy "Owners change roles" on public.crew_members for update
  to authenticated using (public.crew_role(crew_id) = 'owner') with check (public.crew_role(crew_id) = 'owner');
create policy "Leave, or remove a member" on public.crew_members for delete
  to authenticated using (user_id = (select auth.uid()) or public.is_crew_admin(crew_id));

create policy "Your requests, and requests to crews you run" on public.crew_requests for select
  to authenticated using (user_id = (select auth.uid()) or public.is_crew_admin(crew_id));
create policy "Ask as yourself" on public.crew_requests for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Withdraw or turn down a request" on public.crew_requests for delete
  to authenticated using (user_id = (select auth.uid()) or public.is_crew_admin(crew_id));

create policy "Admins see invite links" on public.crew_invites for select
  to authenticated using (public.is_crew_admin(crew_id));
create policy "Admins make invite links" on public.crew_invites for insert
  to authenticated with check (created_by = (select auth.uid()) and public.is_crew_admin(crew_id));
create policy "Admins revoke invite links" on public.crew_invites for delete
  to authenticated using (public.is_crew_admin(crew_id));

create policy "Posts of readable crews" on public.crew_posts for select using (public.can_read_crew(crew_id));
create policy "Members post as themselves" on public.crew_posts for insert
  to authenticated with check (author_id = (select auth.uid()) and public.is_crew_member(crew_id));
create policy "Authors edit, admins pin" on public.crew_posts for update to authenticated
  using (author_id = (select auth.uid()) or public.is_crew_admin(crew_id))
  with check (author_id = (select auth.uid()) or public.is_crew_admin(crew_id));
create policy "Authors and admins delete posts" on public.crew_posts for delete
  to authenticated using (author_id = (select auth.uid()) or public.is_crew_admin(crew_id));

create policy "Reactions on readable posts" on public.crew_post_reactions for select using (
  exists (select 1 from public.crew_posts p where p.id = post_id and public.can_read_crew(p.crew_id))
);
create policy "Members react as themselves" on public.crew_post_reactions for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.crew_posts p where p.id = post_id and public.is_crew_member(p.crew_id))
);
create policy "Members remove their reactions" on public.crew_post_reactions for delete
  to authenticated using (user_id = (select auth.uid()));

create policy "Collections of readable crews" on public.crew_collections for select using (public.can_read_crew(crew_id));
create policy "Members share collections" on public.crew_collections for insert
  to authenticated with check (added_by = (select auth.uid()) and public.is_crew_member(crew_id));
create policy "The sharer or an admin unshares" on public.crew_collections for delete
  to authenticated using (added_by = (select auth.uid()) or public.is_crew_admin(crew_id));

-- Only these columns change after writing; everything else is set by the triggers above.
revoke update on public.crews from anon, authenticated;
grant update (name, blurb, icon, color, visibility, tags) on public.crews to authenticated;
revoke update on public.crew_members from anon, authenticated;
grant update (role) on public.crew_members to authenticated;
revoke update on public.crew_requests from anon, authenticated;
revoke update on public.crew_invites from anon, authenticated;
revoke update on public.crew_posts from anon, authenticated;
grant update (body, mentions, pinned) on public.crew_posts to authenticated;
revoke update on public.crew_post_reactions from anon, authenticated;
revoke update on public.crew_collections from anon, authenticated;

-- ─── Crew chat rooms ────────────────────────────────────────────────────────────────────────────────────────

-- A crew's room is an ordinary chat room ("crew-<slug>") tied to the crew. It stays out of the public room
-- list, and only the crew's members read and write in it. Public rooms work exactly as before.

create function public.can_use_room(room_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.slug = room_slug and (r.kind = 'public' or public.is_crew_member(r.crew_id))
  )
$$;

drop policy "Rooms are public" on public.rooms;
create policy "Public rooms, and your crews' rooms" on public.rooms for select
  using (kind = 'public' or public.is_crew_member(crew_id));
drop policy "Members open rooms as themselves" on public.rooms;
create policy "Members open public rooms as themselves" on public.rooms for insert to authenticated
  with check (created_by = (select auth.uid()) and kind = 'public' and crew_id is null and slug !~ '^crew-');

drop policy "Messages are public" on public.room_messages;
create policy "Messages of rooms you can open" on public.room_messages for select using (public.can_use_room(room));
drop policy "Members write as themselves" on public.room_messages;
create policy "Members write as themselves" on public.room_messages for insert
  to authenticated with check (author_id = (select auth.uid()) and public.can_use_room(room));

drop policy "Reactions are public" on public.message_reactions;
create policy "Reactions in rooms you can open" on public.message_reactions for select using (public.can_use_room(room));
drop policy "Members react as themselves" on public.message_reactions;
create policy "Members react as themselves" on public.message_reactions for insert
  to authenticated with check (user_id = (select auth.uid()) and public.can_use_room(room));


-- ─── Direct messages ────────────────────────────────────────────────────────────────────────────────────────

-- One conversation per pair of members, stored with the smaller id first. Each side's read mark is kept here.
create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  a_read_at timestamptz,
  b_read_at timestamptz,
  last_message_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index dm_threads_b_idx on public.dm_threads (user_b);
create index dm_threads_created_by_idx on public.dm_threads (created_by);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000 and body ~ '\S'),
  created_at timestamptz not null default now()
);

create index dm_messages_thread_created_idx on public.dm_messages (thread_id, created_at desc);
create index dm_messages_author_created_idx on public.dm_messages (author_id, created_at desc);

-- Blocking a member stops messages both ways. Only you see who you blocked.
create table public.member_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index member_blocks_blocked_idx on public.member_blocks (blocked_id);

create function public.dm_participant(thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dm_threads t where t.id = thread and (select auth.uid()) in (t.user_a, t.user_b)
  )
$$;

create function public.dm_blocked(one uuid, other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_blocks b
    where (b.blocker_id = one and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = one)
  )
$$;

-- Opens (or finds) your conversation with another member. Ten new conversations a day.
create function public.start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  found uuid;
begin
  if me is null then
    raise exception 'Sign in to send messages.' using errcode = 'P0001';
  end if;
  if other is null or other = me or not exists (select 1 from public.profiles p where p.id = other) then
    raise exception 'That member could not be found.' using errcode = 'P0001';
  end if;
  select t.id into found from public.dm_threads t where t.user_a = least(me, other) and t.user_b = greatest(me, other);
  if found is not null then
    return found;
  end if;
  if public.dm_blocked(me, other) then
    raise exception 'You cannot message this member.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_threads t where t.created_by = me and t.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can start up to 10 new conversations a day.' using errcode = 'P0001';
  end if;
  insert into public.dm_threads (user_a, user_b, created_by) values (least(me, other), greatest(me, other), me)
  returning id into found;
  return found;
end;
$$;

-- Marks a conversation read up to now, for you. The other side sees it as "Seen".
create function public.mark_dm_read(thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  update public.dm_threads set
    a_read_at = case when user_a = me then now() else a_read_at end,
    b_read_at = case when user_b = me then now() else b_read_at end
  where id = thread and me in (user_a, user_b);
end;
$$;

-- Your conversations, newest first, with the other member, the last message and how many you have not read.
create function public.dm_inbox()
returns table (
  id uuid, other_id uuid, other_name text, other_avatar text, last_message_at timestamptz, last_body text,
  last_author uuid, unread bigint, other_read_at timestamptz, blocked boolean
)
language sql stable security definer set search_path = '' as $$
  select t.id, o.id, o.name, o.avatar_url, t.last_message_at, lm.body, lm.author_id,
    (select count(*) from public.dm_messages m
       where m.thread_id = t.id and m.author_id <> (select auth.uid())
         and m.created_at > coalesce(case when t.user_a = (select auth.uid()) then t.a_read_at else t.b_read_at end, '-infinity')),
    case when t.user_a = (select auth.uid()) then t.b_read_at else t.a_read_at end,
    exists (select 1 from public.member_blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = o.id)
  from public.dm_threads t
  join public.profiles o on o.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
  left join lateral (
    select m.body, m.author_id from public.dm_messages m where m.thread_id = t.id order by m.created_at desc limit 1
  ) lm on true
  where (select auth.uid()) in (t.user_a, t.user_b)
  order by coalesce(t.last_message_at, t.created_at) desc
  limit 200
$$;

-- Messages: ten in ten seconds and 500 a day, never to someone who blocked you (or whom you blocked).
-- The recipient gets one notification per unread conversation, not one per message.
create function public.dm_message_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.dm_threads;
  other uuid;
begin
  select * into t from public.dm_threads where id = new.thread_id;
  other := case when t.user_a = new.author_id then t.user_b else t.user_a end;
  if public.dm_blocked(new.author_id, other) then
    raise exception 'You cannot message this member.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_messages m where m.author_id = new.author_id and m.created_at > now() - interval '10 seconds') >= 10 then
    raise exception 'You are sending messages too quickly. Wait a few seconds and try again.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dm_messages m where m.author_id = new.author_id and m.created_at > now() - interval '1 day') >= 500 then
    raise exception 'You sent 500 messages today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger dm_messages_rules before insert on public.dm_messages
  for each row execute function public.dm_message_rules();

create function public.dm_message_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  if not exists (
    select 1 from public.notifications n
    where n.user_id = other and n.target = 'dm:' || t.id::text and n.read_at is null
  ) then
    perform public.notify(other, 'mention', new.author_id, 'dm:' || t.id::text, new.body);
  end if;
  return new;
end;
$$;

create trigger dm_messages_sent after insert on public.dm_messages
  for each row execute function public.dm_message_sent();

-- Blocking: a hundred blocks at most.
create function public.member_block_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.member_blocks b where b.blocker_id = new.blocker_id) >= 100 then
    raise exception 'You can block up to 100 members.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger member_blocks_rules before insert on public.member_blocks
  for each row execute function public.member_block_rules();

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.member_blocks enable row level security;

-- Conversations are opened through start_dm() and marked read through mark_dm_read(); nobody writes rows directly.
create policy "Your conversations" on public.dm_threads for select
  to authenticated using ((select auth.uid()) in (user_a, user_b));

create policy "Messages in your conversations" on public.dm_messages for select
  to authenticated using (public.dm_participant(thread_id));
create policy "Write in your conversations as yourself" on public.dm_messages for insert
  to authenticated with check (author_id = (select auth.uid()) and public.dm_participant(thread_id));
create policy "Delete your own messages" on public.dm_messages for delete
  to authenticated using (author_id = (select auth.uid()));

create policy "Your blocks" on public.member_blocks for select
  to authenticated using (blocker_id = (select auth.uid()));
create policy "Block as yourself" on public.member_blocks for insert
  to authenticated with check (blocker_id = (select auth.uid()));
create policy "Unblock" on public.member_blocks for delete
  to authenticated using (blocker_id = (select auth.uid()));

revoke insert, update, delete on public.dm_threads from anon, authenticated;
revoke update on public.dm_messages from anon, authenticated;
revoke update on public.member_blocks from anon, authenticated;
revoke all on public.dm_threads, public.dm_messages, public.member_blocks from anon;
grant select on public.dm_threads to authenticated;

-- ─── Function permissions ───────────────────────────────────────────────────────────────────────────────────

revoke execute on function public.crew_rules() from public, anon, authenticated;
revoke execute on function public.crew_created() from public, anon, authenticated;
revoke execute on function public.crew_renamed() from public, anon, authenticated;
revoke execute on function public.crew_member_rules() from public, anon, authenticated;
revoke execute on function public.crew_member_changed() from public, anon, authenticated;
revoke execute on function public.crew_request_rules() from public, anon, authenticated;
revoke execute on function public.crew_invite_rules() from public, anon, authenticated;
revoke execute on function public.crew_post_rules() from public, anon, authenticated;
revoke execute on function public.notify_crew_mentions() from public, anon, authenticated;
revoke execute on function public.crew_collection_rules() from public, anon, authenticated;
revoke execute on function public.dm_message_rules() from public, anon, authenticated;
revoke execute on function public.dm_message_sent() from public, anon, authenticated;
revoke execute on function public.member_block_rules() from public, anon, authenticated;

-- Called by members; each checks who is asking.
revoke execute on function public.accept_crew_invite(text) from public, anon;
revoke execute on function public.start_dm(uuid) from public, anon;
revoke execute on function public.mark_dm_read(uuid) from public, anon;
revoke execute on function public.dm_inbox() from public, anon;
revoke execute on function public.dm_participant(uuid) from public, anon;
revoke execute on function public.dm_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_crew_invite(text) to authenticated;
grant execute on function public.start_dm(uuid) to authenticated;
grant execute on function public.mark_dm_read(uuid) to authenticated;
grant execute on function public.dm_inbox() to authenticated;
grant execute on function public.dm_participant(uuid) to authenticated;
-- Policies on public tables call these for signed-out readers too; they only ever describe the caller.
grant execute on function public.crew_role(uuid) to anon, authenticated;
grant execute on function public.is_crew_member(uuid) to anon, authenticated;
grant execute on function public.is_crew_admin(uuid) to anon, authenticated;
grant execute on function public.can_read_crew(uuid) to anon, authenticated;
grant execute on function public.can_use_room(text) to anon, authenticated;
grant execute on function public.crew_activity(uuid) to anon, authenticated;

-- ─── Live updates ───────────────────────────────────────────────────────────────────────────────────────────

-- Realtime applies the select policies above, so members only hear their own conversations and crews.
alter publication supabase_realtime add table public.crew_posts, public.crew_members, public.dm_threads, public.dm_messages;
