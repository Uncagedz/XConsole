import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2] || process.env.VIN_RECON_SOURCE;
if (!inputPath) {
  throw new Error("Provide an input workbook as argv[2] or VIN_RECON_SOURCE.");
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});

console.log(summary.ndjson);
