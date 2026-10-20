-- Guests see only public content, enforced here and not only on screen.
--
-- A guest is the `anon` role: anyone holding the site's publishable key without signing in. Reading stays
-- open for what the site shows the world (forum, news, models, datasets, tools, public code, events,
-- leaderboard, pages, published projects). What people say to each other, who is online, crews' insides,
-- and anything personal now need a signed-in member.
--
-- How: `as restrictive ... to anon using (false)` policies. A restrictive policy is ANDed with the
-- permissive ones, so it closes a table to guests without touching what members can read, and it keeps
-- working if someone later adds a permissive policy "to public". Every statement is safe to run twice.
-- No drop statements.

do $$
declare
  t text;
  closed text[] := array[
    -- Chat: messages and reactions are for members (room names stay public, so guests see what exists).
    'room_messages', 'message_reactions',
    -- Who is online, and on which page.
    'presence',
    -- Crews' insides: who is in them, their posts, reactions and collections (a crew's name stays findable).
    'crew_members', 'crew_posts', 'crew_post_reactions', 'crew_collections', 'crew_invites', 'crew_requests',
    -- Direct messages (already closed to guests by grants and policies; this keeps them closed).
    'dm_threads', 'dm_messages', 'member_blocks',
    -- Personal: notifications, saved items, private votes, AI usage, reports.
    'notifications', 'bookmarks', 'poll_votes', 'duel_votes', 'ai_usage', 'ai_cache', 'ai_provider_usage', 'reports',
    -- Staff records.
    'moderation_log', 'site_page_revisions', 'news_runs', 'news_signals', 'news_sources', 'news_tips'
  ];
begin
  foreach t in array closed loop
    -- Skip tables an older database does not have yet.
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Guests cannot read this') then
      execute format('create policy %I on public.%I as restrictive for select to anon using (false)', 'Guests cannot read this', t);
    end if;
  end loop;
end
$$;

-- Profiles: guests see what a byline and a public card need, and nothing else. Members' notification
-- settings, onboarding and deletion dates, role and pause details are not for guests. (There is no email
-- column here: addresses live in auth.users, which no client role can read.)
-- Column privileges only bite when the table-wide one is gone, so the table grant is swapped for a column list.
revoke select on table public.profiles from anon;
grant select (id, name, handle, avatar_url, bio, location, website, github, created_at) on table public.profiles to anon;
