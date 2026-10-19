-- Profiles are public, so the reason for a pause is not kept there: staff see it in the moderation log
-- and the member gets it in their own notification.
create or replace function public.suspend_member(member uuid, days integer, reason text default '')
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
      suspended_reason = null
  where id = member;
  perform public.log_moderation(case when days <= 0 then 'unsuspend' else 'suspend' end, 'profile', member::text, reason);
  if days > 0 then
    perform public.notify(member, 'system', null, 'account:suspended', left('Your account is paused: ' || coalesce(reason, ''), 140));
  end if;
end;
$$;

update public.profiles set suspended_reason = null where suspended_reason is not null;
