# XConsole Development

## Prerequisites

- Windows 11 for Local Agent and portal automation
- Node.js 22 or 24
- pnpm 11
- Python 3.12
- PostgreSQL 16 and Redis 7, or Docker Desktop

No real dealership, lender, marketplace, or customer credentials are required
for fixture development. Never copy cookies, browser profiles, storage state,
credit applications, or unsanitized portal captures into this repository.

## Install and verify

```powershell
pnpm install --frozen-lockfile
python -m pip install -r requirements-dev.txt
$env:DATABASE_URL = "postgresql://xconsole:xconsole@127.0.0.1:5432/xconsole?schema=public"
pnpm db:validate
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
python -m pytest -q
pnpm build
pnpm security:check
```

On this workstation, set `GIT_EXECUTABLE` to a Git binary before
`pnpm security:check` if Git is not on `PATH`.

## Database

Prisma in `packages/database` is the only migration authority.

```powershell
pnpm db:deploy
pnpm --filter @xconsole/database seed
```

`SEED_OWNER_PASSWORD` is required only when the owner account does not already
exist and must contain at least 12 characters. The seed never supplies a
fallback password.

## Start the cloud-safe services

Create local `.env` files from the examples, use unique random tokens, then:

```powershell
pnpm dev:cloud
```

Default local endpoints:

- Dashboard: `http://127.0.0.1:5173`
- Gateway: `http://127.0.0.1:3001/health`
- AI API: `http://127.0.0.1:4000/health`

The gateway dashboard token is sent as `Authorization: Bearer <token>`.
Production mode refuses the development token and device-registration code.

## Register and run the Windows Local Agent

The Local Agent is never deployed to Railway. It stores its configuration with
Windows DPAPI under `%LOCALAPPDATA%\XConsole` and keeps Playwright profiles and
recordings outside Git.

```powershell
$env:XCONSOLE_GATEWAY_URL = "https://your-gateway.example"
$env:XCONSOLE_DEVICE_REGISTRATION_CODE = "<one-time-registration-code>"
pnpm --filter @xconsole/local-agent register
pnpm --filter @xconsole/local-agent start
```

For an isolated smoke test, set `XCONSOLE_AGENT_DATA_DIR` to a temporary
directory. The agent heartbeats, polls jobs with exponential backoff, rejects
unapproved write jobs, and shuts down on `SIGINT`/`SIGTERM`.

## Capture a portal recording

Only capture accounts you are authorized to access. Complete login and MFA
yourself. The agent does not bypass either.

```powershell
pnpm --filter @xconsole/local-agent record -- "https://authorized-portal.example"
```

Before turning a capture into a fixture:

1. Review the screenshot, HTML, URL, and title manually.
2. Remove names, phones, emails, VIN/customer pairings, account identifiers,
   tokens, cookies, credit data, and financial documents.
3. Keep selectors and response shapes only when the sanitized evidence proves
   them.
4. Mark the connector fixture-tested; do not call it live-tested.

## Activate ReconVision and 1Micro VIN lookups

Use the reviewed recording to identify the real login URL, lookup URL, VIN input,
result container, submit control, and result-field selectors. Configure those
non-secret values with the `configure-portal` command documented in
`apps/local-agent/README.md`, then run:

```powershell
pnpm --filter @xconsole/local-agent portal-login -- reconvision
pnpm --filter @xconsole/local-agent portal-login -- onemicro
pnpm --filter @xconsole/local-agent start
```

Complete login/MFA in the visible Chrome windows. Vehicle pages can then queue
read-only VIN jobs. Routine lookups run headlessly; an authentication challenge
stops the job and requests manual reauthentication instead of bypassing it.

Messenger is available at `/messenger`. It opens a reusable browser window
because Facebook prevents secure Messenger pages from being embedded in an
XConsole iframe.

## Legacy compatibility

The original FastAPI application remains runnable with:

```powershell
$env:XCONSOLE_BASIC_AUTH_USER = "<local-admin-name>"
$env:XCONSOLE_BASIC_AUTH_PASSWORD = "<unique-password>"
$env:XCONSOLE_SESSION_SECRET = "<32+-character-random-secret>"
$env:XCONSOLE_LEGACY_API_TOKEN = "<32+-character-random-service-token>"
pnpm legacy:start
```

Its Facebook Selenium, dealership inventory, and RouteOne/Bank Brain entry
points remain available through explicit legacy commands documented in the
root `package.json`. Only `/api/health` and CORS preflight are unauthenticated.
Configure connector `legacyAuthorization` as `Bearer
<XCONSOLE_LEGACY_API_TOKEN>`. The preserved legacy dashboard instead uses the
explicit Basic credentials and receives an HTTP-only session cookie. New code
should call connector or gateway boundaries.

### Use the live admin inventory in the unified dashboard

The unified gateway now reads the mature FastAPI inventory pipeline instead of
showing only its database seed. Use the same random service token in both
processes.

Legacy API terminal:

```powershell
$env:PORT = "8100"
$env:XCONSOLE_LEGACY_API_TOKEN = "<32+-character-random-service-token>"
pnpm legacy:start
```

Unified stack terminal:

```powershell
$env:LEGACY_AUTOMATION_API_URL = "http://127.0.0.1:8100"
$env:XCONSOLE_LEGACY_API_TOKEN = "<same-service-token>"
$env:XCONSOLE_ALLOW_INSECURE_DEV = "true"
pnpm dev:cloud
```

Open `http://127.0.0.1:5173/inventory`. The gateway caches the normalized read
for 30 seconds. “Sync live inventory” refreshes the legacy website cache and,
when PostgreSQL is configured, upserts the VIN records and dealership source
status into the central database.

`VITE_XCONSOLE_API_TOKEN` is an optional local-development shortcut only. Do
not set it on a deployed dashboard because every `VITE_` value is embedded in
the public JavaScript bundle. In production, configure a separate
`XCONSOLE_DASHBOARD_SESSION_SECRET` on the gateway and use the dashboard
sign-in screen. The access token is exchanged server-side for a signed,
HTTP-only cookie and is not stored by the dashboard.

For the DriveCentric extension, add its exact
`chrome-extension://<extension-id>` origin to `CHROME_EXTENSION_ORIGINS`.
Arbitrary extension origins are rejected.

## Troubleshooting

- `P1012 Environment variable not found`: set `DATABASE_URL`.
- `P1001 Can't reach database`: start PostgreSQL or Docker Desktop.
- Local Agent registration fails: confirm the one-time code and that Windows
  PowerShell can load `System.Security`.
- Extension cannot reach XConsole: verify AI API JWT authentication,
  `XCONSOLE_GATEWAY_URL`, and the server-side gateway token.
- Live portal job is `approval_required`: approve it explicitly after reviewing
  its target and payload; fixture tests never grant approval.
