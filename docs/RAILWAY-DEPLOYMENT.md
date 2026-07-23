# Railway Deployment

## Services

Deploy these cloud services from the same commit:

- `xconsole-gateway-api`
- `xconsole-ai-api`
- `xconsole-dashboard`
- `xconsole-postgres`
- `xconsole-redis`
- `xconsole-n8n`
- `xconsole-scheduler`

The manifests are under `infrastructure/railway`. The Windows Local Agent is
deliberately absent because authenticated portal automation must remain on the
user's registered Windows machine.

## Required configuration

Use Railway secrets, never committed `.env` files:

- `DATABASE_URL`
- `REDIS_URL`
- `XCONSOLE_API_TOKEN` (32+ random characters)
- `XCONSOLE_DASHBOARD_SESSION_SECRET` (a different 32+ character random value)
- `XCONSOLE_DEVICE_REGISTRATION_CODE` (one-time, rotate after registration)
- `CORS_ORIGINS`
- `XCONSOLE_GATEWAY_URL`
- `XCONSOLE_GATEWAY_TOKEN`
- AI provider key and model settings required by `apps/ai-api`

Use the per-service `.env.example` files as the variable inventory. Do not
deploy billing/subscription variables; Phase 1 disables those routes.

## Release order

1. Provision PostgreSQL and Redis.
2. Run `pnpm db:deploy` as a one-off migration command.
3. Run `pnpm --filter @xconsole/database seed` with
   `SEED_OWNER_PASSWORD` set for the first release only.
4. Deploy gateway and verify `/health`.
5. Deploy AI API and verify `/health`.
6. Deploy the workflow orchestrator. Keep the legacy compatibility service
   local unless its cloud-safe parsing/import boundary is explicitly needed.
7. Deploy the dashboard with `VITE_GATEWAY_API_URL` pointing at the public
   gateway and add the dashboard origin to the gateway `CORS_ORIGINS`.
   Never set `VITE_XCONSOLE_API_TOKEN` in a production dashboard build: Vite
   variables are public browser code. Enter `XCONSOLE_API_TOKEN` on the
   dashboard sign-in screen instead; the gateway exchanges it for a signed,
   HTTP-only session cookie.
8. Register the Windows Local Agent, then rotate the registration code.
9. Import disabled n8n workflows from `workflows/n8n`, bind credentials, review
   every node, and enable workflows individually.

## Release checks

```powershell
pnpm install --frozen-lockfile
pnpm security:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:validate
pnpm db:generate
pnpm db:deploy
```

The deployment is not complete until gateway health, authenticated dashboard
reads, AI health, and a Local Agent heartbeat are observed. Portal connectors
remain disabled or approval-required until a sanitized recording has been
reviewed.

## Rollback

The database migration is additive. Roll back services to the preceding commit
without dropping tables, disable affected connectors/workflows, and use the
documented legacy startup path. Never roll back by deleting production data or
reusing an old browser session.
