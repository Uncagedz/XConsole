import type { InventoryVehicle, LeadContext } from './types.js';

export type MarketType = 'local' | 'regional' | 'out_of_state' | 'unknown';
export type LeadRoute = 'showroom' | 'remote';

export interface StoreProfile {
  name: string;
  city: string;
  state: string;
  zip: string;
  address: string;
}

export interface ZipDirectoryEntry {
  zip: string;
  city: string;
  county: string;
  state: string;
  marketType: Exclude<MarketType, 'unknown'>;
  landmarks: string[];
}

export interface LocationInsight {
  marketType: MarketType;
  route: LeadRoute;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  landmark?: string;
  confidence?: string;
  distanceMiles?: number;
  driveTimeMinutes?: number;
  classification?: string;
  askForZip?: boolean;
  summary: string;
  nextStep: string;
  talkingPoints: string[];
  evidence: string[];
}

export interface BuyerProfile {
  summary: string;
  affordabilityRead: string;
  fitRead: string;
  shopperMotives: string[];
  guidance: string[];
}

export const tavernaStoreProfile: StoreProfile = {
  name: 'Taverna Chrysler Dodge Jeep Ram Fiat',
  city: 'Plantation',
  state: 'FL',
  zip: '33317',
  address: '777 N State Road 7, Plantation, FL 33317',
};

export const southFloridaZipDirectory: Record<string, ZipDirectoryEntry> = {
  '33012': {
    zip: '33012',
    city: 'Hialeah',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Westland', 'Amelia District'],
  },
  '33014': {
    zip: '33014',
    city: 'Hialeah',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Palm Springs Mile', 'Hialeah Park'],
  },
  '33015': {
    zip: '33015',
    city: 'Miami Lakes',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Main Street Miami Lakes', 'NW 67th Avenue'],
  },
  '33016': {
    zip: '33016',
    city: 'Hialeah',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Country Club of Miami area', 'NW 67th Avenue'],
  },
  '33018': {
    zip: '33018',
    city: 'Hialeah',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Hialeah Gardens side', 'I-75 corridor'],
  },
  '33021': {
    zip: '33021',
    city: 'Hollywood',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Hard Rock', 'Yellow Green Farmers Market'],
  },
  '33023': {
    zip: '33023',
    city: 'West Park',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Miramar Parkway corridor', 'Pembroke Road'],
  },
  '33024': {
    zip: '33024',
    city: 'Pembroke Pines',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Pembroke Lakes', 'CB Smith Park'],
  },
  '33025': {
    zip: '33025',
    city: 'Miramar',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Miramar Town Center', 'University Drive corridor'],
  },
  '33026': {
    zip: '33026',
    city: 'Pembroke Pines',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Pembroke Lakes Mall', 'Pines Boulevard'],
  },
  '33027': {
    zip: '33027',
    city: 'Miramar',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['SilverLakes', 'Miramar Parkway'],
  },
  '33028': {
    zip: '33028',
    city: 'Pembroke Pines',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Pembroke Falls', 'West Pines'],
  },
  '33029': {
    zip: '33029',
    city: 'Pembroke Pines',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['West Pines', 'I-75 corridor'],
  },
  '33064': {
    zip: '33064',
    city: 'Pompano Beach',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Sample Road corridor', 'Pompano Citi Centre'],
  },
  '33065': {
    zip: '33065',
    city: 'Coral Springs',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['The Walk', 'University Drive'],
  },
  '33067': {
    zip: '33067',
    city: 'Parkland',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Parkland Golf and Country Club', 'Hillsboro Boulevard'],
  },
  '33071': {
    zip: '33071',
    city: 'Coral Springs',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Coral Square', 'University Drive'],
  },
  '33073': {
    zip: '33073',
    city: 'Coconut Creek',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Promenade at Coconut Creek', 'Sawgrass Expressway'],
  },
  '33126': {
    zip: '33126',
    city: 'Miami',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Miami International Airport', 'Dolphin Expressway'],
  },
  '33166': {
    zip: '33166',
    city: 'Doral',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['CityPlace Doral', 'Miami International Airport'],
  },
  '33172': {
    zip: '33172',
    city: 'Miami',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Dolphin Mall', 'Doral'],
  },
  '33178': {
    zip: '33178',
    city: 'Doral',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Doral', 'Turnpike corridor'],
  },
  '33186': {
    zip: '33186',
    city: 'Miami',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Kendall Drive', 'The Hammocks'],
  },
  '33196': {
    zip: '33196',
    city: 'Miami',
    county: 'Miami-Dade',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Kendall West', 'West Kendall Baptist side'],
  },
  '33311': {
    zip: '33311',
    city: 'Fort Lauderdale',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Wilton Manors', 'Oakland Park corridor'],
  },
  '33312': {
    zip: '33312',
    city: 'Fort Lauderdale',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['595 corridor', 'Riverland Road'],
  },
  '33313': {
    zip: '33313',
    city: 'Plantation',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Broward Mall', 'Plantation Walk'],
  },
  '33317': {
    zip: '33317',
    city: 'Plantation',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Plantation Walk', 'Broward Mall', 'Sawgrass Mills'],
  },
  '33322': {
    zip: '33322',
    city: 'Sunrise',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Sawgrass Mills', 'Sunrise Boulevard'],
  },
  '33323': {
    zip: '33323',
    city: 'Sunrise',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Sawgrass Mills', 'Amerant Bank Arena'],
  },
  '33324': {
    zip: '33324',
    city: 'Davie',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['595 corridor', 'Nova / Tower Shops'],
  },
  '33328': {
    zip: '33328',
    city: 'Davie',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Tower Shops', 'Flamingo Road'],
  },
  '33331': {
    zip: '33331',
    city: 'Weston',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Weston Commons', 'West Broward side'],
  },
  '33325': {
    zip: '33325',
    city: 'Davie',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Weston Road', '595 corridor'],
  },
  '33326': {
    zip: '33326',
    city: 'Weston',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Weston Town Center', 'Cleveland Clinic Weston'],
  },
  '33327': {
    zip: '33327',
    city: 'Weston',
    county: 'Broward',
    state: 'FL',
    marketType: 'local',
    landmarks: ['Weston Town Center', 'I-75'],
  },
  '33428': {
    zip: '33428',
    city: 'Boca Raton',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['West Boca', 'Glades Road'],
  },
  '33433': {
    zip: '33433',
    city: 'Boca Raton',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Town Center area', 'Palmetto Park Road'],
  },
  '33434': {
    zip: '33434',
    city: 'Boca Raton',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Town Center at Boca', 'Lions Road'],
  },
  '33437': {
    zip: '33437',
    city: 'Boynton Beach',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Jog Road', 'Boynton corridor'],
  },
  '33411': {
    zip: '33411',
    city: 'Royal Palm Beach',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Southern Boulevard', 'Royal Palm side'],
  },
  '33414': {
    zip: '33414',
    city: 'Wellington',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Wellington Green', 'Equestrian Preserve'],
  },
  '33431': {
    zip: '33431',
    city: 'Boca Raton',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Mizner Park', 'Glades Road'],
  },
  '33458': {
    zip: '33458',
    city: 'Jupiter',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Abacoa', 'Jupiter side'],
  },
  '33467': {
    zip: '33467',
    city: 'Lake Worth',
    county: 'Palm Beach',
    state: 'FL',
    marketType: 'regional',
    landmarks: ['Turnpike corridor', 'Lake Worth Road'],
  },
};

