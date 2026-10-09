export interface AuthRedirect {
  status: 'success' | 'error' | null;
  reason: string | null;
}

function paramsFrom(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/**
 * Parse the markers an OAuth return leaves on the app URL.
 *
 * Supabase (PKCE) appends `?code=...` on success and `?error=...&error_description=...`
 * on failure; the implicit flow uses the hash fragment. We also understand the
 * legacy `?auth=success|error&reason=...` markers.
 */
export function parseAuthRedirect(search: string, hash = ''): AuthRedirect {
  const query = new URLSearchParams(search);
  const fragment = paramsFrom(hash);

  const error =
    query.get('error') ?? fragment.get('error') ?? query.get('error_code') ?? fragment.get('error_code');
  if (error) {
    const reason =
      query.get('error_description') ??
      fragment.get('error_description') ??
      query.get('error_code') ??
      fragment.get('error_code') ??
      error;
    return { status: 'error', reason };
  }

  const status = query.get('auth') ?? fragment.get('auth');
  if (status === 'success') return { status: 'success', reason: null };
  if (status === 'error') {
    return { status: 'error', reason: query.get('reason') ?? fragment.get('reason') };
  }

  return { status: null, reason: null };
}

/** True when the URL carries any auth-related marker worth stripping. */
export function hasAuthRedirect(search: string, hash = ''): boolean {
  const query = new URLSearchParams(search);
  const fragment = paramsFrom(hash);
  const keys = ['code', 'error', 'error_code', 'error_description', 'auth', 'reason'];
  return keys.some((key) => query.has(key) || fragment.has(key));
}

const REASON_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  invalid_state: 'The sign-in request expired. Please try again.',
  missing_code: 'Google did not return a sign-in code. Please try again.',
  email_unverified: 'That Google email is not verified, so it cannot be used to sign in.',
  userinfo: 'Could not read your Google profile. Please try again.',
  network: 'Could not reach the sign-in provider. Check your connection and try again.',
  server_error: 'The sign-in service reported an error. Please try again.',
  temporarily_unavailable: 'The sign-in service is temporarily unavailable. Please try again.',
  otp_expired: 'That sign-in link has expired. Please try again.',
};

/** Human-readable message for a failed sign-in. */
export function authErrorMessage(reason: string | null): string {
  if (!reason) return 'Sign-in failed. Please try again.';
  const normalized = reason.toLowerCase();
  for (const [key, message] of Object.entries(REASON_MESSAGES)) {
    if (normalized.includes(key)) return message;
  }
  if (normalized.startsWith('token_')) {
    return 'Google rejected the sign-in attempt. Please try again.';
  }
  return 'Sign-in failed. Please try again.';
}
