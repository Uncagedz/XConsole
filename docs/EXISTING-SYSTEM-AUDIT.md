# XConsole Existing System Audit

Audit date: 2026-07-23  
Source revisions:

- `Uncagedz/Xconsole-Dealership-Tool` at `3c1cb06`
- `Uncagedz/AI-sales-Extension` at `c8bd1e1`

## Executive summary

The dealership repository contains the broadest working dealership functionality, but it is a mixed Python/React/TypeScript deployment with a 12,000+ line FastAPI router, file-backed persistence, embedded authentication defaults, and cloud-hosted Selenium. The AI extension repository is already closer to a monorepo and supplies the strongest foundation for typed contracts, Express security middleware, Prisma/PostgreSQL, AI provider isolation, logging, and the Manifest V3 extension. Its checked-in head is not currently reproducible: several packages depend on build artifacts that are not built by package-local commands, AI tests disagree with the current prompt code, and the extension source has unbalanced JSX.

The safe migration is additive. Keep the dealership repository history and working Python/Selenium code intact behind adapters, import the extension and Express code as first-class workspaces, make Prisma the only schema migration authority, and move all interactive browser execution to a Windows Local Agent.

## Repository 1: Xconsole-Dealership-Tool

### Entry points and frameworks

| Area | Entry point | Stack | Current role |
| --- | --- | --- | --- |
| Dashboard | `src/main.tsx`, `src/App.tsx` | React 18, Vite 5, React Router, Zustand | Main XConsole UI |
| Cloud/API host | `app/main.py` | FastAPI, Uvicorn | API plus built SPA hosting |
| API implementation | `app/api.py` | Python/Pydantic/httpx/BeautifulSoup/Selenium | Inventory, vehicles, Facebook, Bank Brain, leads, CARFAX, admin |
| Railway launcher | `tools/railway_start.py` | Python subprocess manager | Starts FastAPI and sales-assistant backend |
| Sales assistant API | `sales-assistant/backend/src/index.ts` | Fastify 4, TypeScript | Bank and vehicle-report helper API |
| Sales assistant UI | `sales-assistant/frontend/src/main.tsx` | React 18, Vite 5 | Standalone deal/bank assistant |
| Facebook live automation | `automation/facebook-marketplace-lister/Lister.py` | Selenium/Chrome | Existing draft/live Marketplace workflow |
| RouteOne automation | `tools/routeone_bank_docs_sync.py` | Selenium/Chrome or Edge | Authorized document/report collection |
| RouteOne manual import | `tools/routeone_manual_import.py` | Python | Imported download processing |
| Bank Brain rebuild | `tools/rebuild_bank_brain.py` | Python/PDF/Office parsers | Lender profile extraction |

### Preservable functionality found

- Website inventory source discovery, fetch, normalization, cache, source diagnostics, active-inventory endpoints, VIN handling, and vehicle assets.
- Facebook draft generation, image import/relink/suggestion, saved-session preflight, live posting, batch/background posting, status files, retry logic, and VIN-level status.
- RouteOne automated document synchronization, manual import, decoded-document output, and Bank Brain rebuilding.
- JD Power trade values, CARFAX summary support, sales assistant, Railway startup, and API/UI tests.
- Existing feature flags and runtime directories that can be retained during the transition.

### Persistence

There is no relational schema authority. State is spread across `data/`, `runtime/`, external bank folders, JSON status files, and generated JSON lender profiles. The Python service has no ORM migration system. This makes it safe for Prisma to become the sole database migration authority.

### Deployment

- Root `Dockerfile` installs Node, Python, Chromium, ChromeDriver, all three application dependency trees, builds the dashboard, and starts multiple processes.
- `railway.json` exposes FastAPI health at `/api/health`.
- Railway currently contains Chromium/Selenium even though the target architecture requires interactive browser automation to remain on the Windows device.
- The launcher defaults to public port `8100` and child sales-assistant port `4300`.

### Tests and measured baseline

- Root Vitest: 1/1 test passed.
- Root Vite production build: passed.
- Sales-assistant frontend build: passed.
- Sales-assistant backend: package declares a test command but has no tests; Vitest exits 1. A package-local install/build also fails in the audited environment because workspace dependency assumptions are not declared.
- Python tests could not be reproduced from `requirements.txt` because `pytest` is not declared.

### Security findings

Severity is relative to this personal system, not to a public SaaS product.

