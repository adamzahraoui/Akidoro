-- Enhance email queue with processing status and recovery

-- 1. Add processing status to check constraint
alter table public.email_events drop constraint if exists email_events_status_check;
alter table public.email_events add constraint email_events_status_check 
  check (status in ('queued', 'processing', 'sent', 'failed', 'skipped'));

-- 2. Add claimed_at timestamp for crash recovery
alter table public.email_events add column if not exists claimed_at timestamptz;

-- 3. Create atomic lease function
create or replace function public.claim_email_events(p_campaign_id uuid, p_limit int)
returns setof public.email_events
language sql
security definer
set search_path = ''
as $$
  
  update public.email_events
  set status = 'processing',
      claimed_at = now()
  where id in (
    select id from public.email_events
    where campaign_id = p_campaign_id
      and (status = 'queued' or (status = 'processing' and claimed_at < now() - interval '5 minutes'))
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  returning *;

$$;
