-- Sign-in round 8: social accounts get a sensible display name.
--
-- A new account's profile was named from `name` in the sign-up metadata, or the start of the email. Social
-- providers put the person's name under different keys (Google and Discord: full_name; GitHub and X:
-- user_name; some OIDC providers: preferred_username), and Apple can hide the email entirely. This reads
-- them in order so a GitHub or X sign-up is not named "Member". Nothing else changes: same trigger, same
-- columns, no new table.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

-- Only the auth trigger calls it (as it did before this file).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
