import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2] || process.env.VIN_RECON_SOURCE;
if (!inputPath) {
  throw new Error("Provide an input workbook as argv[2] or VIN_RECON_SOURCE.");
}
const outputDir = path.resolve(
  process.argv[3] || process.env.VIN_RECON_OUTPUT_DIR || "outputs/vin-recon/lookup",
);
const outputPath = path.join(outputDir, "1micro crossmatch sorted - recon dates.xlsx");
const resultsPath = path.join(outputDir, "lookup_results.json");
const previewPath = path.join(outputDir, "recon_dates_preview.png");
const sheetName = "1Micro Audit Crossmatch";
const apiBase =
  process.env.VIN_RECON_API_BASE ||
  "https://vinlookuptaverna.netlify.app/.netlify/functions/status";

function columnLetter(index1Based) {
  let n = index1Based;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function parseA1EndRow(address) {
  const match = /:?[A-Z]+(\d+)$/.exec(address);
  return match ? Number(match[1]) : 1;
}

function parseReconDate(value) {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(String(value).trim());
  if (!match) return value;
  let [, mm, dd, yyyy, hh = "0", min = "0", ampm = "AM"] = match;
  let hour = Number(hh);
  if (/PM/i.test(ampm) && hour !== 12) hour += 12;
  if (/AM/i.test(ampm) && hour === 12) hour = 0;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min));
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function reconSummary(record) {
  if (!record) {
    return { date: null, state: "No record", stage: "", days: null, note: "No lookup result found" };
  }

  if (record.recon_state === "completed") {
    return {
      date: parseReconDate(record.recon_completed),
      state: "Completed",
      stage: "Recon complete",
      days: record.recon_completed_days ? Number(record.recon_completed_days) : null,
      note: record.recon_completed
        ? `Completed ${record.recon_completed}`
        : "Completed, date not provided",
    };
  }

  if (record.recon_state === "active") {
    const parts = [
      record.recon_stage || record.recon_status || "In reconditioning",
      record.recon_lot ? `Lot ${record.recon_lot}` : "",
    ].filter(Boolean);
    return {
      date: null,
      state: "Active",
      stage: parts.join(" - "),
      days: record.recon_days ? Number(record.recon_days) : null,
      note: record.recon_days
        ? `${Number(record.recon_days).toFixed(1)} days in recon`
        : "Currently in ReconVision",
    };
  }

  return {
    date: null,
    state: record.recon_state ? titleCase(record.recon_state) : "Not in ReconVision",
    stage: record.recon_status || record.recon_stage || "",
    days: null,
    note: "No ReconVision check-in or completion record",
  };
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await task(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem(sheetName);
const usedRange = sheet.getUsedRange();
const rowCount = parseA1EndRow(usedRange.address);
const vinValues = sheet.getRange(`B2:B${rowCount}`).values.flat();
const rows = vinValues.map((vin, offset) => ({
  rowNumber: offset + 2,
  vin: String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
}));

let completed = 0;
const lookupRows = await mapLimit(rows, 6, async (row) => {
  const lookupUrl = `${apiBase}?q=${encodeURIComponent(row.vin)}`;
  if (!row.vin || row.vin.length < 6) {
    completed += 1;
    console.log(`${completed}/${rows.length} row ${row.rowNumber}: missing VIN`);
    return {
      ...row,
      lookupUrl,
      count: 0,
      selected: null,
      summary: { date: null, state: "Missing VIN", stage: "", days: null, note: "No VIN in workbook row" },
    };
  }

  try {
    const data = await fetchWithRetry(lookupUrl);
    const results = data.results || [];
    const exact = results.find((candidate) => String(candidate.vin || "").toUpperCase() === row.vin);
    const selected = exact || (results.length === 1 ? results[0] : null);
    const summary = reconSummary(selected);
    let note = summary.note;
    if (!selected && results.length > 1) {
      note = `Multiple lookup results (${results.length}); no exact VIN selected`;
    } else if (selected && results.length > 1) {
      note = `${note}; exact match selected from ${results.length} results`;
    }
    completed += 1;
    console.log(`${completed}/${rows.length} row ${row.rowNumber}: ${row.vin} -> ${summary.state}`);
    return {
      ...row,
      lookupUrl,
      count: data.count ?? results.length,
      selected,
      summary: { ...summary, note },
    };
  } catch (error) {
    completed += 1;
    console.log(`${completed}/${rows.length} row ${row.rowNumber}: ${row.vin} -> lookup error`);
    return {
      ...row,
      lookupUrl,
      count: null,
      selected: null,
      summary: { date: null, state: "Lookup error", stage: "", days: null, note: error.message },
    };
  }
});

const headers = [["Recon Date", "Recon State", "Recon Stage/Status", "Recon Days", "Lookup Note", "Lookup URL"]];
const outputValues = lookupRows.map(({ summary, lookupUrl }) => [
  summary.date,
  summary.state,
  summary.stage,
  summary.days,
  summary.note,
  lookupUrl,
]);

const startCol = 11;
const endCol = startCol + headers[0].length - 1;
const startLetter = columnLetter(startCol);
const endLetter = columnLetter(endCol);

sheet.getRange(`${startLetter}1:${endLetter}1`).values = headers;
sheet.getRange(`${startLetter}2:${endLetter}${rowCount}`).values = outputValues;

sheet.getRange(`${startLetter}1:${endLetter}1`).format = {
  font: { bold: true },
  fill: "#F2F2F2",
};
sheet.getRange(`${startLetter}:${startLetter}`).format.columnWidth = 19;
sheet.getRange(`${columnLetter(startCol + 1)}:${columnLetter(startCol + 1)}`).format.columnWidth = 15;
sheet.getRange(`${columnLetter(startCol + 2)}:${columnLetter(startCol + 2)}`).format.columnWidth = 28;
sheet.getRange(`${columnLetter(startCol + 3)}:${columnLetter(startCol + 3)}`).format.columnWidth = 12;
sheet.getRange(`${columnLetter(startCol + 4)}:${columnLetter(startCol + 4)}`).format.columnWidth = 42;
sheet.getRange(`${columnLetter(startCol + 5)}:${columnLetter(startCol + 5)}`).format.columnWidth = 60;
sheet.getRange(`${startLetter}2:${startLetter}${rowCount}`).format.numberFormat = "m/d/yyyy h:mm AM/PM";
sheet.getRange(`${columnLetter(startCol + 3)}2:${columnLetter(startCol + 3)}${rowCount}`).format.numberFormat = "0.0";

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName,
  range: `A1:${endLetter}${Math.min(rowCount, 35)}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

await fs.writeFile(
  resultsPath,
  JSON.stringify(
    lookupRows.map(({ rowNumber, vin, lookupUrl, count, selected, summary }) => ({
      rowNumber,
      vin,
      lookupUrl,
      count,
      matchedVin: selected?.vin || null,
      reconState: summary.state,
      reconStage: summary.stage,
      reconDays: summary.days,
      reconDate: summary.date instanceof Date ? summary.date.toISOString() : summary.date,
      note: summary.note,
    })),
    null,
    2,
  ),
);

console.log(JSON.stringify({ outputPath, resultsPath, previewPath }, null, 2));
