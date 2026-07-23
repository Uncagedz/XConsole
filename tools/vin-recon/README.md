# VIN recon workbook tools

These scripts were consolidated from the former local `vin_recon_work` folder.
They query the dealership VIN-status endpoint and inspect, enrich, polish, or
render workbook files.

The workbook inputs and generated outputs are intentionally not committed.
They can contain dealership inventory data and are reproducible from the source
workbook.

## Runtime

The scripts use `@oai/artifact-tool`, which is available in the Codex artifact
runtime. Run them with that package on the Node module path.

Common configuration:

- `VIN_RECON_SOURCE`: input `.xlsx` workbook
- `VIN_RECON_OUTPUT_DIR`: generated output directory
- `VIN_RECON_API_BASE`: VIN status endpoint override
- `VIN_RECON_AS_OF_DATE`: optional `YYYY-MM-DD` reporting date
- `VIN_RECON_WORKBOOK`: workbook used by inspection/rendering utilities

Command-line input and output paths take precedence over environment variables.

Example:

```powershell
node tools/vin-recon/lookup_and_fill.mjs `
  "C:\work\inventory.xlsx" `
  "outputs\vin-recon\lookup"
```

Generated files belong under `outputs/vin-recon/`, which is ignored by Git.
