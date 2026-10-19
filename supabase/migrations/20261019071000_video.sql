-- Video lab: AI videos members share, with the prompt, model, tool and shot settings that made them, and likes.
-- A post links a video on YouTube or Vimeo, or a short MP4/WebM clip uploaded to the "videos" bucket. Pages
-- show a poster first and only load the player when someone presses play.
-- Drafts are prompts saved from the shot builder without a video yet; only their author sees them.
-- Published posts are public unless staff hid them; members write only their own rows; suspended members cannot
-- post, like or upload; staff hide, unhide or remove any post through moderate_video(), which logs the action.
-- Everything here is new and additive (see 20261019070000_roles_admin.sql for is_staff and is_suspended).

-- ─── Posts ──────────────────────────────────────────────────────────────────────────────────────────────────

create table public.video_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'published' check (status in ('draft', 'published')),
  title text not null check (char_length(trim(title)) between 3 and 120),
  -- Stored in one canonical form (the app normalises links before saving):
  --   https://www.youtube.com/watch?v=<11 chars>
  --   https://vimeo.com/<id>  or  https://vimeo.com/<id>/<unlisted hash>
  --   https://<project>/storage/v1/object/public/videos/<author uuid>/<file>.mp4|webm  (checked by trigger below)
  video_url text check (
    video_url is null or (
      char_length(video_url) <= 500 and video_url ~ (
        '^(https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}'
        || '|https://vimeo\.com/[0-9]{1,12}(/[0-9a-f]{6,20})?'
        || '|https://[^/\s]+/storage/v1/object/public/videos/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}\.(mp4|webm))$'
      )
    )
  ),
  -- A still shown before the video loads: YouTube's or Vimeo's own thumbnail, or an image in the "videos" bucket.
  poster_url text check (
    poster_url is null or (
      char_length(poster_url) <= 500 and poster_url ~ (
        '^(https://i\.ytimg\.com/vi/[A-Za-z0-9_-]{11}/[a-z0-9_]{2,20}\.jpg'
        || '|https://i\.vimeocdn\.com/video/[A-Za-z0-9_-]{1,200}(\?[A-Za-z0-9=&_.-]{0,80})?'
        || '|https://[^/\s]+/storage/v1/object/public/videos/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}\.(jpg|jpeg|png|webp))$'
      )
    )
  ),
  prompt text not null default '' check (char_length(prompt) <= 4000),
  -- Free text (models change monthly); the app offers suggestions.
  model text not null default '' check (char_length(model) <= 80),
  tool text not null default '' check (char_length(tool) <= 80),
  -- Shot settings from the builder (camera move, lens, lighting, mood, duration, aspect, seed and similar).
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4096),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 5 and (cardinality(tags) = 0 or array_to_string(tags, ',') ~ '^[a-z0-9][a-z0-9-]{0,23}(,[a-z0-9][a-z0-9-]{0,23})*$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden_at timestamptz,
  check (status = 'draft' or video_url is not null)
);

create index video_posts_feed_idx on public.video_posts (created_at desc) where status = 'published' and hidden_at is null;
create index video_posts_author_idx on public.video_posts (author_id, created_at desc);
create index video_posts_tags_idx on public.video_posts using gin (tags);

-- Likes: one per member per post.
create table public.video_likes (
  video_id uuid not null references public.video_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create index video_likes_user_idx on public.video_likes (user_id, created_at desc);

alter table public.video_posts enable row level security;
alter table public.video_likes enable row level security;

create policy "Published videos are public, drafts are their author's" on public.video_posts for select
  using ((status = 'published' and hidden_at is null) or author_id = (select auth.uid()) or public.is_staff());
create policy "Members post as themselves" on public.video_posts for insert
  to authenticated with check (author_id = (select auth.uid()) and hidden_at is null);
create policy "Members edit their own posts" on public.video_posts for update
  to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Members delete their own posts" on public.video_posts for delete
  to authenticated using (author_id = (select auth.uid()));
create policy "Staff remove video posts" on public.video_posts for delete
  to authenticated using (public.is_staff());
create policy "Suspended members cannot post" on public.video_posts as restrictive for insert
  to authenticated with check (not public.is_suspended());
create policy "Suspended members cannot edit" on public.video_posts as restrictive for update
  to authenticated using (not public.is_suspended()) with check (not public.is_suspended());

-- Likes are public (counts), on posts you can see, as yourself, never on your own post.
create policy "Video likes are public" on public.video_likes for select using (true);
create policy "Members like as themselves" on public.video_likes for insert
  to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.video_posts v
      where v.id = video_id and v.status = 'published' and v.hidden_at is null and v.author_id <> (select auth.uid())
    )
  );
create policy "Members remove their own likes" on public.video_likes for delete
  to authenticated using (user_id = (select auth.uid()));
create policy "Suspended members cannot like" on public.video_likes as restrictive for insert
  to authenticated with check (not public.is_suspended());

