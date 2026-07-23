import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  process.argv[2] ||
  process.env.VIN_RECON_WORKBOOK ||
  "outputs/vin-recon/lookup/1micro crossmatch sorted - recon dates.xlsx";
const previewPath =
  process.argv[3] ||
  process.env.VIN_RECON_PREVIEW ||
  path.join(path.dirname(workbookPath), "recon_dates_preview.png");
const sheetName = "1Micro Audit Crossmatch";

function parseA1EndRow(address) {
  const match = /:?[A-Z]+(\d+)$/.exec(address);
  return match ? Number(match[1]) : 1;
}

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem(sheetName);
const rowCount = parseA1EndRow(sheet.getUsedRange().address);
const stateRange = sheet.getRange(`L2:L${rowCount}`);
stateRange.values = stateRange.values.map(([value]) => [
  value === "None" ? "Not in ReconVision" : value,
]);
sheet.getRange("L:L").format.columnWidth = 20;

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName,
  range: `A1:P${Math.min(rowCount, 35)}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);
console.log(workbookPath);
