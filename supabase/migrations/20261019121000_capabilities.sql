-- Roles, capabilities and reputation tiers (round 8).
--
-- What a member may do is a set of capabilities ("thread.create", "event.create", "news.publish"...). A member
-- holds the capabilities of:
--   1. the "member" role (everyone signed in) and their base role from profiles.role (member, moderator, admin);
--   2. any extra roles an admin granted them (editor, contributor, or a custom role);
--   3. the reputation tiers they reached (points from the reputation ledger), including a role a tier hands out
--      automatically (Star, 300 points, makes you a Contributor).
-- Admins hold every capability. Guests and paused (suspended) members hold none. `public.has_cap(cap)` is the
-- single check: restrictive insert policies below use it on every table members write to, so the database
-- enforces it no matter what the interface shows.
--
-- Depends on 20261019070000_roles_admin.sql (is_admin, is_suspended, log_moderation) and the reputation ledger
-- (20261018201000_community.sql, 20261018221000_missions_launchpad.sql). Additive only.

-- ─── Tables ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.role_defs (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{1,23}$'),
  label text not null check (char_length(label) between 1 and 40),
  description text not null default '' check (char_length(description) <= 240),
  color text not null default '#8fb4ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  caps text[] not null default '{}' check (cardinality(caps) <= 64),
  builtin boolean not null default false,
  -- Higher ranks win when only one badge fits: admin 100, moderator 60, editor 40, custom 30, contributor 20.
  rank integer not null default 30 check (rank between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null references public.role_defs (key) on delete cascade on update cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

create index if not exists member_roles_role_idx on public.member_roles (role_key, granted_at desc);

create table if not exists public.rep_tiers (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{1,23}$'),
  label text not null check (char_length(label) between 1 and 40),
  min_points integer not null check (min_points between 0 and 1000000),
  caps text[] not null default '{}' check (cardinality(caps) <= 64),
  -- A role members get automatically while they hold this tier (shown as a badge, its caps count too).
  grants_role text references public.role_defs (key) on delete set null on update cascade,
  updated_at timestamptz not null default now()
);

alter table public.role_defs enable row level security;
alter table public.member_roles enable row level security;
alter table public.rep_tiers enable row level security;

-- Who holds which role is public (badges); every change goes through the admin functions below.
create policy "Roles are public" on public.role_defs for select using (true);
create policy "Role grants are public" on public.member_roles for select using (true);
create policy "Reputation tiers are public" on public.rep_tiers for select using (true);
revoke insert, update, delete on public.role_defs, public.member_roles, public.rep_tiers from anon, authenticated;
grant select on public.role_defs, public.member_roles, public.rep_tiers to anon, authenticated;

-- ─── Defaults ───────────────────────────────────────────────────────────────────────────────────────────────

-- Everyone signed in can talk: start threads, reply, chat, message, send news tips, use the free AI (within its
-- quota), curate collections and file issues. Posting outside links and creating things others join (events,
-- missions, launches, duels, crews) unlock with reputation, which keeps drive-by spam out without slowing down
-- people who take part.
insert into public.role_defs (key, label, description, color, caps, builtin, rank) values
  ('member', 'Member', 'Everyone who signed in. What every member can do from day one.', '#949cad',
    array['thread.create', 'reply.create', 'room.post', 'message.send', 'news.tip', 'ai.use', 'collection.create', 'issue.create'], true, 0),
  ('contributor', 'Contributor', 'Trusted members. Reaching Star (300 reputation) makes you one; admins can also grant it.', '#7fe0b0',
    array['link.post', 'submission.create', 'project.create', 'repo.create', 'event.create', 'mission.create', 'launch.create', 'duel.create', 'crew.create'], true, 20),
  ('editor', 'Editor', 'Writes and publishes news and edits the site''s own pages and menus.', '#d8c59e',
    array['news.write', 'news.publish', 'pages.edit', 'menus.edit', 'link.post', 'submission.create', 'project.create', 'repo.create'], true, 40),
  ('moderator', 'Moderator', 'Keeps the community healthy: handles reports, hides posts, pauses accounts, runs the forum and chat.', '#8fb4ff',
    array['moderate', 'forum.manage', 'chat.manage', 'room.create', 'link.post', 'submission.create', 'project.create', 'repo.create',
      'event.create', 'mission.create', 'launch.create', 'duel.create', 'crew.create'], true, 60),
  ('admin', 'Admin', 'Runs the site. Admins always have every power.', '#ffb4e6',
    array['thread.create', 'reply.create', 'link.post', 'submission.create', 'project.create', 'collection.create', 'event.create',
      'mission.create', 'launch.create', 'duel.create', 'crew.create', 'room.create', 'room.post', 'message.send', 'repo.create',
      'issue.create', 'news.tip', 'news.write', 'news.publish', 'pages.edit', 'menus.edit', 'forum.manage', 'chat.manage', 'moderate',
      'members.manage', 'roles.manage', 'settings.manage', 'ai.use'], true, 100)
on conflict (key) do nothing;

-- The tiers follow the reputation levels members already see (Stardust, Comet, Planet, Star): 25 points is a
-- few threads and replies (a thread is 5, a reply 2), 100 is steady participation over days, 300 is someone
-- others rely on.
insert into public.rep_tiers (key, label, min_points, caps, grants_role) values
  ('stardust', 'Stardust', 0, '{}', null),
  ('comet', 'Comet', 25, array['link.post', 'submission.create', 'project.create', 'repo.create'], null),
  ('planet', 'Planet', 100, array['event.create', 'mission.create', 'launch.create', 'duel.create', 'crew.create'], null),
  ('star', 'Star', 300, '{}', 'contributor')
on conflict (key) do nothing;

-- ─── Checks ─────────────────────────────────────────────────────────────────────────────────────────────────

-- A member's points for tiers: everything they earned, without missions they pledged points to (pledging a
-- reward should not take powers away).
create or replace function public.rep_points(member uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.points), 0)::bigint from public.reputation_ledger() l where l.member_id = member and l.kind <> 'mission-pledge';
$$;

