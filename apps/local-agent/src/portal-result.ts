import type { PortalConnectorId } from './config.js';

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function listValue(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n|;/)
    .map((item) => item.replace(/^[•\-–]\s*/, '').trim())
    .filter(Boolean);
}

function labeled(summary: string, labels: string[]) {
  const lines = summary.split(/\r?\n/).map((line) => line.trim());
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(`^${escaped}\\s*(?::\\s*(.*))?$`, 'i');
    const index = lines.findIndex((line) => expression.test(line));
    if (index < 0) continue;
    const sameLine = lines[index]?.match(expression)?.[1];
    if (sameLine?.trim()) return clean(sameLine);
    if (lines[index + 1]) return clean(lines[index + 1]);
  }
  return null;
}

function dateMatches(summary: string) {
  return [...new Set(
    [...summary.matchAll(/\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/gi)]
      .map((match) => match[0]),
  )];
}

export function parseReconStage(summary: string) {
  const tableRow = summary.match(/\t([^\t\r\n]+)\t\d{2}\/\d{2}\/\d{4}\s/);
  if (tableRow?.[1]) return tableRow[1].trim();
  const values = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const updatedIndex = values.findIndex((value) => /^\d{2}\/\d{2}\/\d{4}\s/.test(value));
  return updatedIndex > 0 ? values[updatedIndex - 1] : null;
}

export function parseReconRepairOrder(summary: string, sourceUrl: string, fallbackOrder?: string) {
  const dates = dateMatches(summary);
  const repairOrder = clean(
    fallbackOrder
      ?? labeled(summary, ['Repair Order', 'RO Number', 'RO #', 'Invoice'])
      ?? sourceUrl.match(/\/work_orders\/([^/?#]+)/i)?.[1],
  );
  const technician = labeled(summary, ['Technician', 'Tech', 'Assigned Technician']);
  const advisor = labeled(summary, ['Service Advisor', 'Advisor', 'Created By']);
  const department = labeled(summary, ['Department', 'Shop', 'Team']);
  const status = labeled(summary, ['Status', 'Stage']) ?? parseReconStage(summary);
  const candidateLines = summary
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8 && line.length <= 240)
    .filter((line) => /(?:replace|repair|inspect|install|mount|balance|detail|clean|diagnos|oil|brake|tire|battery|alignment|paint|body|glass|recall|service|performed|completed)/i.test(line))
    .filter((line) => !/^(?:status|stage|department|technician|tech|service advisor|advisor|created by|opened|completed|closed|updated)\s*:/i.test(line))
    .filter((line) => !/^(?:DMS RO Details|Body Shop|Vehicle Details|Mechanical Inspection & Test Drive|TASK COMPLETED|Review Inspection|Mechanical Repairs|Detail & Photos|DETAIL & PH\.\.\.|INSPECTION)$/i.test(line));
  const workPerformed = [...new Set(candidateLines)].slice(0, 20);
  return {
    repairOrder,
    department,
    status,
    openedAt: labeled(summary, ['Opened', 'Created', 'RO Opened']) ?? dates[0] ?? null,
    completedAt: labeled(summary, ['Completed', 'Closed', 'RO Closed']) ?? dates.at(-1) ?? null,
    technician,
    advisor,
    workPerformed,
    sourceUrl,
  };
}

export function parseReconTimeline(summary: string, sourceUrl: string) {
  const rows = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\t/.test(line) && !/^invoice\t/i.test(line));
  return rows.map((row) => {
    const [repairOrder, department, updatedAt] = row.split('\t').map((value) => value.trim());
    return {
      repairOrder: repairOrder || null,
      department: department || null,
      status: department || null,
      openedAt: null,
      completedAt: updatedAt || null,
      technician: null,
      advisor: null,
      workPerformed: [],
      sourceUrl,
    };
  });
}

export function parseOneMicroKey(summary: string, imageUrls: string[] = []) {
  const holder = labeled(summary, [
    'Last Checked Out By',
    'Last Key User',
    'Last Borrower',
    'Checked Out By',
    'Assigned To',
    'Holder',
  ]);
  const lastCheckedOutAt = labeled(summary, [
    'Last Checked Out',
    'Checkout Time',
    'Last Activity',
    'Last Accessed',
    'Checked Out At',
  ]);
  const activity = summary
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /\b(?:checked?\s*(?:in|out)|borrowed|returned|removed|key\s+(?:taken|returned))\b/i.test(line))
    .slice(0, 12);
  const usefulImage = imageUrls.find((url) => !/(?:logo|icon|avatar|sprite|favicon)/i.test(url)) ?? null;
  return {
    location: labeled(summary, ['Tag Location', 'Key Location']) ?? labeled(summary, ['Lot Location']),
    lotLocation: labeled(summary, ['Lot Location']),
    holder,
    lastCheckedOutBy: holder,
    lastCheckedOutAt,
    keyImageUrl: usefulImage,
    activity,
  };
}

