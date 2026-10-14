# Akidoro

Akidoro is a distraction-free Pomodoro timer with weekly statistics, plain-text notes, guest/local data persistence, and link-based music (YouTube and Spotify).

## Features

- Pomodoro timer with focus, short break, long break and statistics.
- Notes with create/edit/delete, previews, timestamps, undo and responsive layout.
- All notes, session history and settings are stored locally in this browser.
- Backup export/import as versioned JSON.
- URL-only YouTube/Spotify embeds. No music account is connected.
- Works without an account or any remote configuration.

## Local-first data

Akidoro does not require sign-in. Data is stored locally in this browser and is not synced between devices.
Data can be lost when the browser's site data is cleared. Sharing a browser profile means sharing this local data.

## Setup

Install dependencies and run the local server:

```bash
npm ci
npm run dev
```

No environment variables are required.

Run checks:

```bash
npm run check
npm test
npm run build
```

## Backup and restore

Use Settings → Export backup (JSON) to download notes, progress and settings.
Use Settings → Import backup (JSON) to merge data by id. Existing data is preserved and duplicates are avoided.

## Guest/account-scoped local data

Akidoro keeps separate local namespaces for any legacy account-scoped data that exists in this browser.
If scoped data is found, the app offers an explicit import choice. It is never merged silently.

## GitHub Pages deployment

The app is deployed to GitHub Pages at `/Akidoro/`.

- Ensure GitHub Pages is enabled: Settings → Pages → Build and deployment → Source: GitHub Actions.
- No repository variables are required for the frontend.
- Run the `Deploy to GitHub Pages` workflow in the Actions tab after review.

## Notes on remote infrastructure

Historical Supabase migrations and remote infrastructure are intentionally left untouched.
This frontend no longer depends on them for normal use.
