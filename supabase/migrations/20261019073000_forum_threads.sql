-- Forum: pinned and locked threads, and announcements only staff can post.
-- Builds on 20261019070000_roles_admin.sql (is_staff(), log_moderation()). Additive only: two columns, one
-- function and three restrictive policies, which apply on top of every existing permissive policy.

-- A pinned thread stays at the top of its category; a locked thread is read-only for members.
-- Members cannot set either column: their update grant on questions names its columns, and these are not among them.
alter table public.questions add column if not exists pinned_at timestamptz;
alter table public.questions add column if not exists locked_at timestamptz;

create index if not exists questions_pinned_idx on public.questions (orbit, pinned_at desc) where pinned_at is not null;

-- Staff pin or unpin, lock or unlock a thread. Every change lands in the moderation log.
create function public.set_thread_flag(target uuid, flag text, turn_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only moderators can do this';
  end if;
  if flag = 'pin' then
    update public.questions set pinned_at = case when turn_on then now() else null end where id = target;
  elsif flag = 'lock' then
    update public.questions set locked_at = case when turn_on then now() else null end where id = target;
  else
    raise exception 'Unknown flag';
  end if;
  if not found then
    raise exception 'That thread is not here any more';
  end if;
  perform public.log_moderation(case when turn_on then flag else 'un' || flag end, 'question', target::text, '');
end;
$$;

revoke execute on function public.set_thread_flag(uuid, text, boolean) from public, anon;
grant execute on function public.set_thread_flag(uuid, text, boolean) to authenticated;

-- Nobody but staff replies to a locked thread.
create policy "Locked threads take no replies" on public.answers as restrictive for insert to authenticated
  with check (
    question_id is null
    or public.is_staff()
    or not exists (select 1 from public.questions q where q.id = question_id and q.locked_at is not null)
  );

-- Announcements are written by the team: members can read and reply, but not start threads there or move one in.
create policy "Only staff post announcements" on public.questions as restrictive for insert to authenticated
  with check (orbit <> 'announcements' or public.is_staff());
create policy "Only staff move threads into announcements" on public.questions as restrictive for update to authenticated
  using (true)
  with check (orbit <> 'announcements' or public.is_staff());
