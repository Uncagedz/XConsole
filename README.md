# XConsole

XConsole is a personal dealership sales operating system that unifies the
existing dealership automation dashboard, DriveCentric AI extension, connector
jobs, and a Windows Local Agent. The canonical monorepo lives in
`Uncagedz/XConsole` on `main`; the integration history remains available in
`Uncagedz/Xconsole-Dealership-Tool` on `feature/xconsole-unification`.

Start with:

- [Development setup](docs/DEVELOPMENT.md)
- [Architecture](docs/XCONSOLE-ARCHITECTURE.md)
- [Existing-system audit](docs/EXISTING-SYSTEM-AUDIT.md)
- [Migration plan](docs/MIGRATION-PLAN.md)
- [Phase 1 status](docs/PHASE-1-STATUS.md)
- [Railway deployment](docs/RAILWAY-DEPLOYMENT.md)

The legacy FastAPI/dashboard startup remains below as a compatibility path
until its adapters are replaced. Browser session state, credentials, customer
PII, and captured portal artifacts must never be committed.

## Legacy CDJRF FB Flow

## Start Local Stack

Use the maintained pnpm entry points from the repository root:

```powershell
pnpm dev:cloud
```

This starts the gateway, AI API, and unified dashboard. To connect the unified
inventory page to the preserved live FastAPI synchronizer, follow
[the live inventory setup](docs/DEVELOPMENT.md#use-the-live-admin-inventory-in-the-unified-dashboard).

Optional one-shot Facebook live setup (driver + placeholder images):

```powershell
.\scripts\setup-facebook-live.ps1
```

Or run stack startup and setup together:

```powershell
.\start-local-stack.ps1 -SetupFacebookLive
```

This starts:

1. Admin UI at `http://127.0.0.1:8100/admin`
2. API at `http://127.0.0.1:8100/api`
3. Sales Assistant UI at `http://127.0.0.1:8100/sales-assistant`

If port `8100` (or sales port `4300`) is already in use, the launcher now auto-picks the next free port and prints a warning with the final URLs.

The launcher also prints a LAN IP URL so you can open the UI from another machine on your network.

## Facebook Posting

- Draft mode writes listing files under `runtime/facebook_posts/<VIN>_<timestamp>/facebook_listing.txt`.
- Live mode runs Selenium automation from `automation/facebook-marketplace-lister`.
- Live mode now enforces these preflight checks:
  - `account_id` must exist in `automation/facebook-marketplace-lister/accounts.json` and include a password
  - all provided image filenames must exist in `automation/facebook-marketplace-lister/images`
  - ChromeDriver must exist in `automation/facebook-marketplace-lister/drivers` (for example `chromedriver.exe`)
- Check readiness via:
  - `POST /api/facebook/bootstrap`
  - `GET /api/facebook/live-requirements`
  - `GET /api/facebook/images`
  - `POST /api/facebook/images/import-from-vehicle`
  - `POST /api/facebook/images/relink`
  - `POST /api/facebook/live-preflight`
  - `POST /api/facebook/prepare-live-post`
  - `POST /api/facebook/full-repair`
  - `GET /api/facebook/images/suggest?vin=<VIN>`
  - `POST /api/wire-everything`
  - UI section: **Live Posting Requirements**

## Unified Stack Endpoints

- `GET /api/stack/readiness` returns build/runtime readiness for admin + sales services.
- `GET /api/sales-assistant/health` checks the sales backend through FastAPI proxy.
- `GET /api/sales-assistant/banks` and `GET /api/sales-assistant/banks/factors` return backend data via proxy.
- `POST /api/sales-assistant/banks/reload` and `POST /api/sales-assistant/banks/factors/reload` trigger backend refresh via proxy.
- `GET /api/inventory/source-status` shows active inventory source and last live sync metadata.
- `POST /api/inventory/sync-live` fetches dealership inventory from the configured URL and stores live cache.
- `GET /api/inventory/active` returns current active inventory items and source status.

## Live Dealership Inventory

The preserved FastAPI service defaults to the configured Taverna used, new,
and lifted-trucks inventory pages. Records are unified by VIN without dropping
richer photos, prices, condition data, or source tags. Override any source
without changing code:

```powershell
$env:DEALERSHIP_INVENTORY_URL = "https://your-dealership.com/used-vehicles/"
$env:DEALERSHIP_NEW_INVENTORY_URL = "https://your-dealership.com/new-vehicles/"
$env:DEALERSHIP_LIFTED_TRUCKS_URL = "https://your-dealership.com/lifted-trucks/"
```

- The unified `/inventory` page shows the same live records, photos, prices,
  source freshness, and sync control through the authenticated gateway bridge.
