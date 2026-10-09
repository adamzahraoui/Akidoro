import { corsHeaders, json, preflight } from '../_shared/cors.ts';
import { adminClient, isAdmin, resolveUser } from '../_shared/supabase.ts';
import { mailConfigured } from '../_shared/email.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface CampaignRow {
  id: string;
  title: string;
  subject: string;
  body: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const emptyCounts = () => ({ queued: 0, sent: 0, failed: 0, skipped: 0 });

async function summaryFor(client: SupabaseClient, row: CampaignRow) {
  const { data } = await client
    .from('email_events')
    .select('status')
    .eq('campaign_id', row.id);
  const counts = emptyCounts();
  for (const event of (data ?? []) as Array<{ status: keyof ReturnType<typeof emptyCounts> }>) {
    if (event.status in counts) counts[event.status] += 1;
  }
  return { ...row, counts };
}

function validateCampaign(input: { title?: unknown; subject?: unknown; body?: unknown }) {
  const title = String(input.title ?? '').trim().slice(0, 200);
  const subject = String(input.subject ?? '').trim().slice(0, 200);
  const body = String(input.body ?? '').trim().slice(0, 20000);
  if (!title || !subject || !body) return null;
  return { title, subject, body };
}

/** Kick the queue worker over HTTP using the service-role key. */
async function triggerQueue(campaignId: string): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    await fetch(`${url}/functions/v1/process-email-queue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    });
  } catch {
    /* The scheduler will pick the queue back up. */
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  const user = await resolveUser(req);
  if (!user) return json({ error: 'unauthenticated', message: 'Sign in required.' }, 401, origin);

  const client = adminClient();
  if (!(await isAdmin(client, user.id))) {
    return json({ error: 'forbidden', message: 'Admins only.' }, 403, origin);
  }

  let body: { action?: string; id?: string; title?: unknown; subject?: unknown; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, origin);
  }

  switch (body.action) {
    case 'overview': {
      const [{ count }, campaignsRes] = await Promise.all([
        client.from('profiles').select('id', { count: 'exact', head: true }).eq('email_updates_opt_in', true),
        client.from('email_campaigns').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      const rows = (campaignsRes.data ?? []) as CampaignRow[];
      const campaigns = await Promise.all(rows.map((row) => summaryFor(client, row)));
      return json({ mailConfigured, optedInRecipients: count ?? 0, campaigns }, 200, origin);
    }

    case 'create': {
      const input = validateCampaign(body);
      if (!input) {
        return json(
          { error: 'invalid_campaign', message: 'Title, subject and body are required.' },
          400,
          origin,
        );
      }
      const { data, error } = await client
        .from('email_campaigns')
        .insert({ ...input, status: 'draft', created_by: user.id === 'service-role' ? null : user.id })
        .select('*')
        .single();
      if (error) return json({ error: 'create_failed', message: error.message }, 400, origin);
      return json({ campaign: await summaryFor(client, data as CampaignRow) }, 200, origin);
    }

    case 'get': {
      const { data, error } = await client
        .from('email_campaigns')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: 'get_failed', message: error.message }, 400, origin);
      if (!data) return json({ error: 'not_found', message: 'Campaign not found.' }, 404, origin);
      return json({ campaign: await summaryFor(client, data as CampaignRow) }, 200, origin);
    }

    case 'send':
    case 'retry': {
      if (!body.id) return json({ error: 'invalid_request' }, 400, origin);
      if (!mailConfigured) {
        return json(
          {
            error: 'email_not_configured',
            message: 'No email provider is configured. Set RESEND_API_KEY or SMTP_* secrets.',
          },
          400,
          origin,
        );
      }
      const { data: campaign, error } = await client
        .from('email_campaigns')
        .select('*')
        .eq('id', body.id)
        .maybeSingle();
      if (error) return json({ error: 'get_failed', message: error.message }, 400, origin);
      if (!campaign) return json({ error: 'not_found' }, 404, origin);

      if (body.action === 'send') {
        const { data: recipients, error: recipientsError } = await client
          .from('profiles')
          .select('id,email')
          .eq('email_updates_opt_in', true);
        if (recipientsError) {
          return json({ error: 'recipients_failed', message: recipientsError.message }, 400, origin);
        }
        const rows = ((recipients ?? []) as Array<{ id: string; email: string | null }>).map((p) => ({
          campaign_id: body.id as string,
          user_id: p.id,
          email: p.email ?? '',
          status: p.email ? 'queued' : 'skipped',
        }));
        if (rows.length) {
          const { error: enqueueError } = await client
            .from('email_events')
            .upsert(rows, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true });
          if (enqueueError) {
            return json({ error: 'enqueue_failed', message: enqueueError.message }, 400, origin);
          }
        }
        await client
          .from('email_campaigns')
          .update({ status: 'sending', started_at: campaign.started_at ?? new Date().toISOString(), completed_at: null })
          .eq('id', body.id);
      } else {
        // Retry: requeue failed events and resume.
        await client
          .from('email_events')
          .update({ status: 'queued', error: null })
          .eq('campaign_id', body.id)
          .eq('status', 'failed');
        await client
          .from('email_campaigns')
          .update({ status: 'sending', completed_at: null })
          .eq('id', body.id);
      }

      await triggerQueue(body.id);
      const { data: fresh } = await client.from('email_campaigns').select('*').eq('id', body.id).single();
      return json({ campaign: await summaryFor(client, fresh as CampaignRow) }, 200, origin);
    }

    default:
      return json({ error: 'unknown_action' }, 400, origin);
  }
});
