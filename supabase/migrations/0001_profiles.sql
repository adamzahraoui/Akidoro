-- Akidoro core schema: profiles and admin roles.
--
-- Every user-owned row is keyed to auth.users(id) and protected by Row Level
-- Security. Admin privileges live in a separate table with no write policies,
-- so a regular user can never grant themselves admin through the API.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text not null default '',
  name                     text,
  picture                  text,
  email_updates_opt_in     boolean not null default false,
  email_updates_consent_at timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists profiles_opt_in_idx on public.profiles (email_updates_opt_in);

-- ---------------------------------------------------------------------------
-- Admin roles. No INSERT/UPDATE/DELETE policies: rows are created only by the
-- service role (SQL editor / Edge Function with the service key).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Keep profiles in sync with the auth user on sign-up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, picture)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email   = excluded.email,
        name    = coalesce(excluded.name, public.profiles.name),
        picture = coalesce(excluded.picture, public.profiles.picture),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

-- Let the signed-in client learn their own admin status even though they cannot
-- read the whole admin_users table.
create or replace function public.my_admin_status()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Only a user can see their own admin marker.
drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own" on public.admin_users
  for select using (auth.uid() = user_id);

-- Users cannot UPDATE profiles directly (their columns are managed by the
-- definer functions below); they may only read their own row.
create or replace function public.set_email_opt_in(p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_consent timestamptz;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select email_updates_consent_at into v_consent
    from public.profiles where id = v_uid;

  -- Record the moment consent is granted; keep the original grant time.
  if p_opt_in and v_consent is null then
    v_consent := now();
  end if;

  update public.profiles
     set email_updates_opt_in = p_opt_in,
         email_updates_consent_at = v_consent,
         updated_at = now()
   where id = v_uid;

  return jsonb_build_object('optIn', p_opt_in, 'consentAt', v_consent);
end;
$$;

revoke all on function public.set_email_opt_in(boolean) from public;
grant execute on function public.set_email_opt_in(boolean) to authenticated;
