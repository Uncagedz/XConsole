# Phase 1 Status

Status date: 2026-07-23

## Source baseline

- `Uncagedz/Xconsole-Dealership-Tool` at `3c1cb06`
- `Uncagedz/AI-sales-Extension` at `c8bd1e1`
- Integration branch: `feature/xconsole-unification`
- Canonical deployment repository: `Uncagedz/XConsole`, branch `main`

## Implemented

- pnpm monorepo with apps, packages, connectors, workflows, and infrastructure
- Shared Zod contracts and connector SDK
- Central additive Prisma schema, migration, secure seed, validation, and
  generated client
- Authenticated Express gateway with connector, inventory, extension, device,
  heartbeat, and job endpoints
- Windows Local Agent with DPAPI configuration, heartbeat/polling, backoff,
  redacted logs, headed Playwright recording, and sanitized failure artifacts
- Dashboard Phase 1 routes, connector health/detail pages, and inventory source
  status
- DriveCentric extension build repair, explicit context ingestion, server-side
  gateway forwarding, and inventory suggestions
- Existing AI prompt/provider/evaluator behavior preserved; subscription and
  billing routes are not mounted
- Docker Compose, Railway service definitions, GitHub Actions CI, and seven
  disabled n8n workflow exports
- Secret/PII ignore policy and repository scanner
- Explicit legacy CORS allowlists plus request-ID-correlated, sanitized 500
  responses
- Original FastAPI/dashboard tools retained for rollback compatibility

## Connector truth table

| Connector | Phase 1 state | Evidence | Live status |
| --- | --- | --- | --- |
| Dealership website | Wrapped | Existing live-sync endpoints + synthetic fixture test | Preserved, not re-exercised against dealer site |
| Facebook Marketplace | Wrapped | Draft/status adapters + fixture test; Selenium entry point preserved | Not live-tested; write path queues approval |
| DriveCentric | Wrapped | 24 extension parser tests + normalized ingestion fixture | Read/ingest fixture-tested; no automatic sending |
| RouteOne / Bank Brain | Wrapped | Existing import/rebuild boundaries + fixture test | Not portal-tested; review required |
| vAuto | Skeleton | Config/result/health fixture | Not configured |
| ReconVision | Skeleton | Config/result/health fixture | Not configured |
| 1Micro | Skeleton | Config/result/health fixture | Not configured |
| CARFAX | Skeleton | Config/result/health fixture | Not configured |
| Window sticker | Skeleton | Config/result/health fixture | Not configured |
| AccuTrade | Skeleton | Config/result/health fixture | Not configured |
| Reynolds & Reynolds | Skeleton | Config/result/health fixture | Not configured |
| Craigslist | Skeleton | Config/result/health fixture | Not configured; approval required |
| OfferUp | Skeleton | Config/result/health fixture | Not configured; approval required |

No connector is labeled live-tested without a successful authenticated portal
run during this phase.

## Verification completed

- `pnpm typecheck`: passed
- `pnpm lint`: passed (warnings only in preserved imported code)
- `pnpm test`: 91 tests passed
- `python -m pytest -q`: 86 tests passed
- `pnpm build`: passed for all 14 workspace projects
- `pnpm security:check`: passed across 479 tracked and pending files
- Prisma validate and client generation: passed
- `pnpm db:deploy`: passed against PostgreSQL 16 in GitHub Actions
- Gateway health and auth smoke: passed
- Real Local Agent DPAPI registration/startup/heartbeat smoke: passed; temporary
  encrypted config and processes were removed
- Full GitHub Actions validation passed in
  [run 30032653958](https://github.com/Uncagedz/Xconsole-Dealership-Tool/actions/runs/30032653958)

## External validation still required

- Migration deployment was not executed on the workstation because it has no
  Docker, PostgreSQL server, or listener on port 5432. The complete migration
  chain deployed successfully against the PostgreSQL 16 service in GitHub
  Actions. Run `pnpm db:deploy` again against the provisioned production
  PostgreSQL service during release.
- No authenticated external portal was used. The user must supply reviewed,
  sanitized recordings for each skeleton listed in `MIGRATION-PLAN.md`.
- Railway services, Redis, n8n credentials, and production origins/tokens must
  be provisioned in the user's accounts.

## Security actions

The tracked Facebook session-cookie file was removed and its class of artifact
is now ignored/scanned. Revoke or rotate that Facebook session before any live
testing because Git history still contains the prior value. The legacy
hard-coded Basic credential was also removed from both service copies. The
legacy compatibility header is generated only when explicit environment
credentials are supplied, and missing configuration creates no default admin.
The new gateway does not depend on legacy Basic authentication.
