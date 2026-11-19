# Integration QA — 2026-11-18

## Initial finding resolved
The active development checkout originally showed an integrations placeholder. It now has configuration and import flows for three open-source services: Vikunja, Forgejo, and Nextcloud.

## Implemented
- Vikunja: test API token against the current v2 API, load projects, and import open tasks.
- Forgejo: test token, load repositories, and import open issues as tasks.
- Nextcloud: test WebDAV access, list files, and import `.md` / `.txt` files as notes.
- Credentials are session-only by default. Users can opt in to remembering them in browser local storage; credentials are not synced to Supabase.
- Imports keep workspace-scoped duplicate markers. Nextcloud file imports are limited to files under the configured account path and up to 1 MB.
- Added setup links and actionable errors for missing configuration, network, and browser CORS failures.
- Pre-filled editable hosted defaults for Vikunja Cloud (`https://app.vikunja.cloud`) and Codeberg (`https://codeberg.org`). Nextcloud requires the user’s own server URL because there is no universal Nextcloud host.
- Existing blank saved host values now fall back to the hosted default. API paths are appended automatically; users should enter only the instance base URL.
- Added ntfy publishing with due-task reminders, task-timer completion alerts, and a daily task briefing. Alerts use the workspace timezone and run while the app is open; the provider settings must be remembered locally for scheduled delivery.
- Added Radicale CalDAV connection checks and manual sync. The sync imports events, publishes new and edited workspace events, and sends local deletions; remote deletions are retained locally to avoid accidental data loss. Repeat rules for daily, weekly, and weekday events are preserved.

## Verification
- Signed in to the local app with the provided demo account and opened Integrations using agent-browser.
- Verified all three providers render their URL/credential fields and Test connection controls; import actions remain disabled until a connection and data load succeed.
- Clicked Test connection with blank settings and confirmed each card reports an actionable setup error without sending a network request.
- Verified credential show/hide toggles.
- Browser console had no application errors.
- Rechecked the refreshed development page with agent-browser: Vikunja Cloud and Codeberg defaults render correctly, their API path hints are visible, and Nextcloud’s base URL stays blank for the user’s server.
- Verified ntfy and Radicale cards, reminder settings, CalDAV fields, and sync actions render in agent-browser. Checked that missing ntfy topics and missing Radicale credentials produce clear errors without sending external requests.
- `npm run lint` passed.
- `npm run build` passed. Vite reports the existing large JavaScript chunk advisory.

## Live service verification still needed
No service credentials were supplied, so successful ntfy delivery and real CalDAV import/export could not be exercised. The service administrators also need to permit requests from the Lethargic Desk origin through CORS. ntfy uses HTTP POST to publish with optional title, tags, priority, and access token ([official publish docs](https://docs.ntfy.sh/publish/)). Radicale is a CalDAV/CardDAV server ([official docs](https://radicale.org/v3.html)). Vikunja now uses its recommended v2 API and Bearer token authentication ([official v2 docs](https://vikunja.io/docs/api-v2/)); Forgejo uses `Authorization: token ...` ([official docs](https://forgejo.org/docs/latest/user/api/usage/)); Nextcloud file access uses WebDAV ([official docs](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html)).

## Evidence
- `integrations-page-updated.png` — updated rendered integration cards.
- `integrations-page.png` — initial placeholder state before implementation.
