// Email rendering + delivery for Akidoro product updates.
// Secrets: RESEND_API_KEY or SMTP_*, MAIL_FROM, UNSUBSCRIBE_SECRET, SITE_URL.

function env(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback;
}

export const mailConfigured = Boolean(env('RESEND_API_KEY') || env('SMTP_HOST'));

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Unsubscribe tokens (usable without signing in) -------------------------
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function sign(payload: string): Promise<Uint8Array> {
  const secret = env('UNSUBSCRIBE_SECRET');
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createUnsubscribeToken(userId: string): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(userId));
  const signature = bytesToBase64Url(await sign(payload));
  return `${payload}.${signature}`;
}

export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const expected = await sign(payload);
    const provided = base64UrlToBytes(signature);
    if (!timingSafeEqual(expected, provided)) return null;
    return new TextDecoder().decode(base64UrlToBytes(payload));
  } catch {
    return null;
  }
}

function unsubscribeBaseUrl(): string {
  const explicit = env('UNSUBSCRIBE_BASE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');
  return `${env('SUPABASE_URL')}/functions/v1/unsubscribe`;
}

export async function unsubscribeUrl(userId: string): Promise<string> {
  const token = await createUnsubscribeToken(userId);
  return `${unsubscribeBaseUrl()}?token=${encodeURIComponent(token)}`;
}

// --- Content ----------------------------------------------------------------
export interface CampaignContent {
  title: string;
  subject: string;
  body: string;
}

export function renderCampaign(campaign: CampaignContent): { subject: string; html: string; text: string } {
  const subject = campaign.subject || campaign.title || 'Akidoro update';
  const paragraphs = String(campaign.body ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f4ee;font-family:Inter,Arial,sans-serif;color:#333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:700;font-size:18px;color:#3e6745;margin-bottom:24px;">Akidoro</div>
    <h1 style="font-size:22px;margin:0 0 16px;">${escapeHtml(campaign.title)}</h1>
    <div style="font-size:15px;line-height:1.6;">${paragraphs}</div>
    <hr style="border:none;border-top:1px solid #e2ded4;margin:32px 0;" />
    <p style="font-size:12px;color:#7a7568;">
      You are receiving this because you opted in to product updates.
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#3e6745;">Unsubscribe</a>.
    </p>
  </div>
</body></html>`;

  const text = `${campaign.title}\n\n${campaign.body}\n\nUnsubscribe: {{UNSUBSCRIBE_URL}}`;
  return { subject, html, text };
}

function personalize(content: { html: string; text: string }, unsubscribe: string) {
  return {
    html: content.html.split('{{UNSUBSCRIBE_URL}}').join(unsubscribe),
    text: content.text.split('{{UNSUBSCRIBE_URL}}').join(unsubscribe),
  };
}

// --- Delivery ---------------------------------------------------------------
export interface DeliverArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export async function deliver({ to, subject, html, text, headers }: DeliverArgs): Promise<void> {
  const resendKey = env('RESEND_API_KEY');
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'Idempotency-Key': eventId,
    },
  });
}
