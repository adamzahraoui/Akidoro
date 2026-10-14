-- Akidoro notes.
--
-- Notes are owned by auth.users and protected by RLS: a user can only read and
-- modify their own rows. Ids are client-generated so uploads are idempotent, and
-- soft-delete tombstones (deleted_at) let clients resolve conflicts safely — a
-- stale offline edit can never resurrect a note deleted on another device.
--
-- Timestamps are epoch-millisecond integers (same convention as focus_sessions);
-- `updated_at` is maintained by the client as the per-note "last edit" clock.

create table if not exists public.notes (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  title      text not null default '',
  content    text not null default '',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own" on public.notes
  for select using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own" on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = user_id);