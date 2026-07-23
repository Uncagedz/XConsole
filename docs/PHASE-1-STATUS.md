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
  heartbeat, job, and signed HTTP-only dashboard-session endpoints
- Windows Local Agent with DPAPI configuration, heartbeat/polling, backoff,
  redacted logs, headed Playwright recording, and sanitized failure artifacts
- Dashboard Phase 1 routes, connector health/detail pages, and inventory source
  status
- Unified live inventory bridge to the preserved synchronizer, including rich
  VIN normalization, photo/search/filter/sort UI, explicit refresh, 30-second
  gateway caching, last-good-data fallback, and PostgreSQL upsert on live sync
- DriveCentric extension build repair, explicit context ingestion, server-side
  gateway forwarding, and inventory suggestions
- Existing AI prompt/provider/evaluator behavior preserved; subscription and
  billing routes are not mounted
- Docker Compose, Railway service definitions, GitHub Actions CI, and seven
  disabled n8n workflow exports
- Secret/PII ignore policy and repository scanner
- Explicit legacy CORS allowlists plus request-ID-correlated, sanitized 500
  responses
- Top-level legacy API authentication with public health only, Basic/session
  dashboard access, and a separate service bearer token for connector wrappers
- Scoped service-token permissions that work through route-level checks without
  granting user administration
- Explicit Chrome-extension CORS allowlist and validated connector state changes
- Original FastAPI/dashboard tools retained for rollback compatibility
- Runtime dashboard API proxy, restored `aniextension.up.railway.app` domain,
  persistent JD Power valuation storage, and VIN-level LTV display
- ReconVision and 1Micro queued VIN-lookup pipeline with dashboard polling,
  persistent job results, normalized recon/key history, separate Local Agent
  browser profiles, manual login/MFA, and headless routine execution
- Dedicated dashboard Messenger workspace that opens Messenger in a reusable
  browser window without proxying Facebook credentials or cookies through XConsole

## Connector truth table

| Connector | Phase 1 state | Evidence | Live status |
| --- | --- | --- | --- |
| Dealership website | Wrapped | Existing live-sync endpoints, normalized gateway bridge, unit tests, and local browser smoke against the packaged live cache | Read path exercised with 1,115 VIN records; external website refresh still requires a successful current sync |
| Facebook Marketplace | Wrapped | Draft/status adapters + fixture test; Selenium entry point preserved | Not live-tested; write path queues approval |
| DriveCentric | Wrapped | 24 extension parser tests + normalized ingestion fixture | Read/ingest fixture-tested; no automatic sending |
| RouteOne / Bank Brain | Wrapped | Existing import/rebuild boundaries + fixture test | Not portal-tested; review required |
| vAuto | Skeleton | Config/result/health fixture | Not configured |
| ReconVision | Recording-ready lookup | Synthetic result normalization + queued Local Agent job tests | Portal URL/selectors and manual login still required |
| 1Micro | Recording-ready lookup | Synthetic result normalization + queued Local Agent job tests | Portal URL/selectors and manual login still required |
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
- `pnpm test`: 111 tests passed
- `python -m pytest -q`: 104 tests passed
- `pnpm build`: passed for all 14 workspace projects
- `pnpm security:check`: passed across 485 tracked and pending files
- Prisma validate and client generation: passed
- `pnpm db:deploy`: passed against PostgreSQL 16 in GitHub Actions
- Gateway health and auth smoke: passed
- Unified inventory browser smoke: 1,115 VIN records, 1,053 active, 62 in
  transit; search/detail and last-good-data behavior passed
- Real Local Agent DPAPI registration/startup/heartbeat smoke: passed; temporary
  encrypted config and processes were removed
- Full GitHub Actions validation passed in
  [run 30032653958](https://github.com/Uncagedz/Xconsole-Dealership-Tool/actions/runs/30032653958)

## Production state

- Canonical GitHub source: `Uncagedz/XConsole`, branch `main`
- Railway services currently online: dashboard, gateway API, AI API, PostgreSQL,
  and the preserved legacy automation adapter
- Dashboard public URL: `https://aniextension.up.railway.app`
- Redis, n8n, and the scheduler remain prepared in source but are not provisioned
  in Railway. PostgreSQL remains the durable job source, so their absence does
  not block Local Agent VIN lookups.
- JD Power workbook import was live-tested with 825 valid VIN values and verified
  after a legacy-service redeploy.

## External validation still required

- Migration deployment was not executed on the workstation because it has no
  Docker, PostgreSQL server, or listener on port 5432. The complete migration
  chain deployed successfully against the PostgreSQL 16 service in GitHub
  Actions. Run `pnpm db:deploy` again against the provisioned production
  PostgreSQL service during release.
- No authenticated external portal was used. The user must supply reviewed,
  sanitized recordings for each skeleton listed in `MIGRATION-PLAN.md`.
- ReconVision and 1Micro require the authorized portal URLs, reviewed selectors,
  and a one-time manual login/MFA on the Windows Local Agent. No selector or
  endpoint has been guessed.
- Redis, n8n, and scheduler credentials/services may be provisioned when their
  optional orchestration workflows are activated.

## Security actions

The tracked Facebook session-cookie file was removed and its class of artifact
is now ignored/scanned. Revoke or rotate that Facebook session before any live
testing because Git history still contains the prior value. The legacy
hard-coded Basic credential was also removed from both service copies. The
legacy compatibility header is generated only when explicit environment
credentials are supplied, and missing configuration creates no default admin.
The new gateway does not depend on legacy Basic authentication.
