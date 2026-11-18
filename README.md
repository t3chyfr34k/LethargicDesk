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

Open the local URL printed by Vite. Without Supabase settings, the app works offline and stores workspace data in this browser's IndexedDB. When configured and signed into a Supabase account, workspace data syncs between devices using that account.

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
2. In the Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`, then `supabase/migrations/002_live_sync.sql`.
3. Enable Email/Password under Supabase Authentication providers. Configure the site's URL and allowed redirect URLs for local development and your deployed site.
4. Restart Vite, sign up or sign in, and choose a workspace. Existing local records are merged into the account on first sync; records are compared by `updated_at` (last update wins on a conflict). IndexedDB remains the offline cache.

Row Level Security limits cloud records to the signed-in user. Each workspace is a separate sync scope. Company workspaces sync across devices signed into the same account; this does not add multi-user company membership or grant another account access. Files use the private `workspace-files` bucket and are uploaded during sync. Google OAuth remains pending. Do not put service-role credentials in the browser.

## Current scope

Personal and Company workspaces are selected before entering the app and can be switched from the sidebar. Each workspace uses a separate IndexedDB database on this browser; Company workspaces hold their own tasks, projects, notes, knowledge articles, files, bookmarks, attendance, timers and preferences. Workspaces are local to this browser and are not shared company accounts. Company role history and start/end dates appear with calendar tenure and live daily worked time on the dashboard. Tasks, projects with separate Features, Pages, Done and To do lists, notes, knowledge articles, bookmarks, local files, attendance check-in/out, time tracking, timezone-aware live clock, preferences and backup/restore use local persistence. The clock reads the device system time and formats it in the selected timezone; it does not query an internet time service. AI Assistant, app integrations, and Google login are pending. Calendar event creation, editing, deletion and daily/weekday/weekly repetition are implemented. Repeating events are stored as one series and rendered into matching calendar days.
