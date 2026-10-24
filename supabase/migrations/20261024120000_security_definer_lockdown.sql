-- Launch security pass: shrink what the API roles can call directly.
--
-- 1. Trigger functions are never RPCs. Postgres checks EXECUTE on a trigger function only when the trigger is
--    created, not when it fires, so revoking it from the API roles changes nothing for the triggers themselves.
-- 2. Internal helpers that no RLS policy, no invoker function and no app code calls lose EXECUTE for anon and
--    authenticated. Security definer functions that call them run as their owner and keep working.
-- 3. Helpers used only by policies scoped to `authenticated`, and RPCs that do nothing without a signed-in
--    member, lose EXECUTE for `anon`.
-- 4. file_downloads and project_view_days had RLS with no policy (only definer functions touch them). They get
--    explicit read policies, and direct writes by the API roles are revoked: counting goes through
--    count_download() and record_project_view().
--
-- Kept on purpose: every RPC the app calls (src/**: .rpc("..."), /rest/v1/rpc/...), every helper an RLS policy
-- calls for the roles that policy applies to, and list_rows / rep_rules / rep_extra_events, which the invoker
-- function reputation_ledger() calls on behalf of leaderboard() for visitors. service_role keeps everything.

do $$
declare
  f record;
begin
  -- 1. Trigger functions in public.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;

  -- 2. Internal helpers: no API role needs them.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'ai_allowed', 'ai_daily_limit', 'ai_enabled', 'ai_setting', 'ai_setting_int',
      'benchmark_tolerance', 'chat_member_can_read', 'cms_my_reputation', 'my_caps',
      'rep_award', 'rep_points', 'site_role', 'moderate_video'
    ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;

  -- 3. Signed-in only.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'code_can_admin', 'code_can_write', 'code_object_writable', 'code_role', 'crew_role',
      'dm_group_member', 'dm_group_owner', 'dm_message_visible',
      'download_object_readable', 'download_object_removable', 'download_object_writable',
      'file_target_editable', 'forum_post_block', 'is_admin', 'is_crew_admin', 'is_project_owner',
      'is_suspended', 'post_media_writable', 'project_comments_open', 'site_content_can_write',
      'log_moderation'
    ])
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end
$$;

-- 4. Tables that only definer functions write.
revoke insert, update, delete, truncate on public.file_downloads from anon, authenticated;
revoke insert, update, delete, truncate on public.project_view_days from anon, authenticated;
revoke select on public.file_downloads from anon;

create policy "Members see their own downloads" on public.file_downloads
  for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_staff()));

create policy "Project view counts follow the project" on public.project_view_days
  for select to anon, authenticated
  using (public.file_target_visible('project', project_id));