-- Members change only what they wrote; hiding is staff-only (moderate_video below), timestamps are the server's.
revoke insert, update, delete on public.video_posts from anon;
revoke update on public.video_posts from authenticated;
grant update (status, title, video_url, poster_url, prompt, model, tool, settings, tags) on public.video_posts to authenticated;
revoke insert, update, delete on public.video_likes from anon;
revoke update on public.video_likes from authenticated;

-- ─── Rules ──────────────────────────────────────────────────────────────────────────────────────────────────

-- New posts: up to 10 an hour and 30 a day per member. Uploaded files must sit in the author's own folder and
-- exist in the "videos" bucket. A published post cannot go back to being a draft (it may already have likes).
create function public.video_post_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  marker text := '/storage/v1/object/public/videos/';
  folder text := new.author_id::text || '/';
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.video_posts v where v.author_id = new.author_id and v.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'You can post up to 10 videos an hour. Try again a little later.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.video_posts v where v.author_id = new.author_id and v.created_at > now() - interval '1 day') >= 30 then
      raise exception 'You can post up to 30 videos a day. Try again tomorrow.' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.hidden_at := null;
  else
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
      raise exception 'Posts keep their author and date.' using errcode = 'P0001';
    end if;
    if old.status = 'published' and new.status = 'draft' then
      raise exception 'A shared video cannot go back to being a draft. Delete it instead.' using errcode = 'P0001';
    end if;
  end if;
  new.title := trim(new.title);
  if new.video_url is not null and position(marker in new.video_url) > 0 then
    if position(marker || folder in new.video_url) = 0
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'videos' and o.name = substr(new.video_url, position(marker in new.video_url) + char_length(marker))
      ) then
      raise exception 'Upload the video to your own folder first.' using errcode = 'P0001';
    end if;
  end if;
  if new.poster_url is not null and position(marker in new.poster_url) > 0 and position(marker || folder in new.poster_url) = 0 then
    raise exception 'Upload the poster to your own folder first.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger video_posts_rules before insert or update on public.video_posts
  for each row execute function public.video_post_rules();
revoke execute on function public.video_post_rules() from public, anon, authenticated;

-- Likes: the server's clock, and at most 200 likes an hour per member (stops scripted like storms).
create function public.video_like_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.video_likes l where l.user_id = new.user_id and l.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many likes in an hour. Try again later.' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger video_likes_rules before insert on public.video_likes
  for each row execute function public.video_like_rules();
revoke execute on function public.video_like_rules() from public, anon, authenticated;

-- Someone liked a member's video: tell the author ("video:<uuid>", kind "like").
create function public.notify_video_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  title text;
begin
  select v.author_id, v.title into owner, title from public.video_posts v where v.id = new.video_id;
  perform public.notify(owner, 'like', new.user_id, 'video:' || new.video_id::text, title);
  return new;
end;
$$;

create trigger video_likes_notify after insert on public.video_likes
  for each row execute function public.notify_video_like();
revoke execute on function public.notify_video_like() from public, anon, authenticated;

-- Staff hide, unhide or remove a post. Every action is written to the moderation log.
create function public.moderate_video(target uuid, act text, note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only moderators can do this';
  end if;
  if act = 'hide' then
    update public.video_posts set hidden_at = now() where id = target;
  elsif act = 'unhide' then
    update public.video_posts set hidden_at = null where id = target;
  elsif act = 'remove' then
    delete from public.video_posts where id = target;
  else
    raise exception 'Unknown action';
  end if;
  perform public.log_moderation(act, 'video', target::text, note);
end;
$$;

revoke execute on function public.moderate_video(uuid, text, text) from public, anon;
grant execute on function public.moderate_video(uuid, text, text) to authenticated;

-- ─── Storage ────────────────────────────────────────────────────────────────────────────────────────────────

-- Public bucket for short clips and posters, 25 MB per file. Files load by URL; members manage only "<their uuid>/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 26214400, array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- At most 40 files per member and 12 new ones a day, so the free storage tier is not filled by one account.
create function public.video_upload_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from storage.objects o
      where o.bucket_id = 'videos' and o.name like (select auth.uid())::text || '/%') < 40
    and (select count(*) from storage.objects o
      where o.bucket_id = 'videos' and o.name like (select auth.uid())::text || '/%' and o.created_at > now() - interval '1 day') < 12
$$;

revoke execute on function public.video_upload_allowed() from public, anon;
grant execute on function public.video_upload_allowed() to authenticated;

create policy "Members see their own video files" on storage.objects for select
  to authenticated using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Members upload videos to their own folder" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text and public.video_upload_allowed()
  );
create policy "Members delete their own video files" on storage.objects for delete
  to authenticated using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Suspended members cannot upload videos" on storage.objects as restrictive for insert
  to authenticated with check (bucket_id <> 'videos' or not public.is_suspended());
