import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { AdminOverview, CampaignSummary } from '../../lib/api';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';

const STATUS_LABEL: Record<CampaignSummary['status'], string> = {
  draft: 'Draft',
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Failed',
};

function statusClass(status: CampaignSummary['status']): string {
  if (status === 'sent') return 'text-accent-700 dark:text-accent-300';
  if (status === 'sending') return 'text-amber-600 dark:text-amber-400';
  if (status === 'failed') return 'text-red-600 dark:text-red-400';
  return 'text-stone-500 dark:text-stone-400';
}

export function AdminView() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', subject: '', body: '' });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await api.adminOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load admin data.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While a broadcast is in flight, poll for progress.
  useEffect(() => {
    if (!overview?.campaigns.some((c) => c.status === 'sending')) return;
    const id = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(id);
  }, [overview, load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateCampaign(form);
      setForm({ title: '', subject: '', body: '' });
      setNotice('Draft campaign created.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the campaign.');
    } finally {
      setBusy(false);
    }
  };

  const send = async (id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminSendCampaign(id);
      setNotice('Broadcast queued. Emails are sent gradually and only to opted-in users.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the broadcast.');
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const retry = async (id: string) => {
    setBusy(true);
    try {
      await api.adminRetryCampaign(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not retry the broadcast.');
    } finally {
      setBusy(false);
    }
  };

  const canCreate = form.title.trim() && form.body.trim() && !busy;

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle hint="Admins only">Product update broadcasts</CardTitle>
        {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {notice ? <p className="mb-3 text-sm text-accent-700 dark:text-accent-300">{notice}</p> : null}

        {overview ? (
          <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>
              <span className="muted">Opted-in recipients: </span>
              <strong className="tabular-nums">{overview.optedInRecipients}</strong>
            </span>
            <span>
              <span className="muted">Email transport: </span>
              <strong>{overview.mailConfigured ? 'Configured' : 'Not configured'}</strong>
            </span>
          </div>
        ) : null}

        {overview && !overview.mailConfigured ? (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            No email provider is configured for the Edge Function. Set RESEND_API_KEY or SMTP_*
            secrets to enable sending. Broadcasts are refused rather than silently dropped.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Title
            <input
              type="text"
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="focus-ring mt-1.5 w-full rounded-lg border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
            />
          </label>
          <label className="block text-sm font-medium">
            Subject
            <input
              type="text"
              value={form.subject}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="focus-ring mt-1.5 w-full rounded-lg border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
            />
          </label>
          <label className="block text-sm font-medium">
            Body
            <textarea
              value={form.body}
              rows={6}
              maxLength={20000}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="focus-ring mt-1.5 w-full rounded-lg border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
            />
          </label>
          <Button variant="primary" onClick={create} disabled={!canCreate}>
            Save draft
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle hint={`${overview?.campaigns.length ?? 0} total`}>Campaigns</CardTitle>
        {overview && overview.campaigns.length === 0 ? (
          <p className="text-sm muted">No campaigns yet.</p>
        ) : null}
        <ul className="divide-y subtle-border">
          {overview?.campaigns.map((campaign) => (
            <li key={campaign.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{campaign.title}</p>
                  <p className="text-xs muted">
                    <span className={statusClass(campaign.status)}>
                      {STATUS_LABEL[campaign.status]}
                    </span>
                    {' · '}
                    {campaign.counts.sent} sent
                    {campaign.counts.queued ? ` · ${campaign.counts.queued} queued` : ''}
                    {campaign.counts.failed ? ` · ${campaign.counts.failed} failed` : ''}
                    {campaign.counts.skipped ? ` · ${campaign.counts.skipped} skipped` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {campaign.status === 'failed' ? (
                    <Button size="sm" variant="ghost" onClick={() => retry(campaign.id)} disabled={busy}>
                      Retry failed
                    </Button>
                  ) : null}
                  {(campaign.status === 'draft' || campaign.status === 'failed') &&
                  confirming !== campaign.id ? (
                    <Button size="sm" onClick={() => setConfirming(campaign.id)} disabled={busy}>
                      Send…
                    </Button>
                  ) : null}
                  {confirming === campaign.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => send(campaign.id)}
                        disabled={busy}
                      >
                        Confirm send
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