| Severity | Finding | Evidence / impact | Required treatment |
| --- | --- | --- | --- |
| Critical | Browser authentication state is committed | `data/facebook_session_cookies.json` is tracked and contains cookie values | Remove from the branch, ignore all browser state, rotate/revoke the affected Facebook session |
| Resolved in Phase 1 hardening | Fixed admin credentials were injected into HTML | The fixed bootstrap value was removed from both legacy copies; the compatibility header is present only when explicit environment credentials are configured | Keep the legacy adapter local and prefer authenticated gateway sessions |
| Resolved in Phase 1 hardening | Default Basic credentials existed in server code | Missing environment credentials now create no admin and no Basic header; session signing uses an ephemeral process secret unless explicitly configured | Set unique secrets only when the legacy adapter is intentionally enabled |
| High | API routes are broadly exempted from the top-level auth middleware | `/api/*` is passed through in `app/main.py`; enforcement is inconsistent at handler level | Put authenticated gateway routes in front of the adapter |
| High | CORS allows `*` with credentials | `app/main.py` | Replace with explicit dashboard/extension origins |
| High | Selenium and browser profiles are designed to run in the cloud container | Root Docker/Railway path | Move browser execution to Local Agent; retain cloud-safe parsing/import routes only |
| Medium | Raw exception messages are returned to callers | Global handler includes exception type/message | Return request IDs and sanitized errors; keep full details in structured logs |
| Medium | File-backed state has no concurrency or durability contract | Multiple JSON/status paths | Normalize into PostgreSQL while keeping files as a compatibility cache |
| Medium | Portal selectors and automation are embedded in a large API module | `app/api.py` | Wrap first, then extract connector by connector |

The tracked inventory and VIN valuation data does not contain detected email, phone, or SSN patterns. Lead and voice-note JSON files are currently empty. Synthetic fixtures should replace all customer-shaped samples during migration.

## Repository 2: AI-sales-Extension

### Entry points and frameworks

| Area | Entry point | Stack | Current role |
| --- | --- | --- | --- |
| API | `apps/api/src/main.ts` | Express 4, TypeScript, Zod | Auth, AI, inventory, logs, admin |
| Local development API | `apps/api/src/local-server.ts` | Express/TypeScript | Large file-backed local compatibility server |
| Database | `apps/api/prisma/schema.prisma` | Prisma 5, PostgreSQL | Current relational schema/migrations |
| Admin web | `apps/admin-web/src/main.tsx` | React 18, Vite 8, Tailwind | Existing administration UI |
| Extension | `apps/extension/src/content/index.tsx` and background worker | Chrome Manifest V3, React, Vite | DriveCentric page assistant |
| DriveCentric parser | `apps/extension/src/content/drivecentric/parser.ts` | DOM parser with fixtures/tests | Lead/conversation extraction |
| Shared contracts | `packages/shared/src/schemas.ts` | Zod/TypeScript | Validated AI, lead, inventory contracts |
| AI | `apps/api/src/services/*` | Provider abstraction | Prompt builder, OpenAI/mock provider, evaluator, usage/message/audit logging |

### Preservable functionality found

- Manifest V3 extension, content and background scripts, DriveCentric parser, page reader, inventory parser, storage, and sidebar.
- Express security middleware: Helmet, HPP, CORS controls, request IDs, rate limiting, JWT access/refresh flows, and Argon2 password hashing.
- Prisma/PostgreSQL migrations and seeds.
- Shared Zod schemas and domain logic.
- Prompt builder, response engine, evaluator, OpenAI/mock providers, audit logs, message logs, and usage logs.
- Railway/Nixpacks/Docker configuration and existing tests.

### Scope conflicts with the requested product

The existing schema and UI contain dealership tenancy, roles, employee administration, credit balances, recharge/transfer flows, usage quotas, and billing routes. These are explicitly out of scope for the personal XConsole. The migration will preserve reusable code in a legacy namespace where needed but will not expose or expand billing, subscriptions, or multi-dealer administration.

### Persistence and migration history

Prisma 5 targets PostgreSQL and has five migrations. Current models focus on dealership/users/sessions, prompts/workflows, usage, credits, messages, audit logs, and settings. It lacks the normalized vehicle, customer, connector, job, marketplace, recon, key, CARFAX, appraisal, and lender-version models required by XConsole.

### Deployment and port conflicts

