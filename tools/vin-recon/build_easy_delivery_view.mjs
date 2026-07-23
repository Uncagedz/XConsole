import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourcePath = process.argv[2] || process.env.VIN_RECON_SOURCE;
if (!sourcePath) {
  throw new Error("Provide an input workbook as argv[2] or VIN_RECON_SOURCE.");
}
const outputDir = path.resolve(
  process.argv[3] || process.env.VIN_RECON_OUTPUT_DIR || "outputs/vin-recon/easy-view",
);
const outputPath = path.join(outputDir, "1micro crossmatch sorted - easy delivery view - Excel safe.xlsx");
const previewDir = path.join(outputDir, "previews");
const apiBase =
  process.env.VIN_RECON_API_BASE ||
  "https://vinlookuptaverna.netlify.app/.netlify/functions/status";
const today = process.env.VIN_RECON_AS_OF_DATE
  ? new Date(`${process.env.VIN_RECON_AS_OF_DATE}T00:00:00`)
  : new Date();

function colLetter(index1Based) {
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

function excelSerialToDate(value) {
  if (typeof value !== "number" || value < 30000) return null;
  return new Date(Math.round((value - 25569) * 86400 * 1000));
}

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseReconDate(value) {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(String(value).trim());
  if (!match) return null;
  let [, mm, dd, yyyy, hh = "0", min = "0", ampm = "AM"] = match;
  let hour = Number(hh);
  if (/PM/i.test(ampm) && hour !== 12) hour += 12;
  if (/AM/i.test(ampm) && hour === 12) hour = 0;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min));
}

function fmtDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function cleanOrigin(value) {
  return String(value || "").replace(/manheim/ig, "Manheim").trim();
}

function vehicleName(source, lookup) {
  if (source.asset) return source.asset;
  return [lookup?.yr, lookup?.make, lookup?.model].filter(Boolean).join(" ") || "Vehicle";
}

function locationText(source, lookup) {
  const pieces = [];
  if (lookup?.key_currently_in) {
    const drawer = lookup.drawer ? `Drawer ${lookup.drawer}` : "";
    const row = lookup.rw !== null && lookup.rw !== undefined && lookup.rw !== "" ? `Row ${lookup.rw}` : "";
    const slot = lookup.slot ? `Slot ${lookup.slot}` : "";
    pieces.push([lookup.kiosk, drawer, row, slot].filter(Boolean).join(" / "));
  } else if (source.kiosk) {
    const drawer = source.drawer !== null && source.drawer !== "" ? `Drawer ${source.drawer}` : "";
    const row = source.row !== null && source.row !== "" ? `Row ${source.row}` : "";
    const slot = source.slot !== null && source.slot !== "" ? `Slot ${source.slot}` : "";
    pieces.push([source.kiosk, drawer, row, slot].filter(Boolean).join(" / "));
  }
  return pieces.filter(Boolean).join(" ");
}

function reconText(lookup, source) {
  if (lookup?.recon_state === "completed") {
    return `Complete${lookup.recon_completed ? ` ${lookup.recon_completed}` : ""}`;
  }
  if (lookup?.recon_state === "active") {
    const days = lookup.recon_days ? `${Number(lookup.recon_days).toFixed(1)} days` : "";
    return ["In recon", lookup.recon_stage || lookup.recon_status, days].filter(Boolean).join(" - ");
  }
  if (source.reconState && source.reconState !== "Not in ReconVision") return source.reconState;
  return "Not in ReconVision";
}

function deliveryBoardText(lookup) {
  if (!lookup) return "No lookup result";
  if (lookup.delivered) {
    return lookup.delivery_eta ? `Delivered ${fmtDate(parseISODate(lookup.delivery_eta))}` : "Delivered";
  }
  if (lookup.on_ship_board) {
    const eta = lookup.delivery_eta ? fmtDate(parseISODate(lookup.delivery_eta)) : "";
    const status = lookup.ship_status && !/^dispatched$/i.test(String(lookup.ship_status)) ? lookup.ship_status : "In transit";
    return eta ? `${status}; ETA ${eta}` : status;
  }
  return "No transporter record";
}

