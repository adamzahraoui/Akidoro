# Akidoro

Akidoro (formerly FocusTime) is a distraction-free Pomodoro timer with weekly statistics, notes, guest mode, optional Google sign-in (via Supabase Auth) and link-based music (YouTube and Spotify).

## Setup & Configuration

This project requires a Supabase backend and is hosted as a static site on GitHub Pages.

### 1. Supabase Project Setup
1. Create a new Supabase project.
2. Link your local project to the remote project using the Supabase CLI:
   `supabase link --project-ref <YOUR_PROJECT_REF>`
3. Apply SQL migrations in order from the Supabase dashboard (SQL Editor) or CLI:
   - `supabase/migrations/0001_profiles.sql`
   - `supabase/migrations/0002_progress.sql`
   - `supabase/migrations/0003_email.sql`
   - `supabase/migrations/0004_email_queue_recovery.sql`
   - `supabase/migrations/0005_notes.sql`

### 2. Google Provider Setup (Authentication)
The app itself performs no OAuth: it delegates entirely to Supabase Auth, which talks to Google
using the credentials configured in the Supabase Dashboard. `invalid_client` / "OAuth client was
not found" is a Dashboard-configuration problem, not an app-code one. To configure it correctly:

1. Go to Google Cloud Console → **APIs & Services → Credentials** and create an **OAuth 2.0 Client
   ID** of type **Web application** (not TV, not Android, not Desktop).
2. The generated **Client ID** is the 72-character value ending in `.apps.googleusercontent.com`.
   It must not be a Supabase key, the project reference, or a client secret.
3. Under **Authorized redirect URIs**, add exactly:
   `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
4. Go to Supabase Dashboard → **Authentication → Providers → Google** for the project:
   1. **Enable** Google.
   2. Paste the **Client ID** from step 2 (the `.apps.googleusercontent.com` value).
   3. Paste the matching **Client Secret** from the same Google OAuth client (a secret from a
      different Web client — even from the same Google project — yields `invalid_client`/401).
5. Supabase Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `https://adamzahraoui.github.io/Akidoro/`
   - **Redirect URLs**: add `http://localhost:5173/` for local development.

> **Troubleshooting `Access blocked · Authorization Error · Error 401: invalid_client`** (project
> `ijyrxxaersbdymkzerml`):
> - Confirm the Auth Google provider is pointing at a **Web application** OAuth client that still
>   exists in Google Cloud. If the client was created under a deleted/renamed Google project, or
>   is of the wrong type, Google rejects it before consent.
> - Confirm the client **secret** field belongs to that exact client id.
> - The frontend never passes a client id to Google; the browser URL during the error is
>   `accounts.google.com/o/oauth2/...` and the `client_id=` query parameter there is what Supabase
>   holds in the Dashboard. Compare it to the value in Google Cloud Console.

### 3. Frontend Variables
Create a `.env` file from `.env.example` and set:
- `VITE_SUPABASE_URL`: Your Supabase API URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase anon public key.

These are public variables and must also be added as **Repository Variables** in GitHub Actions (Settings -> Secrets and variables -> Actions -> Variables).

### 4. Edge Function Secrets and Deployment
Akidoro uses Supabase Edge Functions for secure operations (email delivery, admin tasks).
1. Generate an unsubscribe secret for emails: `openssl rand -hex 32`
2. Configure secrets on your Supabase project (via CLI):
   ```bash
   supabase secrets set RESEND_API_KEY="your-resend-key"
   supabase secrets set MAIL_FROM="Akidoro <hello@example.com>"
   supabase secrets set UNSUBSCRIBE_SECRET="your-generated-secret"
   ```
   *(Alternatively, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` instead of RESEND).*
3. Deploy Edge Functions (requires `supabase` CLI):
   ```bash
   supabase functions deploy admin-campaigns
   supabase functions deploy process-email-queue
   supabase functions deploy unsubscribe
   ```
   *(Or trigger the manual `.github/workflows/deploy-functions.yml` action, providing `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` as repository secrets).*

### 5. Admin Setup
To grant an account admin privileges (to manage and send email campaigns), insert its row into the
`admin_users` table. There is no update policy on it (by design users can never self-grant), so run
this in the Supabase SQL Editor:
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'your.email@example.com'
on conflict (user_id) do nothing;
```

### 6. Queue Scheduling (Email)
Queued email processing resumes automatically on the next scheduled cron invocation if an invocation ends with remaining emails. The email queue is processed by invoking the `process-email-queue` Edge Function. To run this automatically, use Supabase pg_cron or an external cron service to invoke `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/process-email-queue` using the `service_role` key. (Currently, sending or retrying a campaign from the Admin UI manually kicks off the queue worker).

### 7. Notes
Notes are plain-text (never HTML) and sync through the `notes` table (migration `0005_notes.sql`),
owned per user with RLS; guest notes live in the browser under `akidoro.notes.v1` and are offered
for merge into the account on sign-in, exactly like sessions. Deletions are soft (tombstones), so
a stale offline edit can never resurrect a deleted note, and the UI shows "Saved" only after the
server acknowledges the write. Note editing never touches the timer or music.

### 8. GitHub Pages Setup & Deployment
- The app is deployed to GitHub Pages at `/Akidoro/`.
- Ensure GitHub Pages is enabled in the repository settings (Settings -> Pages -> Build and deployment -> Source: GitHub Actions).
- Run the `Deploy to GitHub Pages` manual workflow in the Actions tab.

## Local Development
Install dependencies and run the local server:
```bash
npm ci
npm run dev
```

Run tests and typechecks:
```bash
npm run check
npm test
```

## Legacy Data Migration (SQLite)
If migrating from an older deployment using SQLite, you can extract the `.db` file (including `-shm` and `-wal` files). Stop the old server to ensure WAL checkpoints, then export records and use Supabase Server-Side SDKs to map `users`, `focus_sessions`, and `user_settings` into the new Postgres database. Never map old account data to a new Supabase identity without explicit verification of ownership (e.g. email matches Google Auth email).

> ⚠️ Local browser data from FocusTime (`focustime.sessions.v1`, `focustime.settings.v1`,
> `focustime.notes.v1`) is automatically detected by the Akidoro client and users will be prompted
> to safely merge their guest sessions, settings and notes to their cloud account upon signing in.
