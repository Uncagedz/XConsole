import fs from 'node:fs';
import path from 'node:path';

function findReportPath(vin: string) {
  const fileName = `${vin}.json`;
  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'data', 'carfax_summaries', fileName),
    path.resolve(process.cwd(), 'data', 'carfax_summaries', fileName),
    path.resolve(process.cwd(), '..', 'data', 'carfax_summaries', fileName),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

export function getLatestVinReport(vin: string): Record<string, unknown> | undefined {
  const reportPath = findReportPath(vin);
  if (!reportPath) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
