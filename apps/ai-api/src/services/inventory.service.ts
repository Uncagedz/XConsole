import crypto from 'node:crypto';
import type { InventorySearchResponse, InventoryVehicle } from '@drivecentric-ai/shared';

export const inventorySourceUrls = [
  'https://www.tavernachryslerdodgejeepramfiat.com/new-inventory/index.htm',
  'https://www.tavernachryslerdodgejeepramfiat.com/used-inventory/index.htm',
] as const;

const inventoryApiSources = [
  {
    source: 'new' as const,
    referer: 'https://www.tavernachryslerdodgejeepramfiat.com/new-inventory/index.htm',
    url: 'https://www.tavernachryslerdodgejeepramfiat.com/apis/widget/INVENTORY_LISTING_DEFAULT_AUTO_NEW:inventory-data-bus1/getInventory',
  },
  {
    source: 'used' as const,
    referer: 'https://www.tavernachryslerdodgejeepramfiat.com/used-inventory/index.htm',
    url: 'https://www.tavernachryslerdodgejeepramfiat.com/apis/widget/INVENTORY_LISTING_DEFAULT_AUTO_USED:inventory-data-bus1/getInventory',
  },
] as const;

interface InventoryIntent {
  make?: string;
  model?: string;
  searchTerm?: string;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  priceMax?: number;
  cheapestFirst: boolean;
  colors: string[];
  excludedColors: string[];
  features: string[];
  excludesHybrid: boolean;
  wantsCleanCarfax: boolean;
  sourcePreference?: InventoryVehicle['source'];
}

interface InventorySourceResult {
  vehicles: InventoryVehicle[];
  totalCount: number;
  pageSize: number;
}

interface DdcAttribute {
  name?: string;
  label?: string;
  value?: string | number;
  normalizedValue?: string;
  labeledValue?: string;
}

interface DdcVehicle {
  title?: string[];
  condition?: string;
  year?: number;
  modelYear?: number;
  make?: string;
  model?: string;
  trim?: string;
  link?: string;
  stockNumber?: string;
  vin?: string;
  odometer?: string | number;
  bodyStyle?: string;
  uuid?: string;
  certified?: boolean;
  images?: Array<{ uri?: string }>;
  packages?: string[];
  attributes?: DdcAttribute[];
  pricing?: {
    retailPrice?: string;
    dprice?: Array<{ label?: string; type?: string; typeClass?: string; value?: string; isFinalPrice?: boolean; isDiscount?: boolean }>;
  };
}

