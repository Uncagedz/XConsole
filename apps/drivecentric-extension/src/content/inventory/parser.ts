import type { InventoryVehicle } from '@drivecentric-ai/shared';

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim();
}

function stableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `inv-${hash.toString(16)}`;
}

function absoluteUrl(href: string | undefined | null, baseUrl: string) {
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function sourceFromUrl(url: string): InventoryVehicle['source'] {
  return /\/used-|\/used\/|preowned|pre-owned/i.test(url) ? 'used' : 'new';
}

function inferMakeModel(title: string) {
  const match = title.match(
    /\b((?:19|20)\d{2})\s+(Chrysler|Dodge|Jeep|Ram|FIAT|Fiat|Kia|Toyota|Honda|Ford|Chevrolet|GMC|Nissan|Hyundai|Mazda|Volkswagen|Subaru|BMW|Mercedes-Benz|Audi|Lexus|Acura|Cadillac)\s+([A-Za-z0-9 -]{2,80})/i,
  );

  if (match?.[1] && match[2]) {
    const modelTrim = clean(match[3]);
    const parts = modelTrim?.split(/\s+/) ?? [];
    return {
      year: Number(match[1]),
      make: match[2].toUpperCase() === 'FIAT' ? 'FIAT' : match[2],
      model: parts.slice(0, 3).join(' '),
      trim: parts.slice(3).join(' ') || undefined,
    };
  }

  const makeOnly = title.match(
    /\b(Chrysler|Dodge|Jeep|Ram|FIAT|Fiat|Kia|Toyota|Honda|Ford|Chevrolet|GMC|Nissan|Hyundai|Mazda|Volkswagen|Subaru|BMW|Mercedes-Benz|Audi|Lexus|Acura|Cadillac)\s+([A-Za-z0-9 -]{2,80})/i,
  );

  if (!makeOnly?.[1]) return {};

  const modelTrim = clean(makeOnly[2]);
  const parts = modelTrim?.split(/\s+/) ?? [];

  return {
    make: makeOnly[1].toUpperCase() === 'FIAT' ? 'FIAT' : makeOnly[1],
    model: parts.slice(0, 3).join(' '),
    trim: parts.slice(3).join(' ') || undefined,
  };
}

function vehicleTitleFromText(text: string) {
  const match = text.match(
    /\b(?:19|20)\d{2}\s+(?:Chrysler|Dodge|Jeep|Ram|FIAT|Fiat|Kia|Toyota|Honda|Ford|Chevrolet|GMC|Nissan|Hyundai|Mazda|Volkswagen|Subaru|BMW|Mercedes-Benz|Audi|Lexus|Acura|Cadillac)\s+[A-Za-z0-9][A-Za-z0-9 .'-]{2,100}/i,
  );
  return clean(match?.[0]);
}

function vehicleTitleFromHref(href: string | undefined) {
  if (!href) return undefined;
  const decoded = decodeURIComponent(href);
  const slug = decoded
    .split('/')
    .pop()
    ?.replace(/\.htm[l]?$/i, '')
    .replace(/[-_]+/g, ' ');

  return vehicleTitleFromText(slug ?? '');
}

function looksLikeVehicleTitle(title: string | undefined) {
  if (!title) return false;
  if (!/\b(?:19|20)\d{2}\b/.test(title)) return false;
  if (
    !/\b(?:Chrysler|Dodge|Jeep|Ram|FIAT|Fiat|Kia|Toyota|Honda|Ford|Chevrolet|GMC|Nissan|Hyundai|Mazda|Volkswagen|Subaru|BMW|Mercedes-Benz|Audi|Lexus|Acura|Cadillac)\b/i.test(
      title,
    )
  ) {
    return false;
  }
  return !/\b(all\s+(?:new|used)\s+inventory|inventory|specials?|incentives?|directions|hours|pricing info|msrp|lease specials?)\b/i.test(
    title,
  );
}

function looksLikeVehicleHref(href: string | undefined) {
  if (!href) return false;
  if (!/\/(?:new|used|inventory)\//i.test(href) && !/VehicleDetails|vin=|stock=/i.test(href)) return false;
  return !/index\.htm|specials|incentives|directions|hours|service|parts|finance|contact/i.test(href);
}

function unique(values: Array<string | undefined>, limit = 20) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = clean(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);

    if (output.length >= limit) break;
  }

  return output;
}

function textLines(text: string) {
  return unique(
    text
      .split(/\n+|•|\|/g)
      .map((line) => clean(line))
      .filter(Boolean),
    200,
  );
}

function getAttr(root: Element, names: string[]) {
  for (const name of names) {
    const value = root.getAttribute(name);
    if (value) return clean(value);
  }
  return undefined;
}

function collectLinks(root: Element, baseUrl: string) {
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).map((anchor) => {
    const href = absoluteUrl(anchor.getAttribute('href'), baseUrl);
    const label = clean(anchor.innerText || anchor.textContent || anchor.title || anchor.getAttribute('aria-label'));
    return href ? { href, label } : undefined;
  });

  return links.filter(Boolean) as Array<{ href: string; label?: string }>;
}

