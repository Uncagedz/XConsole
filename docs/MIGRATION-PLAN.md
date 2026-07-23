# XConsole Migration Plan

## Delivery target

The connected GitHub tooling does not provide repository creation, so Phase 1 is built on:

```text
Uncagedz/Xconsole-Dealership-Tool
branch: feature/xconsole-unification
```

Later, mirror the branch history into `Uncagedz/XConsole` and make that repository the deployment source.

## Migration principles

- Add adapters before removing code.
- Preserve Facebook behavior; change its invocation boundary, not its form logic.
- Preserve DriveCentric parsing fixtures and restore the current build before adding ingestion.
- Make each stage independently buildable and reversible.
- Keep Prisma as the only migration authority.
- Keep portal selectors unknown until a reviewed recording proves them.
- Label all connectors as live-tested, fixture-tested, wrapped, or skeleton.

## Stage 0: Baseline and containment

1. Record source SHAs and baseline test/build results.
2. Create `feature/xconsole-unification`.
3. Remove tracked Facebook cookie state and expand ignore rules.
4. Add secret/PII fixture checks.
5. Retain the old Railway/startup files under documented legacy commands.

Exit criteria:

- Required audit documents exist.
- No browser auth state remains tracked on the branch.
- Baseline failures are documented rather than misreported as regressions.

## Stage 1: Workspace foundation

1. Establish npm workspaces for `apps/*`, `packages/*`, and `connectors/*`.
2. Move the current dashboard to `apps/dashboard`.
3. Copy the FastAPI application and its tools into `apps/legacy-automation-api` without deleting root compatibility files.
4. Import the DriveCentric extension into `apps/drivecentric-extension`.
5. Import the Express/Prisma API into `apps/ai-api`.
6. Add common TypeScript, lint, test, and build scripts.

Exit criteria:

- Root install is deterministic.
- Dashboard, AI API, extension, and legacy compatibility tests have explicit commands.

## Stage 2: Contracts, database, and gateway

1. Create `packages/contracts` with Zod schemas for connector, vehicle, customer/lead, device, heartbeat, job, and API payloads.
2. Create `packages/database` and move Prisma ownership there.
3. Add all required normalized models and an additive migration.
4. Create `apps/gateway-api` with:
   - `/health`
   - `/api/connectors`
   - `/api/connectors/:id`
   - `/api/connectors/:id/runs`
   - `/api/connectors/:id/retry`
   - `/api/vehicles`
   - `/api/vehicles/:vin`
   - `/api/devices/register`
   - `/api/agent/heartbeat`
   - `/api/agent/jobs/lease`
   - `/api/agent/jobs/:id/complete`
   - `/api/extension/drivecentric/context`
5. Add request IDs, schema validation, authentication, rate limiting, audit logging, and safe errors.

Exit criteria:

- Contracts and connector-result validation tests pass.
- Prisma validates/generates and migrations can deploy to PostgreSQL.
- Gateway health and authenticated boundary tests pass.

## Stage 3: Connector SDK and Local Agent

1. Create `packages/connector-sdk`.
2. Add the common execution wrapper and typed error classes.
3. Create `apps/local-agent`:
   - device token storage using Windows DPAPI
   - heartbeat and job polling
   - retry/backoff and graceful shutdown
   - structured logs
   - Playwright browser factory
   - failure screenshots/HTML
   - recording and sanitization command
4. Keep all artifacts outside Git by default.

Exit criteria:

- Agent starts without portal credentials.
- Agent registration/heartbeat works against a fixture gateway.
- Recording sanitizer tests prove password/token/cookie/SSN removal.

## Stage 4: Required connector migration

### Dealership website

- Adapter calls the preserved inventory synchronizer.
- Normalize by VIN into `Vehicle`, `VehicleSourceSnapshot`, and `InventoryStatus`.
- Add fixture tests for create/update/skip counts.

### Facebook Marketplace

- Add connector metadata/config/result wrapper.
- Draft mode calls preserved description/image preparation.
- Live mode queues an approval-required Local Agent job that invokes the existing Selenium entry point.
- Preserve status polling, VIN state, retry behavior, and preflight checks.

### DriveCentric

- Restore the extension build with a minimal source repair.
- Preserve parser fixtures.
- Add normalized context ingestion to the gateway.
- Add inventory suggestion response fields for price, recon, and key state.
- Keep sending under explicit user action only.

