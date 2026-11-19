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

Personal and company workspaces are selected before entering the app and can be switched from the sidebar. Each account has its own Personal workspace plus company workspaces named by that user. Each workspace has separate tasks, projects, notes, knowledge articles, files, bookmarks, attendance, timers and preferences. Company role history and start/end dates appear with calendar tenure and live daily worked time on the dashboard. The AI Assistant supports user-supplied API providers. App integrations support Vikunja, Forgejo, Nextcloud, ntfy and Radicale using credentials stored locally on the device; integrations require the remote service to permit browser CORS requests. Google login remains pending. Calendar event creation, editing, deletion and daily/weekday/weekly repetition are implemented. Repeating events are stored as one series and rendered into matching calendar days.

## Push notifications with ntfy

Open **Integrations → Push notifications · ntfy**. Use `https://ntfy.sh` or your own server, choose a long, hard-to-guess topic, and subscribe to that same topic in the ntfy app on each device. A topic on the public ntfy server acts like a password, so keep it private. An access token is optional for public topics and can be used with authenticated servers. “Send test notification” checks the connection.

You can enable due-task reminders, task-timer completion alerts, and a daily briefing, and set the alert times in the workspace timezone. Scheduled alerts are sent while Lethargic Desk is open in a browser and the ntfy settings are remembered on that device; browser-only scheduling cannot run while the app is closed. The current app has no focus-session feature, so the completion alert is attached to the existing task timer.

## Calendar sync with Radicale

Radicale is an optional, separate CalDAV server. The project includes a Windows local setup that installs Radicale 3.9.2 in an isolated Python virtual environment, binds it only to `127.0.0.1`, configures bcrypt password authentication and persistent local storage, and creates a starter calendar. Run these commands from the repository root in PowerShell:

```powershell
.\radicale\setup.ps1
.\radicale\start.ps1
```

The first command prints a generated Radicale username and password once; save them. It asks for the Lethargic Desk origin and defaults to `http://localhost:5173`. If Vite starts on another port, edit `Access-Control-Allow-Origin` in `.radicale-data\config` to match the exact origin and restart Radicale. The server is local-only and this configuration is for development; use HTTPS and a deployment-specific CORS origin before making a CalDAV server reachable over a network.

Then open **Integrations → Calendar sync · Radicale** and enter the generated credentials and collection URL printed by setup (`http://127.0.0.1:5232/lethargicdesk/calendar/`). Test the connection, then choose **Sync calendar now**. New connections default to import-only; choose export-only or two-way sync when appropriate. Linked event edits and deletions are synchronized; remote deletions are kept locally to avoid accidental data loss. Calendar credentials are remembered only when that option is enabled.

The setup follows Radicale's [v3 quick start](https://radicale.org/v3.html#simple-5-minute-setup), but keeps authentication enabled: the docs' `--auth-type none` example accepts any username and password and is explicitly marked insecure. The server configuration uses Radicale's [htpasswd authentication](https://radicale.org/v3.html#authentication), filesystem storage and configurable HTTP headers for browser CORS. Runtime data and password hashes stay under the ignored `.radicale-data` directory; the plaintext password is not written to disk.

Open **Integrations → Calendar sync · Radicale** and enter the full CalDAV calendar collection URL, username, and password. Test the connection, then choose **Sync calendar now** to import events and publish workspace events. Linked event edits and deletions are sent on later syncs. Events deleted directly in Radicale are left in the workspace to avoid deleting local events unexpectedly. The Radicale server must allow HTTPS browser requests from the Lethargic Desk origin, including CalDAV `PROPFIND`, `PUT`, and `DELETE` methods and the `Authorization` header. Calendar credentials are stored locally only when “Remember credentials on this device” is enabled.
# Username authentication setup

Username accounts use Supabase Auth for password hashing and sessions. The app never stores or sends plaintext passwords to a database table. Supabase Auth uses an internal, non-deliverable address for its email identifier; users only enter usernames in the app.

Before username sign-up works on a Supabase project, apply the database migration and deploy the Edge Function:

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy username-auth --no-verify-jwt
```

The project reference is the subdomain in the Supabase project URL. The Edge Function uses the platform-provided `SUPABASE_SERVICE_ROLE_KEY` server-side; do not put a service-role or secret key in `.env` or frontend code. Sign-in uses Supabase Auth directly and does not require the Edge Function. Usernames are 3–24 lowercase letters, numbers, dots, underscores, or hyphens; passwords must be 12–128 characters.

## Public holidays in Calendar

The Calendar loads the selected year's public holidays from the Nager.Date API, lets each signed-in account/workspace choose a country, and shades Saturdays and Sundays. Existing attendance entries marked as company holidays or leave also appear in the calendar. Country availability follows Nager.Date's supported-country list; if a country is not provided, the calendar keeps showing weekends and manually recorded company holidays. Holiday data requires an internet connection and is not copied into Supabase.

The ntfy settings include priority, tags, and an optional click URL. Reminder messages intentionally contain task counts or generic prompts rather than task titles or timer descriptions, which helps limit private data sent to a topic. Browser-based reminder checks still require the app to be open; reliable delivery while it is closed needs a running companion service or a server-side scheduler.
