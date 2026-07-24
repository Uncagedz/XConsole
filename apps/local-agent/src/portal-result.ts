import type { PortalConnectorId } from './config.js';

function listValue(value: string | undefined) {
  if (!value) return [];
  return value.split(/\r?\n|;/).map((item) => item.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean);
}

export function parseReconStage(summary: string) {
  const tableRow = summary.match(/\t([^\t\r\n]+)\t\d{2}\/\d{2}\/\d{4}\s/);
  if (tableRow?.[1]) return tableRow[1].trim();
  const values = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const updatedIndex = values.findIndex((value) => /^\d{2}\/\d{2}\/\d{4}\s/.test(value));
  return updatedIndex > 0 ? values[updatedIndex - 1] : null;
}

export function parseCarfaxReport(summary: string, reportUrl: string) {
  const ownerMatch = summary.match(/\bCARFAX\s+(\d+)-Owner Vehicle\b/i);
  const serviceMatch = summary.match(/\b(\d+)\s+Service History Records\b/i);
  const valueSection = summary.match(/CARFAX History-Based Value[\s\S]{0,300}?\$([\d,]+)/i);
  const mileageMatch = summary.match(/\b([\d,]+)\s*mi\b/i);
  const eventNumbers = new Set(
    [...summary.matchAll(/^Event\s+(\d+)\s*$/gim)].map((match) => match[1]),
  );
  const accidentDates = new Set(
    [...summary.matchAll(/Accident reported:\s*(\d{2}\/\d{2}\/\d{4})/gi)].map((match) => match[1]),
  );
  const accidents = eventNumbers.size || accidentDates.size || (/\bAccident Reported\b/i.test(summary) ? 1 : 0);
  const highlights = [
    ownerMatch ? `${ownerMatch[1]} owner vehicle` : null,
    accidents ? `${accidents} accident event${accidents === 1 ? '' : 's'} reported` : 'No accident event found in the report',
    serviceMatch ? `${serviceMatch[1]} service history records` : null,
    /\bNo total loss reported\b/i.test(summary) ? 'No total loss reported' : null,
    /\bNo airbag deployment reported\b/i.test(summary) ? 'No airbag deployment reported' : null,
    /\bNo indication of an odometer rollback\b/i.test(summary) ? 'No odometer rollback indicated' : null,
    /\bNo open recalls reported\b/i.test(summary) ? 'No open recalls reported' : null,
  ].filter((value): value is string => Boolean(value));
  const carfaxValue = valueSection ? Number(valueSection[1].replace(/,/g, '')) : null;
  const mileage = mileageMatch ? Number(mileageMatch[1].replace(/,/g, '')) : null;

  return {
    owners: ownerMatch ? Number(ownerMatch[1]) : null,
    accidents,
    service: serviceMatch ? `${serviceMatch[1]} service history records` : null,
    serviceRecords: serviceMatch ? Number(serviceMatch[1]) : null,
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
