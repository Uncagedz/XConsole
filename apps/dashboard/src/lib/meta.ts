export interface CarfaxSignals {
  owners?: number;
  accidents?: number;
  serviceRecords?: number;
  warrantyRemainingMi?: number;
  states: string[];
}

const US_STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
]);

function captureInt(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1].replace(/,/g, ''), 10);
}

export function extractCarfaxSignals(text: string): CarfaxSignals {
  const owners =
    captureInt(text, /\b(\d+)\s+owner(?:s)?\b/i) ??
    captureInt(text, /\bowner(?:s)?\s*:\s*(\d+)\b/i);
  const accidents =
    captureInt(text, /\b(\d+)\s+accident(?:s)?\b/i) ??
    captureInt(text, /\baccident(?:s)?\s*:\s*(\d+)\b/i);
  const serviceRecords =
    captureInt(text, /\bservice\s+records?\s*:\s*(\d+)\b/i) ??
    captureInt(text, /\b(\d+)\s+documented\s+visits?\b/i);
  const warrantyRemainingMi = captureInt(
    text,
    /\bwarranty\s+remaining\s*([\d,]+)\s*miles?\b/i,
  );

  const states = Array.from(
    new Set(
      (text.match(/\b[A-Z]{2}\b/g) || []).filter((token) =>
        US_STATE_CODES.has(token.toUpperCase()),
      ),
    ),
  );

  return {
    owners,
    accidents,
    serviceRecords,
    warrantyRemainingMi,
    states,
  };
}
