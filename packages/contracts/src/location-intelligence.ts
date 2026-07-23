import zipcodes from 'zipcodes';
import type { LeadContext, Role } from './types.js';

export type LocationSource = 'zip' | 'page_city_state' | 'phone_area' | 'unknown';
export type LocationConfidence = 'zip_confirmed' | 'page_confirmed' | 'estimated_from_phone' | 'unknown';
export type LocationClassification = 'local' | 'local_far' | 'out_of_state' | 'unknown';

interface DealershipLocationInput {
  address?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zipCode?: string | undefined;
}

interface CustomerLocationIntelData {
  source: LocationSource;
  confidence: LocationConfidence;
  classification: LocationClassification;
  route: 'showroom' | 'remote';
  zipCode?: string;
  city?: string;
  state?: string;
  distanceMiles?: number;
  driveTimeMinutes?: number;
  label: string;
  summary: string;
  nextStep: string;
  rapportAnchor?: string;
  evidence: string[];
  askForZip: boolean;
}

const defaultDealershipLocation: { address: string; city: string; state: string; zipCode: string } = {
  address: '777 N State Road 7',
  city: 'Plantation',
  state: 'FL',
  zipCode: '33317',
};

const stateNames: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

const stateCodes = new Set([
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

const phoneAreaCodes: Record<
  string,
  {
    city: string;
    state: string;
    rapportAnchor: string;
  }
> = {
  '201': { city: 'Jersey City / northern New Jersey', state: 'NJ', rapportAnchor: 'NYC-area food or Meadowlands traffic' },
  '202': { city: 'Washington', state: 'DC', rapportAnchor: 'DC landmarks and food spots' },
  '203': { city: 'Bridgeport / New Haven', state: 'CT', rapportAnchor: 'New Haven pizza' },
  '205': { city: 'Birmingham', state: 'AL', rapportAnchor: 'Birmingham barbecue' },
  '206': { city: 'Seattle', state: 'WA', rapportAnchor: 'Seattle coffee and waterfront landmarks' },
  '210': { city: 'San Antonio', state: 'TX', rapportAnchor: 'the River Walk and Texas food spots' },
  '212': { city: 'New York', state: 'NY', rapportAnchor: 'New York pizza or Midtown traffic' },
  '213': { city: 'Los Angeles', state: 'CA', rapportAnchor: 'LA food spots and freeway traffic' },
  '214': { city: 'Dallas', state: 'TX', rapportAnchor: 'Dallas barbecue and sports' },
  '215': { city: 'Philadelphia', state: 'PA', rapportAnchor: 'Philly cheesesteaks and Center City' },
  '216': { city: 'Cleveland', state: 'OH', rapportAnchor: 'Cleveland food and lakefront landmarks' },
  '217': { city: 'central Illinois', state: 'IL', rapportAnchor: 'Illinois college towns and road trips' },
  '225': { city: 'Baton Rouge', state: 'LA', rapportAnchor: 'Louisiana food and LSU country' },
  '229': { city: 'South Georgia', state: 'GA', rapportAnchor: 'South Georgia barbecue and college-town food spots' },
  '239': { city: 'Fort Myers / Naples', state: 'FL', rapportAnchor: 'Gulf Coast beaches' },
  '248': { city: 'Detroit suburbs', state: 'MI', rapportAnchor: 'Detroit-style pizza and Woodward Avenue' },
  '281': { city: 'Houston metro', state: 'TX', rapportAnchor: 'Houston barbecue and Gulf Coast drives' },
  '301': { city: 'Maryland / DC suburbs', state: 'MD', rapportAnchor: 'DC-area traffic and Maryland food spots' },
  '302': { city: 'Delaware', state: 'DE', rapportAnchor: 'Delaware beaches and tax-free shopping' },
  '303': { city: 'Denver', state: 'CO', rapportAnchor: 'Denver mountain drives' },
  '305': { city: 'Miami', state: 'FL', rapportAnchor: 'Miami food and Doral traffic' },
  '312': { city: 'Chicago', state: 'IL', rapportAnchor: 'Chicago deep dish or lakefront landmarks' },
  '313': { city: 'Detroit', state: 'MI', rapportAnchor: 'Detroit-style pizza and car culture' },
  '314': { city: 'St. Louis', state: 'MO', rapportAnchor: 'St. Louis barbecue and the Arch' },
  '321': { city: 'Central Florida', state: 'FL', rapportAnchor: 'Orlando and Space Coast drives' },
  '323': { city: 'Los Angeles', state: 'CA', rapportAnchor: 'LA food spots and freeway traffic' },
  '330': { city: 'Akron / Canton', state: 'OH', rapportAnchor: 'Ohio road trips and local food spots' },
  '334': { city: 'Montgomery / southeast Alabama', state: 'AL', rapportAnchor: 'Alabama barbecue and college football' },
  '336': { city: 'Greensboro / Winston-Salem', state: 'NC', rapportAnchor: 'North Carolina barbecue and Piedmont drives' },
  '352': { city: 'Gainesville / Ocala', state: 'FL', rapportAnchor: 'Gainesville and horse-country drives' },
  '404': { city: 'Atlanta', state: 'GA', rapportAnchor: 'Atlanta lemon pepper wings, barbecue, and peach desserts' },
  '405': { city: 'Oklahoma City', state: 'OK', rapportAnchor: 'Oklahoma City food spots and Route 66 drives' },
  '407': { city: 'Orlando', state: 'FL', rapportAnchor: 'Orlando and I-4 traffic' },
  '410': { city: 'Baltimore', state: 'MD', rapportAnchor: 'Maryland crab cakes and Inner Harbor' },
  '414': { city: 'Milwaukee', state: 'WI', rapportAnchor: 'Milwaukee lakefront and food spots' },
  '415': { city: 'San Francisco', state: 'CA', rapportAnchor: 'Bay Area bridges and food spots' },
  '469': { city: 'Dallas', state: 'TX', rapportAnchor: 'Dallas barbecue and sports' },
  '470': { city: 'Atlanta metro', state: 'GA', rapportAnchor: 'Atlanta lemon pepper wings and barbecue' },
  '478': { city: 'Macon / central Georgia', state: 'GA', rapportAnchor: 'Macon soul food and Georgia barbecue' },
  '501': { city: 'Little Rock / central Arkansas', state: 'AR', rapportAnchor: 'Arkansas barbecue and Ozark road trips' },
  '502': { city: 'Louisville', state: 'KY', rapportAnchor: 'Louisville food spots and bourbon country' },
  '503': { city: 'Portland', state: 'OR', rapportAnchor: 'Portland food carts and mountain drives' },
  '504': { city: 'New Orleans', state: 'LA', rapportAnchor: 'New Orleans food and music' },
  '512': { city: 'Austin', state: 'TX', rapportAnchor: 'Austin barbecue and hill country drives' },
  '513': { city: 'Cincinnati', state: 'OH', rapportAnchor: 'Cincinnati chili and riverfront spots' },
  '561': { city: 'Palm Beach', state: 'FL', rapportAnchor: 'Boca and Palm Beach drives' },
  '602': { city: 'Phoenix', state: 'AZ', rapportAnchor: 'Phoenix desert drives and food spots' },
  '614': { city: 'Columbus', state: 'OH', rapportAnchor: 'Columbus food spots and Buckeye country' },
  '615': { city: 'Nashville', state: 'TN', rapportAnchor: 'Nashville hot chicken and music spots' },
  '617': { city: 'Boston', state: 'MA', rapportAnchor: 'Boston neighborhoods and seafood' },
  '678': { city: 'Atlanta metro', state: 'GA', rapportAnchor: 'Atlanta lemon pepper wings and barbecue' },
  '702': { city: 'Las Vegas', state: 'NV', rapportAnchor: 'Las Vegas food spots and desert drives' },
  '704': { city: 'Charlotte', state: 'NC', rapportAnchor: 'Charlotte food spots and Carolina drives' },
  '706': { city: 'North Georgia / Augusta / Columbus', state: 'GA', rapportAnchor: 'Georgia barbecue and mountain drives' },
  '713': { city: 'Houston', state: 'TX', rapportAnchor: 'Houston barbecue and Gulf Coast drives' },
  '727': { city: 'St. Pete / Clearwater', state: 'FL', rapportAnchor: 'Tampa Bay beaches' },
  '754': { city: 'Broward', state: 'FL', rapportAnchor: 'Broward and Sawgrass Mills' },
  '762': { city: 'North Georgia / Augusta / Columbus', state: 'GA', rapportAnchor: 'Georgia barbecue and mountain drives' },
  '770': { city: 'Atlanta suburbs', state: 'GA', rapportAnchor: 'Atlanta lemon pepper wings and barbecue' },
  '772': { city: 'Treasure Coast', state: 'FL', rapportAnchor: 'Treasure Coast drives' },
  '786': { city: 'Miami', state: 'FL', rapportAnchor: 'Miami and Doral food spots' },
  '801': { city: 'Salt Lake City', state: 'UT', rapportAnchor: 'Salt Lake mountain drives' },
  '813': { city: 'Tampa', state: 'FL', rapportAnchor: 'Tampa Bay and I-4 drives' },
  '850': { city: 'Florida Panhandle', state: 'FL', rapportAnchor: 'Panhandle beaches' },
  '863': { city: 'Lakeland / Central Florida', state: 'FL', rapportAnchor: 'Lakeland and Central Florida drives' },
  '904': { city: 'Jacksonville', state: 'FL', rapportAnchor: 'Jacksonville and north Florida drives' },
  '912': { city: 'Savannah / coastal Georgia', state: 'GA', rapportAnchor: 'Savannah seafood and Lowcountry-style spots' },
  '918': { city: 'Tulsa', state: 'OK', rapportAnchor: 'Tulsa barbecue and Route 66 spots' },
  '941': { city: 'Sarasota / Bradenton', state: 'FL', rapportAnchor: 'Sarasota beaches and Gulf Coast drives' },
  '943': { city: 'Atlanta metro', state: 'GA', rapportAnchor: 'Atlanta lemon pepper wings and barbecue' },
  '954': { city: 'Broward', state: 'FL', rapportAnchor: 'Plantation and Sawgrass Mills' },
  '972': { city: 'Dallas', state: 'TX', rapportAnchor: 'Dallas barbecue and sports' },
};

function compact(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : undefined;
}

function normalizeState(value: string | undefined) {
  const normalized = compact(value)?.toUpperCase();
  if (!normalized) return undefined;
  if (stateCodes.has(normalized)) return normalized;
  return stateNames[normalized];
}

export function normalizeZip(value: string | undefined) {
  return value?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0].slice(0, 5);
}

function likelyStoreLine(line: string, originZip: string | undefined) {
  return (
    Boolean(originZip && new RegExp(`\\b${originZip}\\b`).test(line) && /\b(dealer|dealership|store|taverna|sales|service|parts|state road|plantation)\b/i.test(line)) ||
    /\b(777\s+N\s+State\s+Road\s+7|Taverna|Sales:\s*\d|Service:\s*\d|Parts:\s*\d|dealership)\b/i.test(line)
  );
}

function zipScore(line: string, originZip: string | undefined) {
  if (likelyStoreLine(line, originZip)) return -100;
  if (/\b(?:customer|buyer|deal|stock|vin|dms|atlas|lead)\s*#?\s*\d{4,8}\b/i.test(line)) return -100;
  let score = 0;
  if (/\b(zip|postal|address|city|state|shopper|home|from|located|lives|where are you|my zip)\b/i.test(line)) score += 20;
  if (/\b(phone|mobile|tel|stock|vin|price|payment|dealership|store|sales|service|parts|customer\s*#|deal\s*#|buyer\s*#)\b/i.test(line)) score -= 25;
  if (originZip && line.includes(originZip)) score -= 15;
  if (line.length <= 80) score += 5;
  return score;
}

export function extractZipCodeFromText(text: string | undefined, options?: { excludeZips?: string[] }) {
  const originZip = options?.excludeZips?.[0];
  const lines = (text ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const candidates = lines
    .flatMap((line, index) =>
      [...line.matchAll(/\b\d{5}(?:-\d{4})?\b/g)].map((match) => ({
        zip: match[0].slice(0, 5),
        line,
        index,
        score: zipScore(line, originZip),
      })),
    )
    .filter((candidate) => !options?.excludeZips?.includes(candidate.zip))
    .filter((candidate) => candidate.score > -50)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return candidates[0]?.zip;
}

function lookupZip(zip: string | undefined) {
  return zip ? zipcodes.lookup(zip) : undefined;
}

function zipRegion(zip: string) {
  const prefix = Number(zip.slice(0, 3));
  if (prefix >= 6 && prefix <= 9) return { label: 'US Caribbean', anchor: 'island shipping logistics and local food spots' };
  if (prefix >= 10 && prefix <= 199) return { label: 'Northeast', anchor: 'local pizza, seafood, city landmarks, or sports' };
  if (prefix >= 200 && prefix <= 269) return { label: 'Mid-Atlantic', anchor: 'DC/Virginia landmarks, mountain drives, or barbecue' };
  if (prefix >= 270 && prefix <= 299) return { label: 'Carolinas', anchor: 'Carolina barbecue, beaches, mountain drives, or college towns' };
  if (prefix >= 300 && prefix <= 399) return { label: 'Southeast', anchor: 'Southern food, coastal spots, mountains, or college towns' };
  if (prefix >= 400 && prefix <= 427) return { label: 'Kentucky / Appalachia', anchor: 'bourbon country, horse country, barbecue, or mountain drives' };
  if (prefix >= 428 && prefix <= 499) return { label: 'Great Lakes / Midwest', anchor: 'Midwest food, lakefronts, sports, or college towns' };
  if (prefix >= 500 && prefix <= 599) return { label: 'Upper Midwest / Plains', anchor: 'road trips, lakes, hometown food, or college towns' };
  if (prefix >= 600 && prefix <= 699) return { label: 'Central Midwest', anchor: 'Chicago, St. Louis, Kansas City, college towns, or barbecue' };
  if (prefix >= 700 && prefix <= 799) return { label: 'South Central / Texas / Gulf', anchor: 'Texas barbecue, Louisiana food, Gulf Coast, or road trips' };
  if (prefix >= 800 && prefix <= 899) return { label: 'Mountain West / Southwest', anchor: 'mountains, desert drives, parks, or ski towns' };
  if (prefix >= 900 && prefix <= 999) return { label: 'West Coast', anchor: 'coast, food, traffic, mountains, or city neighborhoods' };
  return { label: 'non-local area', anchor: 'a safe food, travel, landmark, or sports reference' };
}

function cityStateFromText(text: string | undefined) {
  const value = compact(text);
  if (!value) return {};
  const comma = value.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*([A-Z]{2}|[A-Za-z ]{4,24})\b/);
  if (comma?.[1] && comma[2]) {
    return { city: compact(comma[1]), state: normalizeState(comma[2]) };
  }
  const loose = value.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\s+([A-Z]{2})\s+\d{5}\b/);
  if (loose?.[1] && loose[2]) {
    return { city: compact(loose[1]), state: normalizeState(loose[2]) };
  }
  const stateOnly = value.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/);
  return { state: normalizeState(stateOnly?.[1]) };
}

function phoneAreaFromNumbers(phoneNumbers: string[] | undefined) {
  for (const phone of phoneNumbers ?? []) {
    const digits = phone.replace(/\D/g, '').replace(/^1/, '');
    const area = digits.slice(0, 3);
    if (phoneAreaCodes[area]) return { area, ...phoneAreaCodes[area] };
  }
  return undefined;
}

function driveMinutes(distanceMiles: number | undefined) {
  return typeof distanceMiles === 'number' ? Math.max(5, Math.round((distanceMiles / 45) * 60)) : undefined;
}

function classify(state: string | undefined, originState: string, driveTimeMinutes: number | undefined): LocationClassification {
  if (!state) return 'unknown';
  if (state !== originState) return 'out_of_state';
  if (typeof driveTimeMinutes === 'number') return driveTimeMinutes <= 120 ? 'local' : 'local_far';
  return 'local_far';
}

function buildIntel(input: {
  source: LocationSource;
  confidence: LocationConfidence;
  zipCode?: string;
  city?: string;
  state?: string;
  distanceMiles?: number;
  driveTimeMinutes?: number;
  originState: string;
  rapportAnchor?: string;
  evidence: string[];
}): CustomerLocationIntelData {
  const classification = classify(input.state, input.originState, input.driveTimeMinutes);
  const where = [input.city, input.state].filter(Boolean).join(', ') || input.zipCode || 'location unknown';
  const distance =
    typeof input.driveTimeMinutes === 'number'
      ? ` About ${input.driveTimeMinutes} minutes away.`
      : typeof input.distanceMiles === 'number'
        ? ` About ${input.distanceMiles} miles away.`
        : '';

  if (classification === 'local') {
    return {
      ...input,
      classification,
      route: 'showroom',
      label: 'Local',
      summary: `Customer appears local near ${where}.${distance}`,
      nextStep: 'Answer their question and make the visit easy only after value is clear and they are appointment-ready.',
      askForZip: input.source !== 'zip',
    };
  }

  if (classification === 'local_far') {
    return {
      ...input,
      classification,
      route: 'showroom',
      label: 'Local but far',
      summary: `Customer appears in Florida but not close to Plantation.${distance}`,
      nextStep: 'Verify availability, condition, numbers, and trade path before asking for the drive.',
      askForZip: input.source !== 'zip',
    };
  }

  if (classification === 'out_of_state') {
    return {
      ...input,
      classification,
      route: 'remote',
      label: 'Out of state',
      summary: `Customer appears out of state near ${where}.${distance}`,
      nextStep: 'Build remote confidence first: verify availability, video/condition, real numbers, then shipping or pickup. Use credit only if financing is relevant.',
      askForZip: input.source !== 'zip',
    };
  }

  return {
    source: input.source,
    confidence: input.confidence,
    classification,
    route: 'remote',
    ...(input.zipCode ? { zipCode: input.zipCode } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.state ? { state: input.state } : {}),
    ...(input.distanceMiles ? { distanceMiles: input.distanceMiles } : {}),
    ...(input.driveTimeMinutes ? { driveTimeMinutes: input.driveTimeMinutes } : {}),
    label: 'Unknown location',
    summary: 'Customer location is not reliable yet.',
    nextStep: 'Ask for ZIP before choosing visit, remote numbers, or delivery path.',
    ...(input.rapportAnchor ? { rapportAnchor: input.rapportAnchor } : {}),
    evidence: input.evidence,
    askForZip: true,
  };
}

export function dealershipLocationFromSettings(settings: unknown, fallback: DealershipLocationInput = defaultDealershipLocation): DealershipLocationInput {
  const record = settings && typeof settings === 'object' ? (settings as { dealershipLocation?: Record<string, unknown> }) : {};
  const value = record.dealershipLocation ?? {};
  const address = compact(value.address) ?? fallback.address;
  const city = compact(value.city) ?? fallback.city;
  const state = normalizeState(compact(value.state)) ?? fallback.state;
  const zipCode = normalizeZip(compact(value.zipCode)) ?? fallback.zipCode;
  return {
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(zipCode ? { zipCode } : {}),
  };
}

export function enrichLeadLocation(context: LeadContext, dealershipLocation: DealershipLocationInput = defaultDealershipLocation): LeadContext {
  const originState = normalizeState(dealershipLocation.state) ?? defaultDealershipLocation.state;
  const originZip = normalizeZip(dealershipLocation.zipCode) ?? defaultDealershipLocation.zipCode;
  const origin = {
    address: dealershipLocation.address ?? defaultDealershipLocation.address,
    city: dealershipLocation.city ?? defaultDealershipLocation.city,
    state: originState,
    zipCode: originZip,
  };
  const explicitZip =
    normalizeZip(context.customerZipCode) ??
    extractZipCodeFromText([context.customerLocation, ...(context.priorMessages ?? []), context.visibleText].filter(Boolean).join('\n'), {
      excludeZips: [originZip],
    });

  if (explicitZip) {
    const lookup = lookupZip(explicitZip);
    const textCityState = cityStateFromText(context.customerLocation);
    const distance = lookupZip(originZip) && lookup ? zipcodes.distance(originZip, explicitZip) ?? undefined : undefined;
    const roundedDistance = typeof distance === 'number' ? Math.round(distance) : undefined;
    const estimatedDriveMinutes = driveMinutes(roundedDistance);
    const resolvedCity = lookup?.city ?? textCityState.city;
    const resolvedState = lookup?.state ?? textCityState.state;
    const region = zipRegion(explicitZip);
    return {
      ...context,
      customerZipCode: explicitZip,
      customerLocation: context.customerLocation ?? [resolvedCity, resolvedState, explicitZip].filter(Boolean).join(' '),
      locationIntel: buildIntel({
        source: 'zip',
        confidence: 'zip_confirmed',
        zipCode: explicitZip,
        ...(resolvedCity ? { city: resolvedCity } : {}),
        ...(resolvedState ? { state: resolvedState } : {}),
        ...(typeof roundedDistance === 'number' ? { distanceMiles: roundedDistance } : {}),
        ...(typeof estimatedDriveMinutes === 'number' ? { driveTimeMinutes: estimatedDriveMinutes } : {}),
        originState: origin.state,
        rapportAnchor: lookup ? `${lookup.city} local food, landmarks, or well-known neighborhood` : region.anchor,
        evidence: lookup
          ? [`ZIP ${explicitZip} maps to ${lookup.city}, ${lookup.state}.`]
          : [`ZIP ${explicitZip} was found, but city/state lookup was unavailable. Treat as ${region.label} until confirmed.`],
      }),
    };
  }

  const pageCityState = cityStateFromText(context.customerLocation);
  if (pageCityState.state) {
    return {
      ...context,
      locationIntel: buildIntel({
        source: 'page_city_state',
        confidence: 'page_confirmed',
        ...(pageCityState.city ? { city: pageCityState.city } : {}),
        state: pageCityState.state,
        originState: origin.state,
        ...(pageCityState.city ? { rapportAnchor: `${pageCityState.city} local food or landmarks` } : {}),
        evidence: [`Page location shows ${[pageCityState.city, pageCityState.state].filter(Boolean).join(', ')}.`],
      }),
    };
  }

  const area = phoneAreaFromNumbers(context.phoneNumbers);
  if (area) {
    return {
      ...context,
      locationIntel: buildIntel({
        source: 'phone_area',
        confidence: 'estimated_from_phone',
        city: area.city,
        state: area.state,
        originState: origin.state,
        rapportAnchor: area.rapportAnchor,
        evidence: [`Phone area code ${area.area} suggests ${area.city}, ${area.state}; confirm before treating it as fact.`],
      }),
    };
  }

  return {
    ...context,
    locationIntel: buildIntel({
      source: 'unknown',
      confidence: 'unknown',
      originState: origin.state,
      evidence: ['No ZIP, reliable city/state, or known phone area code was found.'],
    }),
  };
}

export function formatLocationStatus(intel: LeadContext['locationIntel']) {
  if (!intel) return 'Unknown - ask ZIP';
  if (intel.confidence === 'zip_confirmed') return `ZIP confirmed${intel.zipCode ? ` ${intel.zipCode}` : ''}`;
  if (intel.confidence === 'page_confirmed') return 'Page location confirmed';
  if (intel.confidence === 'estimated_from_phone') return 'Estimated from phone';
  return 'Unknown - ask ZIP';
}

export function primaryCtaForLocation(intel: LeadContext['locationIntel'], role: Role | undefined) {
  if (role === 'bdc') {
    if (intel?.classification === 'out_of_state') return 'Remote Plan';
    if (intel?.classification === 'local_far') return 'Confirm Before Trip';
    if (intel?.classification === 'unknown') return 'Ask for ZIP';
    return 'Bring Them In';
  }
  if (intel?.classification === 'out_of_state') return 'Remote Plan';
  if (intel?.classification === 'local_far') return 'Confirm Before Trip';
  if (intel?.classification === 'unknown') return 'Ask for ZIP';
  return 'Close This Lead';
}

export function locationStrategyReason(intel: LeadContext['locationIntel']) {
  if (!intel) return 'Because location is unknown, ask for ZIP before choosing visit or remote path.';
  if (intel.classification === 'local') return 'Because ZIP/location shows they are close enough for a store visit.';
  if (intel.classification === 'local_far') return 'Because they are in Florida but far enough to verify details before the trip.';
  if (intel.classification === 'out_of_state') return 'Because out-of-state buyers need confidence, verified numbers, video/condition proof, and logistics before travel. Credit app only belongs here if they are discussing financing or payment.';
  return 'Because location is unknown, ask for ZIP before choosing visit or remote path.';
}
