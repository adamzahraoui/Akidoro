-- Akidoro product-update email campaigns.
--
-- `email_events` is a durable queue: UNIQUE (campaign_id, user_id) plus the
-- status column make enqueueing idempotent, and attempts/sent_at track progress.
-- Only the service role (Edge Functions) writes here; admins may read.

create table if not exists public.email_campaigns (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  subject      text not null,
  body         text not null,
  status       text not null default 'draft'
                 check (status in ('draft', 'sending', 'sent', 'failed')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz
);

create table if not exists public.email_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  status      text not null default 'queued'
                check (status in ('queued', 'sent', 'failed', 'skipped')),
  error       text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (campaign_id, user_id)
);

create index if not exists email_events_queue_idx
  on public.email_events (campaign_id, status);

alter table public.email_campaigns enable row level security;
alter table public.email_events enable row level security;

-- Admins can read campaigns and delivery state. There are deliberately no
-- INSERT/UPDATE/DELETE policies: only the service role may mutate the queue.
drop policy if exists "email_campaigns_admin_read" on public.email_campaigns;
create policy "email_campaigns_admin_read" on public.email_campaigns
  for select using (public.is_admin());

drop policy if exists "email_events_admin_read" on public.email_events;
create policy "email_events_admin_read" on public.email_events
  for select using (public.is_admin());