- Default API port is `3000`; local Windows scripts refer to `4000`.
- Admin web uses `5173`.
- Repository 1 uses `8100` and `4300`.
- Both repositories have independent Railway definitions and incompatible start/build assumptions.
- Repository 1 is Vite/Vitest 5/2; repository 2 is Vite/Vitest 8/4. React is 18 in applications, but `packages/ui` does not pin React as a peer, allowing an accidental React 19 package-local install.

### Tests and measured baseline

- Shared package: 29/29 tests passed.
- Prisma Client generation: passed.
- API: 12 tests discovered; 5 failed. Two suites cannot resolve unbuilt local package entry points; three prompt-strategy expectations disagree with current code.
- Admin web: test suite cannot resolve the unbuilt UI package; production Vite bundle completes when TypeScript is bypassed by the failed chained command.
- Extension: 3 tests passed, but the DriveCentric parser suite cannot resolve the shared package.
- Extension TypeScript/build: fails because `apps/extension/src/sidebar/main.tsx` has unbalanced JSX near the end of the file.
- Package-local `tsc` commands fail under isolated pnpm installation because TypeScript is only declared at the root and no pnpm workspace is defined.

### Security findings

- Real OpenAI keys are not present in the inspected environment templates.
- `.env.production` is tracked. It contains only a public Vite API URL today, but production env files should not be a general secret channel.
- Extension refresh/access tokens are held in Chrome extension storage. This is acceptable for the extension boundary if tokens are short-lived/rotatable and never logged.
- CORS intentionally accepts all `chrome-extension://` origins. The unified API must additionally bind tokens to the registered extension/device/user and should prefer an explicit extension ID where practical.
- The seed example uses a known placeholder password and must never be enabled unchanged in production.

## Duplicated systems

| Capability | Dealership repository | AI extension repository | Resolution |
| --- | --- | --- | --- |
| React dashboard | Main XConsole dashboard | Admin web | Main dashboard becomes `apps/dashboard`; selectively reuse admin components |
| API | FastAPI monolith + Fastify child | Express API + local server | Express becomes gateway/AI service; FastAPI remains legacy adapter |
| Auth/users | Basic/file-backed users | JWT/Prisma users/sessions | Use JWT/device tokens in gateway; no employee admin or tenancy |
| Inventory | Live dealership fetch/cache | Inventory search service and extension page parser | Normalize through connector contracts into PostgreSQL |
| Logs | File/runtime status | Prisma usage/message/audit | Central structured logging and connector runs in PostgreSQL |
| Railway | One multi-runtime container | One Node API/admin deployment | Split cloud-safe services; no browser runtime on Railway |
| Configuration | Python env/files | Zod env and shared config | Typed per-service configuration with secret redaction |

## Migration risks

1. Facebook posting is selector- and timing-sensitive. Preserve Selenium code and invoke it through a connector adapter without changing its form behavior in Phase 1.
2. The legacy Python API has tightly coupled helpers and module globals. Copying individual functions would be riskier than running the existing module as a compatibility service.
3. Extension source currently does not build. Restore JSX structure with the smallest possible change and retain parser fixtures before adding XConsole ingestion.
4. Current Prisma migrations model a SaaS-like product. Add XConsole models additively first; removal of legacy billing/tenancy tables is deferred.
5. Inventory snapshots are large and file-backed. Initial ingestion must be idempotent by normalized VIN and should not require committing refreshed snapshots.
6. Portal automation cannot be live-tested without the user's authenticated browser. Skeletons must remain recording/fixture-tested and report `reauthenticationRequired` rather than guessing selectors.
7. Windows browser profiles, screenshots, HTML snapshots, report downloads, and auth state require explicit ignore rules and sanitized recording paths outside Git.

## Files that must not be committed

- `.env`, `.env.local`, production secrets, API keys, passwords, JWT secrets, and device tokens.
- `data/facebook_session_cookies.json` and every cookie/storage-state file.
- Chrome/Edge/Playwright profiles, extension auth exports, browser databases, and local authentication folders.
- Local Agent encrypted configuration, screenshots, raw HTML recordings, logs, job payloads, and failure artifacts.
- RouteOne/Reynolds/vendor report downloads, credit reports, credit applications, and raw customer exports.
- Any fixture containing real customer names, contact details, application data, or authorization headers.

## Audit conclusion

At audit time, repository creation was unavailable in the connected GitHub
surface, so `feature/xconsole-unification` was the correct safe delivery target.
After Phase 1 validation and GitHub CLI authorization, the public
`Uncagedz/XConsole` repository was created and the verified history was
preserved on its `main` branch.
