import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath =
  process.argv[2] ||
  process.env.VIN_RECON_WORKBOOK ||
  "outputs/vin-recon/lookup/1micro crossmatch sorted - recon dates.xlsx";
const sourceBlob = await FileBlob.load(sourcePath);
const sourceWorkbook = await SpreadsheetFile.importXlsx(sourceBlob);
const sourceSheet = sourceWorkbook.worksheets.getItem("1Micro Audit Crossmatch");

for (const address of ["A61:P61", "A1:P1"]) {
  console.log(address);
  console.log(JSON.stringify(sourceSheet.getRange(address).values, null, 2));
}