function clean(value: string | undefined) {
  return value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stableId(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
}

function numberFromText(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function priceNumber(value: string | undefined) {
  const parsed = numberFromText(value);
  return parsed && parsed > 100 ? parsed : undefined;
}

function browserHeaders(referer: string, accept: string) {
  return {
    accept,
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    referer,
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': accept.includes('json') ? 'empty' : 'document',
    'sec-fetch-mode': accept.includes('json') ? 'cors' : 'navigate',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
  };
}

function attr(vehicle: DdcVehicle, name: string, preferred: 'normalized' | 'raw' = 'normalized') {
  const found = vehicle.attributes?.find((item) => item.name === name);
  if (!found) return undefined;
  const raw = found.value?.toString() ?? found.labeledValue;
  return preferred === 'raw' ? raw ?? found.normalizedValue : found.normalizedValue ?? raw;
}

function finalPrice(vehicle: DdcVehicle) {
  return (
    vehicle.pricing?.dprice?.find((item) => item.isFinalPrice && item.value)?.value ??
    vehicle.pricing?.dprice?.find((item) => /sale|price|taverna/i.test(`${item.label ?? ''} ${item.typeClass ?? ''}`) && item.value)?.value ??
    vehicle.pricing?.retailPrice ??
    vehicle.pricing?.dprice?.find((item) => item.value && !item.isDiscount)?.value
  );
}

function isCdjrMake(make: string | undefined) {
  return Boolean(make && /^(chrysler|dodge|jeep|ram|fiat)$/i.test(make));
}

function windowStickerUrl(make: string | undefined, vin: string | undefined) {
  if (!vin || !isCdjrMake(make)) return undefined;
  return `https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=${encodeURIComponent(vin)}`;
}

function carfaxUrl(source: InventoryVehicle['source'], vin: string | undefined) {
  if (source !== 'used' || !vin) return undefined;
  return `https://www.carfax.com/VehicleHistory/p/Report.cfx?partner=DVW_1&vin=${encodeURIComponent(vin)}`;
}

function normalizeModel(value: string | undefined) {
  const text = value?.toLowerCase() ?? '';
  const models = [
    'grand cherokee l',
    'grand cherokee',
    'wrangler',
    'gladiator',
    'wagoneer',
    'grand wagoneer',
    'compass',
    'renegade',
    'cherokee',
    'ram 1500',
    'ram 2500',
    'ram 3500',
    'pacifica',
    'voyager',
    'durango',
    'hornet',
    'charger',
    'challenger',
  ];
  const match = models.find((model) => text.includes(model));
  if (!match) return undefined;
  return match
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
    .replace(/^Ram /, '');
}

const knownMakes = [
  'Acura',
  'Alfa Romeo',
  'Audi',
  'BMW',
  'Buick',
  'Cadillac',
  'Chevrolet',
  'Chrysler',
  'Dodge',
  'FIAT',
  'Ford',
  'Genesis',
  'GMC',
  'Honda',
  'Hyundai',
  'Infiniti',
  'Jeep',
  'Kia',
  'Land Rover',
  'Lexus',
  'Lincoln',
  'Maserati',
  'Mazda',
  'Mercedes-Benz',
  'MINI',
  'Nissan',
  'Porsche',
  'Ram',
  'Subaru',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

const knownNonCdjrModels = [
  'panamera',
  'cayenne',
  'macan',
  '911',
  'boxster',
  'cayman',
  'camry',
  'corolla',
  'rav4',
  'highlander',
  'tacoma',
  'tundra',
  'accord',
  'civic',
  'pilot',
  'cr-v',
  'f-150',
  'silverado',
  'sierra',
  'escalade',
  'tahoe',
  'suburban',
  'mustang',
  'camaro',
  'model 3',
  'model y',
  'altima',
  'maxima',
  'sentra',
  'rogue',
  'q50',
  'q60',
  'gle',
  'glc',
  'c-class',
  'e-class',
  'x5',
  'x3',
  'm3',
  'm4',
  'a4',
  'q5',
  'q7',
];

const colorWords = [
  'black',
  'white',
  'gray',
  'grey',
  'silver',
  'blue',
  'red',
  'green',
  'orange',
  'yellow',
  'brown',
  'tan',
  'purple',
  'neon',
];

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toUpperCase() === token && token.length <= 3 ? token : token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
    .replace(/\bCr-V\b/i, 'CR-V')
    .replace(/\bF-150\b/i, 'F-150');
}

function normalizedColor(color: string) {
  return color === 'grey' ? 'gray' : color;
}

function humanNumber(value: string | undefined, suffix = '') {
  if (!value) return undefined;
  const compact = value.replace(/[$,\s]/g, '').toLowerCase();
  const numeric = Number(compact.replace(/k$/, ''));
  if (!Number.isFinite(numeric)) return undefined;
  const meansThousands = /k/i.test(`${value}${suffix}`) && numeric < 1000;
  return Math.round(numeric * (meansThousands ? 1000 : 1));
}

function colorPattern(color: string) {
  if (color === 'gray') return /\b(gray|grey|granite|silver zynith|anvil)\b/i;
  if (color === 'neon') return /\b(neon|lime|bright green|high velocity|sublime)\b/i;
  return new RegExp(`\\b${color}\\b`, 'i');
}

function extractExcludedColors(text: string) {
  const segments = [
    ...text.matchAll(
      /\b(?:not interested in|do(?:n't| not) want|does(?:n't| not) want|dont want|avoid|exclude|skip|not looking for|anything but|except|no)\s+([^.;\n]{1,120})/gi,
    ),
    ...text.matchAll(/\b([^.;\n]{1,90}?\b(?:red|white|gray|grey|silver|blue|green|orange|yellow|brown|tan|purple|neon)\b[^.;\n]{0,60})\s+(?:are|is)\s+(?:out|excluded|not wanted|a no|no go)/gi),
  ].map((match) => match[1] ?? '');
  return Array.from(
    new Set(
      segments.flatMap((segment) =>
        colorWords
          .filter((color) => new RegExp(`\\b${color}\\b`, 'i').test(segment))
          .map(normalizedColor),
      ),
    ),
  );
}

function extractMake(text: string) {
  return knownMakes.find((make) => new RegExp(`\\b${make.replace(/[-\s]/g, '[-\\\\s]?')}\\b`, 'i').test(text));
}

function extractGenericModel(text: string, make?: string) {
  const normalized = text.toLowerCase();
  const known = knownNonCdjrModels.find((model) => new RegExp(`\\b${model.replace(/[-\s]/g, '[-\\\\s]?')}\\b`, 'i').test(normalized));
  if (known) return titleCase(known);
  if (!make) return undefined;
  const afterMake = normalized.split(new RegExp(make.replace(/[-\s]/g, '[-\\\\s]?'), 'i'))[1];
  if (!afterMake) return undefined;
  const stopWords = new Set([
    'black',
    'white',
    'gray',
    'grey',
    'silver',
    'blue',
    'red',
    'green',
    'under',
    'over',
    'less',
    'than',
    'below',
    'max',
    'maximum',
    'up',
    'to',
    'around',
    'about',
    'dollars',
    'dollar',
    'bucks',
    'usd',
    'price',
    'cheap',
    'cheapest',
    'lowest',
    'budget',
    'with',
    'clean',
    'used',
    'new',
    'certified',
    'hardtop',
    'hard',
    'top',
    'miles',
    'mile',
  ]);
  const tokens = afterMake
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !stopWords.has(token))
    .slice(0, 2);
  return tokens.length ? titleCase(tokens.join(' ')) : undefined;
}

function parseIntent(query: string | undefined): InventoryIntent {
  const text = query?.toLowerCase() ?? '';
  const mileageMaskedText = text.replace(
    /\b(?:under|less than|below|max(?:imum)?|up to|around|about|no more than|at most)\s*[0-9]+(?:[,.][0-9]+)?\s*k?\s*(?:miles?|mi)\b/gi,
    ' mileage-request ',
  );
  const excludedColors = extractExcludedColors(text);
  const colors = colorWords
    .filter((color) => color !== 'neon' && new RegExp(`\\b${color}\\b`, 'i').test(text))
    .map(normalizedColor)
    .filter((color) => !excludedColors.includes(color));
  const heavyDutyRamRequest = /\b(?:ram\s*)?3500\b|\b(?:dually|dualy|dooly|doolie|dual\s+rear|dual[-\s]?wheel|drw)\b/i.test(text);
  const make = extractMake(query ?? '') ?? (heavyDutyRamRequest ? 'Ram' : undefined);
  const model = normalizeModel(query) ?? (heavyDutyRamRequest ? '3500' : extractGenericModel(query ?? '', make));
  const cdjrMake = make && ['Chrysler', 'Dodge', 'Jeep', 'Ram', 'FIAT'].includes(make);
  const searchTerm = query?.trim()
    ? cdjrMake && model
      ? undefined
      : [make, model].filter(Boolean).join(' ') || query.trim().slice(0, 80)
    : undefined;
  const yearMinMatch =
    text.match(/\b(?:20|19)\d{2}\s*(?:or\s+newer|and\s+up|\+|up|or\s+up)\b/i) ??
    text.match(/\b(?:newer than|after|from)\s*((?:20|19)\d{2})\b/i);
  const yearMin = yearMinMatch ? Number(yearMinMatch[0].match(/\b(?:20|19)\d{2}\b/)?.[0]) : undefined;
  const yearMax = text.match(/\b(?:before|under|older than)\s*((?:20|19)\d{2})\b/i)?.[1];
  const mileageMatch =
    text.match(/\b(?:under|less than|below|max(?:imum)?|up to|around|about|no more than|at most)\s*([0-9]+(?:[,.][0-9]+)?)\s*(k)?\s*(?:miles?|mi)\b/i) ??
    text.match(/\b([0-9]+(?:[,.][0-9]+)?)\s*(k)\s*(?:miles?|mi)\s*(?:or less|and under|max|maximum)?\b/i);
  const mileageMax = humanNumber(mileageMatch?.[1], mileageMatch?.[2]);
  const priceMatch =
    mileageMaskedText.match(
      /\b(?:under|less than|below|max(?:imum)?|up to|around|about|no more than|at most|budget(?:\s+is)?|cash(?:\s+budget)?|out[-\s]?the[-\s]?door|otd|all[-\s]?in)\s*\$?\s*([0-9]+(?:[,.][0-9]+)?)\s*(k)?\b/i,
    ) ??
    mileageMaskedText.match(/\$\s*([0-9]+(?:[,.][0-9]+)?)\s*(k)?\b/i) ??
    mileageMaskedText.match(/\b([0-9]+(?:[,.][0-9]+)?)\s*(k)?\s*(?:cash|budget|out[-\s]?the[-\s]?door|otd|all[-\s]?in|price)\b/i);
  const rawPrice = humanNumber(priceMatch?.[1], priceMatch?.[2]);
  const priceMax =
    rawPrice && !/\b(?:miles?|mi)\b/i.test(priceMatch?.[0] ?? '') && (/\$|dollars?|bucks|usd|price|cheap|cheapest|budget|cash|otd|out[-\s]?the[-\s]?door|all[-\s]?in/i.test(text) || rawPrice >= 5000)
      ? rawPrice
      : undefined;
  const features = [
    /\bhard\s*top|hardtop|3[-\s]?piece(?:\s+hard)?\s+top|freedom\s+top/i.test(text) ? 'hardtop' : '',
    /\b4x4|4wd|four wheel|all wheel|awd\b/i.test(text) ? '4x4' : '',
    /\b(?:dually|dualy|dooly|doolie|dual\s+rear|dual[-\s]?wheel|drw)\b/i.test(text) ? 'dually' : '',
    /\bleather(?:\s+(?:seat|seats|interior|trim|trimmed))?\b/i.test(text) ? 'leather' : '',
    /\bsunroof|moonroof\b/i.test(text) ? 'sunroof' : '',
    /\bheated\b/i.test(text) ? 'heated' : '',
    /\btow|towing\b/i.test(text) ? 'tow' : '',
    /\bnav|navigation\b/i.test(text) ? 'navigation' : '',
    /\bremote\s+start\b/i.test(text) ? 'remote start' : '',
  ].filter(Boolean);
  const sourcePreference = /\bused|pre[-\s]?owned|cpo|certified\b/i.test(text)
    ? 'used'
    : /\bnew\b/i.test(text)
      ? 'new'
      : undefined;
  const excludesHybrid =
    /\b(?:no|not|avoid|exclude|skip|do(?:n't| not) want|does(?:n't| not) want|dont want|don't\s+want|do not want|non[-\s]?hybrid)\s+(?:a\s+)?(?:hybrid|hybird|4xe|plug[-\s]?in)\b/i.test(
      text,
    ) ||
    /\b(?:no|not interested in|do(?:n't| not) want|avoid|exclude|skip)\b[^.;\n]{0,120}\b(?:hybrid|hybird|4xe|plug[-\s]?in)\b/i.test(text) ||
    /\b(?:hybrid|hybird|4xe|plug[-\s]?in)\s+(?:excluded|not wanted|is out|are out|no go)\b/i.test(text);
  return {
    ...(make ? { make } : {}),
    ...(model ? { model } : {}),
    ...(searchTerm ? { searchTerm } : {}),
    ...(yearMin ? { yearMin } : {}),
    ...(yearMax ? { yearMax: Number(yearMax) } : {}),
    ...(mileageMax ? { mileageMax } : {}),
    ...(priceMax ? { priceMax } : {}),
    cheapestFirst: /\b(?:cheap|cheapest|lowest|least expensive|budget)\b/i.test(text),
    colors,
    excludedColors,
    features,
    excludesHybrid,
    wantsCleanCarfax: /\bclean\s+carfax|no accident|accident[-\s]?free|clean history\b/i.test(text),
    ...(sourcePreference ? { sourcePreference } : {}),
  };
}

function sourceFromUrl(url: string): InventoryVehicle['source'] {
  return url.includes('/used-') ? 'used' : 'new';
}

function inferMakeModel(title: string) {
  const match = title.match(/\b(19|20)\d{2}\s+(Chrysler|Dodge|Jeep|Ram|FIAT|Fiat)\s+([A-Za-z0-9 -]{2,40})/i);
  if (!match) {
    const makeOnly = title.match(/\b(Chrysler|Dodge|Jeep|Ram|FIAT|Fiat)\s+([A-Za-z0-9 -]{2,40})/i);
    return makeOnly
      ? {
          make: makeOnly[1]?.toUpperCase() === 'FIAT' ? 'FIAT' : makeOnly[1],
          model: clean(makeOnly[2])?.split(/\s+/).slice(0, 3).join(' '),
        }
      : {};
  }
  return {
    year: Number(title.match(/\b(19|20)\d{2}\b/)?.[0]),
    make: match[2]?.toUpperCase() === 'FIAT' ? 'FIAT' : match[2],
    model: clean(match[3])?.split(/\s+/).slice(0, 3).join(' '),
  };
}

function strategyFor(vehicle: Pick<InventoryVehicle, 'source' | 'title' | 'make' | 'model'>) {
  const label = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.title;
  if (/wrangler/i.test(label)) return 'Lean into lifestyle, 4x4 capability, and appointment urgency before it gets shopped around.';
  if (/grand cherokee|durango|pacifica/i.test(label)) return 'Position comfort, room, and easy same-day comparison to protect the showroom visit.';
  if (/ram|1500|2500|truck/i.test(label)) return 'Anchor on capability, trade value, and a quick appraisal or test drive window.';
  if (vehicle.source === 'used') return 'Use this as a payment-friendly alternative if price or budget becomes the objection.';
  return 'Use this as a strong same-brand alternative and offer to verify availability before the customer waits.';
}

function vehicleFromDdc(vehicle: DdcVehicle, source: InventoryVehicle['source']): InventoryVehicle | null {
  const year = vehicle.year ?? vehicle.modelYear;
  const vin = vehicle.vin ?? attr(vehicle, 'vin', 'raw');
  const stockNumber = vehicle.stockNumber ?? attr(vehicle, 'stockNumber', 'raw');
  const title =
    Array.isArray(vehicle.title) && vehicle.title.length
      ? vehicle.title.join(' ')
      : [year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const cleaned = clean(title);
  if (!cleaned || !stockNumber) return null;
  const mileage = attr(vehicle, 'odometer', 'raw') ?? (vehicle.odometer !== undefined ? `${vehicle.odometer} miles` : undefined);
  const exterior = attr(vehicle, 'exteriorColor', 'raw');
  const interior = attr(vehicle, 'interiorColor', 'raw');
  const bodyStyle = attr(vehicle, 'bodyStyle', 'raw') ?? vehicle.bodyStyle;
  const driveLine = attr(vehicle, 'driveLine', 'raw');
  const engine = attr(vehicle, 'engine', 'raw');
  const transmission = attr(vehicle, 'transmission', 'raw');
  const packages = vehicle.packages?.filter(Boolean) ?? [];
  const fitDetails = [
    exterior ? `Exterior ${exterior}` : '',
    interior ? `Interior ${interior}` : '',
    driveLine ? driveLine : '',
    engine ? `Engine ${engine}` : '',
    packages.slice(0, 3).join(', '),
  ].filter(Boolean);
  const url = vehicle.link ? new URL(vehicle.link, 'https://www.tavernachryslerdodgejeepramfiat.com').href : undefined;
  const stickerUrl = windowStickerUrl(vehicle.make, vin);
  const historyUrl = carfaxUrl(source, vin);

  return {
    id: vehicle.uuid ?? stableId(`${source}:${stockNumber}:${vin ?? cleaned}`),
    source,
    title: [cleaned, bodyStyle].filter(Boolean).join(' ').slice(0, 140),
    ...(year ? { year } : {}),
    ...(vehicle.make ? { make: vehicle.make } : {}),
    ...(vehicle.model ? { model: vehicle.model } : {}),
    ...(vehicle.trim ? { trim: vehicle.trim } : {}),
    price: finalPrice(vehicle),
    ...(mileage ? { mileage } : {}),
    ...(exterior ? { exteriorColor: exterior } : {}),
    ...(interior ? { interiorColor: interior } : {}),
    ...(bodyStyle ? { bodyStyle } : {}),
    ...(driveLine ? { drivetrain: driveLine } : {}),
    ...(engine ? { engine } : {}),
    ...(transmission ? { transmission } : {}),
    ...(stockNumber ? { stockNumber } : {}),
    ...(vin ? { vin } : {}),
    ...(url ? { url } : {}),
    ...(vehicle.images?.[0]?.uri ? { imageUrl: vehicle.images[0].uri } : {}),
    ...(stickerUrl ? { windowStickerUrl: stickerUrl } : {}),
    ...(historyUrl ? { carfaxUrl: historyUrl } : {}),
    strategy: `${strategyFor({ source, title: cleaned, make: vehicle.make, model: vehicle.model })} ${fitDetails.join(' | ')}`.trim(),
    sourceMode: 'api_live',
  };
}

function vehicleSearchText(vehicle: InventoryVehicle) {
  return [
    vehicle.title,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.price,
    vehicle.mileage,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.bodyStyle,
    vehicle.drivetrain,
    vehicle.engine,
    vehicle.transmission,
    vehicle.stockNumber,
    vehicle.vin,
    vehicle.strategy,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreInventoryFit(vehicle: InventoryVehicle, intent: InventoryIntent) {
  const text = vehicleSearchText(vehicle);
  const title = vehicle.title.toLowerCase();
  let score = 20;
  const tags: string[] = [];
  const reasons: string[] = [];
  const hardMisses: string[] = [];

  if (intent.make) {
    if (vehicle.make?.toLowerCase() === intent.make.toLowerCase() || title.includes(intent.make.toLowerCase())) {
      score += 12;
      tags.push(intent.make);
    } else {
      hardMisses.push(`not ${intent.make}`);
    }
  }

  if (intent.model) {
    if (vehicle.model?.toLowerCase().includes(intent.model.toLowerCase()) || title.includes(intent.model.toLowerCase())) {
      score += 28;
      tags.push(intent.model);
      reasons.push(`matches ${intent.model}`);
    } else {
      hardMisses.push(`not ${intent.model}`);
    }
  }

  if (intent.yearMin) {
    if (vehicle.year && vehicle.year >= intent.yearMin) {
      score += 10;
      tags.push(`${intent.yearMin}+`);
      reasons.push(`${vehicle.year} is ${intent.yearMin}+`);
    } else if (vehicle.year) {
      hardMisses.push(`older than ${intent.yearMin}`);
    }
  }

  if (intent.yearMax) {
    if (vehicle.year && vehicle.year <= intent.yearMax) score += 6;
    else if (vehicle.year) hardMisses.push(`newer than ${intent.yearMax}`);
  }

  if (intent.mileageMax) {
    const miles = numberFromText(vehicle.mileage);
    if (miles !== undefined && miles <= intent.mileageMax) {
      score += 14;
      tags.push(`under ${intent.mileageMax.toLocaleString()} mi`);
      reasons.push(`${vehicle.mileage} is inside the mileage request`);
    } else if (miles !== undefined) {
      hardMisses.push(`over ${intent.mileageMax.toLocaleString()} miles`);
    }
  }

  if (intent.priceMax) {
    const price = priceNumber(vehicle.price);
    if (price !== undefined && price <= intent.priceMax) {
      score += 22;
      tags.push(`under $${intent.priceMax.toLocaleString()}`);
      reasons.push(`${vehicle.price} is inside the price request`);
    } else if (price !== undefined) {
      hardMisses.push(`over $${intent.priceMax.toLocaleString()}`);
    } else {
      hardMisses.push('missing price');
    }
  }

  for (const color of intent.colors) {
    const exteriorText = vehicle.strategy.match(/Exterior\s+([^|]+)/i)?.[1] ?? '';
    if (colorPattern(color).test(exteriorText)) {
      score += 12;
      tags.push(`${color} color`);
      reasons.push(`has ${color} color evidence`);
    } else {
      hardMisses.push(`no ${color} exterior evidence`);
    }
  }

  for (const color of intent.excludedColors) {
    const exteriorText = vehicle.strategy.match(/Exterior\s+([^|]+)/i)?.[1] ?? '';
    if (colorPattern(color).test(exteriorText)) {
      hardMisses.push(`${color} exterior excluded by customer`);
    } else {
      tags.push(`not ${color}`);
    }
  }

  if (intent.excludesHybrid) {
    if (/\b(4xe|hybrid|hybird|plug[-\s]?in|phev)\b/i.test(text)) {
      hardMisses.push('hybrid/4xe excluded by customer');
    } else {
      tags.push('non-hybrid');
      reasons.push('avoids hybrid/4xe wording');
    }
  }

  for (const feature of intent.features) {
    const pattern =
      feature === 'hardtop'
        ? /\bhard\s*top|hardtop|3[-\s]?piece/i
        : feature === 'dually'
          ? /\bdually|dualy|dual\s+rear|dual[-\s]?wheel|drw|3500\b/i
        : feature === '4x4'
          ? /\b4x4|4wd|four wheel|all wheel|awd\b/i
          : new RegExp(`\\b${feature}\\b`, 'i');
    if (pattern.test(text)) {
      score += 12;
      tags.push(feature);
      reasons.push(feature === 'dually' ? 'is a Ram 3500 candidate; confirm dual rear wheel on the sticker' : `has ${feature}`);
    } else {
      hardMisses.push(`missing ${feature}`);
    }
  }

  if (intent.sourcePreference) {
    if (vehicle.source === intent.sourcePreference) score += 8;
    else hardMisses.push(`not ${intent.sourcePreference}`);
  }

  if (intent.wantsCleanCarfax) {
    tags.push('carfax-verify');
    reasons.push('Carfax/history must be verified on the vehicle page before promising it is clean.');
  }

  if (!reasons.length) {
    reasons.push('Closest available match from the live store feed.');
  }

  return {
    vehicle: {
      ...vehicle,
      fitScore: Math.max(0, Math.min(99, score - hardMisses.length * 18)),
      matchTags: Array.from(new Set(tags)).slice(0, 12),
      recommendationReason: `${reasons.join(' ')}${hardMisses.length ? ` Near miss: ${hardMisses.join(', ')}.` : ''}`,
    },
    hardMisses,
  };
}

function vehicleFromTitle(title: string, source: InventoryVehicle['source'], url?: string): InventoryVehicle | null {
  const cleaned = clean(title);
  if (!cleaned || cleaned.length < 8) return null;
  const inferred = inferMakeModel(cleaned);
  return {
    id: stableId(`${source}:${cleaned}:${url ?? ''}`),
    source,
    title: cleaned.slice(0, 120),
    ...(inferred.year ? { year: inferred.year } : {}),
    ...(inferred.make ? { make: inferred.make } : {}),
    ...(inferred.model ? { model: inferred.model } : {}),
    ...(url ? { url } : {}),
    strategy: strategyFor({ source, title: cleaned, make: inferred.make, model: inferred.model }),
    sourceMode: 'api_live',
  };
}

function extractJsonVehicles(html: string, source: InventoryVehicle['source']) {
  const vehicles: InventoryVehicle[] = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const script of scripts) {
    const json = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(json) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const record = item as { name?: string; model?: string; brand?: { name?: string } | string; url?: string; image?: string };
        const title = record.name ?? [record.brand && typeof record.brand === 'object' ? record.brand.name : record.brand, record.model].filter(Boolean).join(' ');
        const vehicle = vehicleFromTitle(title, source, record.url);
        if (vehicle) vehicles.push({ ...vehicle, ...(record.image ? { imageUrl: record.image } : {}) });
      }
    } catch {
      // Ignore malformed embedded JSON and continue with the regex parser.
    }
  }
  return vehicles;
}

function extractTextVehicles(html: string, source: InventoryVehicle['source']) {
  const vehicles: InventoryVehicle[] = [];
  const seen = new Set<string>();
  const text = html.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  const pattern = /\b((?:19|20)\d{2}\s+(?:Chrysler|Dodge|Jeep|Ram|FIAT|Fiat)\s+[A-Za-z0-9][A-Za-z0-9 .'-]{2,70})/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && vehicles.length < 60) {
    const title = clean(match[1]);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const vehicle = vehicleFromTitle(title, source);
    if (vehicle) vehicles.push(vehicle);
  }
  return vehicles;
}

async function fetchInventoryPage(url: string) {
  const response = await fetch(url, {
    headers: browserHeaders(url, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
  });
  if (!response.ok) throw new Error(`Inventory source returned ${response.status}`);
  return response.text();
}

async function fetchInventoryApiSource(
  sourceInfo: (typeof inventoryApiSources)[number],
  intent: InventoryIntent,
  maxVehicles: number,
): Promise<InventorySourceResult> {
  const vehicles: InventoryVehicle[] = [];
  const useNativeSearch = Boolean(intent.searchTerm);

  async function fetchPage(start: number) {
    const url = new URL(sourceInfo.url);
    url.searchParams.set('start', String(start));
    if (useNativeSearch && intent.searchTerm) {
      url.searchParams.set('search', intent.searchTerm);
    } else {
      if (intent.make) url.searchParams.set('make', intent.make);
      if (intent.model) url.searchParams.set('model', intent.model);
    }
    const response = await fetch(url, {
      headers: browserHeaders(sourceInfo.referer, 'application/json, text/javascript, */*; q=0.01'),
    });
    if (!response.ok) throw new Error(`Inventory API returned ${response.status}`);
    const payload = (await response.json()) as {
      inventory?: DdcVehicle[];
      pageInfo?: { totalCount?: number; pageSize?: number; trackingData?: DdcVehicle[] };
    };
    const items = Array.isArray(payload.inventory) ? payload.inventory : (payload.pageInfo?.trackingData ?? []);
    return {
      items,
      totalCount: Number(payload.pageInfo?.totalCount ?? items.length),
      pageSize: Number(payload.pageInfo?.pageSize ?? (items.length || 18)),
    };
  }

  const first = await fetchPage(0);
  for (const item of first.items) {
    const vehicle = vehicleFromDdc(item, sourceInfo.source);
    if (vehicle) vehicles.push(vehicle);
  }

  const pageSize = Math.max(1, first.pageSize || first.items.length || 18);
  const fetchLimit = Math.max(pageSize, Math.min(maxVehicles, first.totalCount));
  const starts: number[] = [];
  for (let start = pageSize; start < fetchLimit; start += pageSize) {
    starts.push(start);
  }

  for (const start of starts) {
    const page = await fetchPage(start);
    for (const item of page.items) {
      const vehicle = vehicleFromDdc(item, sourceInfo.source);
      if (vehicle) vehicles.push(vehicle);
    }
  }

  return {
    vehicles,
    totalCount: first.totalCount,
    pageSize,
  };
}

function rankVehicles(vehicles: InventoryVehicle[], query: string | undefined) {
  const tokens = (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
  if (tokens.length === 0) return vehicles;
  return vehicles
    .map((vehicle) => {
      const haystack = [vehicle.title, vehicle.make, vehicle.model, vehicle.trim, vehicle.stockNumber].filter(Boolean).join(' ').toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { vehicle, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.vehicle);
}

function queryTokens(query: string | undefined) {
  const ignored = new Set([
    'with',
    'without',
    'under',
    'over',
    'clean',
    'find',
    'need',
    'needs',
    'want',
    'wants',
    'wanted',
    'looking',
    'show',
    'have',
    'has',
    'customer',
    'client',
    'shopper',
    'person',
    'someone',
    'something',
    'anything',
    'like',
    'please',
    'that',
    'this',
    'them',
    'they',
    'their',
    'him',
    'her',
    'me',
    'you',
    'less',
    'than',
    'below',
    'max',
    'maximum',
    'dollars',
    'dollar',
    'bucks',
    'usd',
    'price',
    'cheap',
    'cheapest',
    'lowest',
    'budget',
    'cash',
    'around',
    'about',
    'no',
    'not',
    'avoid',
    'exclude',
    'skip',
    'interested',
    'door',
    'out',
    'the',
    'miles',
    'mile',
  ]);
  return (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !ignored.has(token));
}

function queryTokenScore(vehicle: InventoryVehicle, query: string | undefined) {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const haystack = vehicleSearchText(vehicle);
  return tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
}

export class InventoryService {
  async search(query?: string, limit = 9): Promise<InventorySearchResponse> {
    const vehicles: InventoryVehicle[] = [];
    const warnings: string[] = [];
    const intent = parseIntent(query);
    const hasQuery = Boolean(query?.trim());
    const maxVehicles =
      intent.mileageMax || intent.colors.length || intent.excludedColors.length || intent.features.length || intent.excludesHybrid
        ? 360
        : hasQuery || intent.model
          ? 180
          : 36;
    const matchedCounts = { new: 0, used: 0 };
    const totalCounts = { new: 0, used: 0 };

    await Promise.all(
      inventoryApiSources
        .filter((source) => !intent.sourcePreference || source.source === intent.sourcePreference)
        .map(async (source) => {
          try {
            const result = await fetchInventoryApiSource(source, intent, maxVehicles);
            vehicles.push(...result.vehicles);
            matchedCounts[source.source] = result.totalCount;
          } catch (error) {
            warnings.push(error instanceof Error ? error.message : 'Inventory API source failed');
          }
        }),
    );

    await Promise.all(
      inventoryApiSources.map(async (source) => {
        try {
          if (!hasQuery && (!intent.sourcePreference || source.source === intent.sourcePreference)) {
            totalCounts[source.source] = matchedCounts[source.source];
            return;
          }
          const result = await fetchInventoryApiSource(
            source,
            { colors: [], excludedColors: [], features: [], excludesHybrid: false, wantsCleanCarfax: false, cheapestFirst: false },
            18,
          );
          totalCounts[source.source] = result.totalCount;
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : 'Inventory count source failed');
        }
      }),
    );

    if (!vehicles.length) {
      await Promise.all(
        inventorySourceUrls.map(async (url) => {
          try {
            const html = await fetchInventoryPage(url);
            const source = sourceFromUrl(url);
            vehicles.push(...extractJsonVehicles(html, source), ...extractTextVehicles(html, source));
          } catch (error) {
            warnings.push(error instanceof Error ? error.message : 'Inventory source failed');
          }
        }),
      );
    }

    const liveVehicleCount = vehicles.length;
    const sourceTotal = totalCounts.new + totalCounts.used;

    const unique = new Map<string, InventoryVehicle>();
    for (const vehicle of vehicles) {
      unique.set(`${vehicle.stockNumber ?? vehicle.vin ?? vehicle.source}:${vehicle.title.toLowerCase()}`, vehicle);
    }

    const fitted = Array.from(unique.values()).map((vehicle) => scoreInventoryFit(vehicle, intent));
    const tokenAware = fitted
      .map((item) => ({
        ...item,
        tokenScore: queryTokenScore(item.vehicle, query),
      }))
      .filter((item) => !hasQuery || item.tokenScore > 0 || item.hardMisses.length === 0);
    const cleanFits = tokenAware.filter((item) => item.hardMisses.length === 0);
    if (hasQuery && !cleanFits.length && tokenAware.length) {
      warnings.push('No exact vehicle matched every requested detail. Showing the closest live matches and marking what must be verified.');
    }
    const ranked = (cleanFits.length ? cleanFits : tokenAware.length ? tokenAware : fitted.map((item) => ({ ...item, tokenScore: 0 })))
      .sort((left, right) => {
        if (intent.cheapestFirst || intent.priceMax) {
          const leftPrice = priceNumber(left.vehicle.price) ?? Number.MAX_SAFE_INTEGER;
          const rightPrice = priceNumber(right.vehicle.price) ?? Number.MAX_SAFE_INTEGER;
          if (leftPrice !== rightPrice) return leftPrice - rightPrice;
        }
        return (right.vehicle.fitScore ?? 0) + right.tokenScore * 8 - ((left.vehicle.fitScore ?? 0) + left.tokenScore * 8);
      })
      .map((item) => item.vehicle);
    const selected = (query && ranked.length ? ranked : rankVehicles(Array.from(unique.values()), query)).slice(0, limit);
    if (hasQuery && !selected.length && sourceTotal > 0) {
      warnings.push('No live inventory matched that search. Try a broader phrase, or verify the exact equipment on the vehicle sticker/history links.');
    }
    if (!sourceTotal && !liveVehicleCount) {
      warnings.push('Live inventory source is unavailable right now. No fallback vehicles are shown.');
    }
    const selectedCounts = selected.reduce(
      (counts, vehicle) => {
        counts[vehicle.source] += 1;
        return counts;
      },
      { new: 0, used: 0 },
    );

    return {
      ...(query ? { query } : {}),
      vehicles: selected,
      counts: {
        totalNew: totalCounts.new,
        totalUsed: totalCounts.used,
        total: totalCounts.new + totalCounts.used,
        matchedNew: selectedCounts.new,
        matchedUsed: selectedCounts.used,
        matchedTotal: selectedCounts.new + selectedCounts.used,
      },
      sourceUrls: [...inventorySourceUrls],
      fetchedAt: new Date().toISOString(),
      live: sourceTotal > 0 || liveVehicleCount > 0,
      ...(warnings.length ? { warning: warnings.join('; ') } : {}),
    };
  }
}
