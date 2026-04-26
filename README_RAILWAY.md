# xConsole on Railway

This repo now has a Railway-ready container deployment.

## What Runs

- Public service: FastAPI app serving `/admin`, `/sales-assistant`, and `/api/*`.
- Internal child service: sales-assistant Fastify backend on `127.0.0.1:${SALES_BACKEND_PORT:-4300}`.
- Railway-facing port: FastAPI listens on Railway's `PORT`.
- Health check: `/api/health`.

## Files Added

- `Dockerfile` builds React, sales-assistant frontend, sales-assistant backend, and Python dependencies.
- `railway.json` tells Railway to use the Dockerfile and health check.
- `tools/railway_start.py` starts both backend processes inside one Railway service.
- `tools/build_production_bundle.mjs` performs the full production build locally or in Docker.
- `requirements.txt` pins Python runtime dependencies.

## Recommended Railway Variables

Set these in Railway service variables:

```text
XCONSOLE_BASIC_AUTH_USER=admin
XCONSOLE_BASIC_AUTH_PASSWORD=<strong-password>
DEALERSHIP_INVENTORY_URL=https://www.tavernachryslerdodgejeepramfiat.com/used-inventory/index.htm
SALES_BACKEND_PORT=4300
XCONSOLE_REBUILD_BANK_BRAIN_ON_START=1
```

Optional if you attach a Railway volume for persistent RouteOne forms:

```text
BANK_DOCS_ROOT=/app/Bank
```

Mount the volume at `/app/Bank` if you want uploaded/downloaded bank documents to survive redeploys.

## RouteOne Forms

RouteOne blocks automated collection behind authenticated login, human verification, and sometimes MFA. The app can decode and learn from the forms once they are present.

Use these hosted endpoints after login:

- `GET /api/bank-brain/docs/status`
- `POST /api/bank-brain/docs/upload`
- `POST /api/bank-brain/docs/rebuild`

Upload supports multipart form data:

```text
files=<one or more PDF/DOCX/XLSX/HTML files>
bank=<optional bank folder name>
rebuild=true
reload_sales_data=true
```

The rebuild process extracts PDF page text, link labels, linked PDF/HTML/DOCX/XLSX content, lender constraints, score/LTV/PTI/DTI thresholds, stips, restrictions, and writes:

- `runtime/routeone_docs/decoded_index.json`
- `data/bank_profiles.generated.json`
- `sales-assistant/data/banks.json`

## Deploy

From a linked Railway project:

```bash
railway up
```

Or connect the repo through Railway GitHub deploys. The Dockerfile is the source of truth.

On this Windows machine, PowerShell may block the generated `railway.ps1` shim. Use:

```powershell
railway.cmd login
railway.cmd link
railway.cmd up
```