const phoneAreaCodes: Record<
  string,
  {
    city: string;
    state: string;
    marketType: Exclude<MarketType, 'unknown'>;
    landmark: string;
    rapport?: string;
  }
> = {
  '305': { city: 'Miami', state: 'FL', marketType: 'local', landmark: 'Doral / Dolphin / Miami side' },
  '321': { city: 'Central Florida', state: 'FL', marketType: 'regional', landmark: 'Orlando side' },
  '352': { city: 'Gainesville / Ocala', state: 'FL', marketType: 'regional', landmark: 'north-central Florida' },
  '386': { city: 'Daytona / Palm Coast', state: 'FL', marketType: 'regional', landmark: 'east coast Florida' },
  '407': { city: 'Orlando', state: 'FL', marketType: 'regional', landmark: 'Orlando' },
  '561': { city: 'Palm Beach', state: 'FL', marketType: 'regional', landmark: 'Boca / Palm Beach side' },
  '727': { city: 'St. Pete / Clearwater', state: 'FL', marketType: 'regional', landmark: 'Tampa Bay' },
  '754': { city: 'Broward', state: 'FL', marketType: 'local', landmark: 'Broward' },
  '772': { city: 'Treasure Coast', state: 'FL', marketType: 'regional', landmark: 'Port St. Lucie side' },
  '786': { city: 'Miami', state: 'FL', marketType: 'local', landmark: 'Miami / Doral side' },
  '813': { city: 'Tampa', state: 'FL', marketType: 'regional', landmark: 'Tampa' },
  '850': { city: 'Florida Panhandle', state: 'FL', marketType: 'regional', landmark: 'Panhandle' },
  '863': { city: 'Central Florida', state: 'FL', marketType: 'regional', landmark: 'Lakeland side' },
  '904': { city: 'Jacksonville', state: 'FL', marketType: 'regional', landmark: 'north Florida' },
  '941': { city: 'Sarasota / Bradenton', state: 'FL', marketType: 'regional', landmark: 'west coast Florida' },
  '954': { city: 'Broward', state: 'FL', marketType: 'local', landmark: 'Broward / Plantation side' },
  '229': { city: 'South Georgia', state: 'GA', marketType: 'out_of_state', landmark: 'Albany / Valdosta side', rapport: 'South Georgia barbecue and college-town food spots' },
  '404': { city: 'Atlanta', state: 'GA', marketType: 'out_of_state', landmark: 'Atlanta', rapport: 'Atlanta lemon pepper wings, barbecue, and peach desserts' },
  '470': { city: 'Atlanta metro', state: 'GA', marketType: 'out_of_state', landmark: 'Atlanta metro', rapport: 'Atlanta lemon pepper wings and barbecue' },
  '478': { city: 'Macon / central Georgia', state: 'GA', marketType: 'out_of_state', landmark: 'Macon', rapport: 'Macon soul food and Georgia barbecue' },
  '678': { city: 'Atlanta metro', state: 'GA', marketType: 'out_of_state', landmark: 'Atlanta metro', rapport: 'Atlanta lemon pepper wings and barbecue' },
  '706': { city: 'North Georgia / Augusta / Columbus', state: 'GA', marketType: 'out_of_state', landmark: 'north Georgia', rapport: 'Georgia barbecue and peach-country road trips' },
  '762': { city: 'North Georgia / Augusta / Columbus', state: 'GA', marketType: 'out_of_state', landmark: 'north Georgia', rapport: 'Georgia barbecue and peach-country road trips' },
  '770': { city: 'Atlanta suburbs', state: 'GA', marketType: 'out_of_state', landmark: 'Atlanta suburbs', rapport: 'Atlanta lemon pepper wings and barbecue' },
  '912': { city: 'Savannah / coastal Georgia', state: 'GA', marketType: 'out_of_state', landmark: 'Savannah', rapport: 'Savannah seafood and Lowcountry-style spots' },
  '943': { city: 'Atlanta metro', state: 'GA', marketType: 'out_of_state', landmark: 'Atlanta metro', rapport: 'Atlanta lemon pepper wings and barbecue' },
};

