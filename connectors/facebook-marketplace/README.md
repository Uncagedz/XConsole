# Facebook Marketplace connector

Phase 1 preserves `automation/facebook-marketplace-lister/Lister.py` and the existing
FastAPI preflight, image, background queue, publish, and status endpoints. This adapter
invokes that code from the Windows Local Agent. `live` requires an approved job.

Fixture tests exercise draft result validation only. Live posting has not been run by
this migration because an authenticated local Facebook session is required.
