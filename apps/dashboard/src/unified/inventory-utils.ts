import type { Vehicle } from '@drivecentric-ai/shared/xconsole';

export type InventoryCondition = 'all' | 'new' | 'used';
export type InventoryPhotoFilter = 'all' | 'with-photos' | 'needs-photos';
export type InventorySort = 'recent' | 'ltv-low' | 'price-low' | 'price-high' | 'mileage-low' | 'title';

export interface InventoryFilters {
  query: string;
  condition: InventoryCondition;
  photos: InventoryPhotoFilter;
  sort: InventorySort;
}

export type InventorySearchInsight = {
  active: boolean;
  summary: string;
  criteria: string[];
};

export function vehicleTitle(vehicle: Vehicle) {
  return vehicle.title
    || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    || vehicle.vin;
}

function condition(vehicle: Vehicle) {
  const raw = `${vehicle.condition ?? ''} ${vehicle.websiteUrl ?? ''}`.toLowerCase();
  if (/\bnew\b|\/new[/-]/.test(raw)) return 'new';
  if (/\bused\b|\bpre-owned\b|\bcertified\b|\/used[/-]/.test(raw)) return 'used';
  return 'unknown';
}

function normalizedVehicleText(vehicle: Vehicle) {
  return [
    vehicleTitle(vehicle),
    vehicle.vin,
    vehicle.stockNumber,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.status,
    vehicle.condition,
    vehicle.bodyStyle,
    vehicle.fuelType,
    vehicle.powertrainType,
    vehicle.drivetrain,
    vehicle.engine,
    vehicle.transmission,
    ...(vehicle.searchFacts ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function parsedAmount(raw: string) {
  const compact = raw.replace(/[$,\s]/g, '').toLowerCase();
  const value = Number.parseFloat(compact);
  if (!Number.isFinite(value)) return null;
  return compact.endsWith('k') ? value * 1_000 : value;
}

type NaturalCriteria = {
  rawQuery: string;
  maxPrice: number | null;
  minPrice: number | null;
  maxMileage: number | null;
  minTowing: number | null;
  minRange: number | null;
  minSeats: number | null;
  thirdRow: boolean;
  terms: string[];
  labels: string[];
};

const ignoredSearchWords = new Set([
  'a', 'an', 'and', 'are', 'car', 'cars', 'find', 'for', 'have', 'has', 'i', 'in', 'is', 'looking',
  'me', 'of', 'or', 'please', 'show', 'that', 'the', 'to', 'vehicle', 'vehicles', 'want', 'with',
  'under', 'below', 'less', 'than', 'over', 'above', 'more', 'at', 'least', 'miles', 'mile', 'range',
  'price', 'priced', 'tows', 'tow', 'towing', 'pounds', 'lbs', 'seats', 'seat',
  'able', 'any', 'can', 'could', 'do', 'does', 'got', 'something', 'what', 'you',
  'third', '3rd', 'row',
]);

function naturalCriteria(query: string): NaturalCriteria {
  const normalized = query.toLowerCase().replace(/[?!.]/g, ' ');
  const exactVin = normalized.replace(/[^a-z0-9]/g, '');
  if (/^[a-hj-npr-z0-9]{17}$/.test(exactVin)) {
    return {
      rawQuery: exactVin,
      maxPrice: null,
      minPrice: null,
      maxMileage: null,
      minTowing: null,
      minRange: null,
      minSeats: null,
      thirdRow: false,
      terms: [exactVin],
      labels: [`VIN ${exactVin.toUpperCase()}`],
    };
  }
  const amount = '([$]?\\s*[\\d,.]+\\s*k?)';
  const maxPriceMatch = normalized.match(new RegExp(`(?:under|below|less than|max(?:imum)?(?: price)?(?: of)?|up to)\\s*${amount}`));
  const minPriceMatch = normalized.match(new RegExp(`(?:over|above|more than|min(?:imum)?(?: price)?(?: of)?|at least)\\s*${amount}`));
  const mileageMatch = normalized.match(new RegExp(`(?:under|below|less than|max(?:imum)?(?: mileage)?(?: of)?|up to)\\s*${amount}\\s*(?:miles?|mi)\\b`));
  const towingMatch = normalized.match(new RegExp(`(?:tow(?:s|ing)?(?: capacity)?(?: of)?|tows at least|tow at least)\\s*${amount}`));
  const rangeMatch = normalized.match(new RegExp(`(?:range(?: of)?|go(?:es)?|over|at least)\\s*${amount}\\s*(?:miles?|mi)\\b`));
  const seatsMatch = normalized.match(/(?:seats?|room for)\s*(\d{1,2})|(\d{1,2})\s*(?:passengers?|seats?)/);
  const maxPrice = maxPriceMatch && !mileageMatch ? parsedAmount(maxPriceMatch[1] ?? '') : null;
  const minPrice = minPriceMatch && !rangeMatch ? parsedAmount(minPriceMatch[1] ?? '') : null;
  const maxMileage = mileageMatch ? parsedAmount(mileageMatch[1] ?? '') : null;
  const minTowing = towingMatch ? parsedAmount(towingMatch[1] ?? '') : null;
  const minRange = rangeMatch && /\b(?:range|go|electric|ev)\b/.test(normalized)
    ? parsedAmount(rangeMatch[1] ?? '')
    : null;
  const minSeats = seatsMatch ? Number(seatsMatch[1] ?? seatsMatch[2]) : null;
  const thirdRow = /\b(?:third|3rd)\s*row\b/.test(normalized);
  const semanticAliases: Array<[RegExp, string]> = [
    [/\b(?:sport utility|suvs?|crossovers?)\b/, 'suv'],
    [/\b(?:pickups?|trucks?)\b/, 'truck'],
    [/\b(?:electric|ev)\b/, 'electric'],
    [/\b(?:plug[- ]?in hybrid|phev)\b/, 'plug-in hybrid'],
    [/\bhybrid\b/, 'hybrid'],
    [/\bdiesel\b/, 'diesel'],
    [/\b(?:gas|gasoline|petrol)\b/, 'gasoline'],
    [/\b(?:all wheel drive|awd)\b/, 'awd'],
    [/\b(?:four wheel drive|4wd|4x4)\b/, '4wd'],
    [/\b(?:front wheel drive|fwd)\b/, 'fwd'],
    [/\b(?:rear wheel drive|rwd)\b/, 'rwd'],
  ];
  const semanticTerms = semanticAliases.filter(([pattern]) => pattern.test(normalized)).map(([, term]) => term);
  const tokens = normalized
    .replace(/[$,\d]/g, ' ')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 1 && !ignoredSearchWords.has(value))
    .filter((value) => !semanticAliases.some(([pattern]) => pattern.test(value)));
  const terms = [...new Set([...semanticTerms, ...tokens])];
  const labels = [
    maxPrice != null ? `≤ $${maxPrice.toLocaleString()}` : null,
    minPrice != null ? `≥ $${minPrice.toLocaleString()}` : null,
    maxMileage != null ? `≤ ${maxMileage.toLocaleString()} miles` : null,
    minTowing != null ? `tows ≥ ${minTowing.toLocaleString()} lb` : null,
    minRange != null ? `range ≥ ${minRange.toLocaleString()} mi` : null,
    minSeats != null ? `${minSeats}+ seats` : null,
    thirdRow ? 'third row' : null,
    ...terms,
  ].filter((value): value is string => Boolean(value));
  return { rawQuery: normalized.trim(), maxPrice, minPrice, maxMileage, minTowing, minRange, minSeats, thirdRow, terms, labels };
}

function matchesNaturalSearch(vehicle: Vehicle, criteria: NaturalCriteria) {
  const searchable = normalizedVehicleText(vehicle);
  if (criteria.rawQuery && searchable.includes(criteria.rawQuery)) return true;
  if (criteria.maxPrice != null && (vehicle.retailPrice == null || vehicle.retailPrice > criteria.maxPrice)) return false;
  if (criteria.minPrice != null && (vehicle.retailPrice == null || vehicle.retailPrice < criteria.minPrice)) return false;
  if (criteria.maxMileage != null && (vehicle.mileage == null || vehicle.mileage > criteria.maxMileage)) return false;
  if (criteria.minTowing != null && (vehicle.maxTowingCapacity == null || vehicle.maxTowingCapacity < criteria.minTowing)) return false;
  const range = vehicle.electricRangeMiles ?? vehicle.estimatedRangeMiles;
  if (criteria.minRange != null && (range == null || range < criteria.minRange)) return false;
  if (criteria.minSeats != null && (vehicle.seatingCapacity == null || vehicle.seatingCapacity < criteria.minSeats)) return false;
  if (criteria.thirdRow && vehicle.thirdRowSeats !== true && !/\b(?:third|3rd)\s*row\b/.test(normalizedVehicleText(vehicle))) return false;
  return criteria.terms.every((term) => {
    if (term === 'suv') return /\b(?:suv|sport utility|crossover)\b/.test(searchable);
    if (term === 'truck') return /\b(?:truck|pickup)\b/.test(searchable);
    if (term === 'electric') return /\b(?:electric|bev|ev)\b/.test(searchable);
    if (term === 'plug-in hybrid') return /\b(?:plug[- ]?in hybrid|phev)\b/.test(searchable);
    if (term === 'hybrid') return /\b(?:hybrid|phev)\b/.test(searchable);
    if (term === 'gasoline') return /\b(?:gas|gasoline|petrol)\b/.test(searchable);
    return searchable.includes(term);
  });
}

export function inventorySearchInsight(items: Vehicle[], query: string): InventorySearchInsight {
  const criteria = naturalCriteria(query);
  const active = Boolean(query.trim());
  if (!active) return { active: false, summary: 'Ask inventory a question', criteria: [] };
  const matches = items.filter((vehicle) => matchesNaturalSearch(vehicle, criteria));
  const complete = items.filter((vehicle) => vehicle.metadataComplete).length;
  return {
    active: true,
    summary: matches.length
      ? `${matches.length.toLocaleString()} match${matches.length === 1 ? '' : 'es'} found from preloaded inventory metadata`
      : 'No vehicle currently satisfies every requested detail',
    criteria: [
      ...criteria.labels,
      `${complete.toLocaleString()}/${items.length.toLocaleString()} metadata-ready`,
    ],
  };
}

export function filterAndSortInventory(items: Vehicle[], filters: InventoryFilters) {
  const query = filters.query.trim().toLowerCase();
  const criteria = naturalCriteria(query);
  return items
    .filter((vehicle) => {
      if (filters.condition !== 'all' && condition(vehicle) !== filters.condition) return false;
      if (filters.photos === 'with-photos' && vehicle.photos.length === 0) return false;
      if (filters.photos === 'needs-photos' && vehicle.photos.length > 0) return false;
      if (!query) return true;
      return matchesNaturalSearch(vehicle, criteria);
    })
    .sort((left, right) => {
      if (filters.sort === 'ltv-low') return (left.loanToValue ?? Number.POSITIVE_INFINITY) - (right.loanToValue ?? Number.POSITIVE_INFINITY);
      if (filters.sort === 'price-low') return (left.retailPrice ?? Number.POSITIVE_INFINITY) - (right.retailPrice ?? Number.POSITIVE_INFINITY);
      if (filters.sort === 'price-high') return (right.retailPrice ?? -1) - (left.retailPrice ?? -1);
      if (filters.sort === 'mileage-low') return (left.mileage ?? Number.POSITIVE_INFINITY) - (right.mileage ?? Number.POSITIVE_INFINITY);
      if (filters.sort === 'title') return vehicleTitle(left).localeCompare(vehicleTitle(right));
      return Date.parse(right.lastSynchronizedAt ?? '1970-01-01') - Date.parse(left.lastSynchronizedAt ?? '1970-01-01');
    });
}

export function inventoryBreakdown(items: Vehicle[]) {
  return items.reduce(
    (summary, vehicle) => {
      const category = condition(vehicle);
      if (category === 'new') summary.new += 1;
      if (category === 'used') summary.used += 1;
      if (vehicle.photos.length > 0) summary.withPhotos += 1;
      return summary;
    },
    { new: 0, used: 0, withPhotos: 0 },
  );
}
