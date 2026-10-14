-- Harden Akidoro notes: explicit grants and safe timestamp/tombstone constraints.
--
-- Apply only after 0005_notes.sql. These statements are idempotent and do not
-- change the public.notes schema used by the app.

alter table public.notes
  drop constraint if exists notes_timestamps_check;

alter table public.notes
  add constraint notes_timestamps_check
  check (
    created_at >= 0
    and updated_at >= 0
    and (deleted_at is null or deleted_at >= created_at)
  );

alter table public.notes
  drop constraint if exists notes_text_length_check;

alter table public.notes
  add constraint notes_text_length_check
  check (char_length(id) <= 200 and char_length(title) <= 300 and char_length(content) <= 100000);

-- Anonymous clients (including browser sessions before sign-in) must never touch
-- user-owned notes. Only authenticated owners may read or modify their rows;
-- the broad grant is revoked first, then ownership-scoped access is restored.
revoke all on table public.notes from public, anon;
grant select, insert, update, delete on table public.notes to authenticated;
