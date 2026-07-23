# XConsole Architecture

## Scope

XConsole is a single-user dealership sales operating system for accounts the user is authorized to access. It has no subscriptions, billing, tenant provisioning, employee directory, public onboarding, or general-purpose RBAC. Authentication exists only to protect the dashboard, DriveCentric extension, cloud APIs, and the user's registered Windows device.

## System boundaries

```text
DriveCentric extension ─┐
                       ├── HTTPS ──> Gateway API ──> PostgreSQL
Dashboard ─────────────┘                 │              │
                                        ├──> AI API    ├──> Redis jobs
                                        │              │
                                        ├──> Legacy automation API (cloud-safe calls only)
                                        │
                                        └── secure jobs/heartbeat
                                                   │
                                      Windows XConsole Local Agent
                                                   │
                         Playwright + preserved Selenium connectors
                                                   │
                              Authorized dealership portals/accounts
```

## Monorepo layout

```text
apps/
  dashboard/                 React/Vite personal dashboard
  gateway-api/               Express API, auth, connector/job/vehicle endpoints
  ai-api/                    preserved AI provider, prompts, evaluator, logs
  legacy-automation-api/     existing FastAPI/Python compatibility service
  drivecentric-extension/    existing Manifest V3 extension
  local-agent/               Windows Node/TypeScript browser worker
  workflow-orchestrator/     scheduler/n8n integration boundary
connectors/
  dealership-website/
  facebook-marketplace/
  drivecentric/
  routeone-bank-brain/
  vauto/
  reconvision/
  onemicro/
  carfax/
  window-sticker/
  accutrade/
  reynolds/
  craigslist/
  offerup/
packages/
  contracts/
  database/
  connector-sdk/
  ui/
  ai-prompts/
  logging/
  configuration/
workflows/n8n/
infrastructure/{railway,docker,github-actions}/
docs/
legacy/
```

`legacy/` is a temporary compatibility boundary. It is not the target architecture and receives only security fixes, tests, and adapter hooks until each feature is migrated.

## Key decisions

### Database and migrations

Prisma is the sole schema and migration authority. `packages/database/prisma/schema.prisma` owns PostgreSQL. Python may read or write through authenticated gateway endpoints or explicit SQL clients, but it must never run schema migrations or create/alter tables.

The existing Prisma migrations are retained as historical input. XConsole adds normalized models for:

- identity/device: `User`, `Device`
- inventory: `Vehicle`, `VehicleSourceSnapshot`, `InventoryStatus`
- sales: `Customer`, `Lead`, `Conversation`, `Message`, `Appointment`, `Task`
- operations: `ReconRecord`, `KeyRecord`, `CarfaxSummary`, `WindowSticker`, `Appraisal`
- marketplace: `MarketplaceListing`, `MarketplacePostingAttempt`
- Bank Brain: `Lender`, `LenderProgram`, `LenderRule`, `LenderProgramVersion`, `DealStructure`, `ApprovalRecommendation`
- automation: `Connector`, `ConnectorRun`, `ConnectorError`, `AutomationJob`
- governance/AI: `AuditLog`, `AiGeneration`

VIN is normalized to uppercase 17-character form and is the primary reconciliation key. Stock number is indexed and treated as a secondary, source-scoped identifier.

### API strategy

`apps/gateway-api` is the only API used directly by the dashboard, extension, or Local Agent. It owns authentication, input validation, rate limiting, audit logging, device registration, job leasing, connector health, vehicle/customer reads, and compatibility proxy calls.

`apps/ai-api` retains the existing prompt builder, provider abstraction, evaluator, and AI logs. In Phase 1 it may be deployed independently or run in-process behind the gateway, but it never exposes an OpenAI key to a browser.

`apps/legacy-automation-api` is the existing FastAPI service with stable endpoints preserved. It is an internal adapter, not a public browser API. Browser-capable endpoints are disabled in Railway and delegated to Local Agent jobs.

### Shared contracts

`packages/contracts` exports Zod schemas and inferred TypeScript types. It defines vehicles, customers/leads, connector metadata/configuration/results, connector health, devices, heartbeats, jobs, and API envelopes. Every boundary validates unknown data before use.

Python compatibility endpoints use JSON representations generated from the same documented schema. Phase 1 avoids a second schema generator and tests representative Python payloads against gateway schemas.

### Connector contract

Every connector implements:

```ts
interface XConsoleConnector<TConfig, TRecord> {
  readonly metadata: ConnectorMetadata;
  readonly configSchema: ZodType<TConfig>;
  healthCheck(context: ConnectorContext<TConfig>): Promise<ConnectorHealth>;
  sync(context: ConnectorContext<TConfig>): Promise<ConnectorSyncResult<TRecord>>;
}
```

The SDK wraps execution to guarantee start/finish timestamps, counts, typed errors, retry count, reauthentication state, last-success metadata, and optional artifact references. Connectors never return raw credentials or authorization headers.

### Local Agent communication

Phase 1 uses HTTPS job polling plus heartbeat rather than a permanent WebSocket. Polling is easier to recover after laptop sleep, firewall changes, Railway deploys, and network transitions.

