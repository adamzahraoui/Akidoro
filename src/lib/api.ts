import { authRedirectUrl, requireSupabase, supabase, supabaseConfigured } from './supabase';

/** Error type shared by the UI. Mirrors the shape the old REST client used. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface PostgrestError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const err = (error ?? {}) as PostgrestError & { status?: number; name?: string };
  const status = typeof err.status === 'number' ? err.status : 400;
  return new ApiError(err.message || 'Request failed', err.code ?? 'request_failed', status);
}

/** Session payload accepted by the `upsert_focus_sessions` RPC (snake_case). */
export interface ServerSession {
  id: string;
  mode: 'focus' | 'short' | 'long';
  label: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  completed: boolean;
  segments: Array<{ start: number; end: number }>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  emailUpdatesOptIn: boolean;
  emailUpdatesConsentAt: string | null;
}

export interface AuthMe {
  user: AuthUser | null;
  providers: { googleLoginConfigured: boolean };
}

export interface ServerState {
  serverTime: string;
  sessions: ServerSession[];
  settings: Record<string, unknown> | null;
  settingsUpdatedAt: string | null;
}

export interface EmailPreferences {
  optIn: boolean;
  consentAt: string | null;
}

export interface CampaignSummary {
  id: string;
  title: string;
  subject: string;
  body: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  counts: { queued: number; sent: number; failed: number; skipped: number };
}

export interface AdminOverview {
  mailConfigured: boolean;
  optedInRecipients: number;
  campaigns: CampaignSummary[];
}

const MODES = new Set(['focus', 'short', 'long']);

/** Validate and normalise a single session before it is uploaded. */
export function sanitizeSession(input: unknown): ServerSession | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const id = String(body.id ?? '');
  if (!id || id.length > 200) return null;
  if (!MODES.has(String(body.mode))) return null;
  const startedAt = Number(body.startedAt);
  const endedAt = Number(body.endedAt);
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || !Number.isFinite(durationSec)) {
    return null;
  }
  const segments = (Array.isArray(body.segments) ? body.segments : [])
    .slice(0, 200)
    .map((s) => ({ start: Number((s as { start?: unknown })?.start), end: Number((s as { end?: unknown })?.end) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
  return {
    id,
    mode: body.mode as ServerSession['mode'],
    label: String(body.label ?? '').slice(0, 200),
    startedAt: Math.round(startedAt),
    endedAt: Math.round(endedAt),
    durationSec: Math.max(0, Math.round(durationSec)),
    completed: Boolean(body.completed),
    segments,
  };
}

interface SessionRow {
  id: string;
  mode: string;
  label: string;
  started_at: number;
  ended_at: number;
  duration_sec: number;
  completed: boolean;
  segments: unknown;
}

function rowToSession(row: SessionRow): ServerSession {
  const segments = Array.isArray(row.segments)
    ? (row.segments as Array<{ start: number; end: number }>)
    : [];
  return {
    id: row.id,
    mode: row.mode as ServerSession['mode'],
    label: row.label,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
    completed: row.completed,
    segments,
  };
}

async function currentUserId(): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error) throw toApiError(error);
  if (!data.user) throw new ApiError('Not signed in', 'unauthenticated', 401);
  return data.user.id;
}

async function adminInvoke<T>(body: Record<string, unknown>): Promise<T> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('admin-campaigns', { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 500;
    throw new ApiError(error.message || 'Admin request failed', 'admin_failed', status);
  }
  const payload = data as { error?: string; message?: string } | null;
  if (payload && payload.error) {
    throw new ApiError(payload.message || payload.error, payload.error, 400);
  }
  return data as T;
}