const stateMap: Record<string, string> = {
  AL: 'AL',
  ALABAMA: 'AL',
  AK: 'AK',
  ALASKA: 'AK',
  AZ: 'AZ',
  ARIZONA: 'AZ',
  AR: 'AR',
  ARKANSAS: 'AR',
  CA: 'CA',
  CALIFORNIA: 'CA',
  CO: 'CO',
  COLORADO: 'CO',
  CT: 'CT',
  CONNECTICUT: 'CT',
  DE: 'DE',
  DELAWARE: 'DE',
  FL: 'FL',
  FLORIDA: 'FL',
  GA: 'GA',
  GEORGIA: 'GA',
  HI: 'HI',
  HAWAII: 'HI',
  ID: 'ID',
  IDAHO: 'ID',
  IL: 'IL',
  ILLINOIS: 'IL',
  IN: 'IN',
  INDIANA: 'IN',
  IA: 'IA',
  IOWA: 'IA',
  KS: 'KS',
  KANSAS: 'KS',
  KY: 'KY',
  KENTUCKY: 'KY',
  LA: 'LA',
  LOUISIANA: 'LA',
  ME: 'ME',
  MAINE: 'ME',
  MD: 'MD',
  MARYLAND: 'MD',
  MA: 'MA',
  MASSACHUSETTS: 'MA',
  MI: 'MI',
  MICHIGAN: 'MI',
  MN: 'MN',
  MINNESOTA: 'MN',
  MS: 'MS',
  MISSISSIPPI: 'MS',
  MO: 'MO',
  MISSOURI: 'MO',
  MT: 'MT',
  MONTANA: 'MT',
  NE: 'NE',
  NEBRASKA: 'NE',
  NV: 'NV',
  NEVADA: 'NV',
  NH: 'NH',
  'NEW HAMPSHIRE': 'NH',
  NJ: 'NJ',
  'NEW JERSEY': 'NJ',
  NM: 'NM',
  'NEW MEXICO': 'NM',
  NY: 'NY',
  'NEW YORK': 'NY',
  NC: 'NC',
  'NORTH CAROLINA': 'NC',
  ND: 'ND',
  'NORTH DAKOTA': 'ND',
  OH: 'OH',
  OHIO: 'OH',
  OK: 'OK',
  OKLAHOMA: 'OK',
  OR: 'OR',
  OREGON: 'OR',
  PA: 'PA',
  PENNSYLVANIA: 'PA',
  RI: 'RI',
  'RHODE ISLAND': 'RI',
  SC: 'SC',
  'SOUTH CAROLINA': 'SC',
  SD: 'SD',
  'SOUTH DAKOTA': 'SD',
  TN: 'TN',
  TENNESSEE: 'TN',
  TX: 'TX',
  TEXAS: 'TX',
  UT: 'UT',
  UTAH: 'UT',
  VT: 'VT',
  VERMONT: 'VT',
  VA: 'VA',
  VIRGINIA: 'VA',
  WA: 'WA',
  WASHINGTON: 'WA',
  WV: 'WV',
  'WEST VIRGINIA': 'WV',
  WI: 'WI',
  WISCONSIN: 'WI',
  WY: 'WY',
  WYOMING: 'WY',
  DC: 'DC',
  'DISTRICT OF COLUMBIA': 'DC',
};