### RouteOne / Bank Brain

- Wrap manual import and Bank Brain rebuild as child-process/module jobs.
- Store source/effective/import/review/confidence/verification/superseded metadata.
- Require human approval before a lender program version becomes recommendation-eligible.
- Keep RouteOne browser synchronization on Local Agent.

Exit criteria:

- All four connectors validate structured results.
- Facebook live code remains present and callable but is not falsely reported as live-tested.
- No lender recommendation uses unreviewed extracted rules.

## Stage 5: Connector skeletons

Create compile-ready connectors for vAuto, ReconVision, 1Micro, CARFAX, window sticker, AccuTrade, Reynolds, Craigslist, and OfferUp. Each contains metadata, Zod configuration, health/sync methods, synthetic fixtures, unit tests, explicit TODOs, and a portal-information checklist.

Exit criteria:

- Every skeleton returns `not_configured` or fixture data; none invents selectors/endpoints.
- Write-capable skeletons require approved jobs.

## Stage 6: Dashboard

1. Preserve the existing UI and route it through the gateway client.
2. Provide all Phase 1 routes:
   - `/dashboard`
   - `/inventory`
   - `/inventory/:vin`
   - `/leads`
   - `/customers/:id`
   - `/tasks`
   - `/marketplace`
   - `/bank-brain`
   - `/connectors`
   - `/connectors/:connectorId`
   - `/settings`
3. Add connector health cards/table and detail page.
4. Add vehicle source status and last-sync/error display.
5. Clearly label fixture/mock/unconfigured connectors.

Exit criteria:

- Dashboard build passes.
- Health/source-status UI has contract-backed component tests.

## Stage 7: Workflows and infrastructure

1. Add importable n8n JSON for inventory sync, opportunity engine, price-drop reactivation, marketplace queue, recon delay, Bank Brain refresh, and CIT monitor.
2. Add Docker Compose for PostgreSQL, Redis, gateway, AI API, dashboard, n8n, and scheduler.
3. Add per-service Railway definitions.
4. Add CI for install, secret checks, type-check, lint, tests, builds, Prisma validation, and migration verification.
5. Add `.env.example` files and setup/runbooks.

Exit criteria:

- No Local Agent Railway definition exists.
- Workflow credentials are environment references only.
- CI commands match local commands.

## Stage 8: Validation and release

Run:

```text
install
type-check
lint
unit tests
integration tests
production builds
prisma validate/generate/migrate deploy
gateway smoke
AI API smoke
Local Agent heartbeat smoke
legacy FastAPI health smoke
```

Record each feature as:

- live-tested
- fixture-tested
- build-tested
- preserved but not exercised
- blocked by authenticated portal access

## Rollback

- Root legacy application files and startup commands remain until Phase 1 validation completes.
- Gateway feature flags can route inventory and connector health back to legacy reads.
- New Prisma changes are additive; rollback disables new services rather than dropping tables.
- Facebook live mode can be disabled independently while draft mode stays available.
- Local Agent jobs are idempotent and leased; failed deployments do not imply duplicate writes.

## Portal access required after Phase 1

For each skeleton, the user should run recording mode after manually completing login/MFA and navigating to the exact target page. Needed recordings:

- vAuto active inventory table and vehicle detail/price history
- ReconVision vehicle queue and recon work-order detail
- 1Micro key search/result and key-holder detail
- CARFAX authorized summary/report landing page
- AccuTrade appraisal list and appraisal detail
- Reynolds authorized report export screen/sample sanitized report
- Craigslist vehicle listing form and confirmation page
- OfferUp vehicle listing form and confirmation page

Recordings must be reviewed and sanitized before being copied into test fixtures.

## Recommended commit sequence

1. `docs: audit existing XConsole systems and migration architecture`
2. `chore: establish secure XConsole monorepo workspaces`
3. `feat: add shared contracts database and connector SDK`
4. `feat: add gateway API and connector health persistence`
5. `feat: add Windows Local Agent and recording mode`
6. `feat: wrap inventory Facebook and RouteOne connectors`
7. `feat: migrate DriveCentric extension and AI API`
8. `feat: add connector health and vehicle source dashboard`
9. `chore: add workflows Railway Docker and CI`
10. `test: validate unified Phase 1 stack`
