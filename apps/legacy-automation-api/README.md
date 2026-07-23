# Legacy automation API

This directory is an additive Phase 1 copy of the working FastAPI, website inventory,
Facebook Selenium, RouteOne, and Bank Brain implementation. Root legacy entry points
remain operational during migration.

Cloud deployments may run parsing/import endpoints only. Any Selenium or authenticated
browser execution must be invoked by the Windows Local Agent.

Run locally:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```
