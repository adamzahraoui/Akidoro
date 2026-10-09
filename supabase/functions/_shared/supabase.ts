import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

/** Service-role client. Bypasses RLS — never expose its key to the browser. */
export function adminClient(): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Resolve the caller from a Bearer JWT. Returns null when unauthenticated. */
export async function resolveUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // A service-role call (scheduler / internal invocation) is trusted.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) {
    return { id: 'service-role', email: null };
  }

  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function isAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  if (userId === 'service-role') return true;
  const { data } = await client
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}
