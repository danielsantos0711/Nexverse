-- Site roles, moderation and site-wide settings.
-- Members get a role (member, moderator, admin). Staff (moderators and admins) can hide or remove anything,
-- handle reports and suspend accounts; only admins change roles and the site settings that drive the
-- whole site (branding, navigation, home sections, theme, announcement, feature switches).

alter table public.profiles
  add column role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  add column suspended_until timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 300);

-- Members never set these themselves: the update grant on profiles is per column and leaves them out.

create function public.site_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p where p.id = (select auth.uid())), 'guest')
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.site_role() in ('moderator', 'admin')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.site_role() = 'admin'
$$;

create function public.is_suspended() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.suspended_until > now() from public.profiles p where p.id = (select auth.uid())), false)
$$;

grant execute on function public.site_role(), public.is_staff(), public.is_admin(), public.is_suspended() to anon, authenticated;

-- The owner's account is the first admin.
update public.profiles set role = 'admin'
where id in (select u.id from auth.users u where lower(u.email) = 'geral@dasantos.net');

-- Staff change roles and suspensions through these functions, which log every action.
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 40),
  target_kind text not null check (char_length(target_kind) between 1 and 40),
  target_id text not null check (char_length(target_id) between 1 and 200),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index moderation_log_recent_idx on public.moderation_log (created_at desc);
alter table public.moderation_log enable row level security;
create policy "Staff read the log" on public.moderation_log for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.moderation_log from anon, authenticated;

create function public.log_moderation(action text, target_kind text, target_id text, note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only moderators can do this';
  end if;
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values ((select auth.uid()), action, target_kind, target_id, left(coalesce(note, ''), 500));
end;
$$;

grant execute on function public.log_moderation(text, text, text, text) to authenticated;

create function public.set_member_role(member uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins change roles';
  end if;
  if new_role not in ('member', 'moderator', 'admin') then
    raise exception 'Unknown role';
  end if;
  if member = (select auth.uid()) and new_role <> 'admin' then
    raise exception 'Admins cannot remove their own admin role';
  end if;
  update public.profiles set role = new_role where id = member;
  perform public.log_moderation('role', 'profile', member::text, new_role);
end;
$$;

create function public.suspend_member(member uuid, days integer, reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only moderators can suspend members';
  end if;
  if exists (select 1 from public.profiles p where p.id = member and p.role <> 'member') and not public.is_admin() then
    raise exception 'Only admins can suspend staff';
  end if;
  if member = (select auth.uid()) then
    raise exception 'You cannot suspend yourself';
  end if;
  update public.profiles
  set suspended_until = case when days <= 0 then null else now() + make_interval(days => least(days, 3650)) end,
      suspended_reason = case when days <= 0 then null else left(coalesce(reason, ''), 300) end
  where id = member;
  perform public.log_moderation(case when days <= 0 then 'unsuspend' else 'suspend' end, 'profile', member::text, reason);
  if days > 0 then
    perform public.notify(member, 'system', null, 'account:suspended', left('Your account is paused: ' || coalesce(reason, ''), 140));
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, text), public.suspend_member(uuid, integer, text) from public, anon;
grant execute on function public.set_member_role(uuid, text), public.suspend_member(uuid, integer, text) to authenticated;

-- Reports: any member can flag something; staff work the queue.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind ~ '^[a-z_]{2,30}$'),
  target_id text not null check (char_length(target_id) between 1 and 200),
  target_url text check (target_url ~ '^/(?!/)[A-Za-z0-9/_.%?=&#-]{0,300}$'),
  reason text not null check (reason in ('spam', 'abuse', 'harassment', 'illegal', 'misleading', 'off_topic', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);

create index reports_open_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
create policy "Your reports, and all reports for staff" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());
create policy "Members report as themselves" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and resolved_by is null and resolved_at is null);
create policy "Staff work the queue" on public.reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke update on public.reports from anon, authenticated;
grant update (status, resolved_by, resolved_at) on public.reports to authenticated;
revoke insert, delete on public.reports from anon;

create function public.reports_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports in an hour. Try again later.';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.reports_rate_limit();
revoke execute on function public.reports_rate_limit() from public, anon, authenticated;

-- Site settings: one row per section, read by everyone, written by admins only.
create table public.site_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null default '{}'::jsonb check (pg_column_size(value) <= 65536),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
create policy "Site settings are public" on public.site_settings for select using (true);
create policy "Admins write settings" on public.site_settings for insert to authenticated with check (public.is_admin());
create policy "Admins change settings" on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins remove settings" on public.site_settings for delete to authenticated using (public.is_admin());