export type OneMicroHistoryRow = {
  createdOn: string | null;
  createdBy: string | null;
  closedOn: string | null;
  closedBy: string | null;
  event: string | null;
  kiosk: string | null;
  tagId: string | null;
  reason: string | null;
};

export function parseOneMicroHistory(rows: OneMicroHistoryRow[], imageUrls: string[] = []) {
  const normalized = rows.map((row) => ({
    createdOn: clean(row.createdOn),
    createdBy: clean(row.createdBy),
    closedOn: clean(row.closedOn),
    closedBy: clean(row.closedBy),
    event: clean(row.event),
    kiosk: clean(row.kiosk),
    tagId: clean(row.tagId),
    reason: clean(row.reason),
  }));
  const checkout = normalized.find((row) => /\b(?:remove|checkout|assign)\b/i.test(row.event ?? ''));
  const usefulImage = imageUrls.find((url) => !/(?:logo|icon|avatar|sprite|favicon)/i.test(url)) ?? null;
  return {
    history: normalized.slice(0, 50),
    activity: normalized.slice(0, 12).map((row) => (
      [row.event, row.createdBy, row.createdOn, row.reason].filter(Boolean).join(' · ')
    )),
    lastCheckedOutBy: checkout?.createdBy ?? null,
    lastCheckedOutAt: checkout?.createdOn ?? null,
    keyImageUrl: usefulImage,
  };
}

