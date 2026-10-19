-- Review fixes for round 8.

-- Replies follow the read rules of their thread's category, so a hidden or members-only category cannot be read
-- through its replies. Sample-thread replies (question_id is null) stay public as before.
create policy "Category read rules" on public.answers as restrictive for select
  using (
    question_id is null
    or exists (select 1 from public.questions q where q.id = question_id and public.forum_can_read(q.orbit))
  );

-- Closing registration in the admin panel closes it for every sign-up path, social logins included: Supabase
-- creates the account before the site can react, so the check runs where the profile is made.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select (s.value ->> 'signupOpen')::boolean from public.site_settings s where s.key = 'access'), true) = false then
    raise exception 'Joining Nexverse is closed right now.';
  end if;
  insert into public.profiles (id, name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'user_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Member'
      ),
      60
    )
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
