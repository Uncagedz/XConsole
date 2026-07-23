# GitHub Actions

The active workflow is `.github/workflows/ci.yml`. It validates the central Prisma
schema/migrations against PostgreSQL, runs security hygiene checks, TypeScript
type-check/lint/tests/builds, and preserves the legacy Python tests.
