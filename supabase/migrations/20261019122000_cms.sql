-- The admin panel runs the site like a CMS: forum categories and groups, chat rooms, custom pages and menus.
-- Builds on 20261019070000_roles_admin.sql (site_role(), is_staff(), is_admin(), moderation_log) and on
-- 20261019121000 (has_cap()). Additive only: new tables, new columns, new functions and policies (restrictive
-- ones apply on top of every existing permissive policy). Every change an admin makes lands in the moderation log.

-- ─── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────

-- has_cap() with a safe fallback: while the roles migration is missing, staff keep the staff capabilities.
create or replace function public.cms_can(cap text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public.has_cap(cap), false);
exception when undefined_function then
  return case
    when cap in ('thread.create', 'reply.create', 'room.post') then public.site_role() <> 'guest' and not public.is_suspended()
    else public.is_staff()
  end;
end;
$$;

-- The signed-in member's reputation points (0 for guests, or when the reputation functions are missing).
create or replace function public.cms_my_reputation() returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  pts bigint;
begin
  if auth.uid() is null then
    return 0;
  end if;
  select r.points into pts from public.member_reputation(auth.uid()) r;
  return coalesce(pts, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public.cms_role_rank(r text) returns integer
language sql immutable set search_path = public as $$
  select case r when 'admin' then 3 when 'moderator' then 2 when 'member' then 1 else 0 end
$$;

-- One log row per admin change. Reorders set cms.quiet and write a single row themselves.
create or replace function public.cms_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  target text;
  changed text;
begin
  if coalesce(current_setting('cms.quiet', true), '') = 'on' or auth.uid() is null then
    return coalesce(new, old);
  end if;
  rec := to_jsonb(coalesce(new, old));
  -- Crew rooms follow their crew; only public rooms are the admins' business.
  if tg_table_name = 'rooms' and rec->>'kind' is distinct from 'public' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'site_settings' and rec->>'key' is distinct from 'menus' then
    return coalesce(new, old);
  end if;
  target := coalesce(rec->>'slug', rec->>'key', rec->>'id', '?');
  if tg_op = 'UPDATE' then
    select string_agg(n.key, ', ' order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at', 'updated_by', 'blocks');
    if to_jsonb(new) -> 'blocks' is distinct from to_jsonb(old) -> 'blocks' then
      changed := concat_ws(', ', changed, 'content');
    end if;
    if changed is null then
      return new;
    end if;
  end if;
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values (
    auth.uid(),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end,
    tg_table_name,
    left(target, 200),
    left(coalesce(case when tg_op = 'UPDATE' then 'Changed ' || changed end, rec->>'name', rec->>'title', ''), 500)
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.cms_log() from public, anon, authenticated;
grant execute on function public.cms_can(text), public.cms_my_reputation(), public.cms_role_rank(text) to anon, authenticated;

-- ─── Forum groups and categories ────────────────────────────────────────────────────────────────────────────

create table if not exists public.forum_groups (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 60),
  blurb text not null default '' check (char_length(blurb) <= 200),
  position integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_categories (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  icon text not null default 'messages-square' check (icon in (
    'megaphone', 'life-buoy', 'sparkles', 'box', 'bot', 'cpu', 'database', 'flask-conical', 'gauge', 'scale',
    'languages', 'globe', 'earth', 'messages-square', 'message-square', 'message-circle', 'book-open', 'code',
    'terminal', 'git-branch', 'folder-git-2', 'rocket', 'target', 'swords', 'trophy', 'users', 'users-round',
    'heart', 'star', 'lightbulb', 'brain', 'image', 'music', 'newspaper', 'calendar-days', 'wrench', 'shield',
    'lock', 'graduation-cap', 'briefcase', 'coffee', 'flame', 'orbit', 'library', 'file-text', 'compass',
    'puzzle', 'palette', 'mic', 'bug', 'zap', 'leaf', 'telescope', 'satellite', 'atom', 'network', 'layers',
    'server', 'cloud', 'smartphone', 'hand-heart', 'circle-help', 'gift', 'hammer', 'flag', 'award')),
  accent text not null default 'ion' check (accent in ('ion', 'gold', 'model', 'dataset', 'tool', 'repo')),
  group_slug text not null references public.forum_groups (slug) on update cascade on delete restrict,
  position integer not null default 0,
  archived boolean not null default false,
  hidden boolean not null default false,
  read_min_role text not null default 'guest' check (read_min_role in ('guest', 'member', 'moderator', 'admin')),
  post_cap text not null default 'thread.create' check (post_cap ~ '^[a-z]+(\.[a-z]+)?$'),
  reply_cap text not null default 'reply.create' check (reply_cap ~ '^[a-z]+(\.[a-z]+)?$'),
  min_reputation integer not null default 0 check (min_reputation between 0 and 1000000),
  staff_only_posting boolean not null default false,
  moderators uuid[] not null default '{}' check (cardinality(moderators) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forum_categories_group_idx on public.forum_categories (group_slug, position);

create or replace function public.cms_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.cms_touch() from public, anon, authenticated;

create trigger forum_groups_touch before update on public.forum_groups for each row execute function public.cms_touch();
create trigger forum_categories_touch before update on public.forum_categories for each row execute function public.cms_touch();
create trigger forum_groups_log after insert or update or delete on public.forum_groups for each row execute function public.cms_log();
create trigger forum_categories_log after insert or update or delete on public.forum_categories for each row execute function public.cms_log();

alter table public.forum_groups enable row level security;
alter table public.forum_categories enable row level security;

create policy "Forum groups are public" on public.forum_groups for select using (not hidden or public.cms_can('forum.manage'));
create policy "Forum managers add groups" on public.forum_groups for insert to authenticated with check (public.cms_can('forum.manage'));
create policy "Forum managers edit groups" on public.forum_groups for update to authenticated using (public.cms_can('forum.manage')) with check (public.cms_can('forum.manage'));
create policy "Forum managers remove groups" on public.forum_groups for delete to authenticated using (public.cms_can('forum.manage'));

create policy "Forum categories are public" on public.forum_categories for select
  using (not hidden or public.cms_can('forum.manage') or (select auth.uid()) = any (moderators));
create policy "Forum managers add categories" on public.forum_categories for insert to authenticated with check (public.cms_can('forum.manage'));
create policy "Forum managers edit categories" on public.forum_categories for update to authenticated using (public.cms_can('forum.manage')) with check (public.cms_can('forum.manage'));
create policy "Forum managers remove categories" on public.forum_categories for delete to authenticated using (public.cms_can('forum.manage'));

-- The presets every copy started with (src/lib/data.ts), same slugs, so existing threads keep their category.
insert into public.forum_groups (slug, name, blurb, position) values
  ('community', 'Community', 'News, questions and things people made.', 0),
  ('build', 'Build', 'Models, agents, data and running them yourself.', 1),
  ('research', 'Research', 'Papers, evals, and doing it responsibly.', 2),
  ('languages', 'Languages', 'AI beyond English, region by region.', 3)
on conflict (slug) do nothing;

insert into public.forum_categories (slug, name, description, icon, accent, group_slug, position, staff_only_posting) values
  ('announcements', 'Announcements', 'Releases, forum news and how things work here.', 'megaphone', 'gold', 'community', 0, true),
  ('help', 'Help', 'Stuck? Ask. Someone has done it before.', 'life-buoy', 'ion', 'community', 1, false),
  ('show', 'Show & tell', 'Share what you built and get honest feedback.', 'sparkles', 'gold', 'community', 2, false),
  ('models', 'Models', 'Training, fine-tuning, quantising, comparing.', 'box', 'model', 'build', 0, false),
  ('agents', 'Agents', 'Tools, loops, memory and agents that behave.', 'bot', 'ion', 'build', 1, false),
  ('local', 'Local & on-device', 'Phones, laptops, offline, private.', 'cpu', 'tool', 'build', 2, false),
  ('data', 'Data & datasets', 'Collecting, cleaning, documenting and sharing data.', 'database', 'dataset', 'build', 3, false),
  ('research', 'Research', 'Papers explained by people who read them.', 'flask-conical', 'ion', 'research', 0, false),
  ('benchmarks', 'Evals & benchmarks', 'Measuring what matters, and catching leaks.', 'gauge', 'dataset', 'research', 1, false),
  ('policy', 'Policy & safety', 'Regulation, licences and doing it responsibly.', 'scale', 'gold', 'research', 2, false),
  ('languages', 'Every language', 'Multilingual work that crosses regions: tokenisers, translation, fairness.', 'languages', 'ion', 'languages', 0, false),
  ('europe', 'European languages', 'Portuguese, Spanish, Swedish, Catalan and the rest of Europe.', 'globe', 'repo', 'languages', 1, false),
  ('africa', 'African languages', 'Yoruba, Swahili, Hausa, Amharic and more.', 'earth', 'gold', 'languages', 2, false),
  ('asia', 'Asian languages', 'Japanese, Korean, Hindi, Chinese and beyond.', 'globe', 'model', 'languages', 3, false),
  ('arabic', 'Arabic & Middle East', 'Dialects, Arabizi, right-to-left and the region''s languages.', 'earth', 'tool', 'languages', 4, false)
on conflict (slug) do nothing;

-- Threads from the first version used community slugs; each maps to a category (same map as src/lib/data.ts).
create or replace function public.forum_category_of(orbit text) returns text
language sql immutable set search_path = public as $$
  select case orbit
    when 'small-models' then 'models' when 'every-language' then 'languages' when 'local-first' then 'local'
    when 'evals' then 'benchmarks' when 'image-audio' then 'show' when 'in-practice' then 'help'
    when 'safety-policy' then 'policy' else orbit end
$$;

-- Whether you may read a category's threads: visible and your role is high enough, or you moderate it.
create or replace function public.forum_can_read(orbit text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  c public.forum_categories;
begin
  select * into c from public.forum_categories where slug = public.forum_category_of(orbit);
  if not found or public.is_staff() then
    return true;
  end if;
  if auth.uid() is not null and auth.uid() = any (c.moderators) then
    return true;
  end if;
  return not c.hidden and public.cms_role_rank(public.site_role()) >= public.cms_role_rank(c.read_min_role);
end;
$$;

-- Why you may not start a thread in a category, or null when you may.
create or replace function public.forum_post_block(orbit text, replying boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  c public.forum_categories;
  is_mod boolean;
begin
  select * into c from public.forum_categories where slug = public.forum_category_of(orbit);
  if not found then
    -- Unknown categories only take threads before the admins have set any up.
    if replying or not exists (select 1 from public.forum_categories) or public.is_staff() then
      return null;
    end if;
    return 'unknown';
  end if;
  if public.is_staff() or public.cms_can('forum.manage') then
    return null;
  end if;
  is_mod := auth.uid() is not null and auth.uid() = any (c.moderators);
  if c.archived then
    return 'archived';
  end if;
  if not public.forum_can_read(orbit) then
    return 'hidden';
  end if;
  if is_mod then
    return null;
  end if;
  if not replying and c.staff_only_posting then
    return 'staff';
  end if;
  if not public.cms_can(case when replying then c.reply_cap else c.post_cap end) then
    return 'cap';
  end if;
  if not replying and c.min_reputation > 0 and public.cms_my_reputation() < c.min_reputation then
    return 'reputation';
  end if;
  return null;
end;
$$;

grant execute on function public.forum_category_of(text), public.forum_can_read(text) to anon, authenticated;
grant execute on function public.forum_post_block(text, boolean) to authenticated;

create policy "Category read rules" on public.questions as restrictive for select using (public.forum_can_read(orbit));
create policy "Category posting rules" on public.questions as restrictive for insert to authenticated
  with check (public.forum_post_block(orbit, false) is null);
create policy "Category reply rules" on public.answers as restrictive for insert to authenticated
  with check (
    question_id is null
    or public.forum_post_block((select q.orbit from public.questions q where q.id = question_id), true) is null
  );

-- Category moderators (and staff) pin, lock and hide threads, and hide replies, in their category.
create or replace function public.forum_moderate(kind text, target uuid, act text, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  cat text;
begin
  if kind = 'question' then
    select public.forum_category_of(q.orbit) into cat from public.questions q where q.id = target;
  elsif kind = 'answer' then
    select public.forum_category_of(q.orbit) into cat from public.answers a join public.questions q on q.id = a.question_id where a.id = target;
  else
    raise exception 'Unknown content kind';
  end if;
  if cat is null then
    raise exception 'That post is not here any more';
  end if;
  if not (public.is_staff() or exists (select 1 from public.forum_categories c where c.slug = cat and auth.uid() = any (c.moderators))) then
    raise exception 'Only this category''s moderators can do this';
  end if;
  if kind = 'question' and act in ('pin', 'unpin') then
    update public.questions set pinned_at = case when act = 'pin' then now() end where id = target;
  elsif kind = 'question' and act in ('lock', 'unlock') then
    update public.questions set locked_at = case when act = 'lock' then now() end where id = target;
  elsif act = 'hide' then
    execute format('update public.%I set hidden_at = now() where id = $1', case kind when 'question' then 'questions' else 'answers' end) using target;
  elsif act = 'unhide' then
    execute format('update public.%I set hidden_at = null where id = $1', case kind when 'question' then 'questions' else 'answers' end) using target;
  else
    raise exception 'Unknown action';
  end if;
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values (auth.uid(), act, kind, target::text, left(concat_ws(' · ', 'Category ' || cat, nullif(note, '')), 500));
end;
$$;

revoke execute on function public.forum_moderate(text, uuid, text, text) from public, anon;
grant execute on function public.forum_moderate(text, uuid, text, text) to authenticated;

-- Reorders groups or categories in one go and writes one log row.
create or replace function public.cms_reorder(what text, slugs text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if what in ('forum_groups', 'forum_categories') and not public.cms_can('forum.manage') then
    raise exception 'Only forum managers can do this';
  elsif what = 'rooms' and not public.cms_can('chat.manage') then
    raise exception 'Only chat managers can do this';
  elsif what = 'site_pages' and not public.cms_can('pages.edit') then
    raise exception 'Only page editors can do this';
  elsif what not in ('forum_groups', 'forum_categories', 'rooms', 'site_pages') then
    raise exception 'Unknown list';
  end if;
  if cardinality(slugs) > 300 then
    raise exception 'Too many items';
  end if;
  perform set_config('cms.quiet', 'on', true);
  if what = 'site_pages' then
    update public.site_pages p set position = s.i - 1 from unnest(slugs) with ordinality s(v, i) where p.id::text = s.v;
  else
    execute format('update public.%I t set position = s.i - 1 from unnest($1) with ordinality s(v, i) where t.slug = s.v', what) using slugs;
  end if;
  perform set_config('cms.quiet', 'off', true);
  insert into public.moderation_log (actor_id, action, target_kind, target_id, note)
  values (auth.uid(), 'reorder', what, what, left('New order: ' || array_to_string(slugs, ', '), 500));
end;
$$;

revoke execute on function public.cms_reorder(text, text[]) from public, anon;
grant execute on function public.cms_reorder(text, text[]) to authenticated;

alter publication supabase_realtime add table public.forum_groups, public.forum_categories;

-- ─── Chat rooms ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.rooms add column if not exists slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 3600);
alter table public.rooms add column if not exists locked boolean not null default false;
alter table public.rooms add column if not exists archived boolean not null default false;
alter table public.rooms add column if not exists staff_only boolean not null default false;
alter table public.rooms add column if not exists min_reputation integer not null default 0 check (min_reputation between 0 and 1000000);
alter table public.rooms add column if not exists position integer not null default 0;
alter table public.rooms add column if not exists updated_at timestamptz;

-- The starting rooms keep the order the chat always showed them in.
update public.rooms r set position = s.i
from (values ('general', 0), ('models', 1), ('agents', 2), ('local-ai', 3), ('datasets', 4), ('show-and-tell', 5),
             ('help', 6), ('research-papers', 7), ('portugues', 8), ('jobs', 9)) s(slug, i)
where r.slug = s.slug and r.position = 0;
update public.rooms set position = 100 where kind = 'public' and position = 0 and slug <> 'general';

create trigger rooms_touch before update on public.rooms for each row execute function public.cms_touch();
create trigger rooms_log after insert or update on public.rooms for each row execute function public.cms_log();

-- Chat managers edit public rooms: name, topic, order and the rules. Rooms are archived, never deleted.
grant update (name, topic, position, slow_mode_seconds, locked, archived, staff_only, min_reputation) on public.rooms to authenticated;
create policy "Chat managers edit public rooms" on public.rooms for update to authenticated
  using (kind = 'public' and public.cms_can('chat.manage'))
  with check (kind = 'public' and public.cms_can('chat.manage'));

-- Team rooms are invisible to everyone else.
create policy "Team rooms are for the team" on public.rooms as restrictive for select
  using (not staff_only or public.is_staff() or public.cms_can('chat.manage'));

create or replace function public.chat_room_open_to_me(room_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not r.staff_only or public.is_staff() or public.cms_can('chat.manage') from public.rooms r where r.slug = room_slug), true)
$$;

-- Why you may not write in a room right now, or null when you may. 'slow:<seconds>' carries the wait.
create or replace function public.chat_post_block(room_slug text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rooms;
  last_at timestamptz;
  wait integer;
begin
  select * into r from public.rooms where slug = room_slug;
  if not found or r.kind <> 'public' then
    return null;
  end if;
  if public.is_staff() or public.cms_can('chat.manage') then
    return null;
  end if;
  if r.archived then
    return 'archived';
  end if;
  if r.staff_only then
    return 'staff';
  end if;
  if r.locked then
    return 'locked';
  end if;
  if not public.cms_can('room.post') then
    return 'cap';
  end if;
  if r.min_reputation > 0 and public.cms_my_reputation() < r.min_reputation then
    return 'reputation';
  end if;
  if r.slow_mode_seconds > 0 then
    select max(m.created_at) into last_at from public.room_messages m where m.room = room_slug and m.author_id = auth.uid();
    if last_at is not null and last_at > now() - make_interval(secs => r.slow_mode_seconds) then
      wait := ceil(extract(epoch from (last_at + make_interval(secs => r.slow_mode_seconds) - now())))::integer;
      return 'slow:' || greatest(wait, 1);
    end if;
  end if;
  return null;
end;
$$;

grant execute on function public.chat_room_open_to_me(text) to anon, authenticated;
grant execute on function public.chat_post_block(text) to authenticated;

create policy "Room rules" on public.room_messages as restrictive for insert to authenticated
  with check (public.chat_post_block(room) is null);
create policy "Team rooms are for the team" on public.room_messages as restrictive for select
  using (public.chat_room_open_to_me(room));

-- ─── Custom pages ───────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 300),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) <= 262144),
  status text not null default 'draft' check (status in ('draft', 'published')),
  show_in_menu boolean not null default false,
  position integer not null default 0,
  published_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_page_revisions (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.site_pages (id) on delete cascade,
  title text not null,
  description text not null default '',
  blocks jsonb not null,
  status text not null,
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz not null default now()
);

create index if not exists site_pages_status_idx on public.site_pages (status, position);
create index if not exists site_page_revisions_page_idx on public.site_page_revisions (page_id, saved_at desc);

create or replace function public.site_pages_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

-- Every save keeps a revision; the newest 30 per page stay.
create or replace function public.site_pages_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.title = old.title and new.description = old.description and new.blocks = old.blocks and new.status = old.status then
    return new;
  end if;
  insert into public.site_page_revisions (page_id, title, description, blocks, status, saved_by)
  values (new.id, new.title, new.description, new.blocks, new.status, auth.uid());
  delete from public.site_page_revisions where page_id = new.id and id not in (
    select id from public.site_page_revisions where page_id = new.id order by saved_at desc, id desc limit 30
  );
  return new;
end;
$$;

revoke execute on function public.site_pages_stamp(), public.site_pages_revision() from public, anon, authenticated;

create trigger site_pages_stamp before insert or update on public.site_pages for each row execute function public.site_pages_stamp();
create trigger site_pages_revision after insert or update on public.site_pages for each row execute function public.site_pages_revision();
create trigger site_pages_log after insert or update or delete on public.site_pages for each row execute function public.cms_log();

alter table public.site_pages enable row level security;
alter table public.site_page_revisions enable row level security;

create policy "Published pages are public" on public.site_pages for select using (status = 'published' or public.cms_can('pages.edit'));
create policy "Page editors add pages" on public.site_pages for insert to authenticated with check (public.cms_can('pages.edit'));
create policy "Page editors edit pages" on public.site_pages for update to authenticated using (public.cms_can('pages.edit')) with check (public.cms_can('pages.edit'));
create policy "Page editors remove pages" on public.site_pages for delete to authenticated using (public.cms_can('pages.edit'));
create policy "Page editors read revisions" on public.site_page_revisions for select to authenticated using (public.cms_can('pages.edit'));
revoke insert, update, delete on public.site_page_revisions from anon, authenticated;

alter publication supabase_realtime add table public.site_pages;

-- Images for pages: a public bucket, written by page editors only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

create policy "Site media is public" on storage.objects for select using (bucket_id = 'site-media');
create policy "Page editors upload site media" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.cms_can('pages.edit'));
create policy "Page editors replace site media" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.cms_can('pages.edit'));
create policy "Page editors remove site media" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.cms_can('pages.edit'));

-- ─── Menus ──────────────────────────────────────────────────────────────────────────────────────────────────

-- The "menus" row of site_settings is written by members with menus.edit (admins already write every row).
create policy "Menu editors add the menus" on public.site_settings for insert to authenticated
  with check (key = 'menus' and public.cms_can('menus.edit'));
create policy "Menu editors change the menus" on public.site_settings for update to authenticated
  using (key = 'menus' and public.cms_can('menus.edit'))
  with check (key = 'menus' and public.cms_can('menus.edit'));

create trigger site_settings_menus_log after insert or update on public.site_settings for each row execute function public.cms_log();
