-- Chat: public rooms, the messages members write in them and the reactions they leave.
-- Everything is readable by anyone; members write as themselves. Messages and reactions stream to the
-- browser through Supabase Realtime, and a trigger slows down anyone posting faster than a person types.

create table public.rooms (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 40),
  topic text not null default '' check (char_length(topic) <= 200),
  kind text not null default 'public' check (kind = 'public'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (slug) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '\S'),
  reply_to uuid constraint room_messages_reply_to_fkey references public.room_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- A reaction carries its message's room (filled in by a trigger) so a room's channel can filter on it.
create table public.message_reactions (
  message_id uuid not null references public.room_messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '🚀', '👀', '🤔', '😂', '🔥')),
  room text not null default '',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index rooms_created_by_idx on public.rooms (created_by);
create index room_messages_room_created_idx on public.room_messages (room, created_at desc);
create index room_messages_author_created_idx on public.room_messages (author_id, created_at desc);
create index room_messages_reply_to_idx on public.room_messages (reply_to);
create index message_reactions_user_idx on public.message_reactions (user_id);
create index message_reactions_room_idx on public.message_reactions (room);

-- No more than 10 messages in 10 seconds from one member, and no more than 5 new rooms a day.
create function public.chat_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'room_messages' then
    if (select count(*) from public.room_messages m
        where m.author_id = new.author_id and m.created_at > now() - interval '10 seconds') >= 10 then
      raise exception 'You are sending messages too quickly. Wait a few seconds and try again.'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'rooms' then
    if (select count(*) from public.rooms r
        where r.created_by = new.created_by and r.created_at > now() - interval '1 day') >= 5 then
      raise exception 'You can create up to 5 rooms a day.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger room_messages_rate_limit
  before insert on public.room_messages
  for each row execute function public.chat_rate_limit();

create trigger rooms_rate_limit
  before insert on public.rooms
  for each row execute function public.chat_rate_limit();

-- Replies stay inside their room; an edit stamps edited_at; a reaction takes its message's room.
create function public.chat_message_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.edited_at := null;
    if new.reply_to is not null and not exists (
      select 1 from public.room_messages p where p.id = new.reply_to and p.room = new.room
    ) then
      raise exception 'a reply must quote a message in the same room';
    end if;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger room_messages_rules
  before insert or update on public.room_messages
  for each row execute function public.chat_message_rules();

create function public.chat_reaction_room() returns trigger
language plpgsql set search_path = '' as $$
begin
  select m.room into new.room from public.room_messages m where m.id = new.message_id;
  return new;
end;
$$;

create trigger message_reactions_room
  before insert on public.message_reactions
  for each row execute function public.chat_reaction_room();

alter table public.rooms enable row level security;
alter table public.room_messages enable row level security;
alter table public.message_reactions enable row level security;

create policy "Rooms are public" on public.rooms for select using (true);
create policy "Members open rooms as themselves" on public.rooms for insert
  to authenticated with check (created_by = (select auth.uid()));

create policy "Messages are public" on public.room_messages for select using (true);
create policy "Members write as themselves" on public.room_messages for insert
  to authenticated with check (author_id = (select auth.uid()));
create policy "Authors edit their messages" on public.room_messages for update
  to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Authors delete their messages" on public.room_messages for delete
  to authenticated using (author_id = (select auth.uid()));

create policy "Reactions are public" on public.message_reactions for select using (true);
create policy "Members react as themselves" on public.message_reactions for insert
  to authenticated with check (user_id = (select auth.uid()));
create policy "Members remove their reactions" on public.message_reactions for delete
  to authenticated using (user_id = (select auth.uid()));

-- After writing, only a message's text may change (edited_at is set by the trigger above).
revoke update on public.rooms from anon, authenticated;
revoke delete on public.rooms from anon, authenticated;
revoke update on public.room_messages from anon, authenticated;
grant update (body) on public.room_messages to authenticated;
revoke update on public.message_reactions from anon, authenticated;

revoke execute on function public.chat_rate_limit() from public, anon, authenticated;
revoke execute on function public.chat_message_rules() from public, anon, authenticated;
revoke execute on function public.chat_reaction_room() from public, anon, authenticated;

-- Live updates. Deletes arrive with the primary key only (row level security keeps the rest private).
alter publication supabase_realtime add table public.rooms, public.room_messages, public.message_reactions;

insert into public.rooms (slug, name, topic, created_by) values
  ('general', 'Lobby', 'Say hello, share what you are building, and meet other builders.', null),
  ('models', 'Models', 'New releases, fine-tunes, quantizations and which model to use for what.', null),
  ('agents', 'Agents', 'Tool use, planning, memory and the frameworks that hold agents together.', null),
  ('local-ai', 'Local AI', 'Running models on your own hardware: GPUs, Macs, llama.cpp, Ollama and friends.', null),
  ('datasets', 'Datasets', 'Finding, cleaning, labelling and sharing data.', null),
  ('show-and-tell', 'Show and tell', 'Post what you made. Demos, repos and screenshots welcome.', null),
  ('help', 'Help', 'Stuck? Ask here. Include what you tried and the error you got.', null),
  ('research-papers', 'Research papers', 'Discuss new papers, reading groups and ideas worth trying.', null),
  ('portugues', 'Português', 'Conversa em português sobre IA, modelos e projetos.', null),
  ('jobs', 'Jobs', 'Hiring or looking for work in AI. One post per role, please.', null);
