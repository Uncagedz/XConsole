# XConsole Gateway API

Common authenticated API for the dashboard, DriveCentric extension, and Windows Local
Agent. Phase 1 includes connector health, vehicle/source status, device registration,
heartbeat, job leasing/completion, and normalized DriveCentric context ingestion.

The in-memory store is used by tests and local fixture mode. PostgreSQL/Prisma is the
production persistence authority; set `DATABASE_URL` and deploy the central migrations
before production rollout.
