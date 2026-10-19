-- Daily AI assist usage per member, for rate limiting the /api/ai routes.
-- Members can read their own counts. Nobody writes the table directly: the route calls ai_consume(), which
-- runs as the table owner, keys on auth.uid() (so a member can only spend their own allowance) and refuses
-- once the day's limit is reached. The limit comes from the server (AI_DAILY_LIMIT) and is capped here.

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
create policy "Members read their own AI usage" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Returns the new count for today, or -1 when the limit is already reached (nothing is spent then).
create function public.ai_consume(daily_limit integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  lim integer := least(greatest(coalesce(daily_limit, 30), 1), 5000);
  d date := (now() at time zone 'utc')::date;
  used integer;
begin
  if me is null then
    raise exception 'Sign in to use AI assist.';
  end if;
  insert into public.ai_usage as u (user_id, day, count) values (me, d, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < lim
  returning u.count into used;
  return coalesce(used, -1);
end;
$$;

revoke execute on function public.ai_consume(integer) from public, anon;
grant execute on function public.ai_consume(integer) to authenticated;