export function parseCarfaxReport(summary: string, reportUrl: string) {
  const ownerMatch = summary.match(/\bCARFAX\s+(\d+)-Owner Vehicle\b/i)
    ?? summary.match(/\b(\d+)\s+Owner(?:s)?\b/i);
  const serviceMatch = summary.match(/\b(\d+)\s+Service History Records\b/i);
  const valueSection = summary.match(/CARFAX History-Based Value[\s\S]{0,300}?\$([\d,]+)/i);
  const mileageMatches = [...summary.matchAll(/\b([\d,]+)\s*mi\b/gi)];
  const eventNumbers = new Set(
    [...summary.matchAll(/^Event\s+(\d+)\s*$/gim)].map((match) => match[1]),
  );
  const accidentEntries = [...summary.matchAll(/Accident reported:?\s*(?:(\d{2}\/\d{2}\/\d{4})[.\s-]*)?([^\r\n]*)/gi)];
  const accidentDates = new Set(accidentEntries.map((match) => match[1]).filter(Boolean));
  const accidents = eventNumbers.size || accidentDates.size || (/\bAccident Reported\b/i.test(summary) ? 1 : 0);
  const titleStatus = /\b(?:No branded title|No title problems reported)\b/i.test(summary)
    ? 'No branded title reported'
    : labeled(summary, ['Title History', 'Title Status']);
  const warranty = /\bwarranty (?:has )?expired\b/i.test(summary)
    ? 'Original warranty expired'
    : labeled(summary, ['Original Warranty', 'Warranty']) ?? (
      /\bestimated to have\b[^\r\n]*\bwarranty\b/i.test(summary)
        ? clean(summary.match(/([^\r\n]*estimated to have[^\r\n]*warranty[^\r\n]*)/i)?.[1])
        : null
    );
  const lastOwned = clean(summary.match(/\bLast owned in\s+([A-Za-z .'-]+)/i)?.[1]);
  const usage = clean(summary.match(/\b(Personal|Corporate|Commercial|Rental|Lease|Fleet)\s+Vehicle\b/i)?.[0]);
  const highlights = [
    ownerMatch ? `${ownerMatch[1]} owner vehicle` : null,
    accidents ? `${accidents} accident event${accidents === 1 ? '' : 's'} reported` : 'No accident event found in the report',
    serviceMatch ? `${serviceMatch[1]} service history records` : null,
    lastOwned ? `Last owned in ${lastOwned}` : null,
    usage,
    warranty,
    /\bNo total loss reported\b/i.test(summary) ? 'No total loss reported' : null,
    /\bNo structural damage reported\b/i.test(summary) ? 'No structural damage reported' : null,
    /\bNo airbag deployment reported\b/i.test(summary) ? 'No airbag deployment reported' : null,
    /\bNo indication of an odometer rollback\b/i.test(summary) ? 'No odometer rollback indicated' : null,
    /\bNo open recalls reported\b/i.test(summary) ? 'No open recalls reported' : null,
  ].filter((value): value is string => Boolean(value));
  const carfaxValue = valueSection ? Number(valueSection[1].replace(/,/g, '')) : null;
  const mileageText = mileageMatches.at(-1)?.[1];
  const mileage = mileageText ? Number(mileageText.replace(/,/g, '')) : null;
  const accidentHistory = accidentEntries.slice(0, 10).map((match) => ({
    date: match[1] ?? null,
    detail: clean(match[2]) ?? 'Accident reported',
  }));
  const serviceHistory = summary
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => /\b(?:vehicle serviced|maintenance inspection|oil and filter|tires? (?:rotated|replaced)|brakes? (?:checked|replaced|serviced))\b/i.test(line))
    .slice(0, 30);

  return {
    owners: ownerMatch ? Number(ownerMatch[1]) : null,
    lastOwnedState: lastOwned,
    usage,
    accidents,
    accidentHistory,
    service: serviceMatch ? `${serviceMatch[1]} service history records` : null,
    serviceRecords: serviceMatch ? Number(serviceMatch[1]) : null,
    serviceHistory,
    warranty,
    titleStatus,
    totalLossReported: /\bTotal loss reported\b/i.test(summary) && !/\bNo total loss reported\b/i.test(summary),
    structuralDamageReported: /\bStructural damage reported\b/i.test(summary) && !/\bNo structural damage reported\b/i.test(summary),
    airbagDeploymentReported: /\bAirbag deployment reported\b/i.test(summary) && !/\bNo airbag deployment reported\b/i.test(summary),
    odometerRollbackIndicated: /\bodometer rollback\b/i.test(summary) && !/\bNo indication of an odometer rollback\b/i.test(summary),
    openRecallsReported: /\bopen recalls? reported\b/i.test(summary) && !/\bNo open recalls reported\b/i.test(summary),
    carfaxValue: Number.isFinite(carfaxValue) ? carfaxValue : null,
    mileage: Number.isFinite(mileage) ? mileage : null,
    highlights,
    reportUrl,
  };
}

export function normalizePortalFields(
  connectorId: PortalConnectorId,
  values: Record<string, string | undefined>,
) {
  if (connectorId === 'reconvision') {
    const readyText = values.frontlineReady?.trim() ?? '';
    const explicitlyNotReady = /\b(?:no|not|false|incomplete|pending)\b/i.test(readyText);
    return {
      stage: values.stage?.trim() || null,
      openWork: listValue(values.openWork),
      frontlineReady: readyText ? !explicitlyNotReady && /\b(?:yes|true|ready|complete|completed)\b/i.test(readyText) : null,
    };
  }
  if (connectorId === 'onemicro') return {
    location: values.location?.trim() || null,
    holder: values.holder?.trim() || null,
  };
  return {};
}
