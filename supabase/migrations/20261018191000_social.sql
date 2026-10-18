-- Social: what members save, whom and what they follow, and the notifications that tell them something happened.
-- Bookmarks are private. Follows are public (follower counts are part of a profile). Notifications are private
-- and only written by the triggers below, never directly by a client.

-- A bookmark points at anything by the same readable key as a like: "model:orbit-8b", "thread:<uuid>", "news:…".
create table public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target text not null check (target ~ '^[a-z]{2,16}:[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, target)
);

create index bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);

-- A follow points at a sample person or organisation ("person:<handle>"), a member ("member:<uuid>"),
-- a forum category ("category:<slug>") or a chat room ("room:<slug>").
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee text not null check (followee ~ '^(person|member|category|room):[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee)
);

create index follows_followee_idx on public.follows (followee);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reply', 'like', 'follow', 'mention', 'system')),
  actor_id uuid references public.profiles (id) on delete set null,
  target text check (target is null or target ~ '^[a-z]{2,16}:[a-z0-9-]{1,80}$'),
  snippet text check (snippet is null or char_length(snippet) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

create policy "Members see their own bookmarks" on public.bookmarks for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Members bookmark as themselves" on public.bookmarks for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members remove their own bookmarks" on public.bookmarks for delete
  to authenticated using (user_id = (select auth.uid()));

create policy "Follows are public" on public.follows for select using (true);
create policy "Members follow as themselves, never themselves" on public.follows for insert
  to authenticated with check (follower_id = (select auth.uid()) and followee <> 'member:' || (select auth.uid())::text);
create policy "Members unfollow their own follows" on public.follows for delete
  to authenticated using (follower_id = (select auth.uid()));

create policy "Members read their own notifications" on public.notifications for select
  to authenticated using (user_id = (select auth.uid()));
create policy "Members mark their own notifications" on public.notifications for update
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members clear their own notifications" on public.notifications for delete
  to authenticated using (user_id = (select auth.uid()));

revoke update on public.bookmarks from anon, authenticated;
revoke update on public.follows from anon, authenticated;
-- Only the triggers write notifications; a member may only change when one was read.
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Writes one notification, unless it is about yourself or the same unread one is already waiting.
create function public.notify(recipient uuid, what text, actor uuid, about text, excerpt text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if recipient is null or recipient = actor then
    return;
  end if;
  if what in ('like', 'follow') and exists (
    select 1 from public.notifications n
    where n.user_id = recipient and n.kind = what and n.actor_id is not distinct from actor
      and n.target is not distinct from about and n.read_at is null
  ) then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, target, snippet)
  values (recipient, what, actor, about, left(nullif(trim(excerpt), ''), 200));
end;
$$;

-- Someone answered a member's question: tell the asker.
create function public.notify_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.question_id is not null then
    perform public.notify(
      (select q.author_id from public.questions q where q.id = new.question_id),
      'reply', new.author_id, 'thread:' || new.question_id::text, new.body
    );
  end if;
  return new;
end;
$$;

-- Someone upvoted a member's question (liked "thread:<uuid>"): tell the asker.
create function public.notify_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  qid uuid;
  owner uuid;
  title text;
begin
  if new.target ~ '^thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    qid := substr(new.target, 8)::uuid;
    select q.author_id, q.title into owner, title from public.questions q where q.id = qid;
    perform public.notify(owner, 'like', new.user_id, new.target, title);
  end if;
  return new;
end;
$$;

-- Someone followed a member: tell them.
create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  followed uuid;
begin
  if new.followee ~ '^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    followed := substr(new.followee, 8)::uuid;
    if exists (select 1 from public.profiles p where p.id = followed) then
      perform public.notify(followed, 'follow', new.follower_id, new.followee, null);
    end if;
  end if;
  return new;
end;
$$;

create trigger answers_notify after insert on public.answers
  for each row execute function public.notify_answer();
create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_like();
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();

-- None of these are part of the API.
revoke execute on function public.notify(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_answer() from public, anon, authenticated;
revoke execute on function public.notify_like() from public, anon, authenticated;
revoke execute on function public.notify_follow() from public, anon, authenticated;

-- New notifications arrive live; Realtime applies the select policy above, so members only hear their own.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
alter publication supabase_realtime add table public.notifications;