export const api = {
  // --- Accounts ---
  async getMe(): Promise<AuthMe> {
    if (!supabase) return { user: null, providers: { googleLoginConfigured: false } };
    const { data, error } = await supabase.auth.getUser();
    if (error) throw toApiError(error);
    const user = data.user;
    if (!user) return { user: null, providers: { googleLoginConfigured: supabaseConfigured } };

    const [profileRes, adminRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('email,name,picture,email_updates_opt_in,email_updates_consent_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.rpc('my_admin_status'),
    ]);

    const profile = profileRes.data as
      | {
          email: string | null;
          name: string | null;
          picture: string | null;
          email_updates_opt_in: boolean | null;
          email_updates_consent_at: string | null;
        }
      | null;

    return {
      user: {
        id: user.id,
        email: profile?.email || user.email || '',
        name: profile?.name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
        picture: profile?.picture ?? (user.user_metadata?.avatar_url as string | undefined) ?? null,
        isAdmin: Boolean(adminRes.data),
        emailUpdatesOptIn: Boolean(profile?.email_updates_opt_in),
        emailUpdatesConsentAt: profile?.email_updates_consent_at ?? null,
      },
      providers: { googleLoginConfigured: supabaseConfigured },
    };
  },

  async signInWithGoogle(): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectUrl(),
        // Identity scopes only: never YouTube, Spotify or Gmail.
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw toApiError(error);
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw toApiError(error);
  },

  // --- Progress sync ---
  async getState(): Promise<ServerState> {
    const sb = requireSupabase();
    await currentUserId();
    const [sessionsRes, settingsRes] = await Promise.all([
      sb
        .from('focus_sessions')
        .select('id,mode,label,started_at,ended_at,duration_sec,completed,segments')
        .order('started_at', { ascending: true }),
      sb.from('user_settings').select('data,updated_at').maybeSingle(),
    ]);
    if (sessionsRes.error) throw toApiError(sessionsRes.error);
    if (settingsRes.error) throw toApiError(settingsRes.error);
    const settingsRow = settingsRes.data as { data: unknown; updated_at: string } | null;
    return {
      serverTime: new Date().toISOString(),
      sessions: ((sessionsRes.data ?? []) as SessionRow[]).map(rowToSession),
      settings: (settingsRow?.data as Record<string, unknown> | undefined) ?? null,
      settingsUpdatedAt: settingsRow?.updated_at ?? null,
    };
  },

  async bulkSessions(sessions: ServerSession[]): Promise<{ ok: boolean; accepted: number }> {
    const sb = requireSupabase();
    const valid = sessions.map(sanitizeSession).filter((s): s is ServerSession => s !== null);
    const { data, error } = await sb.rpc('upsert_focus_sessions', { p_sessions: valid });
    if (error) throw toApiError(error);
    return { ok: true, accepted: (data as number) ?? 0 };
  },

  async deleteSessions(): Promise<{ ok: boolean }> {
    const sb = requireSupabase();
    const userId = await currentUserId();
    const { error } = await sb.from('focus_sessions').delete().eq('user_id', userId);
    if (error) throw toApiError(error);
    return { ok: true };
  },

  async putSettings(
    settings: Record<string, unknown>,
    updatedAt: string,
  ): Promise<{ applied: boolean; settings: Record<string, unknown> | null; updatedAt: string }> {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc('put_user_settings', {
      p_settings: settings,
      p_updated_at: updatedAt,
    });
    if (error) throw toApiError(error);
    return data as { applied: boolean; settings: Record<string, unknown> | null; updatedAt: string };
  },

  // --- Email preferences ---
  async getEmailPreferences(): Promise<EmailPreferences> {
    const sb = requireSupabase();
    const userId = await currentUserId();
    const { data, error } = await sb
      .from('profiles')
      .select('email_updates_opt_in,email_updates_consent_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw toApiError(error);
    const row = data as { email_updates_opt_in: boolean | null; email_updates_consent_at: string | null } | null;
    return {
      optIn: Boolean(row?.email_updates_opt_in),
      consentAt: row?.email_updates_consent_at ?? null,
    };
  },

  async putEmailPreferences(optIn: boolean): Promise<EmailPreferences> {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc('set_email_opt_in', { p_opt_in: optIn });
    if (error) throw toApiError(error);
    return data as EmailPreferences;
  },

  // --- Admin (privileged work runs in an Edge Function) ---
  adminOverview: () => adminInvoke<AdminOverview>({ action: 'overview' }),
  adminCreateCampaign: (input: { title: string; subject: string; body: string }) =>
    adminInvoke<{ campaign: CampaignSummary }>({ action: 'create', ...input }),
  adminGetCampaign: (id: string) =>
    adminInvoke<{ campaign: CampaignSummary }>({ action: 'get', id }),
  adminSendCampaign: (id: string) =>
    adminInvoke<{ campaign: CampaignSummary }>({ action: 'send', id }),
  adminRetryCampaign: (id: string) =>
    adminInvoke<{ campaign: CampaignSummary }>({ action: 'retry', id }),
};
