-- Akidoro progress: focus sessions and settings, with RLS and ownership-safe RPCs.
--
-- The RPCs run as SECURITY INVOKER, so Row Level Security still applies to every
-- read/write. They enforce the monotonic-merge and last-write-wins rules in one
-- place so retries and duplicate uploads are always idempotent.

-- ---------------------------------------------------------------------------
-- Tables.
-- ---------------------------------------------------------------------------
create table if not exists public.focus_sessions (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  mode         text not null check (mode in ('focus', 'short', 'long')),
  label        text not null default '',
  started_at   bigint not null,
  ended_at     bigint not null,
  duration_sec integer not null check (duration_sec >= 0),
  completed    boolean not null default false,
  segments     jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists focus_sessions_user_started_idx
  on public.focus_sessions (user_id, started_at);

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.focus_sessions enable row level security;
alter table public.user_settings enable row level security;

-- ---------------------------------------------------------------------------
-- RLS: every operation is scoped to the authenticated owner.
-- ---------------------------------------------------------------------------
drop policy if exists "focus_sessions_select_own" on public.focus_sessions;
create policy "focus_sessions_select_own" on public.focus_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "focus_sessions_insert_own" on public.focus_sessions;
create policy "focus_sessions_insert_own" on public.focus_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "focus_sessions_update_own" on public.focus_sessions;
create policy "focus_sessions_update_own" on public.focus_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "focus_sessions_delete_own" on public.focus_sessions;
create policy "focus_sessions_delete_own" on public.focus_sessions
  for delete using (auth.uid() = user_id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Monotonic session upsert. A weaker record never overwrites a stronger one.
-- Invalid entries are skipped rather than aborting the whole batch.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_focus_sessions(p_sessions jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_accepted integer := 0;
  v_item     jsonb;
  v_segments jsonb;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    return 0;
  end if;

  for v_item in select value from jsonb_array_elements(p_sessions) as t(value) loop
    begin
      if not (v_item ? 'id')
         or not (v_item ? 'mode')
         or (v_item ->> 'mode') not in ('focus', 'short', 'long')
         or (v_item ->> 'id') = '' then
        continue;
      end if;

      v_segments := coalesce(v_item -> 'segments', '[]'::jsonb);
      if jsonb_typeof(v_segments) <> 'array' then
        v_segments := '[]'::jsonb;
      end if;

      insert into public.focus_sessions
        (user_id, id, mode, label, started_at, ended_at, duration_sec, completed, segments, updated_at)
      values (
        v_uid,
        left(v_item ->> 'id', 200),
        v_item ->> 'mode',
        left(coalesce(v_item ->> 'label', ''), 200),
        (v_item ->> 'startedAt')::bigint,
        (v_item ->> 'endedAt')::bigint,
        greatest(0, (v_item ->> 'durationSec')::integer),
        coalesce((v_item ->> 'completed')::boolean, false),
        v_segments,
        now()
      )
      on conflict (user_id, id) do update set
        mode         = excluded.mode,
        label        = excluded.label,
        started_at   = excluded.started_at,
        ended_at     = excluded.ended_at,
        duration_sec = excluded.duration_sec,
        completed    = excluded.completed,
        segments     = excluded.segments,
        updated_at   = excluded.updated_at
      where excluded.duration_sec > public.focus_sessions.duration_sec
         or (excluded.duration_sec = public.focus_sessions.duration_sec
             and excluded.completed
             and not public.focus_sessions.completed);

      if found then
        v_accepted := v_accepted + 1;
      end if;
    exception when others then
      -- Skip malformed rows; never fail the whole batch.
      null;
    end;
  end loop;

  return v_accepted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Last-write-wins settings. The stored copy wins on a stale or tied write.
-- ---------------------------------------------------------------------------
create or replace function public.put_user_settings(
  p_settings jsonb,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing public.user_settings%rowtype;
  v_updated  timestamptz := now();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    p_settings := '{}'::jsonb;
  end if;

  select * into v_existing from public.user_settings where user_id = v_uid;
  if found and v_existing.updated_at > coalesce(p_updated_at, 'epoch'::timestamptz) then
    return jsonb_build_object(
      'applied', false,
      'settings', v_existing.data,
      'updatedAt', v_existing.updated_at
    );
  end if;

  insert into public.user_settings (user_id, data, updated_at)
  values (v_uid, p_settings, v_updated)
  on conflict (user_id) do update
    set data = excluded.data, updated_at = excluded.updated_at;

  return jsonb_build_object('applied', true, 'settings', p_settings, 'updatedAt', v_updated);
end;
$$;

grant execute on function public.upsert_focus_sessions(jsonb) to authenticated;
grant execute on function public.put_user_settings(jsonb, timestamptz) to authenticated;
