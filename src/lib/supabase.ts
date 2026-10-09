import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Public Supabase configuration. Only the publishable (anon) key ever lives in
 * the frontend — security is enforced by Row Level Security. The service-role
 * key, OAuth client secret and database password must never reach the browser.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        // Restore and refresh the session automatically; PKCE is the recommended
        // flow for a static SPA hosted on GitHub Pages.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'akidoro.auth.v1',
      },
    })
  : null;

/**
 * The URL Supabase should send the user back to after Google consent. It respects
 * the Vite base path so it is correct both locally (`http://localhost:5173/`) and
 * in production (`https://adamzahraoui.github.io/Akidoro/`).
 */
export function authRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return new URL(base, window.location.origin).toString();
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  }
  return supabase;
}