- Device registration produces a revocable one-time token exchange.
- The stored device secret is encrypted with Windows DPAPI.
- Each request uses a device identifier and bearer token.
- Jobs use leases, attempt counters, idempotency keys, and explicit completion/failure calls.
- The agent sends a heartbeat every 30 seconds and uses exponential backoff with jitter.
- High-risk writes require an approved job state before execution.

A WebSocket notification channel can be added later without changing job semantics.

### Job queue

PostgreSQL is the durable source of job truth. Redis provides short-lived queue notification, rate limiting, and locks. The scheduler and n8n create jobs through the gateway; Local Agent leases only jobs assigned to its device/capabilities.

### n8n

n8n orchestrates schedules and calls authenticated gateway endpoints. It does not own dealership records, connector state, or lender rules. Importable workflow JSON uses environment variables for URLs/tokens and contains no credentials.

### Browser automation

- Local Agent owns Playwright, installed Chrome/Chromium selection, recording mode, screenshots, and sanitized HTML.
- Existing Facebook Selenium and RouteOne Selenium remain callable as child processes during Phase 1.
- No automation bypasses MFA, CAPTCHA, access controls, or vendor restrictions.
- Authentication challenges return `reauthenticationRequired: true`.
- Recording output defaults outside Git, strips password inputs, sensitive input values, inline tokens, authorization-like text, cookies, and storage state.

### Deployment boundaries

Railway:

- `xconsole-dashboard`
- `xconsole-gateway-api`
- `xconsole-ai-api`
- `xconsole-postgres`
- `xconsole-redis`
- `xconsole-n8n`
- `xconsole-scheduler`
- optional internal `legacy-automation-api` with browser execution disabled

Windows only:

- `xconsole-local-agent`
- all interactive browser profiles and portal automation
- user-approved report capture/download

### Observability

Structured JSON logs include service, request/job/run ID, connector ID, level, event, duration, and sanitized error classification. Connector runs persist:

- start/finish/success
- records found/created/updated/skipped
- error type and safe message
- artifact references
- reauthentication flag
- retry count
- last successful sync

Authorization headers, cookies, passwords, raw HTML, full customer credit data, and device secrets are never logged.

## Security model

- The Phase 1 owner dashboard exchanges its gateway token for a signed,
  short-lived, HTTP-only session cookie. The gateway token is never compiled
  into a production dashboard bundle. Multi-user access and rotating refresh
  sessions remain a later identity milestone.
- Extension tokens are scoped to extension ingestion/AI/inventory reads and explicit feedback.
- Device tokens are independently revocable and cannot act as a dashboard user.
- Sensitive routes are rate-limited and all writes are audited.
- Read connectors may run automatically.
- Marketplace publishing and other high-risk writes require approval in Phase 1.
- Credit application submission and customer application changes are not implemented.

## Connector execution locations

| Connector | Phase 1 state | Location |
| --- | --- | --- |
| dealership-website | Wrapped/implemented | Railway-safe |
| facebook-marketplace | Wrapped around Selenium | Local Agent |
| drivecentric | Extension ingestion implemented; browser skeleton | Extension + Local Agent |
| routeone-bank-brain | Manual import/rebuild wrapped; browser sync local | Railway-safe parser + Local Agent browser |
| vAuto | Skeleton/recording | Local Agent |
| ReconVision | Skeleton/recording | Local Agent |
| 1Micro | Skeleton/recording | Local Agent |
| CARFAX | Skeleton/recording | Local Agent |
| window-sticker | Skeleton/import | Railway-safe where URL/file is supplied |
| AccuTrade | Skeleton/recording | Local Agent |
| Reynolds | Skeleton/report import | Local Agent/import |
| Craigslist | Skeleton/approval write | Local Agent |
| OfferUp | Skeleton/approval write | Local Agent |

## Active migration controls

- `LEGACY_AUTOMATION_API_URL` and `XCONSOLE_LEGACY_API_TOKEN` connect the
  gateway to the preserved inventory synchronizer through an authenticated
  server-to-server boundary.
- `LEGACY_INVENTORY_CACHE_TTL_MS` limits duplicate reads of the large inventory
  payload.
- Explicit sync persists normalized VIN records into Prisma/PostgreSQL when the
  database-backed gateway store is active.
- `CHROME_EXTENSION_ORIGINS` contains only reviewed DriveCentric extension
  origins.

Legacy startup remains available for Facebook, RouteOne/Bank Brain, and admin
rollback compatibility. The unified inventory route no longer depends on a
synthetic gateway seed when the adapter is configured.

## Error and reauthentication semantics

Errors use stable categories: `configuration`, `authentication`, `reauthentication_required`, `authorization`, `validation`, `selector_changed`, `network`, `rate_limited`, `portal_unavailable`, `parse`, `timeout`, `cancelled`, and `internal`.

MFA/CAPTCHA/password challenges are not retried as ordinary failures. They create an actionable connector error, keep the browser/session under user control, and wait for manual reauthentication.
