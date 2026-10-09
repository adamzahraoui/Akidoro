# Akidoro

Akidoro (formerly FocusTime) is a distraction-free Pomodoro timer with weekly statistics, guest mode, optional Google sign-in (via Supabase Auth) and link-based music (YouTube and Spotify).

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

### 2. Google Provider Setup (Authentication)
1. Go to Google Cloud Console and create an OAuth 2.0 Client ID (Web application).
2. Set the authorized redirect URI to exactly:
   `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
3. Go to Supabase Dashboard -> Authentication -> Providers -> Google.
4. Enable Google, insert the `Client ID` and `Client Secret`.
5. Under Supabase Authentication -> URL Configuration, set the Site URL to:
   `https://adamzahraoui.github.io/Akidoro/`
6. Add `http://localhost:5173/` as an additional redirect URL for local development.

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
To grant an account admin privileges (to manage and send email campaigns):
Run this in the Supabase SQL Editor:
```sql
update public.profiles set is_admin = true where email = 'your.email@example.com';
```

### 6. Queue Scheduling (Email)
Queued email processing resumes automatically on the next scheduled cron invocation if an invocation ends with remaining emails. The email queue is processed by invoking the `process-email-queue` Edge Function. To run this automatically, use Supabase pg_cron or an external cron service to invoke `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/process-email-queue` using the `service_role` key. (Currently, sending or retrying a campaign from the Admin UI manually kicks off the queue worker).

### 7. GitHub Pages Setup & Deployment
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

> ⚠️ Local browser data from FocusTime (`focustime.sessions.v1`) is automatically detected by the Akidoro client and users will be prompted to safely merge their guest sessions to their cloud account upon signing in.