function clean(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim();
}

function normalizeState(value: string | undefined) {
  const normalized = clean(value)?.toUpperCase();
  return normalized ? stateMap[normalized] ?? normalized : undefined;
}

function extractZip(text: string | undefined) {
  return text?.match(/\b\d{5}\b/)?.[0];
}

function zipRegionFromZip(zip: string) {
  const prefix = Number(zip.slice(0, 3));
  if (prefix >= 6 && prefix <= 9) return { region: 'Puerto Rico / US Caribbean', anchor: 'island distance and shipping logistics' };
  if (prefix >= 10 && prefix <= 59) return { region: 'New England / Northeast', anchor: 'local food, college-town, coastline, or historic downtown references' };
  if (prefix >= 100 && prefix <= 199) return { region: 'New York / Pennsylvania / Northeast corridor', anchor: 'NY/PA food, sports, or road-trip landmarks' };
  if (prefix >= 200 && prefix <= 269) return { region: 'Mid-Atlantic / Virginia / DC / West Virginia', anchor: 'DC/Virginia road-trip, mountain, or barbecue references' };
  if (prefix >= 270 && prefix <= 299) return { region: 'Carolinas', anchor: 'Carolina barbecue, beach, mountain, or college-town references' };
  if (prefix >= 300 && prefix <= 399) return { region: 'Southeast', anchor: 'Southern food, coastal, mountain, or college-town references' };
  if (prefix >= 400 && prefix <= 427) return { region: 'Kentucky / Appalachia', anchor: 'bourbon trail, horse country, barbecue, or mountain-drive references' };
  if (prefix >= 428 && prefix <= 499) return { region: 'Great Lakes / Midwest', anchor: 'Midwest food, lake, sports, or college-town references' };
  if (prefix >= 500 && prefix <= 599) return { region: 'Upper Midwest / Plains', anchor: 'road-trip, lake, or hometown food references' };
  if (prefix >= 600 && prefix <= 699) return { region: 'Central Midwest', anchor: 'Chicago, St. Louis, Kansas City, college-town, or barbecue references' };
  if (prefix >= 700 && prefix <= 799) return { region: 'South Central / Gulf / Texas', anchor: 'Texas barbecue, Louisiana food, Gulf coast, or road-trip references' };
  if (prefix >= 800 && prefix <= 899) return { region: 'Mountain West / Southwest', anchor: 'mountain, desert, national park, or ski-town references' };
  if (prefix >= 900 && prefix <= 999) return { region: 'West Coast / Pacific', anchor: 'coast, traffic, food, mountain, or city-neighborhood references' };
  return { region: 'outside South Florida', anchor: 'a safe local food, travel, landmark, or sports reference' };
}

function extractState(text: string | undefined) {
  if (!text) return undefined;
  const tokens = text.toUpperCase().match(/\b[A-Z]{2,}\b/g) ?? [];
  for (const token of tokens) {
    const state = normalizeState(token);
    if (state && state.length === 2) return state;
  }
  return undefined;
}

function firstKnownAreaCode(phoneNumbers: string[] | undefined) {
  for (const phone of phoneNumbers ?? []) {
    const digits = phone.replace(/\D/g, '');
    const areaCode = digits.slice(0, 3);
    if (phoneAreaCodes[areaCode]) return areaCode;
  }
  return undefined;
}

