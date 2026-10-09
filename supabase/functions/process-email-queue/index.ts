import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { adminClient, isAdmin, resolveUser } from '../_shared/supabase.ts';
import { mailConfigured, sendProductUpdate } from '../_shared/email.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const BATCH = 25;
const MAX_ATTEMPTS = 3;
const SEND_SPACING_MS = 150;

interface CampaignRow {
  id: string;
  title: string;
  subject: string;
  body: string;
}

interface QueueEvent {
  id: string;
  user_id: string;
  email: string;
  attempts: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function remaining(client: SupabaseClient, campaignId: string): Promise<number> {
  const { count } = await client
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued');
  return count ?? 0;
}

async function finalize(client: SupabaseClient, campaignId: string): Promise<void> {
  if ((await remaining(client, campaignId)) > 0) return;
  const { data } = await client.from('email_events').select('status').eq('campaign_id', campaignId);
  const statuses = ((data ?? []) as Array<{ status: string }>).map((e) => e.status);
  const sent = statuses.filter((s) => s === 'sent').length;
  await client
    .from('email_campaigns')
    .update({
      status: sent > 0 ? 'sent' : 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
}

async function processCampaign(
  client: SupabaseClient,
  campaign: CampaignRow,
): Promise<{ processed: number; remaining: number }> {
  let processed = 0;
  const startTime = Date.now();
  const MAX_EXECUTION_MS = 20000;

  while (Date.now() - startTime < MAX_EXECUTION_MS) {
    const { data, error } = await client.rpc('claim_email_events', {
      p_campaign_id: campaign.id,
      p_limit: BATCH
    });
    if (error) throw new Error(error.message);

    const events = (data ?? []) as QueueEvent[];
    if (!events.length) break;

    const { data: profiles } = await client
      .from('profiles')
      .select('id,email,email_updates_opt_in')
      .in('id', events.map((e) => e.user_id));
    const byId = new Map(
      ((profiles ?? []) as Array<{ id: string; email: string | null; email_updates_opt_in: boolean }>).map(
        (p) => [p.id, p],
      ),
    );

    for (const event of events) {
      const profile = byId.get(event.user_id);
      if (!profile || !profile.email_updates_opt_in || !profile.email) {
        await client.from('email_events').update({ status: 'skipped' }).eq('id', event.id);
        processed += 1;
        continue;
      }

      try {
        await sendProductUpdate(
          { id: event.user_id, email: profile.email },
          { title: campaign.title, subject: campaign.subject, body: campaign.body },
          event.id,
        );
        await client
          .from('email_events')
          .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: event.attempts + 1, error: null })
          .eq('id', event.id);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'email_not_configured') throw err;
        const attempts = event.attempts + 1;
        await client
          .from('email_events')
          .update({
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
            attempts,
            error: (err instanceof Error ? err.message : 'send_failed').slice(0, 300),
          })
          .eq('id', event.id);
        processed += 1;
        return { processed, remaining: await remaining(client, campaign.id) };
      }

      processed += 1;
      await delay(SEND_SPACING_MS);
    }

    if (events.length < BATCH) break;
  }

  return { processed, remaining: await remaining(client, campaign.id) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const user = await resolveUser(req);
  if (!user) return json({ error: 'unauthenticated' }, 401, origin);

  const client = adminClient();
  if (!(await isAdmin(client, user.id))) {
    return json({ error: 'forbidden', message: 'Admins only.' }, 403, origin);
  }
  if (!mailConfigured) {
    return json({ error: 'email_not_configured' }, 400, origin);
  }

  let body: { campaignId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let query = client.from('email_campaigns').select('*').eq('status', 'sending');
  if (body.campaignId) query = query.eq('id', body.campaignId);
  const { data, error } = await query;
  if (error) return json({ error: 'query_failed', message: error.message }, 400, origin);

  const campaigns = (data ?? []) as CampaignRow[];
  let processed = 0;
  let remainingTotal = 0;
  for (const campaign of campaigns) {
    try {
      const result = await processCampaign(client, campaign);
      processed += result.processed;
      remainingTotal += result.remaining;
      await finalize(client, campaign.id);
    } catch (err) {
      return json(
        { error: 'processing_failed', message: err instanceof Error ? err.message : 'failed' },
        400,
        origin,
      );
    }
  }

  return json({ processed, remaining: remainingTotal }, 200, origin);
});
