-- Members, their questions and their answers.
-- Everything is readable by anyone (Nexverse is a public community); writing is limited to your own rows.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 10 and 300),
  body text not null default '' check (char_length(body) <= 20000),
  orbit text not null check (orbit ~ '^[a-z0-9-]{1,40}$'),
  lang text not null check (lang ~ '^[a-z]{2}$'),
  accepted_answer_id uuid,
  created_at timestamptz not null default now()
);

-- An answer belongs either to a member's question or to one of the sample threads that ship with the app.
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  sample_thread text check (sample_thread ~ '^[a-z0-9-]{1,80}$'),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  check ((question_id is null) <> (sample_thread is null))
);

alter table public.questions
  add constraint questions_accepted_answer_fkey
  foreign key (accepted_answer_id) references public.answers (id) on delete set null;

create index questions_created_idx on public.questions (created_at desc);
create index questions_orbit_idx on public.questions (orbit, created_at desc);
create index questions_author_idx on public.questions (author_id);
create index answers_question_idx on public.answers (question_id, created_at);
create index answers_sample_idx on public.answers (sample_thread, created_at);
create index answers_author_idx on public.answers (author_id);

-- Every new account gets a profile, named from what they gave at sign-up or the start of their email.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Member'), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the asker may mark an answer as the one that worked, and only an answer to their own question.
create function public.check_accepted_answer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.accepted_answer_id is not null and not exists (
    select 1 from public.answers a where a.id = new.accepted_answer_id and a.question_id = new.id
  ) then
    raise exception 'accepted answer must answer this question';
  end if;
  return new;
end;
$$;

create trigger questions_accepted_answer
  before insert or update of accepted_answer_id on public.questions
  for each row execute function public.check_accepted_answer();

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

create policy "Profiles are public" on public.profiles for select using (true);
create policy "Members edit their own profile" on public.profiles for update
  to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Questions are public" on public.questions for select using (true);
create policy "Members ask as themselves" on public.questions for insert
  to authenticated with check ((select auth.uid()) = author_id);
create policy "Askers edit their questions" on public.questions for update
  to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Askers delete their questions" on public.questions for delete
  to authenticated using ((select auth.uid()) = author_id);

create policy "Answers are public" on public.answers for select using (true);
create policy "Members answer as themselves" on public.answers for insert
  to authenticated with check ((select auth.uid()) = author_id);
create policy "Members delete their answers" on public.answers for delete
  to authenticated using ((select auth.uid()) = author_id);

-- Columns a member may change after writing: a question's text and accepted answer, a profile's name.
revoke update on public.questions from anon, authenticated;
grant update (title, body, orbit, lang, accepted_answer_id) on public.questions to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;
revoke update on public.answers from anon, authenticated;
