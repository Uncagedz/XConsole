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

## Legacy compatibility

The original FastAPI application remains runnable with:

```powershell
pnpm legacy:start
```

Its Facebook Selenium, dealership inventory, and RouteOne/Bank Brain entry
points remain available through explicit legacy commands documented in the
root `package.json`. New code should call connector or gateway boundaries.

## Troubleshooting

- `P1012 Environment variable not found`: set `DATABASE_URL`.
- `P1001 Can't reach database`: start PostgreSQL or Docker Desktop.
- Local Agent registration fails: confirm the one-time code and that Windows
  PowerShell can load `System.Security`.
- Extension cannot reach XConsole: verify AI API JWT authentication,
  `XCONSOLE_GATEWAY_URL`, and the server-side gateway token.
- Live portal job is `approval_required`: approve it explicitly after reviewing
  its target and payload; fixture tests never grant approval.