function looksLikeStoreLocation(value: string | undefined) {
  return Boolean(value?.match(/\b(777\s+N\s+State\s+Road\s+7|Taverna|Plantation,\s*FL\s*33317|Plantation\s+FL\s+33317-?2157)\b/i));
}

function remoteTalkingPoints(input: { state?: string; city?: string; landmark?: string; rapport?: string }) {
  const where = input.city ?? input.state ?? 'out of state';
  const rapport = input.rapport
    ? `If it feels natural, use a light local rapport line around ${input.rapport}; keep it brief and not creepy.`
    : input.landmark
      ? `If it feels natural, use ${input.landmark} as a soft location anchor; keep it brief and not creepy.`
      : 'Use the location only as a soft distance clue, not a gimmick.';
  return [
    `Treat ${where} as a remote buyer first. Do not lead with "come in".`,
    'Create peace of mind: verified availability, quick video or photos, exact numbers, pickup/shipping clarity, and finance only when the customer actually raises payment or approval.',
    'For used vehicles, mention the 3 day / 300 mile return policy only when it is relevant and say you will verify it applies to this unit.',
    'Shipping can be quoted at store-provided wholesale rates around $0.75 per mile when delivery is the right path.',
    'Use the store credibility line only when it helps: Taverna sells 450+ cars a month and handles out-of-state buyers often.',
    rapport,
  ];
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function createLocationInsight(
  base: {
    marketType: MarketType;
    route: LeadRoute;
    summary: string;
    nextStep: string;
    talkingPoints: string[];
    evidence: string[];
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
    landmark?: string;
    confidence?: string;
    distanceMiles?: number;
    driveTimeMinutes?: number;
    classification?: string;
    askForZip?: boolean;
  },
): LocationInsight {
  const insight: LocationInsight = {
    marketType: base.marketType,
    route: base.route,
    summary: base.summary,
    nextStep: base.nextStep,
    talkingPoints: base.talkingPoints,
    evidence: base.evidence,
  };

  if (base.city) insight.city = base.city;
  if (base.state) insight.state = base.state;
  if (base.zip) insight.zip = base.zip;
  if (base.county) insight.county = base.county;
  if (base.landmark) insight.landmark = base.landmark;
  if (base.confidence) insight.confidence = base.confidence;
  if (typeof base.distanceMiles === 'number') insight.distanceMiles = base.distanceMiles;
  if (typeof base.driveTimeMinutes === 'number') insight.driveTimeMinutes = base.driveTimeMinutes;
  if (base.classification) insight.classification = base.classification;
  if (typeof base.askForZip === 'boolean') insight.askForZip = base.askForZip;

  return insight;
}

function inferMotives(context: Pick<LeadContext, 'visibleText' | 'vehicleOfInterest' | 'paymentBudgetHints' | 'tradeInfo' | 'priorMessages'>) {
  const haystack = [
    context.visibleText,
    context.vehicleOfInterest,
    context.paymentBudgetHints,
    context.tradeInfo,
    ...(context.priorMessages ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const motives: string[] = [];
  if (containsAny(haystack, [/family/, /kids/, /car seat/, /3rd row/, /third row/, /space/])) motives.push('family space');
  if (containsAny(haystack, [/work/, /job/, /tools/, /tow/, /hauling/, /payload/, /truck/])) motives.push('work / capability');
  if (containsAny(haystack, [/payment/, /monthly/, /budget/, /down payment/, /credit/, /apr/, /lease/])) motives.push('payment sensitivity');
  if (containsAny(haystack, [/commute/, /gas mileage/, /mpg/, /daily driver/])) motives.push('commuter practicality');
  if (containsAny(haystack, [/beach/, /top off/, /4x4/, /off road/, /adventure/, /weekend/])) motives.push('lifestyle / fun');
  if (containsAny(haystack, [/luxury/, /loaded/, /features/, /technology/, /comfort/])) motives.push('comfort / feature expectations');
  return motives;
}

export function analyzeLeadMarket(
  context: Pick<
    LeadContext,
    | 'customerLocation'
    | 'customerZipCode'
    | 'locationIntel'
    | 'phoneNumbers'
    | 'visibleText'
    | 'emails'
    | 'tradeInfo'
    | 'paymentBudgetHints'
    | 'vehicleOfInterest'
  >,
): LocationInsight {
  const evidence: string[] = [];
  if (context.locationIntel) {
    const intel = context.locationIntel;
    const marketType: MarketType =
      intel.classification === 'local' ? 'local' : intel.classification === 'local_far' ? 'regional' : intel.classification;
    const talkingPoints =
      intel.classification === 'out_of_state'
        ? remoteTalkingPoints({
            ...(intel.state ? { state: intel.state } : {}),
            ...(intel.city ? { city: intel.city } : {}),
            ...(intel.rapportAnchor ? { landmark: intel.rapportAnchor } : {}),
          })
        : [
            intel.classification === 'local'
              ? 'Bring this shopper into the store once the visible question is answered.'
              : intel.classification === 'local_far'
                ? 'Respect the drive. Verify the key details before pushing the trip.'
                : 'Ask for ZIP before committing to visit or remote path.',
          ];
    return createLocationInsight({
      marketType,
      route: intel.route,
      summary: intel.summary,
      nextStep: intel.nextStep,
      talkingPoints,
      evidence: intel.evidence,
      ...(intel.city ? { city: intel.city } : {}),
      ...(intel.state ? { state: intel.state } : {}),
      ...(intel.zipCode ? { zip: intel.zipCode } : {}),
      ...(intel.rapportAnchor ? { landmark: intel.rapportAnchor } : {}),
      confidence: intel.confidence,
      ...(typeof intel.distanceMiles === 'number' ? { distanceMiles: intel.distanceMiles } : {}),
      ...(typeof intel.driveTimeMinutes === 'number' ? { driveTimeMinutes: intel.driveTimeMinutes } : {}),
      classification: intel.classification,
      askForZip: intel.askForZip,
    });
  }
  const explicitLocation = looksLikeStoreLocation(context.customerLocation) ? undefined : clean(context.customerLocation);
  const phoneAreaCode = firstKnownAreaCode(context.phoneNumbers);
  const phoneArea = phoneAreaCode ? phoneAreaCodes[phoneAreaCode] : undefined;
  const locationText = clean([explicitLocation, !phoneArea ? context.visibleText : undefined].filter(Boolean).join('\n'));
  const zip = extractZip(locationText);
  const state = normalizeState(extractState(locationText));

  if (zip && southFloridaZipDirectory[zip]) {
    const entry = southFloridaZipDirectory[zip];
    const landmark = entry.landmarks[0];
    evidence.push(`ZIP ${zip} maps to ${entry.city}, ${entry.state}.`);
    return createLocationInsight({
      marketType: entry.marketType,
      route: 'showroom',
      city: entry.city,
      state: entry.state,
      zip,
      county: entry.county,
      ...(landmark ? { landmark } : {}),
      summary:
        entry.marketType === 'local'
          ? `Local South Florida lead from ${entry.city}. Make the visit easy only after the customer concern is answered.`
          : `${entry.city} is still in-state, but this lead may want a cleaner plan before making the drive.`,
      nextStep:
        entry.marketType === 'local'
          ? 'Answer first, then offer a simple visit or call only when they are ready.'
          : 'Lead with value, verify the key details, then discuss a visit or call only once the drive makes sense.',
      talkingPoints: [
        landmark ? `Use a natural local anchor like ${landmark} if it fits the conversation.` : 'Use a natural local reference if it helps reduce friction.',
        entry.marketType === 'local'
          ? `Make the visit feel convenient from ${entry.city}.`
          : `Respect the extra drive from ${entry.city} and remove friction before asking for the visit.`,
      ],
      evidence,
    });
  }

  if (zip) {
    const region = zipRegionFromZip(zip);
    evidence.push(`ZIP ${zip} is outside the South Florida close-in directory.`);
    const regionalFlorida = state === 'FL';
    return createLocationInsight({
      marketType: regionalFlorida ? 'regional' : state ? 'out_of_state' : 'unknown',
      route: regionalFlorida ? 'showroom' : 'remote',
      ...(state ? { state } : {}),
      zip,
      landmark: region.region,
      summary: regionalFlorida
        ? `Florida ZIP ${zip} appears outside the immediate Plantation area. Respect the drive before pushing the visit.`
        : `ZIP ${zip} suggests a ${region.region} buyer or at least a non-local buyer. Do not lead with a Plantation visit until location, numbers, and logistics make sense.`,
      nextStep: regionalFlorida
        ? 'Give a reason the drive is worth it, verify the key details, then offer a visit or quick call.'
        : 'Soft-confirm where they are, then move to video/walkaround, verified numbers, shipping/delivery quote, or a call before travel. Use finance only if payment or approval is part of the conversation.',
      talkingPoints: regionalFlorida
        ? [
            'Treat this as an in-state drive-in lead, not a same-block stop-in.',
            'Verify availability, numbers, and trade path before asking for the trip if the drive is long.',
          ]
        : [
            ...remoteTalkingPoints({ ...(state ? { state } : {}), landmark: region.region }),
            `For a light rapport line, choose one safe ${region.anchor}. If the ZIP is only a clue, phrase it as a question instead of a fact.`,
          ],
      evidence,
    });
  }

  if (phoneArea && (!state || state === phoneArea.state)) {
    evidence.push(`Phone area code ${phoneAreaCode} suggests ${phoneArea.city}, ${phoneArea.state}.`);
    if (phoneArea.state !== 'FL') {
      return createLocationInsight({
        marketType: 'out_of_state',
        route: 'remote',
        city: phoneArea.city,
        state: phoneArea.state,
        landmark: phoneArea.landmark,
        summary: `${phoneArea.city} phone-area clue suggests an out-of-state buyer. Do not push a Plantation visit until the vehicle, numbers, and logistics make sense.`,
        nextStep: 'Ask a light location-confirming question, then move to video/walkaround, verified numbers, shipping or pickup logistics, or a quick call before travel.',
        talkingPoints: remoteTalkingPoints({
          city: phoneArea.city,
          state: phoneArea.state,
          landmark: phoneArea.landmark,
          ...(phoneArea.rapport ? { rapport: phoneArea.rapport } : {}),
        }),
        evidence,
      });
    }
    return createLocationInsight({
      marketType: phoneArea.marketType,
      route: 'showroom',
      city: phoneArea.city,
      state: phoneArea.state,
      landmark: phoneArea.landmark,
      summary:
        phoneArea.marketType === 'local'
          ? `Florida lead close enough to treat like a showroom opportunity.`
          : `Florida lead, but likely outside your immediate backyard. Build confidence before the drive.`,
      nextStep:
        phoneArea.marketType === 'local'
          ? 'Answer first and make the visit simple only when they are ready.'
          : 'Start with a clean value recap, then verify the details before asking for the drive.',
      talkingPoints: [
        phoneArea.marketType === 'local'
          ? `Use a South Florida reference naturally if it helps reduce friction.`
          : `Respect the longer Florida drive and give them a cleaner plan before discussing a visit.`,
      ],
      evidence,
    });
  }

  if (state === 'FL') {
    evidence.push('Explicit Florida location found.');
    return createLocationInsight({
      marketType: 'regional',
      route: 'showroom',
      state: 'FL',
      summary: 'In-state Florida lead. Reduce drive friction before any visit ask.',
      nextStep: 'Use a quick value recap, verify the details, then discuss a visit only when it is useful.',
      talkingPoints: [
        'Treat this like a Florida drive-in lead: make the trip feel worth it.',
        'Offer to line up the best next step before they commit to the drive.',
      ],
      evidence,
    });
  }

  if (state && state !== 'FL') {
    evidence.push(`Explicit out-of-state location found (${state}).`);
    return createLocationInsight({
      marketType: 'out_of_state',
      route: 'remote',
      state,
      summary: 'Out-of-state lead. Do not lead with "just come in." Build remote confidence first.',
      nextStep: 'Verify availability, condition, exact numbers, and pickup/shipping path before asking for travel. Use finance only if payment or approval is part of the conversation.',
      talkingPoints: remoteTalkingPoints({ state }),
      evidence,
    });
  }

  return createLocationInsight({
    marketType: 'unknown',
    route: 'remote',
    summary: 'Location is still unclear. Stay flexible and do not assume a visit, travel path, or credit path.',
    nextStep: 'Ask one clean location or timing question only if it helps the close. Otherwise keep momentum with the easiest next step.',
    talkingPoints: ['Avoid overreaching on location. Keep the path simple and friction-free.'],
    evidence,
  });
}

export function buildBuyerProfile(
  context: Pick<LeadContext, 'vehicleOfInterest' | 'paymentBudgetHints' | 'tradeInfo' | 'visibleText' | 'priorMessages'>,
  market: LocationInsight,
): BuyerProfile {
  const motives = inferMotives(context);
  const affordabilityRead = context.paymentBudgetHints
    ? 'This shopper is telling you money matters. Keep the path grounded in verified numbers, trade value, and realistic next steps.'
    : 'Budget is not explicit yet, so qualify softly through payment range, trade, or use-case if it helps the close.';

  const fitRead = context.vehicleOfInterest
    ? `Pressure-test whether ${context.vehicleOfInterest} is actually the right fit for how they live, drive, and spend.`
    : 'The exact vehicle fit is still loose. Use one or two smart options to tighten the path.';

  const guidance = [
    market.route === 'showroom'
      ? 'For local Florida buyers, make the store visit easy only after the basic objection is handled.'
      : 'For remote buyers, verify the vehicle, condition, numbers, and pickup/shipping path before travel.',
    context.tradeInfo ? 'Trade details matter here. Use the appraisal path as leverage if the info is incomplete.' : undefined,
    context.paymentBudgetHints ? 'Keep money language clean. Verify, do not promise.' : undefined,
    motives.includes('family space') ? 'Talk in terms of room, daily life, and ease, not just specs.' : undefined,
    motives.includes('work / capability') ? 'Tie the vehicle to the job-to-be-done: payload, towing, reliability, and fit for the work week.' : undefined,
    motives.includes('lifestyle / fun') ? 'Let the message feel aspirational, but keep the close practical.' : undefined,
  ].filter(Boolean) as string[];

  return {
    summary:
      motives.length > 0
        ? `Likely motives: ${motives.join(', ')}.`
        : 'Motives are not obvious yet, so qualify through use-case, payment comfort, and urgency.',
    affordabilityRead,
    fitRead,
    shopperMotives: motives,
    guidance,
  };
}

function scoreVehicleAgainstNeeds(title: string, source: InventoryVehicle['source'], motives: string[], vehicleOfInterest: string | undefined) {
  let score = 0;
  const reasons: string[] = [];
  const tags: string[] = [];
  const normalizedTitle = title.toLowerCase();
  const requested = clean(vehicleOfInterest)?.toLowerCase();

  if (requested && normalizedTitle.includes(requested)) {
    score += 35;
    reasons.push('Strong direct match to the vehicle already on the page.');
    tags.push('direct-match');
  }

  if (requested && requested.split(/\s+/).some((token) => token.length > 3 && normalizedTitle.includes(token))) {
    score += 14;
    reasons.push('Close enough to the vehicle they are already considering.');
    tags.push('similar-match');
  }

  if (motives.includes('payment sensitivity') && source === 'used') {
    score += 14;
    reasons.push('Used inventory helps if payment or budget is the real hinge point.');
    tags.push('payment-friendly');
  }

  if (motives.includes('payment sensitivity') && /lease|new/i.test(title)) {
    score += 8;
    reasons.push('A fresh lease or incentive angle may lower friction if the numbers are the sticking point.');
    tags.push('lease-angle');
  }

  if (motives.includes('family space') && /grand cherokee l|durango|pacifica|grand cherokee/i.test(normalizedTitle)) {
    score += 18;
    reasons.push('Fits the family-space conversation better than a pure impulse close.');
    tags.push('family-fit');
  }

  if (motives.includes('work / capability') && /ram 1500|ram 2500|ram 3500|gladiator/i.test(normalizedTitle)) {
    score += 18;
    reasons.push('Fits a work, truck, or capability-driven buyer.');
    tags.push('work-fit');
  }

  if (motives.includes('lifestyle / fun') && /wrangler|gladiator/i.test(normalizedTitle)) {
    score += 16;
    reasons.push('Matches a lifestyle or fun-forward buyer better than a plain transportation pitch.');
    tags.push('lifestyle-fit');
  }

  if (motives.includes('comfort / feature expectations') && /grand cherokee|wagoneer|durango|pacifica/i.test(normalizedTitle)) {
    score += 12;
    reasons.push('Lines up with a comfort, feature, or upscale-use-case shopper.');
    tags.push('comfort-fit');
  }

  return { score, reasons, tags };
}

export function recommendInventoryForLead(context: LeadContext, inventory: InventoryVehicle[], market: LocationInsight) {
  const buyer = buildBuyerProfile(context, market);
  return inventory
    .map((vehicle) => {
      const match = scoreVehicleAgainstNeeds(vehicle.title, vehicle.source, buyer.shopperMotives, context.vehicleOfInterest);
      const routeReason =
        market.route === 'showroom'
          ? 'Good fit for a local or in-state visit path.'
          : 'Good fit for a remote verification, numbers, video, or pickup/shipping path.';

      const recommendationReason = [...match.reasons, routeReason].filter(Boolean).join(' ');
      return {
        ...vehicle,
        fitScore: Math.max(0, Math.min(99, 40 + match.score)),
        matchTags: match.tags.slice(0, 8),
        recommendationReason,
      };
    })
    .sort((left, right) => {
      const scoreDiff = (right.fitScore ?? 0) - (left.fitScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return left.title.localeCompare(right.title);
    });
}