function classifyDelivery(lookup) {
  if (!lookup) {
    return {
      status: "CHECK",
      confidence: "Low",
      board: "No lookup result",
      reason: "VIN was not found in the lookup site.",
      action: "Check the VIN manually in dispatch.",
      sort: 1,
    };
  }

  const onsiteSignals = [];
  if (lookup.key_currently_in) onsiteSignals.push("key is in 1Micro");
  else if (lookup.key_in_1micro) onsiteSignals.push("key was seen in 1Micro");
  if ((lookup.open_ro_count || 0) > 0) onsiteSignals.push(`${lookup.open_ro_count} open RO`);
  if (lookup.recon_state === "active") onsiteSignals.push("vehicle is in recon");
  if (lookup.recon_state === "completed") onsiteSignals.push("recon is complete");

  if (lookup.delivered) {
    return {
      status: "YES",
      confidence: "High",
      board: deliveryBoardText(lookup),
      reason: "Transporter board says delivered.",
      action: "No delivery follow-up needed.",
      sort: 3,
    };
  }

  if (lookup.on_ship_board && onsiteSignals.length) {
    return {
      status: "CHECK",
      confidence: "Medium",
      board: deliveryBoardText(lookup),
      reason: `Dispatch board does not say delivered, but ${onsiteSignals.join(", ")}.`,
      action: "Verify in dispatch; it may already be on site.",
      sort: 0,
    };
  }

  if (!lookup.on_ship_board && onsiteSignals.length) {
    return {
      status: "YES",
      confidence: lookup.key_currently_in || lookup.recon_state ? "High" : "Medium",
      board: deliveryBoardText(lookup),
      reason: `Not on transporter board, but ${onsiteSignals.join(", ")}.`,
      action: "Treat as delivered/on site unless dispatch says otherwise.",
      sort: 3,
    };
  }

  if (lookup.on_ship_board) {
    const eta = parseISODate(lookup.delivery_eta);
    const overdue = eta && eta < today;
    return {
      status: "NO",
      confidence: overdue ? "Medium" : "High",
      board: deliveryBoardText(lookup),
      reason: overdue
        ? "Board does not show delivered and there are no on-site clues, but the ETA has passed."
        : "Board shows in transit and there are no on-site clues.",
      action: overdue ? "Call/verify delivery status." : "Wait for delivery or follow up with dispatch.",
      sort: overdue ? 1 : 2,
    };
  }

  return {
    status: "CHECK",
    confidence: "Low",
    board: deliveryBoardText(lookup),
    reason: "No transporter record and no strong on-site clue.",
    action: "Check manually before deciding.",
    sort: 1,
  };
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
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

function setWidths(sheet, widths) {
  widths.forEach((width, idx) => {
    sheet.getRange(`${colLetter(idx + 1)}:${colLetter(idx + 1)}`).format.columnWidth = width;
  });
}

function styleTitle(sheet, titleRange, subtitleRange) {
  const title = sheet.getRange(titleRange);
  title.format = {
    fill: "#1F4E79",
    font: { bold: true, color: "#FFFFFF", size: 18 },
  };
  const subtitle = sheet.getRange(subtitleRange);
  subtitle.format = {
    fill: "#D9EAF7",
    font: { color: "#17324D", size: 12 },
  };
}

function styleTable(sheet, range, statusColIndex = 1) {
  const used = sheet.getRange(range);
  used.format = {
    font: { size: 11, color: "#1F2933" },
    borders: { preset: "all", style: "thin", color: "#D9E2EC" },
    wrapText: true,
  };
  const [, endCell] = range.split(":");
  const headerEndCol = endCell.replace(/\d+/g, "");
  sheet.getRange(`A1:${headerEndCol}1`).format = {
    fill: "#1F4E79",
    font: { bold: true, color: "#FFFFFF", size: 12 },
    wrapText: true,
  };
  const endRow = Number(endCell.replace(/[A-Z]+/g, ""));
  for (let row = 2; row <= endRow; row += 1) {
    const status = sheet.getRange(`${colLetter(statusColIndex)}${row}`).values[0][0];
    const rowRange = sheet.getRange(`A${row}:${headerEndCol}${row}`);
    if (status === "YES") {
      rowRange.format.fill = "#E9F7EF";
      sheet.getRange(`${colLetter(statusColIndex)}${row}`).format = { fill: "#1E8449", font: { bold: true, color: "#FFFFFF" } };
    } else if (status === "NO") {
      rowRange.format.fill = "#FDEDEC";
      sheet.getRange(`${colLetter(statusColIndex)}${row}`).format = { fill: "#C0392B", font: { bold: true, color: "#FFFFFF" } };
    } else if (status === "CHECK") {
      rowRange.format.fill = "#FFF4E5";
      sheet.getRange(`${colLetter(statusColIndex)}${row}`).format = { fill: "#B9770E", font: { bold: true, color: "#FFFFFF" } };
    }
  }
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
}

function addTable(sheet, rows, name, widths) {
  const endRow = Math.max(1, rows.length);
  const endCol = rows[0]?.length || 1;
  const endAddress = `${colLetter(endCol)}${endRow}`;
  sheet.getRange(`A1:${endAddress}`).values = rows;
  styleTable(sheet, `A1:${endAddress}`);
  setWidths(sheet, widths);
}

function simpleRows(records) {
  return [
    [
      "Delivered?",
      "Confidence",
      "Stock #",
      "Vehicle",
      "VIN Last 6",
      "Deal #",
      "Board Says",
      "Why I Think This",
      "What To Do",
      "Recon",
      "Key / RO / Location",
    ],
    ...records.map((r) => [
      r.status,
      r.confidence,
      r.stock,
      r.vehicle,
      r.last6,
      r.dealNo || "",
      r.board,
      r.reason,
      r.action,
      r.recon,
      r.location,
    ]),
  ];
}

function countBy(records, status) {
  return records.filter((r) => r.status === status).length;
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const sourceBlob = await FileBlob.load(sourcePath);
const sourceWorkbook = await SpreadsheetFile.importXlsx(sourceBlob);
const sourceSheet = sourceWorkbook.worksheets.getItem("1Micro Audit Crossmatch");
const usedRows = parseA1EndRow(sourceSheet.getUsedRange().address);
const sourceValues = sourceSheet.getRange(`A1:P${usedRows}`).values;
const header = sourceValues[0];
const dataRows = sourceValues.slice(1);

const sourceRecords = dataRows.map((row, idx) => ({
  sourceRow: idx + 2,
  stock: row[0],
  vin: String(row[1] || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
  asset: row[2],
  kiosk: row[3],
  drawer: row[4],
  row: row[5],
  slot: row[6],
  originalNote: row[7],
  soldStatus: row[8],
  soldDate: row[9] instanceof Date ? row[9] : excelSerialToDate(row[9]),
  reconDate: row[10],
  reconState: row[11],
  reconStage: row[12],
  reconDays: row[13],
  lookupNote: row[14],
  lookupUrl: row[15],
}));

let completed = 0;
const lookupRecords = await mapLimit(sourceRecords, 6, async (source) => {
  const lookupUrl = `${apiBase}?q=${encodeURIComponent(source.vin)}`;
  try {
    const data = await fetchWithRetry(lookupUrl);
    const matches = data.results || [];
    const exact = matches.find((candidate) => String(candidate.vin || "").toUpperCase() === source.vin);
    const selected = exact || (matches.length === 1 ? matches[0] : null);
    completed += 1;
    console.log(`${completed}/${sourceRecords.length} ${source.vin || "(missing VIN)"} checked`);
    return { source, lookup: selected, matchCount: data.count ?? matches.length, lookupUrl, error: "" };
  } catch (error) {
    completed += 1;
    console.log(`${completed}/${sourceRecords.length} ${source.vin || "(missing VIN)"} lookup error`);
    return { source, lookup: null, matchCount: null, lookupUrl, error: error.message };
  }
});

const records = lookupRecords.map(({ source, lookup, matchCount, lookupUrl, error }) => {
  const prediction = classifyDelivery(lookup);
  const dealNo = lookup?.deal_no || String(source.originalNote || "").match(/\d{3,}/)?.[0] || "";
  const etaOrArrival = parseISODate(lookup?.delivery_eta);
  const reconDate = lookup?.recon_completed ? parseReconDate(lookup.recon_completed) : source.reconDate;
  const keyText = lookup?.key_currently_in
    ? "Key in 1Micro"
    : lookup?.key_in_1micro
      ? "Key seen before"
      : "No 1Micro key";
  const roText = (lookup?.open_ro_count || 0) > 0 ? `${lookup.open_ro_count} open RO` : "No open RO";
  return {
    status: prediction.status,
    confidence: prediction.confidence,
    stock: source.stock,
    vehicle: vehicleName(source, lookup),
    vin: source.vin,
    last6: source.vin.slice(-6),
    dealNo,
    soldDate: lookup?.deal_date || fmtDate(source.soldDate),
    board: prediction.board,
    reason: error ? `Lookup error: ${error}` : prediction.reason,
    action: error ? "Check manually." : prediction.action,
    recon: reconText(lookup, source),
    reconDate,
    etaOrArrival,
    location: [keyText, roText, locationText(source, lookup)].filter(Boolean).join(" - "),
    originalNote: source.originalNote || "",
    soldStatus: source.soldStatus || "",
    sourceRow: source.sourceRow,
    matchCount,
    lookupUrl,
    sort: prediction.sort,
    origin: cleanOrigin(lookup?.origin),
    shipStatus: lookup?.ship_status || "",
    deliveredRaw: lookup?.delivered ?? null,
    onShipBoard: lookup?.on_ship_board ?? null,
  };
});

records.sort((a, b) => a.sort - b.sort || String(a.status).localeCompare(String(b.status)) || String(a.stock).localeCompare(String(b.stock)));

const yesRecords = records.filter((r) => r.status === "YES");
const noRecords = records.filter((r) => r.status === "NO");
const checkRecords = records.filter((r) => r.status === "CHECK");
const actionRecords = [...checkRecords, ...noRecords].sort((a, b) => a.sort - b.sort || String(a.stock).localeCompare(String(b.stock)));

const workbook = Workbook.create();

const start = workbook.worksheets.add("Start Here");
start.showGridLines = false;
start.getRange("A1:I1").values = [["Delivery Prediction Summary"]];
start.getRange("A2:I2").values = [[`Plain-English view for ${records.length} vehicles. Last updated July 9, 2026 from the Taverna VIN lookup site.`]];
styleTitle(start, "A1:I1", "A2:I2");
start.getRange("A4:B4").values = [["What this means", "Count"]];
start.getRange("A5:B8").values = [
  ["YES - likely delivered / on site", countBy(records, "YES")],
  ["NO - likely not delivered yet", countBy(records, "NO")],
  ["CHECK - verify manually", countBy(records, "CHECK")],
  ["Total vehicles", records.length],
];
start.getRange("D4:I4").values = [["How to Read the Workbook", "", "", "", "", ""]];
start.getRange("D5:I9").values = [
  ["Start with the Needs Action tab. Those are the only rows that probably need a call or manual check.", "", "", "", "", ""],
  ["YES means the lookup says delivered, or the car has strong on-site clues like key, recon, or an open RO.", "", "", "", "", ""],
  ["NO means it still looks in transit and there are no on-site clues.", "", "", "", "", ""],
  ["CHECK means the systems disagree or the lookup is missing. These should be verified before dispatch is marked complete.", "", "", "", "", ""],
  ["The All Vehicles tab keeps every VIN in one place with the reason beside the answer.", "", "", "", "", ""],
];
start.getRange("A11:I11").values = [["First Rows To Review", "", "", "", "", "", "", "", ""]];
start.getRange("A12:I12").values = [["Delivered?", "Confidence", "Stock #", "Vehicle", "VIN Last 6", "Board Says", "Why", "What To Do", "Recon"]];
const topRows = actionRecords.slice(0, 12).map((r) => [
  r.status,
  r.confidence,
  r.stock,
  r.vehicle,
  r.last6,
  r.board,
  r.reason,
  r.action,
  r.recon,
]);
if (topRows.length) start.getRange(`A13:I${12 + topRows.length}`).values = topRows;
start.getRange("A4:B8").format = {
  font: { size: 13 },
  borders: { preset: "all", style: "thin", color: "#B7C9D9" },
};
start.getRange("A4:B4").format = { fill: "#1F4E79", font: { bold: true, color: "#FFFFFF", size: 13 } };
start.getRange("D4:I4").format = { fill: "#1F4E79", font: { bold: true, color: "#FFFFFF", size: 13 } };
start.getRange("D5:I9").format = { fill: "#F8FBFD", font: { size: 12 }, wrapText: true };
start.getRange("A11:I11").format = { fill: "#1F4E79", font: { bold: true, color: "#FFFFFF", size: 13 } };
start.getRange(`A12:I${Math.max(12, 12 + topRows.length)}`).format = {
  font: { size: 11 },
  borders: { preset: "all", style: "thin", color: "#D9E2EC" },
  wrapText: true,
};
start.getRange("A12:I12").format = { fill: "#D9EAF7", font: { bold: true, color: "#17324D", size: 11 } };
setWidths(start, [17, 14, 13, 35, 12, 24, 42, 34, 28]);
start.getRange("A:A").format.columnWidth = 28;
start.getRange("B:B").format.columnWidth = 12;
start.getRange("A5:A5").format.fill = "#E9F7EF";
start.getRange("A6:A6").format.fill = "#FDEDEC";
start.getRange("A7:A7").format.fill = "#FFF4E5";

const widths = [14, 13, 13, 38, 12, 12, 24, 44, 36, 31, 38];
addTable(workbook.worksheets.add("Needs Action"), simpleRows(actionRecords), "NeedsActionTable", widths);
addTable(workbook.worksheets.add("Delivered"), simpleRows(yesRecords), "DeliveredTable", widths);
addTable(workbook.worksheets.add("Not Delivered"), simpleRows(noRecords), "NotDeliveredTable", widths);
addTable(workbook.worksheets.add("Check Manually"), simpleRows(checkRecords), "CheckManuallyTable", widths);
addTable(workbook.worksheets.add("All Vehicles"), simpleRows(records), "AllVehiclesTable", widths);

const details = workbook.worksheets.add("Lookup Details");
const detailRows = [
  [
    "Delivered?",
    "Confidence",
    "Stock #",
    "VIN",
    "Vehicle",
    "Deal #",
    "Sold Date",
    "ETA / Arrival",
    "Recon Date",
    "Transporter Board",
    "Origin",
    "Ship Status",
    "Original Note",
    "Lookup URL",
  ],
  ...records.map((r) => [
    r.status,
    r.confidence,
    r.stock,
    r.vin,
    r.vehicle,
    r.dealNo || "",
    r.soldDate || "",
    r.etaOrArrival,
    r.reconDate,
    r.board,
    r.origin,
    r.shipStatus,
    r.originalNote,
    r.lookupUrl,
  ]),
];
addTable(details, detailRows, "LookupDetailsTable", [14, 13, 13, 23, 38, 12, 13, 13, 20, 28, 24, 18, 35, 70]);
details.getRange(`H2:I${detailRows.length}`).format.numberFormat = "m/d/yyyy";

const check = await workbook.inspect({
  kind: "table",
  range: "Start Here!A4:I24",
  include: "values,formulas",
  tableMaxRows: 24,
  tableMaxCols: 9,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const previews = [
  ["Start Here", "A1:I25", `${previewDir}/start_here.png`],
  ["Needs Action", `A1:K${Math.min(actionRecords.length + 1, 25)}`, `${previewDir}/needs_action.png`],
  ["All Vehicles", "A1:K25", `${previewDir}/all_vehicles.png`],
];

for (const [sheetName, range, previewPath] of previews) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({
  outputPath,
  counts: {
    yes: countBy(records, "YES"),
    no: countBy(records, "NO"),
    check: countBy(records, "CHECK"),
    total: records.length,
  },
  previews: previews.map(([, , path]) => path),
}, null, 2));
