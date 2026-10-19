-- Who is online now, bound to the signed-in account. Each member keeps one row (their id comes from their
-- session, never from the browser), refreshed while a tab is open. Rows older than 90 seconds count as gone.
create table public.presence (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  path text not null default '/' check (path ~ '^/[A-Za-z0-9/_.%-]{0,119}$' and path !~ '^//'),
  seen_at timestamptz not null default now()
);

create index presence_seen_idx on public.presence (seen_at desc);

-- The server sets the time, so a browser cannot keep itself "online" with a date in the future.
create function public.presence_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.seen_at := now();
  return new;
end;
$$;

create trigger presence_touch before insert or update on public.presence
  for each row execute function public.presence_touch();

revoke execute on function public.presence_touch() from public, anon, authenticated;

alter table public.presence enable row level security;

create policy "Who is online can be seen" on public.presence for select
  using (seen_at > now() - interval '90 seconds' or user_id = (select auth.uid()));
create policy "Members announce themselves" on public.presence for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members update their own row" on public.presence for update
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members leave" on public.presence for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.presence from anon, authenticated;
grant update (user_id, path, seen_at) on public.presence to authenticated;
revoke insert, delete on public.presence from anon;

alter publication supabase_realtime add table public.presence;
