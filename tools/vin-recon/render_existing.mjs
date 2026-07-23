import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2] || process.env.VIN_RECON_SOURCE;
if (!inputPath) {
  throw new Error("Provide an input workbook as argv[2] or VIN_RECON_SOURCE.");
}
const outputPath = path.resolve(
  process.argv[3] || process.env.VIN_RECON_PREVIEW || "outputs/vin-recon/existing_preview.png",
);

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const preview = await workbook.render({
  sheetName: "1Micro Audit Crossmatch",
  range: "A1:J25",
  scale: 1,
  format: "png",
});

await fs.writeFile(outputPath, new Uint8Array(await preview.arrayBuffer()));
console.log(outputPath);
