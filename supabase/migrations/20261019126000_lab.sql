-- Lab: saved and shared Prompt Playground prompts.
--
-- A member saves a prompt (system + user prompt with {{variables}}, the chosen models and temperature). It is
-- private to its owner until they share it; shared prompts are readable by anyone with the link
-- (/lab/prompt/<id>), signed in or not. Only the owner can change or delete it. Suspended members cannot save.

create table if not exists public.lab_prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  system text not null default '' check (char_length(system) <= 8000),
  prompt text not null check (char_length(prompt) between 1 and 20000),
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables) = 'object' and pg_column_size(variables) <= 40000),
  models text[] not null default '{}' check (coalesce(array_length(models, 1), 0) <= 3),
  temperature real check (temperature is null or (temperature >= 0 and temperature <= 2)),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lab_prompts_owner_idx on public.lab_prompts (owner_id, updated_at desc);

alter table public.lab_prompts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lab_prompts' and policyname = 'Shared prompts are public, own prompts are visible to their owner') then
    create policy "Shared prompts are public, own prompts are visible to their owner" on public.lab_prompts for select
      using (shared or owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lab_prompts' and policyname = 'Members save prompts as themselves') then
    create policy "Members save prompts as themselves" on public.lab_prompts for insert to authenticated
      with check (owner_id = (select auth.uid()) and not public.is_suspended());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lab_prompts' and policyname = 'Owners edit their prompts') then
    create policy "Owners edit their prompts" on public.lab_prompts for update to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()) and not public.is_suspended());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lab_prompts' and policyname = 'Owners delete their prompts') then
    create policy "Owners delete their prompts" on public.lab_prompts for delete to authenticated
      using (owner_id = (select auth.uid()));
  end if;
end $$;

-- Keep updated_at honest and stop the owner column from being moved to someone else.
create or replace function public.lab_prompts_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.lab_prompts_touch() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'lab_prompts_touch' and tgrelid = 'public.lab_prompts'::regclass) then
    create trigger lab_prompts_touch before insert or update on public.lab_prompts
      for each row execute function public.lab_prompts_touch();
  end if;
end $$;

grant select on public.lab_prompts to anon, authenticated;
grant insert, update, delete on public.lab_prompts to authenticated;