function findVehicleUrl(root: Element, baseUrl: string) {
  const direct =
    root.querySelector<HTMLAnchorElement>('a[href*="/new/"], a[href*="/used/"], a[href*="/inventory/"], a[href*="VehicleDetails"], a[href*="vin="], a[href*="stock="]') ??
    root.querySelector<HTMLAnchorElement>('a[href]');

  const href = absoluteUrl(direct?.getAttribute('href'), baseUrl);
  return href && looksLikeVehicleHref(href) ? href : undefined;
}

function findStickerUrl(root: Element, baseUrl: string) {
  const links = collectLinks(root, baseUrl);
  const sticker = links.find((link) =>
    /\b(window sticker|sticker|monroney|build sheet|spec sheet|equipment|original window)\b/i.test(`${link.label ?? ''} ${link.href}`),
  );
  return sticker?.href;
}

function findCarfaxUrl(root: Element, baseUrl: string) {
  const links = collectLinks(root, baseUrl);
  const carfax = links.find((link) => /\b(carfax|auto ?check|history report|vehicle history)\b/i.test(`${link.label ?? ''} ${link.href}`));
  return carfax?.href;
}

function collectImageUrls(root: Element, baseUrl: string) {
  const urls = [
    ...Array.from(root.querySelectorAll<HTMLImageElement>('img')).map(
      (img) =>
        img.currentSrc ||
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-lazy') ||
        img.getAttribute('data-lazy-src'),
    ),
    ...Array.from(root.querySelectorAll<HTMLElement>('[style*="background-image"]')).map((node) => {
      const style = node.getAttribute('style') ?? '';
      return style.match(/url\(["']?([^"')]+)["']?\)/i)?.[1];
    }),
  ];

  return unique(
    urls
      .map((url) => absoluteUrl(url, baseUrl))
      .filter((url) => url && !/logo|sprite|favicon|placeholder|loading/i.test(url)),
    12,
  );
}

function extractPrice(text: string) {
  const labels = [
    /internet price[:\s]*\$?\s?([\d,]+)/i,
    /sale price[:\s]*\$?\s?([\d,]+)/i,
    /our price[:\s]*\$?\s?([\d,]+)/i,
    /dealer price[:\s]*\$?\s?([\d,]+)/i,
    /msrp[:\s]*\$?\s?([\d,]+)/i,
  ];

  for (const pattern of labels) {
    const match = text.match(pattern);
    if (match?.[1]) return `$${match[1]}`;
  }

  return clean(text.match(/\$\s?\d[\d,]+/)?.[0]);
}

function extractMsrp(text: string) {
  const match = text.match(/\bMSRP[:\s]*\$?\s?([\d,]+)/i);
  return match?.[1] ? `$${match[1]}` : undefined;
}

function extractSavings(text: string) {
  const match =
    text.match(/\b(?:savings|discount|dealer discount|you save)[:\s]*\$?\s?([\d,]+)/i) ??
    text.match(/\$\s?([\d,]+)\s+(?:off|savings)/i);

  return match?.[1] ? `$${match[1]}` : undefined;
}

function extractMileage(text: string) {
  const mileageMatch =
    text.match(/\b(?:mileage|miles|odometer)[:\s]*([0-9][0-9,]{1,8})\b/i) ??
    text.match(/\b([0-9][0-9,]{1,8})\s*(?:miles|mi)\b/i);

  return mileageMatch?.[1] ? `${mileageMatch[1]} mi` : undefined;
}

