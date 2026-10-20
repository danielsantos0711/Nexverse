-- Round 10 shell: each member's own feel for the site (Settings › Your experience).
--   ui_prefs.motion     'site' | 'calm' | 'full'   calm turns animations into plain fades for this member
--   ui_prefs.accent     'site' | 'ion' | 'gold' | 'aurora' | 'nova'   the member's own accent colour
--   ui_prefs.shortcuts  boolean                    single-key shortcuts (/, C, G, J, K) on or off
-- Additive only: one column, one column grant, one size check. Profiles are already readable by everyone and
-- editable only by their owner ("Members edit their own profile"); the grant adds this column to what a
-- member may update in their own row.

alter table public.profiles add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_ui_prefs_small') then
    alter table public.profiles
      add constraint profiles_ui_prefs_small check (jsonb_typeof(ui_prefs) = 'object' and pg_column_size(ui_prefs) < 2048);
  end if;
end $$;

grant update (ui_prefs) on public.profiles to authenticated;
