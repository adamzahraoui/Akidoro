#!/usr/bin/env node
// Migrate the legacy FocusTime SQLite database into Supabase.
//
// The existing data/focustime.db is only READ (opened readonly) — never modified
// or deleted. Local users are matched to Supabase Auth users by email; a local
// user with no matching Supabase account is reported and skipped.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-sqlite-to-supabase.mjs
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-sqlite-to-supabase.mjs --apply
//
// Default is a dry run that reads and reports without writing. Pass --apply to
// actually write. The service-role key bypasses RLS, so run this locally only.

import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dbFlag = args.indexOf('--db');
const dbPath = resolve(dbFlag >= 0 ? args[dbFlag + 1] : 'data/focustime.db');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error(`SQLite database not found: ${dbPath}`);
  process.exit(1);
}

const CHUNK = 500;
const dryRun = !apply;
console.log(`Migrating ${dbPath} → ${SUPABASE_URL}`);
console.log(dryRun ? 'DRY RUN (no writes). Pass --apply to write.' : 'APPLY mode: writing to Supabase.');

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAuthUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 1000) break;
  }
  return byEmail;
}

function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  const authByEmail = await listAuthUsers();
  console.log(`Found ${authByEmail.size} Supabase Auth user(s).`);

  const localUsers = db.prepare('SELECT * FROM users').all();
  const idMap = new Map();
  const skipped = [];

  for (const user of localUsers) {
    const target = authByEmail.get(String(user.email).toLowerCase());
    if (target) idMap.set(user.id, target);
    else skipped.push(user.email);
  }
  console.log(`Matched ${idMap.size}/${localUsers.length} local user(s) to Supabase accounts.`);
  if (skipped.length) console.log(`Skipped (no Supabase account yet): ${skipped.join(', ')}`);

  if (!dryRun) {
    const profiles = localUsers
      .filter((u) => idMap.has(u.id))
      .map((u) => ({
        id: idMap.get(u.id),
        email: u.email ?? '',
        name: u.name ?? null,
        picture: u.picture ?? null,
        email_updates_opt_in: Boolean(u.email_updates_opt_in),
        email_updates_consent_at: u.email_updates_consent_at ?? null,
        updated_at: new Date().toISOString(),
      }));
    for (const part of chunk(profiles, CHUNK)) {
      const { error } = await supabase.from('profiles').upsert(part, { onConflict: 'id' });
      if (error) throw error;
    }

    const admins = localUsers
      .filter((u) => idMap.has(u.id) && Boolean(u.is_admin))
      .map((u) => ({ user_id: idMap.get(u.id) }));
    if (admins.length) {
      const { error } = await supabase.from('admin_users').upsert(admins, { onConflict: 'user_id' });
      if (error) throw error;
    }
  }

  const sessions = db.prepare('SELECT * FROM focus_sessions').all();
  const sessionRows = sessions
    .filter((s) => idMap.has(s.user_id))
    .map((s) => {
      let segments = [];
      try {
        const parsed = JSON.parse(s.segments ?? '[]');
        if (Array.isArray(parsed)) segments = parsed;
      } catch {
        /* keep empty */
      }
      return {
        user_id: idMap.get(s.user_id),
        id: s.id,
        mode: s.mode,
        label: s.label ?? '',
        started_at: s.started_at,
        ended_at: s.ended_at,
        duration_sec: s.duration_sec,
        completed: Boolean(s.completed),
        segments,
        updated_at: s.updated_at ?? new Date().toISOString(),
      };
    });
  console.log(`Focus sessions to migrate: ${sessionRows.length}`);
  if (!dryRun) {
    for (const part of chunk(sessionRows, CHUNK)) {
      const { error } = await supabase.from('focus_sessions').upsert(part, { onConflict: 'user_id,id' });
      if (error) throw error;
    }
  }

  const settingsRows = db
    .prepare('SELECT * FROM user_settings')
    .all()
    .filter((s) => idMap.has(s.user_id))
    .map((s) => {
      let data = {};
      try {
        data = JSON.parse(s.data ?? '{}');
      } catch {
        /* keep empty */
      }
      return { user_id: idMap.get(s.user_id), data, updated_at: s.updated_at ?? new Date().toISOString() };
    });
  console.log(`Settings rows to migrate: ${settingsRows.length}`);
  if (!dryRun) {
    for (const part of chunk(settingsRows, CHUNK)) {
      const { error } = await supabase.from('user_settings').upsert(part, { onConflict: 'user_id' });
      if (error) throw error;
    }
  }

  console.log(dryRun ? 'Dry run complete.' : 'Migration complete.');
  console.log('Note: guest browser data lives in localStorage, not SQLite, and is not migrated here.');
  db.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