function extractStock(text: string, root: Element) {
  const attr = getAttr(root, ['data-stock', 'data-stock-number', 'data-vehicle-stock']);
  if (attr) return attr;

  const match =
    text.match(/\b(?:stock|stk)\s*#?:?\s*([A-Z0-9-]{4,24})\b/i) ??
    text.match(/\bStock Number[:\s]*([A-Z0-9-]{4,24})\b/i);

  return match?.[1];
}

function extractVin(text: string, root: Element) {
  const attr = getAttr(root, ['data-vin', 'data-vehicle-vin']);
  if (attr) return attr.toUpperCase();

  const match =
    text.match(/\bvin\s*#?:?\s*([A-HJ-NPR-Z0-9]{11,17})\b/i) ??
    text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);

  return match?.[1]?.toUpperCase();
}

function collectFeatures(text: string) {
  const featurePatterns = [
    /\b4x4\b/i,
    /\bAWD\b/i,
    /\bFWD\b/i,
    /\bRWD\b/i,
    /\bHEMI\b/i,
    /\bV6\b/i,
    /\bV8\b/i,
    /\bTurbo\b/i,
    /\bLeather\b/i,
    /\bNavigation\b/i,
    /\bBackup Camera\b/i,
    /\bRear Camera\b/i,
    /\bBluetooth\b/i,
    /\bApple CarPlay\b/i,
    /\bAndroid Auto\b/i,
    /\bSunroof\b/i,
    /\bMoonroof\b/i,
    /\bPanoramic\b/i,
    /\bHeated Seats?\b/i,
    /\bVentilated Seats?\b/i,
    /\bAdaptive Cruise\b/i,
    /\bBlind Spot\b/i,
    /\bRemote Start\b/i,
    /\bTow Package\b/i,
    /\bBed Liner\b/i,
    /\bHard Top\b/i,
    /\bSoft Top\b/i,
    /\b4xe\b/i,
    /\bHybrid\b/i,
    /\bThird Row\b/i,
    /\bCaptain'?s Chairs\b/i,
  ];

  return unique(
    featurePatterns
      .map((pattern) => text.match(pattern)?.[0])
      .filter(Boolean),
    30,
  );
}

function collectFeatureLines(text: string) {
  const lines = textLines(text);
  return unique(
    lines.filter((line) =>
      /\b(4x4|awd|fwd|rwd|leather|navigation|camera|bluetooth|carplay|android auto|sunroof|heated|ventilated|adaptive|blind spot|remote start|tow|package|hard top|soft top|third row|captain|safety|engine|transmission|drivetrain|fuel|mpg|warranty|certified)\b/i.test(
        line,
      ),
    ),
    35,
  );
}

function extractColor(text: string, label: 'exterior' | 'interior') {
  const pattern =
    label === 'exterior'
      ? /\b(?:exterior color|exterior|color)[:\s]+([A-Za-z0-9 -]{3,40})\b/i
      : /\b(?:interior color|interior)[:\s]+([A-Za-z0-9 -]{3,40})\b/i;

  return clean(text.match(pattern)?.[1]);
}

function extractEngine(text: string) {
  return clean(text.match(/\b(?:engine)[:\s]+([A-Za-z0-9 .,-]{3,80})\b/i)?.[1]);
}

function extractTransmission(text: string) {
  return clean(text.match(/\b(?:transmission)[:\s]+([A-Za-z0-9 .,-]{3,80})\b/i)?.[1]);
}

function extractDrivetrain(text: string) {
  return clean(text.match(/\b(?:drivetrain|drive type)[:\s]+([A-Za-z0-9 .,-]{3,40})\b/i)?.[1] ?? text.match(/\b(4x4|AWD|FWD|RWD)\b/i)?.[1]);
}

function extractCertified(text: string) {
  return /\b(certified|cpo|certified pre-owned)\b/i.test(text);
}

function collectBadges(text: string) {
  return unique(
    textLines(text).filter((line) =>
      /\b(new arrival|certified|cpo|one owner|clean carfax|manager special|sale|special|low miles|great deal|hot|featured|in transit|available|sold|pending)\b/i.test(
        line,
      ),
    ),
    15,
  );
}

function buildSearchBlob(parts: Array<string | undefined | string[]>) {
  return unique(
    parts.flatMap((part) => (Array.isArray(part) ? part : [part])).filter(Boolean) as string[],
    80,
  ).join(' | ');
}

function strategyFor(title: string, source: InventoryVehicle['source']) {
  if (/wrangler/i.test(title)) return 'Use this when the buyer wants lifestyle, 4x4, open-air fun, or a stronger appointment hook.';
  if (/grand cherokee|durango|pacifica/i.test(title)) return 'Use this when space, comfort, family practicality, or road-trip confidence can strengthen the close.';
  if (/ram|1500|2500|3500|truck/i.test(title)) return 'Use this when capability, trade value, towing, comfort, or truck use-case matters.';
  if (/charger|challenger|daytona|scat|hellcat/i.test(title)) return 'Use this when emotion, presence, performance, or excitement can move the customer.';
  if (/optima|accord|camry|corolla|civic|elantra|sonata/i.test(title)) return 'Use this as a value-friendly daily driver angle when payment, reliability, fuel economy, or clean condition matters.';
  if (source === 'used') return 'Use this as a value/payment-friendly move when budget or monthly comfort is the real issue.';
  return 'Use this as a same-brand alternative that keeps the lead moving without losing momentum.';
}

function parseVehicleCard(source: InventoryVehicle['source'], url: string, root: Element): InventoryVehicle | null {
  const text = clean((root as HTMLElement).innerText || root.textContent) ?? '';
  const href = findVehicleUrl(root, url);
  const title =
    vehicleTitleFromText(text) ??
    vehicleTitleFromHref(href) ??
    clean(root.querySelector('[data-testid*="title" i], [class*="title" i], h1, h2, h3, a')?.textContent);

  if (!title) return null;
  if (!looksLikeVehicleTitle(title)) return null;
  if (href && !looksLikeVehicleHref(href)) return null;

  const price = extractPrice(text);
  const msrp = extractMsrp(text);
  const savings = extractSavings(text);
  const mileage = extractMileage(text);
  const stockNumber = extractStock(text, root);
  const vin = extractVin(text, root);
  const stickerUrl = findStickerUrl(root, url);
  const carfaxUrl = findCarfaxUrl(root, url);
  const photoUrls = collectImageUrls(root, url);
  const features = collectFeatures(text);
  const featureLines = collectFeatureLines(text);
  const badges = collectBadges(text);
  const inferred = inferMakeModel(title);

  if (!price && !stockNumber && !vin && !href && !stickerUrl && !carfaxUrl) return null;

  const vehicle = {
    id: stableId(`${source}:${title}:${vin ?? stockNumber ?? href ?? url}`),
    source,
    title: title.slice(0, 140),
    ...(inferred.year ? { year: inferred.year } : {}),
    ...(inferred.make ? { make: inferred.make } : {}),
    ...(inferred.model ? { model: inferred.model } : {}),
    ...(inferred.trim ? { trim: inferred.trim } : {}),
    ...(price ? { price } : {}),
    ...(msrp ? { msrp } : {}),
    ...(savings ? { savings } : {}),
    ...(mileage ? { mileage } : {}),
    ...(stockNumber ? { stockNumber } : {}),
    ...(vin ? { vin } : {}),
    ...(href ? { url: href } : {}),
    ...(stickerUrl ? { stickerUrl } : {}),
    ...(carfaxUrl ? { carfaxUrl } : {}),
    ...(photoUrls.length ? { photoUrls } : {}),
    ...(features.length ? { features } : {}),
    ...(featureLines.length ? { featureLines } : {}),
    ...(badges.length ? { badges } : {}),
    ...(extractColor(text, 'exterior') ? { exteriorColor: extractColor(text, 'exterior') } : {}),
    ...(extractColor(text, 'interior') ? { interiorColor: extractColor(text, 'interior') } : {}),
    ...(extractEngine(text) ? { engine: extractEngine(text) } : {}),
    ...(extractTransmission(text) ? { transmission: extractTransmission(text) } : {}),
    ...(extractDrivetrain(text) ? { drivetrain: extractDrivetrain(text) } : {}),
    ...(extractCertified(text) ? { certified: true } : {}),
    strategy: strategyFor(title, source),
    searchBlob: buildSearchBlob([
      title,
      price,
      msrp,
      savings,
      mileage,
      stockNumber,
      vin,
      features,
      featureLines,
      badges,
      stickerUrl ? 'window sticker available' : undefined,
      carfaxUrl ? 'carfax available' : undefined,
      extractCertified(text) ? 'certified pre-owned' : undefined,
    ]),
    sourceMode: 'browser_live',
  };

  return vehicle as InventoryVehicle;
}

export function parseDealerInventoryPage(document: Document, url: string) {
  const source = sourceFromUrl(url);

  const candidates = Array.from(
    new Set(
      [
        ...Array.from(
          document.querySelectorAll(
            [
              '[data-vehicle]',
              '[data-vin]',
              '[data-stock]',
              '[data-vehicle-id]',
              '[data-testid*="vehicle" i]',
              '[data-testid*="inventory" i]',
              'article',
              'li',
              '[class*="inventory" i]',
              '[class*="vehicle" i]',
              '[class*="card" i]',
              '[class*="result" i]',
              '[class*="listing" i]',
              '[class*="vdp" i]',
            ].join(', '),
          ),
        ),
        ...Array.from(
          document.querySelectorAll(
            'a[href*="/new/"], a[href*="/used/"], a[href*="/inventory/"], a[href*="VehicleDetails"], a[href*="vin="], a[href*="stock="]',
          ),
        )
          .filter((anchor) => looksLikeVehicleHref((anchor as HTMLAnchorElement).href))
          .map((anchor) => anchor.closest('article, li, [class*="card" i], [class*="vehicle" i], [class*="result" i], [class*="listing" i], div') ?? anchor),
      ].filter(Boolean),
    ),
  );

  const vehicles: InventoryVehicle[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const vehicle = parseVehicleCard(source, url, candidate);
    if (!vehicle) continue;

    const key = `${vehicle.source}:${vehicle.vin ?? vehicle.stockNumber ?? vehicle.title}`.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    vehicles.push(vehicle);
  }

  return vehicles.slice(0, 80);
}
