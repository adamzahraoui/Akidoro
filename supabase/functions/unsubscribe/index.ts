// Public one-click unsubscribe. verify_jwt = false (see supabase/config.toml):
// the signed token in the URL is the credential, so no account/session is needed.
import { adminClient } from '../_shared/supabase.ts';
import { verifyUnsubscribeToken } from '../_shared/email.ts';

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Akidoro</title></head>
<body style="margin:0;background:#f7f4ee;font-family:Inter,Arial,sans-serif;color:#333;">
  <main style="max-width:480px;margin:15vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.06);">
    <div style="font-weight:700;color:#3e6745;margin-bottom:16px;">Akidoro</div>
    <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
    <p style="font-size:15px;line-height:1.6;">${message}</p>
  </main>
</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return page('Method not allowed', 'Please use the link from your email.', 405);
  }

  const url = new URL(req.url);
  let token = url.searchParams.get('token') ?? '';

  if (!token && req.method === 'POST') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await req.json().catch(() => ({}))) as { token?: string };
      token = body.token ?? '';
    }
  }

  const userId = await verifyUnsubscribeToken(token);
  if (!userId) {
    return page('Link expired', 'This unsubscribe link is invalid or has expired.', 400);
  }

  const client = adminClient();
  const { error } = await client
    .from('profiles')
    .update({ email_updates_opt_in: false, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    return page('Something went wrong', 'We could not update your preferences. Please try again later.', 500);
  }

  return page(
    "You're unsubscribed",
    'You will no longer receive Akidoro product updates. You can opt back in any time from Settings.',
    200,
  );
});
