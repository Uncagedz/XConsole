# Workspace consolidation record

The canonical source of truth is this repository. The prior local workspaces
were audited and consolidated as follows:

| Former local item | Canonical location or disposition |
| --- | --- |
| `AI-sales-Extension-source` | Integrated into `apps/ai-api`, `apps/dashboard`, `apps/drivecentric-extension`, and shared packages |
| `extension-good` | Byte-identical to `apps/drivecentric-extension/src/sidebar/main.tsx` |
| `vin_recon_work` | Portable source moved to `tools/vin-recon` |
| `work_routeone` | Sanitized, portable source moved to `tools/routeone-research` |
| `outputs` | Generated inventory workbooks/previews; reproducible and intentionally ignored |
| `tmp_test` | Temporary renders and debugging files; intentionally excluded |
| `extension-good.zip` | Redundant build/archive copy; source is tracked |
| Runtime databases, sessions, cookies, browser profiles, and credentials | Intentionally excluded and represented by templates or deployment variables |

## What “everything in GitHub” means

All reusable application code, migrations, deployment definitions,
configuration templates, tests, documentation, and safe utility source are
tracked in GitHub. The repository intentionally does not contain:

- credentials, tokens, cookies, browser sessions, or private keys;
- `node_modules`, Python caches, build output, or downloaded browser binaries;
- mutable production databases and Railway volumes;
- customer, credit, lender-export, or dealership-private source documents;
- reproducible temporary screenshots, PDF renders, and workbook output.

This boundary keeps the repository reproducible without turning a public source
repository into a credential store or customer-data archive.
