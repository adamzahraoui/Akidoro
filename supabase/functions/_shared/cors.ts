// CORS is configured by origin (never by path). The GitHub Pages origin is the
// bare host — the browser sends `Origin: https://adamzahraoui.github.io` even
// for requests made from https://adamzahraoui.github.io/Akidoro/.
export const ALLOWED_ORIGINS = [
  'https://adamzahraoui.github.io',
  'http://localhost:5173',
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });
}

export function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
