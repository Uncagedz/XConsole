import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  process.argv[2] ||
  process.env.VIN_RECON_WORKBOOK ||
  "outputs/vin-recon/easy-view/1micro crossmatch sorted - easy delivery view - Excel safe.xlsx";
const outputDir = path.resolve(
  process.argv[3] ||
    process.env.VIN_RECON_PREVIEW_DIR ||
    path.join(path.dirname(workbookPath), "previews"),
);

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = [
  ["Start Here", "A1:I25", "start_here.png"],
  ["Needs Action", "A1:K12", "needs_action.png"],
  ["Delivered", "A1:K25", "delivered.png"],
  ["Not Delivered", "A1:K8", "not_delivered.png"],
  ["Check Manually", "A1:K8", "check_manually.png"],
  ["All Vehicles", "A1:K25", "all_vehicles.png"],
  ["Lookup Details", "A1:N25", "lookup_details.png"],
];

for (const [sheetName, range, fileName] of sheets) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
console.log(outputDir);
