# Railway service layout

The canonical deployment is one Railway project backed only by
`Uncagedz/XConsole` on `main`. The root Dockerfile builds the shared production
image once and `tools/railway_dispatch.mjs` selects the service role from
`RAILWAY_SERVICE_NAME`. This makes the root `railway.json` valid for every
application service. Preserve the existing legacy service and its `/app/Bank`
volume because it owns the live inventory cache and `xconsole.up.railway.app`.

Core services:

- `xconsole-legacy-automation`: root `railway.json` (legacy is the dispatcher fallback)
- `xconsole-postgres`: Railway PostgreSQL
- `xconsole-ai-api`: root `railway.json`
- `xconsole-gateway-api`: root `railway.json`
- `xconsole-dashboard`: root `railway.json`

The scheduler, Redis, and n8n services in `services.json` are optional until a
production workflow requires them. Attach `xconsole-postgres` to the gateway
and AI services with Railway reference variables. Keep the Local Agent on
Windows.

Never remove a superseded project until its database has been audited or
backed up and all replacement health checks pass.
