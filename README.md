# XConsole

XConsole is a personal dealership sales operating system that unifies the
existing dealership automation dashboard, DriveCentric AI extension, connector
jobs, and a Windows Local Agent. The Phase 1 monorepo lives on
`feature/xconsole-unification`.

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

Run one of these from the repo root:

```powershell
.\start-local-stack.ps1
```

or

```cmd
start-local-stack.cmd
```

For double-click launch from Explorer, use `start-local-stack.cmd` (not the `.ps1` file).

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

- Default source URL: `https://www.porschewestbroward.com/new-vehicles/`
- Override source URL with env var:

```powershell
$env:DEALERSHIP_INVENTORY_URL = "https://your-dealership.com/new-vehicles/"
```

- The dashboard now includes **Dealership Inventory Sync** so you can refresh inventory from the live website and immediately view it in the inventory panel.
