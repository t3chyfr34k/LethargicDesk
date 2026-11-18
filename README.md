# Lethargic Desk

Your work. Your space. Your control. A local-first personal workspace by Lethargic Labs.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A modern browser with IndexedDB support

## Run on Windows

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Without Supabase settings, the app works offline and stores workspace data in this browser's IndexedDB. When configured and signed into a Supabase account, only that account's workspace data syncs between devices.

## Build and preview

```powershell
npm run build
npm run preview
```

## Data and backups

Use the export icon in the top bar to download a versioned JSON backup. Visit **Settings → Security** to import a backup. Import validates the file before writing and merges records by ID; keep a separate backup before restoring. Browser storage can be cleared by browser settings, so export backups regularly.

## Development

```powershell
npm run test
```

Dexie schema versions and local repositories are in `src/lib/database.ts`. Components use the repository layer for persisted data. Shared calculations and validation live in `src/lib/logic.ts`.

## Supabase live sync

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and the Supabase publishable/anon key. Never use a service-role key in the browser.
2. In the Supabase SQL Editor, apply `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/002_live_sync.sql`, and `supabase/migrations/003_username_auth.sql`.
3. Deploy `supabase/functions/username-auth` with `npx supabase functions deploy username-auth --no-verify-jwt`. Keep the service-role key in the Edge Function environment only.
4. Restart Vite. New sign-ups provide a username, password, company name, role and start date. The app creates a Personal workspace and the named company workspace for that account. Users can add more companies later.

Row Level Security limits cloud records and files to the signed-in user. Each record is scoped by both account ID and workspace ID. Personal and each company workspace use separate IndexedDB databases; workspace metadata and pending deletion queues are also namespaced per account on the device. Signing into a different account does not show the previous account's cached data. Company workspaces are private to the account that created them; shared company membership is not enabled. Google OAuth remains pending. Do not put service-role credentials in the browser.

## Current scope

Personal and company workspaces are selected before entering the app and can be switched from the sidebar. Each account has its own Personal workspace plus company workspaces named by that user. Each workspace has separate tasks, projects, notes, knowledge articles, files, bookmarks, attendance, timers and preferences. Company role history and start/end dates appear with calendar tenure and live daily worked time on the dashboard. AI Assistant, app integrations, and Google login are pending. Calendar event creation, editing, deletion and daily/weekday/weekly repetition are implemented. Repeating events are stored as one series and rendered into matching calendar days.
# Username authentication setup

Username accounts use Supabase Auth for password hashing and sessions. The app never stores or sends plaintext passwords to a database table. Supabase Auth uses an internal, non-deliverable address for its email identifier; users only enter usernames in the app.

Before username sign-up works on a Supabase project, apply the database migration and deploy the Edge Function:

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy username-auth --no-verify-jwt
```

The project reference is the subdomain in the Supabase project URL. The Edge Function uses the platform-provided `SUPABASE_SERVICE_ROLE_KEY` server-side; do not put a service-role or secret key in `.env` or frontend code. Sign-in uses Supabase Auth directly and does not require the Edge Function. Usernames are 3–24 lowercase letters, numbers, dots, underscores, or hyphens; passwords must be 12–128 characters.