-- Whether the signed-in member may do something. False for guests and paused members, true for admins.
create or replace function public.has_cap(cap text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  base text;
  paused_until timestamptz;
  pts bigint;
begin
  if me is null or cap is null then
    return false;
  end if;
  select p.role, p.suspended_until into base, paused_until from public.profiles p where p.id = me;
  if not found then
    return false;
  end if;
  if base = 'admin' then
    return true;
  end if;
  if paused_until is not null and paused_until > now() then
    return false;
  end if;
  -- Roles first: cheap lookups.
  if exists (select 1 from public.role_defs r where r.key in ('member', base) and cap = any (r.caps))
    or exists (
      select 1 from public.member_roles m join public.role_defs r on r.key = m.role_key
      where m.user_id = me and r.key not in ('moderator', 'admin') and cap = any (r.caps)
    ) then
    return true;
  end if;
  -- Then reputation, only when some tier could grant it.
  if not exists (
    select 1 from public.rep_tiers t left join public.role_defs r on r.key = t.grants_role
    where cap = any (t.caps) or cap = any (coalesce(r.caps, '{}'))
  ) then
    return false;
  end if;
  pts := public.rep_points(me);
  return exists (
    select 1 from public.rep_tiers t left join public.role_defs r on r.key = t.grants_role
    where t.min_points <= pts and (cap = any (t.caps) or cap = any (coalesce(r.caps, '{}')))
  );
end;
$$;

-- Every capability the signed-in member holds, for the interface.
create or replace function public.my_caps() returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  base text;
  paused_until timestamptz;
  pts bigint;
begin
  if me is null then
    return '{}';
  end if;
  select p.role, p.suspended_until into base, paused_until from public.profiles p where p.id = me;
  if not found then
    return '{}';
  end if;
  if base = 'admin' then
    return array(
      select distinct c from (
        select unnest(r.caps) c from public.role_defs r union all select unnest(t.caps) from public.rep_tiers t
      ) x order by c
    );
  end if;
  if paused_until is not null and paused_until > now() then
    return '{}';
  end if;
  pts := public.rep_points(me);
  return array(
    select distinct c from (
      select unnest(r.caps) c from public.role_defs r where r.key in ('member', base)
      union all
      select unnest(r.caps) from public.member_roles m join public.role_defs r on r.key = m.role_key
        where m.user_id = me and r.key not in ('moderator', 'admin')
      union all
      select unnest(t.caps) from public.rep_tiers t where t.min_points <= pts
      union all
      select unnest(r.caps) from public.rep_tiers t join public.role_defs r on r.key = t.grants_role
        where t.min_points <= pts and r.key not in ('moderator', 'admin')
    ) x order by c
  );
end;
$$;

-- What the interface needs in one call: base role, extra roles (granted and earned), points and capabilities.
create or replace function public.my_standing() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  base text;
  paused_until timestamptz;
  pts bigint;
begin
  if me is null then
    return jsonb_build_object('signed_in', false, 'base', 'guest', 'roles', '[]'::jsonb, 'earned', '[]'::jsonb, 'points', 0, 'suspended', false, 'caps', '[]'::jsonb);
  end if;
  select p.role, p.suspended_until into base, paused_until from public.profiles p where p.id = me;
  pts := public.rep_points(me);
  return jsonb_build_object(
    'signed_in', true,
    'base', coalesce(base, 'member'),
    'roles', coalesce((select jsonb_agg(m.role_key order by m.role_key) from public.member_roles m where m.user_id = me), '[]'::jsonb),
    'earned', coalesce((select jsonb_agg(distinct t.grants_role) from public.rep_tiers t where t.grants_role is not null and t.min_points <= pts), '[]'::jsonb),
    'points', pts,
    'suspended', coalesce(paused_until > now(), false),
    'caps', to_jsonb(public.my_caps())
  );
end;
$$;

-- Roles members show as badges: their staff role, granted roles and the one their reputation earned. Up to 100 at once.
create or replace function public.member_badges(members uuid[]) returns table (member_id uuid, roles text[])
language sql stable security definer set search_path = public as $$
  select u.id, array(
    select distinct k from (
      select p.role k from public.profiles p where p.id = u.id and p.role <> 'member'
      union all
      select m.role_key from public.member_roles m where m.user_id = u.id
      union all
      select t.grants_role from public.rep_tiers t
        where t.grants_role is not null and t.min_points <= public.rep_points(u.id)
    ) x order by k
  )
  from unnest(members[1:100]) as u(id);
$$;

revoke execute on function public.rep_points(uuid), public.has_cap(text), public.my_caps(), public.my_standing(), public.member_badges(uuid[]) from public;
grant execute on function public.rep_points(uuid), public.has_cap(text), public.my_caps(), public.my_standing(), public.member_badges(uuid[]) to anon, authenticated;

-- ─── Admin functions ────────────────────────────────────────────────────────────────────────────────────────

-- Powers that the database ties to the base roles (is_staff, is_admin), so other roles cannot hold them.
create or replace function public.staff_caps() returns text[]
language sql immutable set search_path = public as $$
  select array['moderate', 'members.manage', 'roles.manage', 'settings.manage']
$$;

-- Keeps well formed, distinct capability names.
create or replace function public.clean_caps(caps text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array(select distinct c from unnest(caps) c where c ~ '^[a-z]{2,20}(\.[a-z]{2,20})?$' order by c), '{}')
$$;

-- Creates or changes a role. Built-in roles keep their key; admins always have everything.
create or replace function public.save_role_def(role_key text, role_label text, role_description text default '', role_color text default '#8fb4ff', role_caps text[] default '{}', role_rank integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text := lower(trim(role_key));
  wanted text[] := public.clean_caps(role_caps);
  old public.role_defs;
begin
  if not public.is_admin() then
    raise exception 'Only admins change roles';
  end if;
  if k = 'admin' then
    raise exception 'Admins always have every power';
  end if;
  if k !~ '^[a-z][a-z0-9-]{1,23}$' then
    raise exception 'A role key is 2 to 24 lowercase letters, digits or dashes, starting with a letter';
  end if;
  if char_length(trim(coalesce(role_label, ''))) not between 1 and 40 then
    raise exception 'Give the role a name of up to 40 characters';
  end if;
  if coalesce(role_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Pick a colour like #8fb4ff';
  end if;
  if cardinality(wanted) > 64 then
    raise exception 'Too many powers for one role';
  end if;
  -- Moderators always moderate; nobody else can hold the staff powers.
  wanted := array(select c from unnest(wanted) c where not (c = any (public.staff_caps())));
  if k = 'moderator' then
    wanted := array_append(wanted, 'moderate');
  end if;
  select * into old from public.role_defs r where r.key = k;
  if not found and (select count(*) from public.role_defs r where not r.builtin) >= 30 then
    raise exception 'There are already 30 custom roles. Remove one first';
  end if;
  insert into public.role_defs (key, label, description, color, caps, builtin, rank)
  values (k, trim(role_label), left(coalesce(trim(role_description), ''), 240), lower(role_color), wanted, false,
    least(greatest(coalesce(role_rank, old.rank, 30), 1), 99))
  on conflict (key) do update set
    label = excluded.label, description = excluded.description, color = excluded.color, caps = excluded.caps,
    rank = case when public.role_defs.builtin then public.role_defs.rank else excluded.rank end,
    updated_at = now();
  perform public.log_moderation(case when old.key is null then 'role-create' else 'role-edit' end, 'role', k,
    left(trim(role_label) || ': ' || array_to_string(wanted, ', '), 500));
end;
$$;

-- Removes a custom role and every grant of it. Built-in roles stay.
create or replace function public.delete_role_def(role_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins change roles';
  end if;
  if exists (select 1 from public.role_defs r where r.key = role_key and r.builtin) then
    raise exception 'Built-in roles cannot be removed';
  end if;
  delete from public.role_defs r where r.key = role_key;
  if found then
    perform public.log_moderation('role-delete', 'role', role_key, '');
  end if;
end;
$$;

-- Gives a member an extra role. Moderator and admin are base roles, changed with set_member_role.
create or replace function public.grant_role(member uuid, role_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  role_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins grant roles';
  end if;
  if role_key in ('member', 'moderator', 'admin') then
    raise exception 'Member, moderator and admin are base roles. Change them on the Members page';
  end if;
  select r.label into role_name from public.role_defs r where r.key = role_key;
  if role_name is null then
    raise exception 'Unknown role';
  end if;
  if not exists (select 1 from public.profiles p where p.id = member) then
    raise exception 'Unknown member';
  end if;
  insert into public.member_roles (user_id, role_key, granted_by) values (member, role_key, (select auth.uid()))
  on conflict on constraint member_roles_pkey do nothing;
  if found then
    perform public.log_moderation('role-grant', 'profile', member::text, role_key);
    perform public.notify(member, 'system', null, 'role:' || role_key, left('You are now ' || role_name || ' on Nexverse.', 140));
  end if;
end;
$$;

-- Takes an extra role away (deletes the grant).
create or replace function public.revoke_role(member uuid, role_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins change roles';
  end if;
  delete from public.member_roles m where m.user_id = member and m.role_key = revoke_role.role_key;
  if found then
    perform public.log_moderation('role-revoke', 'profile', member::text, role_key);
  end if;
end;
$$;

-- Replaces the reputation tiers with a new list: [{key, label, min_points, caps, grants_role}], 1 to 12 of them,
-- one starting at 0 points.
create or replace function public.save_rep_tiers(tiers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  t jsonb;
  keys text[] := '{}';
  mins integer[] := '{}';
  k text;
  m integer;
  g text;
begin
  if not public.is_admin() then
    raise exception 'Only admins change reputation tiers';
  end if;
  if jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) not between 1 and 12 then
    raise exception 'Keep between 1 and 12 tiers';
  end if;
  for t in select * from jsonb_array_elements(tiers) loop
    k := lower(trim(t ->> 'key'));
    m := (t ->> 'min_points')::integer;
    g := nullif(trim(coalesce(t ->> 'grants_role', '')), '');
    if k is null or k !~ '^[a-z][a-z0-9-]{1,23}$' then
      raise exception 'Each tier needs a key of 2 to 24 lowercase letters, digits or dashes';
    end if;
    if char_length(trim(coalesce(t ->> 'label', ''))) not between 1 and 40 then
      raise exception 'Each tier needs a name of up to 40 characters';
    end if;
    if m is null or m < 0 or m > 1000000 then
      raise exception 'Points go from 0 to 1,000,000';
    end if;
    if k = any (keys) or m = any (mins) then
      raise exception 'Two tiers share a key or a number of points';
    end if;
    if g is not null and (g in ('member', 'moderator', 'admin') or not exists (select 1 from public.role_defs r where r.key = g)) then
      raise exception 'A tier can hand out the contributor, editor or a custom role only';
    end if;
    keys := keys || k;
    mins := mins || m;
  end loop;
  if not (0 = any (mins)) then
    raise exception 'One tier must start at 0 points, so new members have one';
  end if;
  delete from public.rep_tiers r where not (r.key = any (keys));
  for t in select * from jsonb_array_elements(tiers) loop
    insert into public.rep_tiers (key, label, min_points, caps, grants_role)
    values (
      lower(trim(t ->> 'key')), trim(t ->> 'label'), (t ->> 'min_points')::integer,
      array(select c from unnest(public.clean_caps(array(select jsonb_array_elements_text(coalesce(t -> 'caps', '[]'::jsonb))))) c
        where not (c = any (public.staff_caps()))),
      nullif(trim(coalesce(t ->> 'grants_role', '')), '')
    )
    on conflict (key) do update set label = excluded.label, min_points = excluded.min_points, caps = excluded.caps,
      grants_role = excluded.grants_role, updated_at = now();
  end loop;
  perform public.log_moderation('rep-tiers', 'settings', 'reputation',
    left((select string_agg(x ->> 'label' || ' ' || (x ->> 'min_points'), ', ') from jsonb_array_elements(tiers) x), 500));
end;
$$;

revoke execute on function public.save_role_def(text, text, text, text, text[], integer), public.delete_role_def(text),
  public.grant_role(uuid, text), public.revoke_role(uuid, text), public.save_rep_tiers(jsonb) from public, anon;
grant execute on function public.save_role_def(text, text, text, text, text[], integer), public.delete_role_def(text),
  public.grant_role(uuid, text), public.revoke_role(uuid, text), public.save_rep_tiers(jsonb) to authenticated;
revoke execute on function public.staff_caps(), public.clean_caps(text[]) from public, anon;
grant execute on function public.staff_caps(), public.clean_caps(text[]) to authenticated;

-- ─── Enforcement ────────────────────────────────────────────────────────────────────────────────────────────

-- Restrictive policies apply on top of the existing permissive ones (which keep "as yourself" and the rest).
-- Likes, stars, reactions, votes, RSVPs, follows, bookmarks, reports, crew wall posts and mission entries stay
-- open to every signed-in member who is not paused.
create policy "Needs thread.create" on public.questions as restrictive for insert to authenticated
  with check (public.has_cap('thread.create'));
create policy "Needs reply.create" on public.answers as restrictive for insert to authenticated
  with check (public.has_cap('reply.create'));
-- Every shared item is an outside link; news tips also need news.tip, the rest submission.create.
create policy "Needs link.post and submission.create or news.tip" on public.submissions as restrictive for insert to authenticated
  with check (public.has_cap('link.post') and public.has_cap(case when kind = 'news' then 'news.tip' else 'submission.create' end));
create policy "Needs project.create" on public.projects as restrictive for insert to authenticated
  with check (public.has_cap('project.create'));
create policy "Needs collection.create" on public.collections as restrictive for insert to authenticated
  with check (public.has_cap('collection.create'));
create policy "Needs event.create" on public.events as restrictive for insert to authenticated
  with check (public.has_cap('event.create'));
create policy "Needs mission.create" on public.missions as restrictive for insert to authenticated
  with check (public.has_cap('mission.create'));
create policy "Needs launch.create" on public.launches as restrictive for insert to authenticated
  with check (public.has_cap('launch.create'));
create policy "Needs duel.create" on public.duels as restrictive for insert to authenticated
  with check (public.has_cap('duel.create'));
create policy "Needs crew.create" on public.crews as restrictive for insert to authenticated
  with check (public.has_cap('crew.create'));
create policy "Needs room.post" on public.room_messages as restrictive for insert to authenticated
  with check (public.has_cap('room.post'));
create policy "Needs message.send" on public.dm_messages as restrictive for insert to authenticated
  with check (public.has_cap('message.send'));
create policy "Needs submission.create" on public.benchmark_results as restrictive for insert to authenticated
  with check (public.has_cap('submission.create'));
