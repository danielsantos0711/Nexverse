-- Community restrictions, round 7: paused (suspended) members cannot post anywhere in missions, benchmarks
-- or crews, and staff can remove member content in those areas. Additive only: restrictive policies on top of
-- the existing permissive ones, plus extra permissive delete policies for staff. Depends on
-- 20261019070000_roles_admin.sql (public.is_suspended(), public.is_staff()).

-- Paused members cannot submit or edit mission entries, submit benchmark results or reproduction verdicts,
-- ask to join crews, or edit crew wall posts. (Inserts on missions, launches, crews, crew_posts and
-- dm_messages are already covered by the roles migration.)
create policy "Suspended members cannot post" on public.mission_entries as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot edit" on public.mission_entries as restrictive for update to authenticated using (not public.is_suspended());
create policy "Suspended members cannot post" on public.benchmark_results as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot post" on public.benchmark_repros as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot edit" on public.benchmark_repros as restrictive for update to authenticated using (not public.is_suspended());
create policy "Suspended members cannot post" on public.crew_requests as restrictive for insert to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot edit" on public.crew_posts as restrictive for update to authenticated using (not public.is_suspended());

-- Staff can remove member content in these areas too.
create policy "Staff remove mission entries" on public.mission_entries for delete to authenticated using (public.is_staff());
create policy "Staff remove benchmark results" on public.benchmark_results for delete to authenticated using (public.is_staff());
create policy "Staff remove crews" on public.crews for delete to authenticated using (public.is_staff());
