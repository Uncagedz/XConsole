# DriveCentric extension

The maintained extension source is `apps/drivecentric-extension` in this
repository. The former standalone `AI-sales-Extension` repository is historical
and must not be used for production builds.

## Production endpoints

- Dashboard: `https://aniextension.up.railway.app`
- Extension AI API: `https://xconsole-ai-api-production.up.railway.app`

The dashboard and AI API are different services. Extension version `0.1.59`
migrates stale saved dashboard URLs to the AI API automatically.

## Build and package

```powershell
pnpm --filter @xconsole/drivecentric-extension test
pnpm --filter @xconsole/drivecentric-extension build
```

Every extension change merged to `main` also runs the
`Package DriveCentric extension` GitHub Actions workflow. Its
`xconsole-drivecentric-extension` artifact contains the installable archive, so
the canonical source and reproducible package both remain in GitHub.