create function public.site_settings_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger site_settings_touch before insert or update on public.site_settings
  for each row execute function public.site_settings_touch();
revoke execute on function public.site_settings_touch() from public, anon, authenticated;

alter publication supabase_realtime add table public.site_settings;

-- Hidden content: staff can hide a post without deleting it. Hidden rows stay visible to their author and staff.
alter table public.questions add column hidden_at timestamptz;
alter table public.answers add column hidden_at timestamptz;
alter table public.submissions add column hidden_at timestamptz;
alter table public.projects add column hidden_at timestamptz;
alter table public.events add column hidden_at timestamptz;
alter table public.room_messages add column hidden_at timestamptz;

-- Featured news and resources picked by staff for the home page.
alter table public.submissions add column featured_at timestamptz;

alter policy "Questions are public" on public.questions
  using (hidden_at is null or author_id = (select auth.uid()) or public.is_staff());
alter policy "Answers are public" on public.answers
  using (hidden_at is null or author_id = (select auth.uid()) or public.is_staff());
alter policy "Submissions are public" on public.submissions
  using (hidden_at is null or author_id = (select auth.uid()) or public.is_staff());
alter policy "Events are public" on public.events
  using (hidden_at is null or host_id = (select auth.uid()) or public.is_staff());
alter policy "Published projects are public, drafts are their owner's" on public.projects
  using ((status = 'published' and hidden_at is null) or owner_id = (select auth.uid()) or public.is_staff());
alter policy "Messages of rooms you can open" on public.room_messages
  using (public.can_use_room(room) and (hidden_at is null or author_id = (select auth.uid()) or public.is_staff()));

create function public.moderate_content(kind text, target uuid, act text, note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  tbl text;
begin
  if not public.is_staff() then
    raise exception 'Only moderators can do this';
  end if;
  tbl := case kind
    when 'question' then 'questions' when 'answer' then 'answers' when 'submission' then 'submissions'
    when 'project' then 'projects' when 'event' then 'events' when 'room_message' then 'room_messages'
    else null end;
  if tbl is null then
    raise exception 'Unknown content kind';
  end if;
  if act = 'hide' then
    execute format('update public.%I set hidden_at = now() where id = $1', tbl) using target;
  elsif act = 'unhide' then
    execute format('update public.%I set hidden_at = null where id = $1', tbl) using target;
  elsif act = 'feature' and kind = 'submission' then
    update public.submissions set featured_at = now() where id = target;
  elsif act = 'unfeature' and kind = 'submission' then
    update public.submissions set featured_at = null where id = target;
  elsif act = 'remove' then
    execute format('delete from public.%I where id = $1', tbl) using target;
  else
    raise exception 'Unknown action';
  end if;
  perform public.log_moderation(act, kind, target::text, note);
end;
$$;

revoke execute on function public.moderate_content(text, uuid, text, text) from public, anon;
grant execute on function public.moderate_content(text, uuid, text, text) to authenticated;

-- Staff can remove anything members post. These add to the existing owner-only policies.
create policy "Staff remove questions" on public.questions for delete to authenticated using (public.is_staff());
create policy "Staff remove answers" on public.answers for delete to authenticated using (public.is_staff());
create policy "Staff remove submissions" on public.submissions for delete to authenticated using (public.is_staff());
create policy "Staff remove projects" on public.projects for delete to authenticated using (public.is_staff());
create policy "Staff remove events" on public.events for delete to authenticated using (public.is_staff());
create policy "Staff remove chat messages" on public.room_messages for delete to authenticated using (public.is_staff());
create policy "Staff remove crew posts" on public.crew_posts for delete to authenticated using (public.is_staff());
create policy "Staff remove missions" on public.missions for delete to authenticated using (public.is_staff());
create policy "Staff remove launches" on public.launches for delete to authenticated using (public.is_staff());
create policy "Staff remove duels" on public.duels for delete to authenticated using (public.is_staff());
create policy "Staff remove collections" on public.collections for delete to authenticated using (public.is_staff());

-- Suspended members can read but not post. Restrictive policies apply on top of every permissive one.
create policy "Suspended members cannot post" on public.questions as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.answers as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.submissions as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.projects as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.events as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.room_messages as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.crew_posts as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.dm_messages as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.missions as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.launches as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.duels as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.crews as restrictive for insert to authenticated with check (not public.is_suspended());

-- New public chat rooms are opened by staff; members talk in them and in their crews' rooms.
create policy "Only staff open public rooms" on public.rooms as restrictive for insert to authenticated
  with check (public.is_staff());
