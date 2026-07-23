import {
  applyCommunicationCompliance,
  extractZipCodeFromText,
  type LeadContext,
  type LeadTimelineActor,
  type LeadTimelineChannel,
  type LeadTimelineDirection,
  type LeadTimelineEntry,
} from '@drivecentric-ai/shared';
import { driveCentricParserConfig, type FieldSelectorConfig, type ParserConfig } from './selectors';

type VehicleCandidate = NonNullable<LeadContext['vehicleOfInterestDetails']>;

const usStateCodes = [
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
].join('|');

const stageKeywords = [
  'engaged',
  'new',
  'attempted contact',
  'appointment set',
  'appointment confirmed',
  'showed',
  'working deal',
  'proposal',
  'sold',
  'delivered',
  'lost',
  'dead',
];

const areaCodeHints: Record<string, string> = {
  '229': 'South Georgia',
  '214': 'Dallas, Texas',
  '303': 'Denver, Colorado',
  '316': 'Wichita, Kansas',
  '404': 'Atlanta, Georgia',
  '405': 'Oklahoma City / central Oklahoma',
  '417': 'southwest Missouri',
  '415': 'San Francisco Bay Area, California',
  '469': 'Dallas, Texas',
  '470': 'Atlanta metro, Georgia',
  '478': 'Macon / central Georgia',
  '479': 'northwest Arkansas',
  '501': 'central Arkansas',
  '539': 'Tulsa / northeast Oklahoma',
  '573': 'Missouri',
  '580': 'western or southern Oklahoma',
  '620': 'southern Kansas',
  '682': 'Fort Worth, Texas',
  '678': 'Atlanta metro, Georgia',
  '706': 'north Georgia / Augusta / Columbus',
  '719': 'Colorado Springs, Colorado',
  '720': 'Denver, Colorado',
  '786': 'Miami, Florida',
  '762': 'north Georgia / Augusta / Columbus',
  '770': 'Atlanta suburbs, Georgia',
  '816': 'Kansas City, Missouri',
  '817': 'Fort Worth, Texas',
  '850': 'Florida panhandle',
  '870': 'Arkansas',
  '918': 'Tulsa / northeast Oklahoma',
  '912': 'Savannah / coastal Georgia',
  '943': 'Atlanta metro, Georgia',
  '940': 'north Texas',
  '972': 'Dallas, Texas',
};

const uiNoisePattern =
  /^(Activity|Conversation|Open|Deals|Value|Add|Actions|Genius|SAVE|Check In|Documents|Portal|Desk|Push|Mark as Sold|Snooze|Dead|New Deal|Vehicles|Trade In|Credit App|Wish List|Best Contact Method|Details|No Vehicles Currently|Generate Summary|PLANNED|NOTE|CALL|EMAIL|TEXT|VIDEO|TASK|APPT)$/i;

const crmReasonNoisePattern =
  /Reason Bought Elsewhere|Cross Sell|Due to Processes|Finance Declined|Inactivity on Deal|No Agreement|Old Deal|Bad Contact Info|Bad Lead|Dealer Purchase|Handraiser|Tradeshow|Service \/ Parts Lead|Test Lead|Transferred:/i;

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clamp(value: string | undefined, max: number) {
  const normalized = clean(value);
  return normalized ? normalized.slice(0, max) : undefined;
}

function unique(values: Array<string | undefined>, limit: number) {
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

function visibleImageContext(document: Document, roots: Element[]) {
  const imageRoots = roots.length ? roots : [document.body];
  const images = imageRoots.flatMap((root) => Array.from(root.querySelectorAll<HTMLImageElement>('img')));
  const useful = images
    .filter((image) => visible(image))
    .map((image) => {
      const src = image.currentSrc || image.src;
      const alt = image.alt || image.title || image.getAttribute('aria-label') || '';
      const rect = image.getBoundingClientRect();
      const nearby = clean((image.closest('li, article, [class*="message" i], [class*="timeline" i], [class*="media" i], [class*="content" i]') as HTMLElement | null)?.innerText);
      if (!src && !alt && !nearby) return undefined;
      if (/minilogo|avatar|profile|intercom|sprite|favicon|logo/i.test([src, alt].join(' '))) return undefined;
      const size = rect.width && rect.height ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : undefined;
      return clamp(
        [
          'Visible image attachment/context',
          alt ? `alt/title: ${alt}` : undefined,
          size ? `size: ${size}` : undefined,
          src ? `url: ${src}` : undefined,
          nearby ? `nearby text: ${nearby.slice(0, 500)}` : undefined,
        ]
          .filter(Boolean)
          .join(' | '),
        1200,
      );
    });
  return unique(useful, 12);
}

function visible(element: Element) {
  if (ignoredNode(element)) return false;
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  const hasLayout = rect.width > 0 || rect.height > 0;
  return style.display !== 'none' && style.visibility !== 'hidden' && (!hasLayout || (rect.width >= 20 && rect.height >= 20));
}

function queryAll(root: ParentNode, selectors: string[]) {
  const output: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    try {
      for (const node of Array.from(root.querySelectorAll(selector)).filter(visible)) {
        if (seen.has(node)) continue;
        seen.add(node);
        output.push(node);
      }
    } catch {
      continue;
    }
  }
  return output;
}

function queryAllAny(root: ParentNode, selectors: string[]) {
  const output: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    try {
      for (const node of Array.from(root.querySelectorAll(selector))) {
        if (ignoredNode(node)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        output.push(node);
      }
    } catch {
      continue;
    }
  }
  return output;
}

function ignoredNode(element: Element) {
  return Boolean(
    element.closest(
      [
        '.dcai-shell',
        '#intercom-container',
        '#intercom-css-container',
        '#intercom-tooltips-container',
        '#intercom-frame',
        '[id^="intercom"]',
        '[class*="intercom-" i]',
        '#upscope___remote-control-container',
        '#upscope___promo-link-container',
        '[id^="upscope___"]',
        '.cdk-describedby-message-container',
      ].join(', '),
    ),
  );
}

function queryAllAnyIncludingRoot(root: ParentNode, selectors: string[]) {
  const output: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of selectors) {
    try {
      if (root instanceof Element && root.matches(selector) && !seen.has(root)) {
        if (ignoredNode(root)) continue;
        seen.add(root);
        output.push(root);
      }
      for (const node of Array.from(root.querySelectorAll(selector))) {
        if (ignoredNode(node)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        output.push(node);
      }
    } catch {
      continue;
    }
  }
  return output;
}

function elementText(element: Element) {
  return clean((element as HTMLElement).innerText || element.textContent);
}

function textLines(text: string) {
  return unique(
    text
      .split(/\n+/)
      .map((line) => clean(line))
      .filter(Boolean),
    1500,
  );
}

function looksLikeNoise(value: string | undefined) {
  const normalized = clean(value);
  if (!normalized) return true;
  return /^(number|stock number|vehicle|source|name|details|activity|conversation|add|actions|deal)$/i.test(normalized) || uiNoisePattern.test(normalized) || crmReasonNoisePattern.test(normalized);
}

function looksLikePersonName(value: string | undefined) {
  const normalized = clean(value);
  if (!normalized) return false;
  if (looksLikeNoise(normalized)) return false;
  if (/[0-9@()]|https?:\/\//i.test(normalized)) return false;
  if (
    /\b(home|drivecentric|appointment|hub|pipeline|store|data|activity|conversation|open|deals|value|customer|deal|vehicle|source|status|sales|bdc|phone|email|text|task|notes?)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/\b(motors|auto|cars|chrysler|dodge|jeep|ram|fiat|ford|toyota|honda|dealer|dealership|kia|nissan|chevrolet|hyundai|mazda|volkswagen|subaru|cadillac|lexus|acura|bmw|mercedes)\b/i.test(normalized)) {
    return false;
  }
  if (/^[A-Z]{1,3}$/.test(normalized)) return false;
  return /^[A-Za-z][A-Za-z.'-]{0,40}(?:\s+[A-Za-z][A-Za-z.'-]{0,40}){1,3}$/.test(normalized);
}

function isNoiseLine(line: string) {
  return (
    looksLikeNoise(line) ||
    /^type your note here/i.test(line) ||
    /^reply stop at any time$/i.test(line) ||
    /^add$/i.test(line) ||
    /^video task\b/i.test(line) ||
    /^phone task\b/i.test(line) ||
    /^day \d+\s*-/i.test(line) ||
    /^today at \d/i.test(line) ||
    /^tomorrow at \d/i.test(line)
  );
}

function candidateFocusRoots(document: Document, config: ParserConfig) {
  const candidates = queryAll(document, config.focusRootSelectors)
    .filter((node) => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      const hasLayout = rect.width > 0 || rect.height > 0;
      return !hasLayout || (rect.width >= 420 && rect.height >= 280);
    })
    .sort((a, b) => scoreFocusRoot(b, config) - scoreFocusRoot(a, config));

  return candidates;
}

function scoreFocusRoot(node: Element, config: ParserConfig) {
  const rect = (node as HTMLElement).getBoundingClientRect();
  const text = elementText(node) ?? '';
  if (text.length < 80) return -1;
  let score = Math.min(rect.width * rect.height / 50000, 20);
  for (const keyword of config.focusKeywords) {
    if (text.includes(keyword)) score += 8;
  }
  if (/Deal:\s*#\d+/i.test(text) && /Customer:\s*#\d+/i.test(text)) score += 22;
  if (/Text From Customer|Text To Customer|Email To Customer|Deal Created|Deal Imported From System/i.test(text)) score += 24;
  if (/deal-header|drc-deal-card|drc-timeline/i.test(`${node.className ?? ''} ${node.tagName}`)) score += 22;
  if (/mat-dialog-container/i.test(node.tagName)) score += 60;
  if (/^drc-deal-card$/i.test(node.tagName)) score += 55;
  if (node.matches('[role="dialog"], .cdk-overlay-pane, .cdk-global-overlay-wrapper')) score += 45;
  if (node.querySelector('drc-deal-card, .deal-header')) score += 35;
  if (/Genius Summary/i.test(text)) score += 16;
  if (/Best Contact Method/i.test(text)) score += 12;
  if (/Activity/i.test(text) && /Conversation/i.test(text)) score += 14;
  if (/New Deal/i.test(text) && /Mark as Sold/i.test(text)) score += 10;
  if (/(Wish List|Details)/i.test(text)) score += 8;
  if (/Sales Engagement Hub/i.test(text) && /Add Filter/i.test(text)) score -= 100;
  if (node.querySelector('table, mat-table, cdk-virtual-scroll-viewport')) score -= 60;
  return score;
}

export function getDriveCentricFocusedRoot(document: Document, config: ParserConfig = driveCentricParserConfig) {
  return candidateFocusRoots(document, config)[0] ?? document.body;
}

function addRoot(roots: Element[], seen: Set<Element>, node: Element | null | undefined) {
  if (!node || seen.has(node)) return;
  if (ignoredNode(node)) return;
  seen.add(node);
  roots.push(node);
}

function collectContextRoots(document: Document, config: ParserConfig = driveCentricParserConfig) {
  const roots: Element[] = [];
  const seen = new Set<Element>();
  const dialogCandidates = queryAll(document, [
    'mat-dialog-container',
    '.cdk-overlay-pane drc-deal-card',
    '.cdk-overlay-pane [role="dialog"]',
    '.cdk-overlay-pane',
    'drc-deal-card',
    '[role="dialog"]',
    '[aria-modal="true"]',
  ])
    .filter((node) => {
      const text = elementText(node) ?? '';
      return /\b(Activity|Conversation|Best Contact Method|Open Deal|New Deal|Mark as Sold|Genius Summary)\b/i.test(text);
    })
    .sort((left, right) => scoreFocusRoot(right, config) - scoreFocusRoot(left, config));
  const focusedRoot = dialogCandidates[0] ?? getDriveCentricFocusedRoot(document, config);
  const focusedElement = focusedRoot instanceof Element ? focusedRoot : document.body;
  const focusedDialog =
    focusedElement.closest('mat-dialog-container, [role="dialog"], .cdk-overlay-pane, .cdk-global-overlay-wrapper') ?? focusedElement;

  addRoot(roots, seen, focusedDialog);
  addRoot(roots, seen, focusedElement);
  for (const node of dialogCandidates.slice(0, 4)) {
    addRoot(roots, seen, node);
  }
  addRoot(roots, seen, focusedDialog.querySelector('drc-deal-card') ?? focusedElement.querySelector('drc-deal-card'));
  addRoot(roots, seen, focusedDialog.querySelector('drc-deal-card-state-view') ?? focusedElement.querySelector('drc-deal-card-state-view'));
  addRoot(roots, seen, focusedDialog.querySelector('drc-deal-card-activity') ?? focusedElement.querySelector('drc-deal-card-activity'));
  addRoot(roots, seen, focusedDialog.querySelector('drc-timeline') ?? focusedElement.querySelector('drc-timeline'));
  addRoot(roots, seen, focusedDialog.querySelector('.deal-header') ?? focusedElement.querySelector('.deal-header'));
  for (const overlay of queryAll(document, ['.cdk-overlay-pane', 'mat-dialog-container', '[role="dialog"]'])) {
    const text = elementText(overlay) ?? '';
    if (/\b(Call Summary|Call Transcript|Phone Summary|Transcript)\b/i.test(text)) addRoot(roots, seen, overlay);
  }
  for (const node of candidateFocusRoots(document, config).slice(0, 5)) {
    if (focusedDialog.contains(node) || node.contains(focusedDialog)) addRoot(roots, seen, node);
  }

  const supportingSelectors = ['header', 'aside', 'section', '[class*="summary" i]', '[class*="contact" i]', '[class*="detail" i]', '[class*="info" i]'];
  for (const node of queryAll(focusedDialog, supportingSelectors)) {
    const text = elementText(node) ?? '';
    if (!text) continue;
    if (
      scoreFocusRoot(node, config) >= 6 ||
      /Deal:\s*#\d+|Customer:\s*#\d+|Genius Summary|Best Contact Method|Address\s+[A-Z]|Phone\s*\/|Mobile|Engaged|Wish List|Details/i.test(text)
    ) {
      addRoot(roots, seen, node);
    }
  }
  for (const node of queryAll(document, supportingSelectors)) {
    if (focusedDialog.contains(node) || node.contains(focusedDialog)) continue;
    const text = elementText(node) ?? '';
    const classText = [node.tagName, node.getAttribute('class'), node.getAttribute('id')].filter(Boolean).join(' ');
    if (!text || /smart-table|pipeline|mat-table|cdk-virtual-scroll|table/i.test(classText) || node.querySelector('table, mat-table, cdk-virtual-scroll-viewport')) continue;
    if (/Sales Engagement Hub|Add Filter/i.test(text)) continue;
    if (/\b(Best Contact Method|Address\s+[A-Z][A-Za-z]+.*\b\d{5}\b|Sales\s*1|BDC\s+[A-Z]|Call Summary|Phone Summary)\b/i.test(text)) {
      addRoot(roots, seen, node);
    }
  }

  return roots.slice(0, 14);
}

function textFromSelectors(root: ParentNode, selectors: string[], limit = 1) {
  return queryAll(root, selectors)
    .map(elementText)
    .filter(Boolean)
    .slice(0, limit) as string[];
}

function textFromSelectorRoots(roots: ParentNode[], selectors: string[], limit = 1) {
  return unique(
    roots.flatMap((root) => textFromSelectors(root, selectors, limit)),
    limit,
  );
}

function textFromLabels(lines: string[], field: FieldSelectorConfig) {
  for (const line of lines) {
    for (const pattern of field.labelPatterns) {
      const match = line.match(pattern);
      if (match?.[2]) return clean(match[2]);
      if (match?.[1]) return clean(match[1]);
    }
  }
  return undefined;
}

function _firstField(root: ParentNode, lines: string[], field: FieldSelectorConfig) {
  const bySelector = textFromSelectors(root, field.selectors, 1)[0];
  if (bySelector && !looksLikeNoise(bySelector)) return bySelector;
  return textFromLabels(lines, field);
}

function firstFieldFromRoots(roots: ParentNode[], lines: string[], field: FieldSelectorConfig) {
  const bySelector = textFromSelectorRoots(roots, field.selectors, 1)[0];
  if (bySelector && !looksLikeNoise(bySelector)) return bySelector;
  return textFromLabels(lines, field);
}

function _listField(root: ParentNode, field: FieldSelectorConfig, limit: number) {
  return textFromSelectors(root, field.selectors, limit).slice(0, limit);
}

function listFieldFromRoots(roots: ParentNode[], field: FieldSelectorConfig, limit: number) {
  return textFromSelectorRoots(roots, field.selectors, limit).slice(0, limit);
}

function stripHeaderDecorations(value: string) {
  return value.replace(/\uD83D\uDD25/g, '').replace(/\u2022/g, '').trim();
}

function _headerName(root: ParentNode, lines: string[]) {
  const heading = textFromSelectors(root, ['h1', 'h2', 'header h1', 'header h2'], 3)
    .map(stripHeaderDecorations)
    .find((value) => /^[A-Za-z][A-Za-z.' -]{2,80}$/.test(value));
  if (heading) return heading;
  return lines.map(stripHeaderDecorations).find((value) => /^[A-Za-z][A-Za-z.' -]{2,80}$/.test(value));
}

function headerNameFromRoots(roots: ParentNode[], lines: string[]) {
  const heading = textFromSelectorRoots(roots, ['h1', 'h2', 'header h1', 'header h2'], 8)
    .map(stripHeaderDecorations)
    .find((value) => /^[A-Za-z][A-Za-z.' -]{2,80}$/.test(value));
  if (heading) return heading;
  return lines.map(stripHeaderDecorations).find((value) => /^[A-Za-z][A-Za-z.' -]{2,80}$/.test(value));
}

function customerNameFromLeadHeader(lines: string[]) {
  const dealIndex = lines.findIndex((line) => /Deal:\s*#?\d+.*Customer:\s*#?\s*\d+/i.test(line));
  const headerLines = dealIndex >= 0 ? lines.slice(Math.max(0, dealIndex - 14), dealIndex) : lines.slice(0, 28);

  for (let index = 0; index < headerLines.length - 1; index += 1) {
    const current = clean(headerLines[index]);
    const next = clean(headerLines[index + 1]);
    const nearbyContext = headerLines.slice(index + 2, index + 7).join(' ');
    if (
      /^[A-Z]{1,4}$/.test(current ?? '') &&
      looksLikePersonName(next) &&
      /\b(Engaged|Sold|Delivered|Deal:|Customer:|@|\(\d{3}\)|Chrysler|Dodge|Jeep|Ram|Fiat|Motors|Dealership)\b/i.test(nearbyContext)
    ) {
      return next;
    }
  }

  const dealerIndex = headerLines.findIndex((line) =>
    /\b(motors|auto|cars|chrysler|dodge|jeep|ram|fiat|dealer|dealership)\b/i.test(line),
  );
  if (dealerIndex > 0) {
    for (let index = dealerIndex - 1; index >= 0; index -= 1) {
      if (looksLikePersonName(headerLines[index])) return clean(headerLines[index]);
    }
  }

  const stageIndex = headerLines.findIndex((line) => stageKeywords.some((stage) => line.toLowerCase() === stage));
  if (stageIndex > 0) {
    for (let index = stageIndex - 1; index >= 0; index -= 1) {
      if (looksLikePersonName(headerLines[index])) return clean(headerLines[index]);
    }
  }

  return headerLines.find(looksLikePersonName);
}

function customerNameFromRoots(roots: ParentNode[], lines: string[], field: FieldSelectorConfig) {
  const byField = firstFieldFromRoots(roots, lines, field);
  if (looksLikePersonName(byField)) return clean(byField);
  const headerName = headerNameFromRoots(roots, lines);
  if (looksLikePersonName(headerName)) return clean(headerName);
  return customerNameFromLeadHeader(lines);
}

function stockFromText(text: string | undefined) {
  const normalized = text
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
  const match =
    normalized?.match(/\bstock\s*(?:#|number|num|no)?\s*[:#]?\s*([A-Z]{1,4}\d{3,20})\b/i) ??
    normalized?.match(/\/\/\s*([A-Z]{1,4}\d{3,20})\b/i) ??
    normalized?.match(/#([A-Z]{1,4}\d{3,20})\b/i) ??
    normalized?.match(/\b([A-Z]{1,4}\d{3,20})\b/i);
  return match?.[1] ? `#${match[1].replace(/^#/, '')}` : undefined;
}

const vehicleMakeRegex =
  /Chrysler|Dodge|Jeep|Ram|Fiat|Toyota|Honda|Ford|Chevrolet|Chevy|GMC|Nissan|Hyundai|Kia|BMW|Mercedes(?:-Benz)?|Audi|Volkswagen|Subaru|Mazda|Lexus|Acura|Cadillac|Lincoln/i;

const vehiclePhraseRegex = new RegExp(
  `\\b((?:19|20)\\d{2})\\s+(${vehicleMakeRegex.source})\\s+([^\\n|,#]{1,100})`,
  'i',
);

function isTradeContext(value: string | undefined) {
  const text = clean(value);
  if (!text) return false;
  return /\b(trade(?:\s|-)?in|trade\b|current vehicle|vehicle you own|car you own|my car|payoff|appraisal|acv|kbb|owned vehicle|garage|lienholder|title in hand)\b/i.test(
    text,
  );
}

function isVehicleInterestContext(value: string | undefined) {
  const text = clean(value);
  if (!text) return false;
  return /\b(vehicle of interest|lead vehicle|interested in|requested vehicle|requested stock|stock#|stock #|stock number|open deal|vehicle interested|vdp|srp|page converted|vehicles viewed|wants the otd|out[-\s]?the[-\s]?door|looking for|i'?m looking for|like the jeep|want this)\b/i.test(
    text,
  );
}

function vehicleCandidateTitle(candidate: VehicleCandidate | undefined) {
  if (!candidate) return undefined;
  const title = [candidate.year, candidate.make, candidate.model, candidate.trim].filter(Boolean).join(' ');
  return clean(title) ?? (candidate.stock ? `Stock ${candidate.stock}` : undefined);
}

function cleanModelTrim(value: string | undefined) {
  return clean(
    value
      ?.replace(/\bstock\s*(?:#|number|num|no)?\s*[:#]?\s*[A-Z]{1,4}\d{3,20}\b/gi, '')
      .replace(/#?[A-Z]{1,4}\d{3,20}\b/g, '')
      .replace(/\bvin\b.*$/i, '')
      .replace(/\b(price|internet price|mileage|miles|odometer)\b.*$/i, '')
      .replace(/\b\d{2,5}\s+lease\b.*$/i, '')
      .replace(/\blease\s+special\b.*$/i, '')
      .replace(
        /\b(?:trade(?:\s|-)?in|add source|source|new deal|vehicles|credit app|open deal|deal:|customer:|ilm|cargurus|car gurus|actions|genius|wish list|best contact method|details)\b.*$/i,
        '',
      )
      .replace(/\s{2,}/g, ' '),
  );
}

function vehicleTitleCase(value: string | undefined) {
  return clean(
    value
      ?.split(/\s+/)
      .map((part) => {
        if (/^\d/.test(part) || /^[A-Z0-9-]{2,}$/.test(part)) return part;
        if (/^4xe$/i.test(part)) return '4xe';
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' '),
  );
}

function vehiclePartsFromText(rawText: string | undefined) {
  const text = clean(rawText);
  if (!text) return {};
  const vehicleSearchText = clean(
    text
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[/_?=&]+/g, ' ')
      .replace(/-/g, ' '),
  );
  const match = text.match(vehiclePhraseRegex) ?? vehicleSearchText?.match(vehiclePhraseRegex);
  const stock = stockFromText(text);
  const vin = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0]?.toUpperCase();
  const price = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?\b/)?.[0]?.replace(/\s+/, '');
  const mileage =
    text.match(/\b(?:mileage|miles|odometer)\s*[:#]?\s*([0-9][0-9,]{2,8})\b/i)?.[1] ??
    text.match(/\b([0-9][0-9,]{2,8})\s*(?:miles|mi)\b/i)?.[1];
  const year = match?.[1] ? Number(match[1]) : undefined;
  const make = match?.[2] ? vehicleTitleCase(match[2].replace(/^Chevy$/i, 'Chevrolet')) : undefined;
  const modelTrim = vehicleTitleCase(cleanModelTrim(match?.[3]));
  const [model, ...trimParts] = modelTrim?.split(/\s+/) ?? [];
  const trim = trimParts.length ? trimParts.join(' ') : undefined;
  return {
    ...(year ? { year } : {}),
    ...(make ? { make } : {}),
    ...(model ? { model } : {}),
    ...(trim ? { trim } : {}),
    ...(stock ? { stock } : {}),
    ...(vin ? { vin } : {}),
    ...(price ? { price } : {}),
    ...(mileage ? { mileage } : {}),
  };
}

function vehicleCandidateFromText(
  rawText: string | undefined,
  role: VehicleCandidate['role'],
  source: string,
  baseConfidence: number,
): VehicleCandidate | undefined {
  const text = clean(rawText);
  if (!text) return undefined;
  const parts = vehiclePartsFromText(text);
  const hasVehiclePhrase = Boolean(parts.year && parts.make);
  const hasStockOrVin = Boolean(parts.stock || parts.vin);
  if (!hasVehiclePhrase && !hasStockOrVin) return undefined;
  const confidence = Math.min(
    100,
    baseConfidence +
      (hasVehiclePhrase ? 8 : 0) +
      (parts.stock ? 8 : 0) +
      (parts.vin ? 8 : 0) +
      (isVehicleInterestContext(text) ? 8 : 0) +
      (isTradeContext(text) ? 6 : 0),
  );
  return {
    role,
    ...parts,
    source,
    rawText: clamp(text, 1000),
    confidence,
  };
}

function dedupeVehicleCandidates(candidates: VehicleCandidate[]) {
  const output: VehicleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.sort((left, right) => right.confidence - left.confidence)) {
    const key = [
      candidate.role,
      candidate.stock?.toLowerCase(),
      candidate.vin?.toLowerCase(),
      candidate.year,
      candidate.make?.toLowerCase(),
      candidate.model?.toLowerCase(),
      candidate.trim?.toLowerCase(),
      candidate.rawText?.slice(0, 80).toLowerCase(),
    ]
      .filter(Boolean)
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output.slice(0, 30);
}

function nodeLooksTradeOnly(node: Element) {
  const nodeText = elementText(node);
  return Boolean(node.closest('[class*="trade" i], [data-testid*="trade" i], drc-add-trade, [class*="garage" i]')) || isTradeContext(nodeText);
}

function collectVehicleCandidates(document: Document, roots: ParentNode[], lines: string[], timeline: LeadTimelineEntry[]) {
  const candidates: VehicleCandidate[] = [];
  const add = (candidate: VehicleCandidate | undefined) => {
    if (candidate) candidates.push(candidate);
  };
  const searchRoots: ParentNode[] = roots.length ? roots : [document];

  const leadSelectors = [
    'drc-card-open-deal',
    'drc-deal-card-open-deal',
    '[class*="open-deal" i]',
    '.vehicle-of-interest',
    '[class*="vehicle-of-interest" i]',
    '[data-testid*="vehicle-of-interest" i]',
    '[data-testid*="lead-vehicle" i]',
    '[data-testid*="inventory" i]',
  ];
  for (const root of searchRoots) {
    for (const node of queryAllAnyIncludingRoot(root, leadSelectors)) {
      const text = elementText(node);
      if (!text || nodeLooksTradeOnly(node)) continue;
      for (const line of textLines(text)) {
        add(vehicleCandidateFromText(line, 'vehicle_of_interest', 'DriveCentric lead/inventory selector', 82));
      }
    }
  }

  const tradeSelectors = ['[class*="trade" i]', '[data-testid*="trade" i]', 'drc-add-trade', '[class*="garage" i]'];
  for (const root of searchRoots) {
    for (const node of queryAllAnyIncludingRoot(root, tradeSelectors)) {
      for (const line of textLines(elementText(node) ?? '')) {
        add(vehicleCandidateFromText(line, 'trade_in', 'DriveCentric trade selector', 86));
      }
    }
  }

  for (const root of roots) {
    for (const line of textLines(extractVisibleText(document, root)).slice(0, 500)) {
      if (isTradeContext(line)) {
        add(vehicleCandidateFromText(line, 'trade_in', 'trade-context line', 74));
      } else if (isVehicleInterestContext(line)) {
        add(vehicleCandidateFromText(line, 'vehicle_of_interest', 'vehicle-interest line', 72));
      } else if (vehiclePhraseRegex.test(line) && !isNoiseLine(line)) {
        add(vehicleCandidateFromText(line, 'vehicle_of_interest', 'page vehicle line', 56));
      } else if (!isNoiseLine(line)) {
        add(vehicleCandidateFromText(line, 'vehicle_of_interest', 'page vehicle line', 56));
      }
    }
  }

  for (const entry of timeline) {
    if (!entry.text) continue;
    const source =
      entry.actor === 'customer'
        ? 'customer timeline message'
        : entry.actor === 'system'
          ? 'system timeline event'
          : 'timeline message';
    if (isTradeContext(entry.text)) {
      add(vehicleCandidateFromText(entry.text, 'trade_in', source, entry.actor === 'customer' ? 78 : 66));
    } else if (isVehicleInterestContext(entry.text) || (entry.actor === 'customer' && /\bstock\s*#?|\/\/[A-Z]{1,4}\d{3,20}\b/i.test(entry.text))) {
      add(vehicleCandidateFromText(entry.text, 'vehicle_of_interest', source, entry.actor === 'customer' ? 84 : 70));
    } else if (entry.actor === 'customer' && vehiclePhraseRegex.test(entry.text)) {
      add(vehicleCandidateFromText(entry.text, 'mentioned', source, 58));
    }
  }

  for (const line of lines) {
    if (isTradeContext(line)) {
      add(vehicleCandidateFromText(line, 'trade_in', 'trade-context page text', 68));
    } else if (isVehicleInterestContext(line)) {
      add(vehicleCandidateFromText(line, 'vehicle_of_interest', 'interest-context page text', 64));
    }
  }

  return dedupeVehicleCandidates(candidates);
}

function pickVehicleOfInterest(candidates: VehicleCandidate[]) {
  const interest = candidates
    .filter((candidate) => candidate.role === 'vehicle_of_interest' && candidate.confidence >= 55)
    .sort((left, right) => right.confidence - left.confidence || Number(Boolean(right.stock)) - Number(Boolean(left.stock)));
  return interest[0];
}

function pickTradeVehicle(candidates: VehicleCandidate[]) {
  return candidates.filter((candidate) => candidate.role === 'trade_in').sort((left, right) => right.confidence - left.confidence)[0];
}

function tradeInfoFromLines(lines: string[], tradeVehicle: VehicleCandidate | undefined) {
  const explicit = lines.find((line) => isTradeContext(line) && !isNoiseLine(line));
  return clamp(tradeVehicle?.rawText ?? explicit, 1200);
}

function normalizePhone(candidate: string | undefined) {
  const raw = clean(candidate);
  if (!raw) return undefined;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return undefined;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(area) || !/^[2-9]\d{2}$/.test(exchange)) return undefined;
  return `(${area}) ${exchange}-${digits.slice(6)}`;
}

export function extractPhones(text: string) {
  const lines = textLines(text).filter((line) => /\b(phone|mobile|cell|text|call)\b/i.test(line));
  const pattern = /(?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]+[2-9]\d{2}[\s.-]+\d{4}\b/g;
  const matches = [...lines.flatMap((line) => line.match(pattern) ?? []), ...(text.match(pattern) ?? [])];
  return unique(matches.map(normalizePhone), 6);
}

export function extractEmails(text: string) {
  return unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [], 8);
}

function extractCallRecordingLinks(document: Document) {
  return unique(
    Array.from(document.querySelectorAll('a[href]')).flatMap((link) => {
      const href = link.getAttribute('href') ?? '';
      const text = clean(link.textContent);
      if (!/\b(recording|call[-\s]?record|transcript|twilio|callrail|voice|voicemail|mp3|wav)\b/i.test(`${href}\n${text ?? ''}`)) {
        return [];
      }
      try {
        return [new URL(href, document.location.href).toString()];
      } catch {
        return [];
      }
    }),
    5,
  );
}

function labeledBlock(lines: string[], labelPattern: RegExp, maxLength: number) {
  const start = lines.findIndex((line) => labelPattern.test(line));
  if (start < 0) return undefined;
  return lines
    .slice(start, start + 10)
    .filter((line) => !isNoiseLine(line) && !crmReasonNoisePattern.test(line))
    .join('\n')
    .slice(0, maxLength);
}

const streetSuffixes =
  'AVE|AVENUE|BLVD|BOULEVARD|CIR|CIRCLE|CT|COURT|DR|DRIVE|HWY|HIGHWAY|LANE|LN|LOOP|PKWY|PARKWAY|PL|PLACE|RD|ROAD|ST|STREET|TER|TERRACE|TRL|TRAIL|WAY';

function customerAddressFromLines(lines: string[]) {
  const candidateLines = lines.filter(
    (line) => !/\b(777\s+N\s+State\s+Road\s+7|Taverna|Sales:\s*\d|Service:\s*\d|Parts:\s*\d|dealership|customer\s*#|deal\s*#|buyer\s*#|dms|atlas)\b/i.test(line),
  );
  const cityStateZipPattern = new RegExp(`\\b([A-Z][A-Z .'-]{1,60})\\s+(${usStateCodes})\\s+(\\d{5})(?:-\\d{4})?\\b`, 'i');
  const fullAddressPattern = new RegExp(
    `\\b(\\d{1,6}\\s+[A-Z0-9][A-Z0-9 .'-]{3,90}\\b(?:${streetSuffixes})\\b\\.?)(?:,?\\s+)([A-Z][A-Z .'-]{1,60})\\s+(${usStateCodes})\\s+(\\d{5})(?:-\\d{4})?\\b`,
    'i',
  );

  for (let index = 0; index < candidateLines.length; index += 1) {
    const line = candidateLines[index] ?? '';
    const next = candidateLines[index + 1] ?? '';
    const next2 = candidateLines[index + 2] ?? '';
    const candidates = [
      line,
      `${line} ${next}`,
      `${line} ${next} ${next2}`,
      /^address$/i.test(line) ? `${next} ${next2}` : '',
      /^address\s+/i.test(line) ? line.replace(/^address\s+/i, '') : '',
    ];

    for (const candidate of candidates) {
      const normalized = clean(candidate);
      if (!normalized) continue;
      const full = normalized.match(fullAddressPattern);
      if (full?.[1] && full[2] && full[3] && full[4]) {
        return {
          location: clean(`${full[1]} ${full[2]} ${full[3].toUpperCase()} ${full[4]}`),
          zip: full[4],
        };
      }
      const cityState = normalized.match(cityStateZipPattern);
      if (cityState?.[1] && cityState[2] && cityState[3] && /^address\b/i.test(line)) {
        return {
          location: clean(`${cityState[1]} ${cityState[2].toUpperCase()} ${cityState[3]}`),
          zip: cityState[3],
        };
      }
    }
  }

  return undefined;
}

function locationFromLines(lines: string[]) {
  const address = customerAddressFromLines(lines);
  if (address?.location) return address.location;

  const candidateLines = lines.filter(
    (line) => !/\b(777\s+N\s+State\s+Road\s+7|Taverna|Sales:\s*\d|Service:\s*\d|Parts:\s*\d|customer\s*#|deal\s*#|buyer\s*#|dms|atlas)\b/i.test(line),
  );
  const addressLabelLine = candidateLines.find((line) =>
    new RegExp(`^Address\\s+[A-Z][A-Z .'-]{1,60}\\s+(?:${usStateCodes})\\s+\\d{5}(?:-\\d{4})?$`, 'i').test(line),
  );
  if (addressLabelLine) return clean(addressLabelLine.replace(/^Address\s+/i, ''));

  const addressLine = candidateLines.find((line) =>
    new RegExp(`\\b[A-Z][A-Z .'-]{1,60}\\s+(?:${usStateCodes})\\s+\\d{5}(?:-\\d{4})?\\b`, 'i').test(line),
  );
  if (addressLine) return addressLine;

  const cityState = candidateLines.find((line) => new RegExp(`\\b[A-Z][A-Z .'-]{1,60},?\\s+(?:${usStateCodes})\\b`, 'i').test(line));
  return cityState;
}

function zipFromCustomerAddressLines(lines: string[]) {
  return customerAddressFromLines(lines)?.zip;
}

function phoneLocationSignals(phoneNumbers: string[]) {
  return phoneNumbers
    .map((phone) => {
      const digits = phone.replace(/\D/g, '');
      const areaCode = digits.slice(0, 3);
      const hint = areaCodeHints[areaCode];
      return hint ? `Phone area code ${areaCode} suggests ${hint}` : undefined;
    })
    .filter(Boolean) as string[];
}

function stageFromLines(lines: string[]) {
  return lines.find((line) => stageKeywords.some((stage) => line.toLowerCase().includes(stage)));
}

function leadSourceFromLines(lines: string[]) {
  return lines.find(
    (line) =>
      /\b(phone|text|email|chat|facebook|autotrader|cars\.com|personal networking|dealerrater|website|web lead)\b/i.test(line) &&
      /[/|-]/.test(line),
  );
}

function salespersonFromLines(lines: string[]) {
  const line = lines.find((value) => /\b(Sales\s*1|Sales\s*2|BDC|Service BDC|Assigned To)\b/i.test(value));
  if (!line) return undefined;
  const match = line.match(/\b(?:Sales\s*1|Sales\s*2|BDC|Service BDC|Assigned To)\s+([A-Z][A-Za-z.' -]{1,80})/i);
  return match?.[1] ? clean(match[1]) : undefined;
}

function internalCrmContextLine(line: string) {
  return (
    /\b(?:note|call note|pinned note|created by:|genius summary|planned|task|appointment|sales\. created by|@[\w .'-]+)\b/i.test(line) ||
    /\b(?:New Deal|Vehicles|Trade In|Credit App|Check In|Documents|Portal|Desk|Mark as Sold|Snooze|Dead)\b/i.test(line)
  );
}

function taskOrMessageLines(roots: ParentNode[], lines: string[]) {
  const selectorTexts = listFieldFromRoots(roots, driveCentricParserConfig.fields.priorMessages, 60).filter(
    (line) => !isNoiseLine(line) && !internalCrmContextLine(line),
  );
  const lineTexts = lines.filter(
    (line) =>
      line.length > 10 &&
      line.length < 500 &&
      !isNoiseLine(line) &&
      !internalCrmContextLine(line) &&
      /\b(?:text from customer|email from customer|text to customer|email to customer)\b/i.test(line),
  );
  return unique([...selectorTexts, ...lineTexts], 24);
}

function taskLikeLine(line: string) {
  return /^(video|phone|call|email|text|note)\s+task\b|^planned$/i.test(line);
}

function actionNoiseLine(line: string) {
  return /^(edit|delete|unpin|save|add)$/i.test(line);
}

function looksLikeSpeakerName(line: string) {
  return /^[A-Za-z][A-Za-z.' -]{1,80}$/.test(line) && !uiNoisePattern.test(line) && !taskLikeLine(line);
}

function timestampMatch(text: string) {
  const patterns = [
    /\b(?:Today|Yesterday|Tomorrow)\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i,
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i,
    /\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2}(?:,\s*\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?\b/i,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?\b/i,
    /\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),?\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+\d{1,2}\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return {
        label: clean(match[0]) ?? match[0],
        index: match.index ?? 0,
      };
    }
  }
  return null;
}

function timestampIso(label: string | undefined, now = new Date()) {
  const value = clean(label);
  if (!value) return undefined;

  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  const timeMatch = value.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (!timeMatch) return undefined;

  const parsed = new Date(now);
  parsed.setSeconds(0, 0);
  let hours = Number(timeMatch[1] ?? '0') % 12;
  if ((timeMatch[3] ?? '').toUpperCase() === 'PM') hours += 12;
  parsed.setHours(hours, Number(timeMatch[2] ?? '0'), 0, 0);

  if (/yesterday/i.test(value)) parsed.setDate(parsed.getDate() - 1);
  if (/tomorrow/i.test(value)) parsed.setDate(parsed.getDate() + 1);

  const weekdayMatch = value.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
  if (weekdayMatch?.[1] && !/\b(today|tomorrow|yesterday)\b/i.test(value)) {
    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const targetDay = weekdays.findIndex((day) => weekdayMatch[1]!.toLowerCase().startsWith(day));
    if (targetDay >= 0) {
      const currentDay = now.getDay();
      const daysAgo = (currentDay - targetDay + 7) % 7;
      parsed.setDate(parsed.getDate() - daysAgo);
    }
  }

  const monthDate = value.match(
    /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i,
  );
  if (monthDate?.[1] && monthDate[2]) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.findIndex((month) => monthDate[1]!.toLowerCase().startsWith(month));
    if (monthIndex >= 0) {
      parsed.setMonth(monthIndex === 8 && /^sept/i.test(monthDate[1]!) ? 8 : Math.min(monthIndex, 11));
      parsed.setDate(Number(monthDate[2]));
      parsed.setFullYear(Number(monthDate[3] ?? parsed.getFullYear()));
    }
  }

  return parsed.toISOString();
}

function namesEqual(left: string | undefined, right: string | undefined) {
  const normalize = (value: string | undefined) =>
    clean(value)
      ?.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function inferActor(source: { speakerName?: string; text?: string }, customerName?: string, salespersonName?: string): LeadTimelineActor {
  const speaker = clean(source.speakerName);
  const text = clean(source.text);
  const combined = `${speaker ?? ''}\n${text ?? ''}`;

  if (outboundMarketingOrDealerText(combined)) return 'automation';
  if (/\b(claire|genius summary|sales assistant|blast|auto(?:mated|mation)?|caddy)\b/i.test(combined)) return 'automation';
  if (speaker && namesEqual(speaker, salespersonName)) return 'salesperson';
  if (speaker && namesEqual(speaker, customerName)) return 'customer';
  if (/\bmanager\b/i.test(speaker ?? '')) return 'manager';
  if (taskLikeLine(speaker ?? '') || /follow[-\s]?up task|planned/i.test(combined)) return 'system';
  if (/\b(i[' ]?m interested|is this available|what are the numbers|pricing|lease terms|my zip|my name is|can you send|do you have)\b/i.test(combined)) {
    return 'customer';
  }
  if (/\b(i can|i[' ]?ll|would .* (work|be easier)|come in|stop by|credit app|verify|take a look|quick call)\b/i.test(combined)) {
    return 'salesperson';
  }
  return 'unknown';
}

function inferChannel(source: { speakerName?: string; text?: string }): LeadTimelineChannel {
  const combined = `${source.speakerName ?? ''}\n${source.text ?? ''}`;
  if (/appointment|appt/i.test(combined)) return 'appt';
  if (/video/i.test(combined)) return 'video';
  if (/email/i.test(combined)) return 'email';
  if (/\btext\b|\bsms\b/i.test(combined)) return 'text';
  if (/\bcall\b|\bphone\b/i.test(combined)) return 'call';
  if (/\bnote\b/i.test(combined)) return 'note';
  return 'unknown';
}

function inferDirection(actor: LeadTimelineActor, channel: LeadTimelineChannel, text: string | undefined): LeadTimelineDirection {
  const combined = clean(text) ?? '';
  if (actor === 'customer') return 'inbound';
  if (actor === 'system') return 'internal';
  if (actor === 'automation') return 'outbound';
  if (channel === 'note') return 'internal';
  if (actor === 'salesperson' || actor === 'manager') {
    if (channel !== 'unknown') return 'outbound';
    if (/\b(hi|hey|would|can|could|i can|i[' ]?ll|let me know|come in|stop by|available|quick call)\b/i.test(combined)) {
      return 'outbound';
    }
    return 'internal';
  }
  return 'unknown';
}

function boundaryLine(lines: string[], index: number) {
  const line = lines[index];
  if (!line) return false;
  if (actionNoiseLine(line)) return true;
  if (taskLikeLine(line)) return true;
  if (timestampMatch(line)) return true;
  if (looksLikeSpeakerName(line) && timestampMatch(lines[index + 1] ?? '')) return true;
  return false;
}

function bodyText(lines: string[], startIndex: number) {
  const body: string[] = [];
  for (let index = startIndex; index < lines.length && body.length < 5; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (body.length > 0 && boundaryLine(lines, index)) break;
    if (isNoiseLine(line) || actionNoiseLine(line) || taskLikeLine(line)) continue;
    body.push(line);
  }
  return clean(body.join(' '));
}

function timelineEntry(entry: {
  speakerName?: string;
  timestampLabel?: string;
  text?: string;
}, customerName?: string, salespersonName?: string): LeadTimelineEntry | null {
  const text = clean(entry.text);
  const speakerName = clean(entry.speakerName);
  if (!text && !speakerName) return null;

  const actor = inferActor(
    {
      ...(speakerName ? { speakerName } : {}),
      ...(text ? { text } : {}),
    },
    customerName,
    salespersonName,
  );
  const channel = inferChannel({
    ...(speakerName ? { speakerName } : {}),
    ...(text ? { text } : {}),
  });
  const direction = inferDirection(actor, channel, text);

  if (!text && actor === 'unknown') return null;

  return {
    actor,
    direction,
    channel,
    ...(speakerName ? { speakerName } : {}),
    ...(entry.timestampLabel ? { timestampLabel: entry.timestampLabel } : {}),
    ...(timestampIso(entry.timestampLabel) ? { timestampIso: timestampIso(entry.timestampLabel) } : {}),
    ...(text ? { text: clamp(text, 3000) } : {}),
  };
}

function buildConversationTimeline(lines: string[], customerName?: string, salespersonName?: string) {
  const entries: LeadTimelineEntry[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length && entries.length < 50; index += 1) {
    const line = lines[index];
    if (!line || isNoiseLine(line) || actionNoiseLine(line) || taskLikeLine(line)) continue;

    const combinedTimestamp = timestampMatch(line);
    if (combinedTimestamp) {
      const before = clean(line.slice(0, combinedTimestamp.index));
      const after = clean(line.slice(combinedTimestamp.index + (combinedTimestamp.label?.length ?? 0)));
      const nextBody = after || bodyText(lines, index + 1);
      const params: { speakerName?: string; timestampLabel?: string; text?: string } = {};
      const textValue = nextBody || before;
      if (before && looksLikeSpeakerName(before)) params.speakerName = before;
      if (combinedTimestamp.label) params.timestampLabel = combinedTimestamp.label;
      if (textValue) params.text = textValue;
      const entry = timelineEntry(
        params,
        customerName,
        salespersonName,
      );
      const key = `${entry?.actor}|${entry?.timestampLabel}|${entry?.text}`;
      if (entry && !seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
      continue;
    }

    if (looksLikeSpeakerName(line)) {
      const nextTimestamp = timestampMatch(lines[index + 1] ?? '');
      if (nextTimestamp) {
        const body = bodyText(lines, index + 2);
        const params: { speakerName?: string; timestampLabel?: string; text?: string } = { speakerName: line };
        if (nextTimestamp.label) params.timestampLabel = nextTimestamp.label;
        if (body) params.text = body;
        const entry = timelineEntry(
          params,
          customerName,
          salespersonName,
        );
        const key = `${entry?.actor}|${entry?.timestampLabel}|${entry?.text}`;
        if (entry && !seen.has(key)) {
          seen.add(key);
          entries.push(entry);
        }
        continue;
      }
    }

    if (timestampMatch(line) && lines[index + 1] && !boundaryLine(lines, index + 1)) {
      const currentTimestamp = timestampMatch(line);
      const body = bodyText(lines, index + 1);
      const params: { speakerName?: string; timestampLabel?: string; text?: string } = {
        timestampLabel: currentTimestamp?.label ?? line,
      };
      if (body) params.text = body;
      const entry = timelineEntry(
        params,
        customerName,
        salespersonName,
      );
      const key = `${entry?.actor}|${entry?.timestampLabel}|${entry?.text}`;
      if (entry && !seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
    }
  }

  return entries;
}

export function isDriveCentricLeadPage(url: string, document: Document, config: ParserConfig = driveCentricParserConfig) {
  const urlMatch = config.leadPageUrlPatterns.some((pattern) => pattern.test(url));
  const selectorMatch = config.leadRootSelectors.some((selector) => document.querySelector(selector));
  const focusedRoot = getDriveCentricFocusedRoot(document, config);
  const focusedText = elementText(focusedRoot) ?? '';
  const focusedMatch = config.focusKeywords.some((keyword) => focusedText.includes(keyword));
  return urlMatch || selectorMatch || focusedMatch;
}

export function extractVisibleText(document: Document, root: ParentNode = document.body) {
  if (!root) return '';
  const baseNode = root instanceof Document ? root.body : root;
  if (!baseNode) return '';

  const walker = document.createTreeWalker(baseNode, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (ignoredNode(parent)) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!visible(parent)) return NodeFilter.FILTER_REJECT;
      return clean(node.textContent ?? undefined) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const chunks: string[] = [];
  let total = 0;
  while (walker.nextNode() && total < 80000) {
    const chunk = clean(walker.currentNode.textContent ?? undefined);
    if (!chunk) continue;
    chunks.push(chunk);
    total += chunk.length + 1;
  }
  return chunks.join('\n').slice(0, 80000);
}

function extractConversationDomText(root: ParentNode) {
  const selectors = [
    '[data-testid*="message" i]',
    '[data-testid*="conversation" i]',
    '[data-testid*="timeline" i]',
    '[class*="message" i]',
    '[class*="conversation" i]',
    '[class*="timeline" i]',
    '[class*="sms" i]',
    '[class*="chat" i]',
    '[class*="activity" i]',
    '[class*="note" i]',
    'article',
    'li',
  ];
  return unique(
    queryAllAny(root, selectors)
      .map((node) => clean(node.textContent))
      .filter((text): text is string => Boolean(text && text.length > 2 && text.length < 5000)),
    120,
  ).join('\n');
}

function replaceBreaksWithNewlines(element: Element) {
  const clone = element.cloneNode(true) as Element;
  const ownerDocument = element.ownerDocument;
  for (const br of Array.from(clone.querySelectorAll('br'))) {
    br.replaceWith(ownerDocument.createTextNode('\n'));
  }
  return clone;
}

function textFromClone(element: Element, removeSelectors: string[] = []) {
  const clone = replaceBreaksWithNewlines(element);
  const selectors = ['script', 'style', 'noscript', ...removeSelectors];
  for (const selector of selectors) {
    for (const node of Array.from(clone.querySelectorAll(selector))) {
      node.remove();
    }
  }
  return cleanMultiline((clone as HTMLElement).innerText || clone.textContent);
}

function stripTimelinePrefix(value: string | undefined) {
  return clean(value?.replace(/^[\s\u2022]+/, ''));
}

function directHeaderTitle(item: Element) {
  const header = item.querySelector('.cmp-tml-hd');
  if (!header) return undefined;
  const directSpan = Array.from(header.children).find(
    (child) => child.tagName.toLowerCase() === 'span' && !child.classList.contains('address'),
  );
  return elementText(directSpan ?? header.querySelector('span') ?? header);
}

function timelineComponentName(item: Element) {
  if (/^drc-/i.test(item.tagName)) return item.tagName.toLowerCase();
  const component = Array.from(item.querySelectorAll('*')).find((node) => /^drc-/i.test(node.tagName));
  return component?.tagName.toLowerCase();
}

function outboundMarketingOrDealerText(text: string | undefined) {
  return /\b(?:text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail|voicemail left|left a voicemail|note|crm note|manager note|task|planned|automation|claire|system|touchpoint|deal imported|duplicate lead|flash sales event|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|are you on the way to the dealership|sales event|we can uber you|no payments for|coupon|respectfully,|taverna chrysler|taverna automotive)\b/i.test(
    text ?? '',
  );
}

function fakeCustomerInboundText(text: string | undefined) {
  return /\b(?:claire parker|claire|automation|blast|auto(?:mated|mation)?|caddy|text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail|voicemail left|left a voicemail|note|crm note|manager note|task|planned|system|touchpoint|deal imported|duplicate lead|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|taverna chrysler|taverna automotive)\b/i.test(
    text ?? '',
  );
}

function hardOutboundLabelOrStoreAutomationText(text: string | undefined) {
  return /\b(?:text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail|voicemail left|left a voicemail|note|crm note|manager note|task|planned|system|touchpoint|deal imported|duplicate lead|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|taverna chrysler|taverna automotive)\b/i.test(
    text ?? '',
  );
}

function safeCustomerInboundBodyText(text: string | undefined) {
  const value = clean(text);
  if (!value) return false;
  return !hardOutboundLabelOrStoreAutomationText(value);
}

function isTrueInboundCustomerEntry(entry: LeadTimelineEntry | undefined) {
  if (!entry) return false;

  // The DriveCentric row label determines direction. A display name such as
  // "Claire Parker" can still appear on a row explicitly labeled
  // "Text From Customer", so only the body is screened for leaked labels or
  // unmistakable automation content here.
  if (hardOutboundLabelOrStoreAutomationText(entry.text) || fakeCustomerInboundText(entry.text)) return false;

  return (
    entry.actor === 'customer' &&
    entry.direction === 'inbound' &&
    entry.channel !== 'note' &&
    Boolean(entry.text?.trim()) &&
    safeCustomerInboundBodyText(entry.text)
  );
}

function driveCentricTimelineHeaderText(item: Element) {
  const header = item.querySelector('.cmp-tml-hd, .header-container, [class*="header" i]');
  return clean([directHeaderTitle(item), header ? elementText(header) : undefined, item.getAttribute('class'), timelineComponentName(item)].filter(Boolean).join(' '));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function explicitDriveCentricLabel(text: string | undefined) {
  const value = clean(text);
  if (!value) return undefined;
  const labels = [
    'Text From Customer',
    'Email From Customer',
    'Chat From Customer',
    'Customer Reply',
    'Web Lead',
    'Inbound Call',
    'Call From Customer',
    'Text To Customer',
    'Email To Customer',
    'Call To Customer',
    'Outbound Call',
    'Phone Task Completed',
    'Voicemail Left',
    'Left a voicemail',
    'Pinned Note',
    'Manager Note',
    'CRM Note',
    'Note',
    'Claire',
    'Automation',
    'Task Completed',
    'System Update',
    'Website Visit',
    'Deal Imported From System',
    'Deal Created',
    'Deal',
    'Video',
  ];
  return labels.find((label) => new RegExp(`\\b${escapeRegex(label)}\\b`, 'i').test(value));
}

function driveCentricEventType(item: Element) {
  const headerText = driveCentricTimelineHeaderText(item);
  const explicit = explicitDriveCentricLabel(headerText);
  if (explicit) return explicit;
  const title = directHeaderTitle(item);
  if (title) return title;
  const component = timelineComponentName(item);
  const itemClass = item.getAttribute('class') ?? '';
  const combined = `${component ?? ''} ${itemClass}`;
  if (/pinned/i.test(combined)) return 'Pinned Note';
  if (/website-visit/i.test(component ?? '') || /websitevisit/i.test(itemClass)) return 'Website Visit';
  if (/deal-import/i.test(component ?? '') || /dealimport/i.test(itemClass)) return 'Deal Imported From System';
  if (/timeline-deal/i.test(component ?? '') || /duplicatedeal|dealcreated/i.test(itemClass)) return 'Deal';
  if (/timeline-email/i.test(component ?? '') || /\bemail\b/i.test(itemClass)) {
    return /fromcustomer|from-customer|customer|inbound|incoming|received/i.test(combined) ? 'Email From Customer' : 'Email To Customer';
  }
  if (/timeline-text/i.test(component ?? '') || /\btext\b/i.test(itemClass)) {
    return /fromcustomer|from-customer|customer|inbound|incoming|received/i.test(combined) ? 'Text From Customer' : 'Text To Customer';
  }
  if (/timeline-note/i.test(component ?? '') || /\bnote\b/i.test(itemClass)) return 'Note';
  if (/timeline-phone/i.test(component ?? '') || /\bphone|call/i.test(itemClass)) return 'Phone';
  return undefined;
}

function driveCentricTimelineBody(item: Element, eventType: string | undefined) {
  const type = eventType?.toLowerCase() ?? '';
  if (/website visit/.test(type)) {
    return clean(
      [
        textFromClone(item.querySelector('.visited-hostname') ?? item),
        textFromClone(item.querySelector('.browsing-time') ?? item),
        item.querySelector('.pages-viewed-count') ? `Pages viewed: ${elementText(item.querySelector('.pages-viewed-count')!)}` : undefined,
        item.querySelector('.inventory-searched-count') ? `Inventory searches: ${elementText(item.querySelector('.inventory-searched-count')!)}` : undefined,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }

  const bodySelectors = [
    '.deal-import-message',
    '.note-message',
    '.cmp-tml-bd.is-content',
    '.cmp-tml-bd:not(.is-media)',
  ];
  const removeSelectors = [
    '.cmp-tml-act',
    '.cmp-tml-ft',
    '.cmp-tml-sts',
    '.cmp-tml-deletable-files',
    '.is-media',
    'audio',
    'video',
    'img',
    'source',
    'svg',
    'button',
  ];

  for (const selector of bodySelectors) {
    const matches = Array.from(item.querySelectorAll(selector));
    for (const match of matches) {
      const text = textFromClone(match, removeSelectors);
      if (text && !actionNoiseLine(text) && !/^Created by:/i.test(text)) return clean(text);
    }
  }

  const fallback = textFromClone(item, [
    '.cmp-tml-hd',
    '.header-container',
    '.cmp-tml-act',
    '.cmp-tml-ft',
    '.cmp-tml-sts',
    '.cmp-tml-deletable-files',
    '.is-media',
    'audio',
    'video',
    'img',
    'source',
    'svg',
    'button',
  ]);
  return clean(fallback);
}


function strictDriveCentricLabelKind(eventType: string | undefined, headerText?: string | undefined) {
  const combined = `${eventType ?? ''} ${headerText ?? ''}`.toLowerCase();

  if (/\b(text from customer|email from customer|chat from customer|customer reply|web lead|inbound call|call from customer)\b/i.test(combined)) {
    return 'customer_inbound' as const;
  }

  if (/\b(text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail left|left a voicemail)\b/i.test(combined)) {
    return 'dealer_outbound' as const;
  }

  if (/\b(note|pinned note|manager note|crm note|task completed|system update|website visit|deal imported|deal created|planned|task|duplicate lead|email blast|blast|marketing)\b/i.test(combined)) {
    return 'internal' as const;
  }

  return 'unknown' as const;
}

function driveCentricSpeakerNameFromHeader(item: Element, eventType: string | undefined) {
  const headerText = driveCentricTimelineHeaderText(item);
  const cleanHeader = clean(headerText);
  if (!cleanHeader) return undefined;

  const type = eventType ? escapeRegex(eventType) : '(?:Text From Customer|Email From Customer|Chat From Customer|Customer Reply|Web Lead|Inbound Call|Call From Customer|Text To Customer|Email To Customer|Call To Customer|Outbound Call|Phone Task Completed|Voicemail Left|Left a voicemail|Note|Pinned Note|Manager Note|CRM Note|Task Completed|System Update|Website Visit|Deal Imported From System|Deal Created|Deal|Video)';
  const match = cleanHeader.match(new RegExp(`${type}\\s*[•\\-–—:]\\s*([^•\\-–—]+?)(?:\\s*[•\\-–—]\\s*|\\s+(?:Today|Yesterday|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b|$)`, 'i'));

  const candidate = clean(match?.[1]);
  if (!candidate) return undefined;
  if (/^\(?\d{3}\)?[-\s.]?\d{3}[-\s.]?\d{4}$/.test(candidate)) return undefined;
  if (/^(today|yesterday|tomorrow|created by|impersonated by)$/i.test(candidate)) return undefined;
  return candidate.slice(0, 120);
}


function driveCentricActor(
  item: Element,
  eventType: string | undefined,
  speakerName: string | undefined,
  customerName?: string,
  salespersonName?: string,
): LeadTimelineActor {
  const headerText = driveCentricTimelineHeaderText(item);
  const strictKind = strictDriveCentricLabelKind(eventType, headerText);

  // ABSOLUTE DriveCentric label authority.
  // The name after the dot (Claire Parker, Ani Sharma, etc.) is NOT trusted for direction.
  // "Text From Customer" is always inbound customer.
  // "Text To Customer" is always outbound dealership.
  if (strictKind === 'customer_inbound') return 'customer';
  if (strictKind === 'dealer_outbound') {
    const combined = `${eventType ?? ''} ${headerText ?? ''} ${speakerName ?? ''}`.toLowerCase();
    return /\b(claire|automation|blast|auto(?:mated|mation)?|caddy)\b/i.test(combined) ? 'automation' : 'salesperson';
  }
  if (strictKind === 'internal') return 'system';

  const type = eventType?.toLowerCase() ?? '';
  const classText = item.getAttribute('class')?.toLowerCase() ?? '';
  const component = timelineComponentName(item) ?? '';
  const timelineBodyText = driveCentricTimelineBody(item, eventType)?.toLowerCase() ?? '';
  const combined = `${type} ${headerText ?? ''} ${classText} ${component} ${speakerName ?? ''} ${timelineBodyText}`.toLowerCase();

  if (/\b(claire parker|claire|blast|auto(?:mated|mation)?|automation|caddy)\b/i.test(combined)) return 'automation';
  if (speakerName && namesEqual(speakerName, salespersonName)) return 'salesperson';
  if (speakerName && namesEqual(speakerName, customerName)) return 'customer';
  if (/\bmanager\b/i.test(speakerName ?? '')) return 'manager';

  if (taskLikeLine(speakerName ?? '') || /\b(note|task|planned|system|deal imported|duplicate lead)\b/i.test(combined)) return 'system';

  return 'unknown';
}

function driveCentricChannel(item: Element, eventType: string | undefined): LeadTimelineChannel {
  const type = eventType?.toLowerCase() ?? '';
  const classText = item.getAttribute('class')?.toLowerCase() ?? '';
  if (/appointment|appt/.test(type)) return 'appt';
  if (/video/.test(type) || /\bvideo\b/.test(classText)) return 'video';
  if (/email/.test(type) || /\bemail\b/.test(classText)) return 'email';
  if (/text/.test(type) || /\btext\b/.test(classText)) return 'text';
  if (/phone|call/.test(type) || /\bphone|call/.test(classText)) return 'call';
  if (/note/.test(type) || /\bnote\b/.test(classText)) return 'note';
  return 'unknown';
}

function driveCentricDirection(
  eventType: string | undefined,
  actor: LeadTimelineActor,
  channel: LeadTimelineChannel,
  headerText?: string,
): LeadTimelineDirection {
  const strictKind = strictDriveCentricLabelKind(eventType, headerText);

  // ABSOLUTE DriveCentric label authority.
  if (strictKind === 'customer_inbound') return 'inbound';
  if (strictKind === 'dealer_outbound') return 'outbound';
  if (strictKind === 'internal') return 'internal';

  if (actor === 'customer') return 'inbound';
  if (actor === 'salesperson' || actor === 'manager' || actor === 'automation') return 'outbound';
  if (actor === 'system' || channel === 'note') return 'internal';

  return 'unknown';
}

function formatTimelineMessage(entry: LeadTimelineEntry) {
  const actorLabel = entry.actor === 'customer' ? 'Customer' : entry.actor === 'automation' ? 'Claire/automation' : entry.actor;
  return clamp([entry.timestampLabel, actorLabel, entry.direction, entry.channel, entry.speakerName, entry.text].filter(Boolean).join(' | '), 3000);
}

function customerFacingTimelineEntry(entry: LeadTimelineEntry) {
  if (entry.direction === 'internal' || entry.channel === 'note' || entry.actor === 'system') return false;

  const combined = [entry.speakerName, entry.timestampLabel, entry.channel, entry.text].filter(Boolean).join(' ');

  if (entry.actor === 'customer') {
    return isTrueInboundCustomerEntry(entry);
  }

  if (entry.actor === 'automation') {
    // Automation can be useful history, but never customer intent.
    return entry.direction === 'outbound' && Boolean(entry.text?.trim()) && !fakeCustomerInboundText(combined);
  }

  return (
    (entry.direction === 'inbound' || entry.direction === 'outbound') &&
    (entry.actor === 'salesperson' || entry.actor === 'manager')
  );
}

function latestCustomerCorrectionSignal(text: string | undefined) {
  const value = clean(text);
  if (!value) return false;
  return (
    /\b(?:wrong|all other|one i want|non[-\s]?existent|black one|green one|not the|sent over)\b/i.test(value) ||
    (/\b(?:photos?|pictures?|gladiators?)\b/i.test(value) && /\b(?:other|wrong|one i want|sent|non[-\s]?existent)\b/i.test(value))
  );
}

function driveCentricTimelineEntry(item: Element, customerName?: string, salespersonName?: string): LeadTimelineEntry | null {
  const eventType = driveCentricEventType(item);
  const headerText = driveCentricTimelineHeaderText(item);
  const strictKind = strictDriveCentricLabelKind(eventType, headerText);
  const speakerNode = item.querySelector('.item-user-fullname, .user-full-name, [class*="sender" i], [class*="from" i]');
  const timestampNode = item.querySelector('.item-details, .time, time, [class*="timestamp" i], [class*="date" i]');
  const speakerName = driveCentricSpeakerNameFromHeader(item, eventType) ?? stripTimelinePrefix(speakerNode ? elementText(speakerNode) : undefined);
  const timestampLabel = stripTimelinePrefix(timestampNode ? elementText(timestampNode) : undefined);
  const body = driveCentricTimelineBody(item, eventType);
  const hasRecording = Boolean(item.querySelector('audio source[src], audio[src]'));
  const text = clean(
    [
      eventType && !/^(text from customer|text to customer|email from customer|email to customer)$/i.test(eventType) ? `${eventType}:` : undefined,
      body,
      hasRecording && !/transcript/i.test(body ?? '') ? 'Call recording is visible, but no call transcript text is visible in the CRM.' : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!text && !speakerName && !timestampLabel) return null;

  // SPEAKER FIREWALL:
  // DriveCentric's row label is absolute truth. The name after the dot is NOT direction.
  // Example: "Text From Customer • Claire Parker" is still the customer's inbound text.
  // Example: "Text To Customer • Maria" is dealership outbound history only.
  let actor: LeadTimelineActor;
  if (strictKind === 'customer_inbound') {
    actor = 'customer';
  } else if (strictKind === 'dealer_outbound') {
    const combined = `${eventType ?? ''} ${headerText ?? ''} ${speakerName ?? ''}`.toLowerCase();
    actor = /\b(claire|automation|blast|auto(?:mated|mation)?|caddy)\b/i.test(combined) ? 'automation' : 'salesperson';
  } else if (strictKind === 'internal') {
    actor = 'system';
  } else {
    actor = outboundMarketingOrDealerText(text) ? 'automation' : driveCentricActor(item, eventType, speakerName, customerName, salespersonName);
  }

  const channel = driveCentricChannel(item, eventType);
  const direction = driveCentricDirection(eventType, actor, channel, headerText);
  const iso = timestampIso(timestampLabel);

  return {
    actor,
    direction,
    channel,
    ...(speakerName ? { speakerName } : {}),
    ...(timestampLabel ? { timestampLabel } : {}),
    ...(iso ? { timestampIso: iso } : {}),
    ...(text ? { text: clamp(text, 3000) } : {}),
  };
}

function driveCentricTimelineItems(root: ParentNode) {
  const seen = new Set<Element>();
  const add = (selectors: string[]) => {
    const items: Element[] = [];
    for (const selector of selectors) {
      for (const item of queryAllAnyIncludingRoot(root, [selector])) {
        if (seen.has(item)) continue;
        seen.add(item);
        items.push(item);
      }
    }
    return items;
  };

  const past = add([
    'drc-past-timeline li[drctimelineitem]',
    'drc-timeline .timeline-grouping:not(.planned) li[drctimelineitem]',
    'drc-timeline li[drctimelineitem]:not(.systemplanned):not(.tasktodo)',
    'drc-deal-card-activity li[drctimelineitem]:not(.systemplanned):not(.tasktodo)',
    'drc-deal-card-activity .timeline-item:not(.systemplanned):not(.tasktodo)',
    'li[drctimelineitem]:not(.systemplanned):not(.tasktodo)',
    '[drctimelineitem]:not(.systemplanned):not(.tasktodo)',
    '.timeline-item:not(.systemplanned):not(.tasktodo)',
  ]);
  const pinned = add(['drc-pinned-notes drc-timeline-pinned-note', 'drc-timeline-pinned-note']);
  const planned = add(['drc-planned-timeline li[drctimelineitem]', '.timeline-grouping.planned li[drctimelineitem]']);
  return [...past, ...pinned, ...planned].slice(0, 140);
}

function buildDriveCentricDomTimeline(root: ParentNode, customerName?: string, salespersonName?: string) {
  const entries: LeadTimelineEntry[] = [];
  const seen = new Set<string>();
  for (const item of driveCentricTimelineItems(root)) {
    const entry = driveCentricTimelineEntry(item, customerName, salespersonName);
    if (!entry) continue;
    const key = [entry.actor, entry.direction, entry.channel, entry.speakerName, entry.timestampLabel, entry.text].filter(Boolean).join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= 80) break;
  }
  return entries;
}

function personInitials(name: string | undefined) {
  const parts = clean(name)
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (!parts?.length) return undefined;
  return parts.map((part) => part[0]).join('').toUpperCase();
}

function looksLikeConversationBubbleText(text: string | undefined) {
  const value = clean(text);
  if (!value) return false;
  if (value.length < 2 || value.length > 1200) return false;
  if (isNoiseLine(value) || actionNoiseLine(value) || taskLikeLine(value)) return false;
  if (/^(Text|Email|Note|Call|Video)\s*[\u2022-]\s*(?:\d+[hm]|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(value)) return false;
  if (/^(New Deal|Vehicles|Trade In|Credit App|Check In|Documents|Portal|Desk|Push|Mark as Sold|Snooze|Dead)$/i.test(value)) return false;
  return (
    /[.!?]$/.test(value) ||
    /\b(i|i'm|ive|i've|my|me|you|your|offer|status|purchase|ready|thanks|tomorrow|today|payment|price|otd|out[-\s]?the[-\s]?door)\b/i.test(value)
  );
}

function elementHasSameTextChild(element: Element, text: string) {
  return Array.from(element.children).some((child) => {
    const childText = elementText(child);
    return Boolean(childText && childText !== text && childText.length > Math.max(12, text.length * 0.75));
  });
}

function nearbyConversationMeta(element: Element) {
  const pieces: string[] = [];

  const labeledTimelineItem = element.closest(
    '[drctimelineitem], .timeline-item, drc-timeline-text, drc-timeline-email, drc-timeline-phone, drc-timeline-note, drc-deal-card-activity',
  );
  if (labeledTimelineItem) pieces.push(elementText(labeledTimelineItem) ?? '');

  let node: Element | null = element;
  for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
    pieces.push(elementText(node) ?? '');
    pieces.push(node.getAttribute('class') ?? '');
    pieces.push(node.tagName ?? '');
    const previous = node.previousElementSibling;
    const next = node.nextElementSibling;
    if (previous) pieces.push(elementText(previous) ?? '');
    if (next) pieces.push(elementText(next) ?? '');
  }
  return clean(pieces.join(' '));
}

function conversationBubbleActor(element: Element, root: ParentNode, text: string, customerName?: string, salespersonName?: string): LeadTimelineActor {
  const classes = [
    element.getAttribute('class'),
    element.parentElement?.getAttribute('class'),
    element.parentElement?.parentElement?.getAttribute('class'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const nearby = nearbyConversationMeta(element);
  const labelSource = `${nearby ?? ''} ${classes}`;
  const customerInitials = personInitials(customerName);
  const salespersonInitials = personInitials(salespersonName);

  // Explicit bubble classes are local to this message. Check them before the
  // wider nearby text, which may include an adjacent message in the opposite
  // direction.
  if (/\b(customer|incoming|inbound|received|from-customer|left)\b/i.test(classes)) return 'customer';
  if (/\b(user|outgoing|outbound|sent|to-customer|right|sales|staff)\b/i.test(classes)) return 'salesperson';

  // Visible DriveCentric labels beat bubble position, initials, and wording heuristics.
  // "Text To Customer" must NEVER become customer intent just because the bubble body sounds like a question.
  if (/\b(text|email|call) to customer\b|\boutbound call\b|\bphone task completed\b|\bvoicemail left\b|\bleft a voicemail\b|\bnote\b|\bclaire\b|\bautomation\b|\btask completed\b/i.test(labelSource)) {
    return /\bclaire\b|\bautomation\b/i.test(labelSource) ? 'automation' : 'salesperson';
  }
  if (/\b(text|email|chat) from customer\b|\bcustomer reply\b|\bweb lead\b|\binbound call\b|\bcall from customer\b/i.test(labelSource)) return 'customer';

  if (salespersonInitials && new RegExp(`\\b${salespersonInitials}\\b`).test(nearby ?? '')) return 'salesperson';
  if (customerInitials && new RegExp(`\\b${customerInitials}\\b`).test(nearby ?? '')) return 'customer';
  if (customerName && new RegExp(`\\b${customerName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(nearby ?? '')) return 'customer';
  if (/\bmy\s+(?:offer|purchase|trade|car|vehicle)|\bi(?:'m| am| have| haven't| want| need)\b/i.test(text)) return 'customer';

  const rect = (element as HTMLElement).getBoundingClientRect();
  const rootRect = root instanceof Element ? (root as HTMLElement).getBoundingClientRect() : undefined;
  if (rootRect && rect.width > 0 && rootRect.width > 0) {
    const leftRatio = (rect.left - rootRect.left) / rootRect.width;
    const rightRatio = (rect.right - rootRect.left) / rootRect.width;
    if (rightRatio > 0.72) return 'salesperson';
    if (leftRatio < 0.42) return 'customer';
  }

  return inferActor({ text }, customerName, salespersonName);
}

function conversationBubbleChannel(meta: string | undefined): LeadTimelineChannel {
  if (/\bemail\b/i.test(meta ?? '')) return 'email';
  if (/\bcall|phone\b/i.test(meta ?? '')) return 'call';
  if (/\bvideo\b/i.test(meta ?? '')) return 'video';
  if (/\bnote\b/i.test(meta ?? '')) return 'note';
  if (/\btext|sms\b/i.test(meta ?? '')) return 'text';
  return 'text';
}

function conversationBubbleTimestamp(meta: string | undefined) {
  return (
    meta?.match(/\b(?:Text|Email|Note|Call|Video)\s*[\u2022-]\s*([^|]{1,40}?)(?=\s{2,}|$)/i)?.[1] ??
    meta?.match(/\b(\d+\s*[hm]|today at [0-9:]+\s*[AP]M|yesterday at [0-9:]+\s*[AP]M|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) at [0-9:]+\s*[AP]M)\b/i)?.[1]
  );
}

function relativeTimestampMinutes(label: string | undefined) {
  const value = clean(label);
  if (!value) return undefined;
  const relative = value.match(/\b(\d+)\s*([mh])\b/i);
  if (relative?.[1] && relative[2]) {
    const amount = Number(relative[1]);
    return relative[2].toLowerCase() === 'h' ? amount * 60 : amount;
  }
  if (/now|just now/i.test(value)) return 0;
  return undefined;
}

function buildDriveCentricConversationBubbleTimeline(root: ParentNode, customerName?: string, salespersonName?: string) {
  const selectors = [
    '[class*="conversation" i] [class*="message" i]',
    '[class*="conversation" i] [class*="bubble" i]',
    '[class*="conversation" i] [class*="text" i]',
    '[class*="chat" i] [class*="message" i]',
    '[class*="chat" i] [class*="bubble" i]',
    '.conversation-message',
  ];
  const entries: LeadTimelineEntry[] = [];
  const seen = new Set<string>();

  for (const element of queryAllAny(root, selectors)) {
    // Never let the generic bubble parser read DriveCentric Activity timeline rows.
    // Those rows have absolute labels like Text From Customer / Text To Customer and must be parsed only by buildDriveCentricDomTimeline.
    if (
      element.closest(
        'drc-timeline, drc-pinned-notes, drc-planned-timeline, drc-past-timeline, drc-deal-card-activity, [drctimelineitem], .timeline-item, .cmp-tml-bd, .cmp-tml-hd',
      )
    ) {
      continue;
    }

    const text = clean(elementText(element));
    if (!text || !looksLikeConversationBubbleText(text)) continue;
    if (elementHasSameTextChild(element, text)) continue;

    const messageContainer = element.parentElement?.closest(
      '.conversation-message, [class*="conversation" i] [class*="bubble" i], [class*="conversation" i] [class*="message" i]',
    );
    const localMetaNode = messageContainer?.querySelector('.message-meta, [class*="meta" i], time');
    const localMeta = localMetaNode ? elementText(localMetaNode) : undefined;
    const meta = clean(localMeta ?? nearbyConversationMeta(element));
    const actor = conversationBubbleActor(element, root, text, customerName, salespersonName);
    const channel = conversationBubbleChannel(meta);
    const direction = inferDirection(actor, channel, text);
    if (direction === 'internal') continue;
    const timestampLabel = clean(conversationBubbleTimestamp(meta));
    const key = [actor, direction, channel, timestampLabel, text].filter(Boolean).join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      actor,
      direction,
      channel,
      ...(timestampLabel ? { timestampLabel } : {}),
      ...(timestampIso(timestampLabel) ? { timestampIso: timestampIso(timestampLabel) } : {}),
      text: clamp(text, 3000),
    });
    if (entries.length >= 80) break;
  }

  return entries
    .map((entry, index) => ({ entry, index, ageMinutes: relativeTimestampMinutes(entry.timestampLabel) }))
    .sort((left, right) => {
      if (left.ageMinutes !== undefined && right.ageMinutes !== undefined) return left.ageMinutes - right.ageMinutes;
      if (left.ageMinutes !== undefined) return -1;
      if (right.ageMinutes !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function mergeTimelineEntries(primary: LeadTimelineEntry[], secondary: LeadTimelineEntry[]) {
  const output: LeadTimelineEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...primary, ...secondary]) {
    const key = [entry.actor, entry.direction, entry.channel, entry.speakerName, entry.timestampLabel, entry.text].filter(Boolean).join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
    if (output.length >= 60) break;
  }
  return output;
}

function newestTimelineEntry(
  entries: LeadTimelineEntry[],
  predicate: (entry: LeadTimelineEntry) => boolean,
) {
  const matches = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => predicate(entry));
  return matches.sort((left, right) => {
    const leftTime = left.entry.timestampIso ? Date.parse(left.entry.timestampIso) : Number.NaN;
    const rightTime = right.entry.timestampIso ? Date.parse(right.entry.timestampIso) : Number.NaN;
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
    if (!Number.isNaN(leftTime)) return -1;
    if (!Number.isNaN(rightTime)) return 1;
    return left.index - right.index;
  })[0]?.entry;
}

function buildDecisionContextTimeline({
  callNotes,
  activitySummary,
  imageContext,
}: {
  callNotes?: string | undefined;
  activitySummary?: string | undefined;
  imageContext: string[];
}) {
  const entries: LeadTimelineEntry[] = [];
  if (callNotes) {
    entries.push({
      actor: 'system',
      direction: 'internal',
      channel: 'call',
      speakerName: 'DriveCentric Call Summary',
      text: clamp(`Call summary / phone context: ${callNotes}`, 3000),
    });
  }
  if (activitySummary) {
    entries.push({
      actor: 'system',
      direction: 'internal',
      channel: 'note',
      speakerName: 'DriveCentric Activity Notes',
      text: clamp(`Activity notes / internal CRM context: ${activitySummary}`, 3000),
    });
  }
  for (const image of imageContext.slice(0, 6)) {
    entries.push({
      actor: 'system',
      direction: 'internal',
      channel: 'video',
      speakerName: 'Visible Media',
      text: clamp(image, 3000),
    });
  }
  return entries;
}

function sentenceHasNegativeIntent(sentence: string, wordPattern: RegExp) {
  return wordPattern.test(sentence) && /\b(no|not|avoid|exclude|skip|don't|dont|do not|isn't|is not|without|non[-\s]?hybrid)\b/i.test(sentence);
}

function customerAuthoredTextFromRawText(rawText: string) {
  const lines = textLines(rawText);
  const chunks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !/\b(?:Text From Customer|Email From Customer|Chat From Customer|Customer Reply|Web Lead)\b/i.test(line)) continue;

    const body = [line, lines[index + 1], lines[index + 2]]
      .filter(Boolean)
      .join(' ')
      .replace(/^.*?\b(?:Text From Customer|Email From Customer|Chat From Customer|Customer Reply|Web Lead)\b/i, '');

    const cleaned = clean(body);
    if (cleaned && !internalCrmContextLine(cleaned) && safeCustomerInboundBodyText(cleaned)) chunks.push(cleaned);
  }
  return unique(chunks, 12).join('\n');
}

function customerTruthSummary(entries: LeadTimelineEntry[], fallbackText: string, stockNumber?: string, zipCode?: string) {
  const customerText = entries
    .filter((entry) => isTrueInboundCustomerEntry(entry))
    .map((entry) => entry.text!)
    .slice(0, 12)
    .join('\n');
  const fallbackCustomerText = customerText ? '' : customerAuthoredTextFromRawText(fallbackText);
  const allText = [customerText, fallbackCustomerText].filter(Boolean).join('\n');
  const latestCustomer = clean((customerText || fallbackCustomerText).split('\n').find(Boolean));
  const requirements: string[] = [];
  const exclusions: string[] = [];
  const logistics: string[] = [];

  if (/\bjeep\b/i.test(allText)) requirements.push('Jeep');
  if (/\bwrangler\b/i.test(allText)) requirements.push('Wrangler');
  if (/\bhard\s*[- ]?top|hardtop|3[-\s]?piece hard top/i.test(allText)) requirements.push('hard-top');
  if (/\bleather\b/i.test(allText)) requirements.push('leather seats/interior');
  const mileage = allText.match(/\b(?:under|less than|below|max(?:imum)?|up to)\s*([0-9][0-9,. ]{1,8})\s*(?:miles?|mi)\b/i)?.[1];
  if (mileage) requirements.push(`under ${mileage.replace(/\s+/g, '')} miles`);

  for (const color of ['red', 'white', 'neon']) {
    const sentences = allText.split(/[.\n!?]+/);
    if (sentences.some((sentence) => sentenceHasNegativeIntent(sentence, new RegExp(`\\b${color}\\b`, 'i')))) {
      exclusions.push(color);
    }
  }
  if (/\b(?:no|not|avoid|exclude|don't\s+want|dont\s+want|do not want|don't|dont|do not|non[-\s]?hybrid)\s+(?:a\s+)?(?:hybrid|hybird|4xe|plug[-\s]?in)\b/i.test(allText)) {
    exclusions.push('hybrid/4xe');
  }

  const cashBudget = allText.match(/\$?\s*31,?200\b/i)?.[0] ?? allText.match(/\$\s*[0-9][0-9,]{3,8}\b/i)?.[0];
  if (/\bcash|pay in full|paid in full\b/i.test(allText) && cashBudget) logistics.push(`${cashBudget.replace(/\s+/g, '')} cash budget`);
  else if (/\bcash|pay in full|paid in full\b/i.test(allText)) logistics.push('cash buyer / paying in full');
  if (/\botd|out[-\s]?the[-\s]?door|out the door/i.test(allText)) logistics.push('wants out-the-door numbers');
  if (/\bGeorgia|GA\b/i.test(allText) || zipCode) logistics.push(`registering in Georgia${zipCode ? ` / ZIP ${zipCode}` : ''}`);
  if (/\bplate|license plate\b/i.test(allText)) logistics.push('has plate in hand / plate transfer matters');
  if (stockNumber) logistics.push(`stock ${stockNumber}`);

  const guardrails: string[] = [];
  if (exclusions.includes('hybrid/4xe')) guardrails.push('Do not recommend or name a 4xe/hybrid as the fit.');
  if (/\bcash|pay in full|paid in full\b/i.test(allText)) guardrails.push('Do not push credit app or financing unless the customer asks.');
  if (exclusions.length) guardrails.push(`Treat exclusions as exclusions: ${exclusions.join(', ')}.`);

  const parts = [
    latestCustomer ? `Latest customer-authored text: "${latestCustomer.slice(0, 500)}"` : undefined,
    requirements.length ? `Requested fit: ${Array.from(new Set(requirements)).join(', ')}.` : undefined,
    exclusions.length ? `Exclusions: ${Array.from(new Set(exclusions)).join(', ')}.` : undefined,
    logistics.length ? `Money/logistics: ${Array.from(new Set(logistics)).join(', ')}.` : undefined,
    guardrails.length ? `Guardrails: ${guardrails.join(' ')}` : undefined,
  ].filter(Boolean);

  return parts.length ? `Customer truth read: ${parts.join(' ')}` : undefined;
}

export function detectSentiment(text: string): LeadContext['sentiment'] {
  if (/angry|frustrated|too high|bad experience|not happy|stop texting|remove me/i.test(text)) return 'negative';
  if (/thanks|thank you|sounds good|perfect|great|see you|interested|ready/i.test(text)) return 'positive';
  return 'neutral';
}

export function scoreLead(text: string): LeadContext['leadScore'] {
  if (/today|now|appointment|test drive|call me|trade|credit app|ready|buy|deposit/i.test(text)) return 'hot';
  if (/price|available|photos|payment|interested|more info|still have|lease|finance/i.test(text)) return 'warm';
  return 'cold';
}

export function detectCrmAutomationHints(text: string) {
  const hints: string[] = [];
  if (/\bclaire\b/i.test(text)) {
    hints.push('Claire appears in the CRM context. Claire is DriveCentric AI bot automation, not the shopper.');
  }
  if (/genius summary/i.test(text)) {
    hints.push('Genius Summary is CRM-generated context and should be treated as supporting detail, not direct customer wording.');
  }
  return hints;
}

function personalizationSignals(context: Partial<LeadContext>, visibleText: string) {
  const signals: string[] = [];
  if (context.customerLocation) signals.push(`Customer location clue: ${context.customerLocation}`);
  signals.push(...phoneLocationSignals(context.phoneNumbers ?? []));
  if (context.vehicleOfInterest) signals.push(`Vehicle of interest: ${context.vehicleOfInterest}`);
  if (context.stockNumber) signals.push(`Stock number on page: ${context.stockNumber}`);
  if (context.tradeInfo) signals.push(`Trade clue: ${context.tradeInfo}`);
  if (context.paymentBudgetHints) signals.push(`Payment or budget clue: ${context.paymentBudgetHints}`);
  if (context.leadSource) signals.push(`Lead source: ${context.leadSource}`);
  if (/distance|shipping|drive from|out[-\s]?of[-\s]?state/i.test(visibleText)) {
    signals.push('Distance or out-of-market logistics may matter; reduce friction and offer a simple path.');
  }
  if (/cash|finance|monthly|payment|down|credit|pre[-\s]?approval|lease/i.test(visibleText)) {
    signals.push('Money conversation is present; give clear next step without implying approval.');
  }
  if (/trade|payoff|vin|miles|mileage/i.test(visibleText)) {
    signals.push('Trade conversation is present; ask for VIN, miles, payoff, and condition if missing.');
  }
  return unique(signals.map((signal) => clamp(signal, 320)), 30);
}

function conversationIdFromUrl(url: string, fallbackText: string) {
  const customerMatch = url.match(/(?:customers?|leads?|opportunities?|deals?)\/([^/?#]+)/i);
  if (customerMatch?.[1]) return customerMatch[1];
  const dealMatch = fallbackText.match(/Deal:\s*#(\d+)/i);
  if (dealMatch?.[1]) return `deal-${dealMatch[1]}`;
  const customerIdMatch = fallbackText.match(/Customer:\s*#(\d+)/i) ?? fallbackText.match(/Customer\s*#\s*(\d+)/i);
  if (customerIdMatch?.[1]) return `customer-${customerIdMatch[1]}`;
  const hashSource = `${url}|${fallbackText.slice(0, 400)}`;
  let hash = 0;
  for (let index = 0; index < hashSource.length; index += 1) {
    hash = (hash * 31 + hashSource.charCodeAt(index)) >>> 0;
  }
  return `drivecentric-${hash.toString(16)}`;
}

export function parseDriveCentricPage(document: Document, url: string, config: ParserConfig = driveCentricParserConfig) {
  const contextRoots = collectContextRoots(document, config);
  const scopedVisibleLines = contextRoots.flatMap((root) => textLines(extractVisibleText(document, root)));
  const scopedConversationLines = contextRoots.flatMap((root) => textLines(extractConversationDomText(root)));
  const rawVisibleText = unique(
    [
      ...scopedVisibleLines,
      ...scopedConversationLines,
      ...(contextRoots.length ? [] : textLines(extractVisibleText(document, document.body))),
    ],
    3500,
  ).join('\n');
  const rawLines = textLines(rawVisibleText);
  const lines = rawLines.filter((line) => !crmReasonNoisePattern.test(line));
  const contentLines = lines.filter(
    (line) =>
      !isNoiseLine(line) ||
      /Deal:\s*#\d+|Customer:\s*#\d+|Genius Summary|Phone\s*\/|Address\s+[A-Z]|Engaged|Appointment/i.test(line),
  );
  const fields = config.fields;
  const phoneNumbers = extractPhones(rawVisibleText);
  const emails = extractEmails(rawVisibleText);
  const customerName = clamp(customerNameFromRoots(contextRoots, lines, fields.customerName), 160);
  const customerLocation = clamp(locationFromLines(lines), 240);
  const customerZipCode = zipFromCustomerAddressLines(lines) ?? extractZipCodeFromText(customerLocation);
  const leadSource = clamp(firstFieldFromRoots(contextRoots, lines, fields.leadSource) ?? leadSourceFromLines(lines), 160);
  const appointmentStatus = clamp(firstFieldFromRoots(contextRoots, lines, fields.appointmentStatus) ?? stageFromLines(lines), 220);
  const salespersonName = clamp(firstFieldFromRoots(contextRoots, lines, fields.salespersonName) ?? salespersonFromLines(lines), 160);
  // Parse the labeled DriveCentric Activity timeline first and treat it as authoritative.
  // Generic chat/bubble parsing is only a fallback for true conversation-tab bubbles when no labeled Activity timeline was found.
  const labeledDomTimeline = mergeTimelineEntries(
    contextRoots.flatMap((root) => buildDriveCentricDomTimeline(root, customerName, salespersonName)),
    [],
  );
  const bubbleTimeline = labeledDomTimeline.length
    ? []
    : mergeTimelineEntries(
        contextRoots.flatMap((root) => buildDriveCentricConversationBubbleTimeline(root, customerName, salespersonName)),
        [],
      );
  const domTimeline = mergeTimelineEntries(labeledDomTimeline, bubbleTimeline);
  const fallbackTimeline = domTimeline.length ? [] : buildConversationTimeline(contentLines, customerName, salespersonName);
  let conversationTimeline = mergeTimelineEntries(domTimeline, fallbackTimeline);
  const vehicleCandidates = collectVehicleCandidates(document, contextRoots, lines, conversationTimeline);
  const vehicleOfInterestDetails = pickVehicleOfInterest(vehicleCandidates);
  const tradeVehicle = pickTradeVehicle(vehicleCandidates);
  const selectorVehicle = firstFieldFromRoots(contextRoots, lines, fields.vehicleOfInterest);
  const selectorVehicleCandidate =
    selectorVehicle && !isTradeContext(selectorVehicle)
      ? vehicleCandidateFromText(selectorVehicle, 'vehicle_of_interest', 'configured vehicle selector', 66)
      : undefined;
  const resolvedVehicleDetails = vehicleOfInterestDetails ?? selectorVehicleCandidate;
  const vehicle = clamp(vehicleCandidateTitle(resolvedVehicleDetails), 220);
  const stockCandidate = firstFieldFromRoots(contextRoots, lines, fields.stockNumber);
  const interestStockLine = lines.find((line) => isVehicleInterestContext(line) && !isTradeContext(line) && stockFromText(line));
  const stockNumber = clamp(
    resolvedVehicleDetails?.stock ??
      stockFromText(stockCandidate) ??
      stockFromText(vehicle) ??
      stockFromText(interestStockLine),
    80,
  );
  const callSummaryBlock = labeledBlock(lines, /\b(call summary|summary)\b/i, 3000);
  const callNotes = clamp([labeledBlock(lines, /\b(call notes?|phone notes?|voicemail notes?)\b/i, 2200), callSummaryBlock].filter(Boolean).join('\n\n'), 3000);
  const activitySummary = clamp(
    [
      labeledBlock(lines, /\b(activity history|activity summary|timeline)\b/i, 1800),
      ...lines.filter((line) => /\b(wants to finalize|ready to close|calling for you|call summary|best payment|down payment|manager could|working another deal)\b/i.test(line)).slice(0, 12),
    ]
      .filter(Boolean)
      .join('\n'),
    3000,
  );
  const imageContext = visibleImageContext(document, contextRoots);
  conversationTimeline = mergeTimelineEntries(conversationTimeline, buildDecisionContextTimeline({ callNotes, activitySummary, imageContext }));
  const externalTimeline = conversationTimeline.filter(customerFacingTimelineEntry);
  const timelineMessages = externalTimeline.map(formatTimelineMessage);
  const internalTimelineMessages = conversationTimeline
    .filter((entry) => !customerFacingTimelineEntry(entry))
    .map((entry) => `Internal CRM context only | ${formatTimelineMessage(entry)}`);
  const truthSummary = customerTruthSummary(conversationTimeline, rawVisibleText, stockNumber, customerZipCode);
  const looseMessageLines = domTimeline.length ? [] : taskOrMessageLines(contextRoots, lines);
  const priorMessages = unique([truthSummary, ...timelineMessages, ...looseMessageLines], 80);
  const timestamps = unique(
    [
      ...conversationTimeline.map((entry) => entry.timestampLabel),
      ...listFieldFromRoots(contextRoots, fields.timestamps, 24),
      ...lines.filter((line) => /\b(?:today|tomorrow|yesterday|mon|tue|wed|thu|fri|sat|sun|am|pm)\b/i.test(line)),
    ].map((line) => clamp(line, 120)),
    24,
  );
  const tradeInfo = tradeInfoFromLines(lines, tradeVehicle);
  const paymentBudgetHints = clamp(
    lines.find((line) => /\b(payment|budget|monthly|finance|credit|lease|apr|otd|out the door|\$)\b/i.test(line) && !isNoiseLine(line)),
    1200,
  );
  const structuredTimelineText = timelineMessages.length ? ['DriveCentric structured customer-facing timeline (newest first):', ...timelineMessages].join('\n') : '';
  const internalTimelineText = internalTimelineMessages.length
    ? ['Internal CRM notes/tasks/system events (not customer-authored):', ...internalTimelineMessages.slice(0, 16)].join('\n')
    : '';
  const visibleText = (priorMessages.length || contentLines.length ? [truthSummary, structuredTimelineText, internalTimelineText, ...contentLines, ...priorMessages] : rawLines)
    .filter(Boolean)
    .join('\n')
    .slice(0, 80000);
  const callRecordingLinks = extractCallRecordingLinks(document);
  const callTranscript = labeledBlock(lines, /\b(call transcript|transcript)\b/i, 6000);
  const latestVisibleActivity = newestTimelineEntry(conversationTimeline, (entry) => Boolean(entry.text || entry.speakerName || entry.timestampLabel));
  const latestInboundCustomerEntry = newestTimelineEntry(
    conversationTimeline,
    (entry) => isTrueInboundCustomerEntry(entry),
  );
  const inboundCustomerCount = conversationTimeline.filter(
    (entry) => isTrueInboundCustomerEntry(entry),
  ).length;
  const outboundDealerCount = conversationTimeline.filter(
    (entry) => (entry.actor === 'salesperson' || entry.actor === 'manager' || entry.actor === 'automation') && entry.direction === 'outbound',
  ).length;
  const internalNoteCount = conversationTimeline.filter((entry) => entry.direction === 'internal' || entry.channel === 'note' || entry.actor === 'system').length;
  const latestCustomerMessageFound = Boolean(latestInboundCustomerEntry);
  const parserWarnings = unique(
    [
      !resolvedVehicleDetails && tradeVehicle ? 'Trade-in detected but vehicle of interest missing' : undefined,
      !resolvedVehicleDetails ? 'Vehicle of interest unknown' : undefined,
      !customerZipCode ? 'ZIP missing' : undefined,
      phoneNumbers.length && !customerZipCode && !customerLocation ? 'Phone area estimate only until ZIP is confirmed' : undefined,
      !latestCustomerMessageFound && !(callNotes || activitySummary) ? 'Latest customer message not found' : undefined,
      !conversationTimeline.length ? 'No DriveCentric message thread detected' : undefined,
      imageContext.length ? `${imageContext.length} visible image attachment(s) detected` : undefined,
    ],
    12,
  );
  const customerText = conversationTimeline
    .filter((entry) => isTrueInboundCustomerEntry(entry))
    .map((entry) => entry.text!)
    .join('\n');
  const latestCustomerText = latestInboundCustomerEntry?.text;
  const correctionSignal = latestCustomerCorrectionSignal(latestCustomerText);
  const externalConversationText = [truthSummary, ...timelineMessages, customerText, vehicle, stockNumber, tradeInfo, paymentBudgetHints, leadSource, customerLocation]
    .filter(Boolean)
    .join('\n');
  const missingInfo = unique(
    [
      correctionSignal ? 'correct vehicle/photos/status' : undefined,
      !customerZipCode ? 'ZIP for taxes, incentives, and distance' : undefined,
      !correctionSignal && !tradeInfo ? 'trade status' : undefined,
      !correctionSignal && !paymentBudgetHints ? 'cash/finance preference or payment comfort' : undefined,
      !correctionSignal && !/\b(today|tomorrow|this week|weekend|soon|ready|buy|purchase)\b/i.test(customerText) ? 'buying timeline' : undefined,
      !correctionSignal && !/\b(wife|husband|spouse|partner|parent|mom|dad|family|boss|business partner)\b/i.test(customerText) ? 'decision maker' : undefined,
    ],
    10,
  );

  const context: LeadContext = {
    pageUrl: url,
    customerName,
    customerLocation,
    customerZipCode,
    phoneNumbers,
    emails,
    personalizationSignals: [],
    vehicleOfInterest: vehicle,
    vehicleOfInterestDetails: resolvedVehicleDetails,
    stockNumber,
    tradeVehicle,
    similarInventory: [],
    mentionedVehicles: vehicleCandidates.filter((candidate) => candidate.role === 'mentioned').slice(0, 12),
    tradeInfo,
    paymentBudgetHints,
    leadSource,
    timestamps,
    priorMessages: unique([...priorMessages, ...imageContext], 80),
    conversationTimeline,
    appointmentStatus,
    salespersonName,
    callRecordingLinks,
    callTranscript,
    callNotes,
    activitySummary,
    crmAutomationHints: detectCrmAutomationHints(visibleText),
    visibleText: [visibleText, imageContext.length ? ['Visible image attachments / media context:', ...imageContext].join('\n') : ''].filter(Boolean).join('\n').slice(0, 80000),
    sentiment: detectSentiment(externalConversationText),
    leadScore: scoreLead(externalConversationText),
    customerIntelligence: {
      customerIntent: truthSummary?.replace(/^Customer truth read:\s*/i, '') ?? latestCustomerText,
      likelyCaresAbout: unique(
        [
          /\botd|out[-\s]?the[-\s]?door|\$|price|payment|budget/i.test(externalConversationText) ? 'real numbers' : undefined,
          /\bvideo|photos?|pictures?|condition|available|still have|wrong|not the|black one|green one|sent over/i.test(externalConversationText)
            ? 'proof and accuracy on the exact vehicle'
            : undefined,
          customerZipCode || /shipping|delivery|out[-\s]?of[-\s]?state|drive/i.test(externalConversationText) ? 'not wasting a trip' : undefined,
          tradeInfo ? 'trade value' : undefined,
        ],
        8,
      ),
      painPoints: unique(
        [
          correctionSignal ? 'Customer is frustrated about wrong vehicle/photos; recover trust before qualifying.' : undefined,
          /\bwrong vehicle|mis-read|misread|backwards|not interested|don't want|dont want/i.test(externalConversationText)
            ? 'Prior response may have misread customer constraints'
            : undefined,
          /\btoo high|out of my range|budget|cash|lowest price/i.test(externalConversationText) ? 'Price or budget sensitivity' : undefined,
          customerZipCode && /GA|Georgia|plate|registration/i.test(externalConversationText) ? 'Needs accurate out-of-state taxes/plate handling' : undefined,
        ],
        8,
      ),
      nonNegotiables: unique(
        [
          stockNumber ? `Specific stock ${stockNumber}` : undefined,
          /\botd|out[-\s]?the[-\s]?door/i.test(externalConversationText) ? 'Exact out-the-door total' : undefined,
          /\bno\s+(?:hybrid|hybird)|don't want a hybrid|do not want a hybrid|no 4xe/i.test(externalConversationText) ? 'No hybrid / no 4xe' : undefined,
          /\bhard[-\s]?top|hardtop/i.test(externalConversationText) ? 'Hard top' : undefined,
          /\bleather/i.test(externalConversationText) ? 'Leather seats' : undefined,
        ],
        10,
      ),
      buyingSignals: unique(
        [
          /\bcash|pay in full|ready|buy|purchase|lowest price|delivery|shipping|otd|out[-\s]?the[-\s]?door/i.test(externalConversationText)
            ? 'Customer is asking deal-moving questions'
            : undefined,
          /\bvideo|walkaround|photos?|pictures?/i.test(externalConversationText) ? 'Wants proof on the vehicle' : undefined,
        ],
        8,
      ),
      objections: unique(
        [
          /\bout of my range|too high|budget/i.test(externalConversationText) ? 'Numbers may not fit' : undefined,
          correctionSignal || /\bwrong vehicle|mis-read|misread|backwards/i.test(externalConversationText) ? 'Trust risk from wrong vehicle/photos' : undefined,
        ],
        8,
      ),
      missingInfo,
      bestNextQuestion: correctionSignal
        ? 'Confirm the exact black Gladiator they want and verify whether it is available/service-ready before asking anything else.'
        : missingInfo.includes('trade status')
          ? 'Are you planning to trade anything in, or would this be just the new vehicle by itself?'
          : missingInfo.includes('cash/finance preference or payment comfort')
            ? 'Are you thinking cash, financing, or just comparing total numbers right now?'
            : 'What matters most on this one: total price, equipment, miles, or making sure it is the right fit?',
      bestNextMove: correctionSignal
        ? 'Own the mix-up, confirm the black Gladiator, and promise to verify/send the correct photos before qualifying.'
        : 'Answer the latest customer message, then ask the single missing question that keeps numbers honest.',
      suggestedTone: 'warm, direct, and accurate',
    },
    qualification: {
      known: unique(
        [
          tradeInfo ? 'Trade status mentioned' : undefined,
          paymentBudgetHints ? 'Budget/payment signal mentioned' : undefined,
          /\bcash|pay in full|paid in full\b/i.test(externalConversationText) ? 'Cash/paying in full signal' : undefined,
          customerZipCode ? `ZIP ${customerZipCode}` : undefined,
        ],
        10,
      ),
      missing: missingInfo,
      highestValueQuestion:
        correctionSignal
          ? 'Do not qualify yet. First fix the vehicle/photo accuracy issue and confirm the exact black Gladiator.'
          : missingInfo[0] === 'trade status'
          ? 'Before I throw numbers at you, are you planning to trade anything in or is this just the vehicle by itself?'
          : missingInfo[0] === 'ZIP for taxes, incentives, and distance'
            ? 'Before I point you the wrong way, what ZIP should I use for taxes and fees?'
            : missingInfo[0]
              ? `The next missing piece is ${missingInfo[0]}. Ask for that naturally.`
              : 'Enough basics are known to answer directly and move to the next step.',
      creditAppAppropriate:
        !correctionSignal &&
        /\bfinance|financing|payment|monthly|approval|credit|pre[-\s]?approval\b/i.test(externalConversationText) &&
        !/\bcash|pay in full|paid in full\b/i.test(externalConversationText),
      appointmentAppropriate:
        !correctionSignal && /\bavailable|today|tomorrow|appointment|test drive|come in|stop by|see it|look at it\b/i.test(externalConversationText),
      reason: 'Qualification should protect the customer from numbers that change later and avoid credit/app pressure before the setup is known.',
    },
    localResearch: {
      status: 'not_connected',
      places: [],
      note: 'No verified local place lookup is connected. Use ZIP/area only for distance and travel confidence; do not name restaurants unless a reliable lookup provides them.',
    },
    parserDebug: {
      messagesParsedCount: conversationTimeline.length,
      latestCustomerMessageFound,
      latestVisibleActivityLabel: latestVisibleActivity ? `${latestVisibleActivity.actor}|${latestVisibleActivity.direction}|${latestVisibleActivity.channel}` : undefined,
      latestVisibleActivityText: latestVisibleActivity?.text,
      latestCustomerMessageLabel: latestInboundCustomerEntry ? `${latestInboundCustomerEntry.actor}|${latestInboundCustomerEntry.direction}|${latestInboundCustomerEntry.channel}` : undefined,
      latestCustomerMessageText: latestInboundCustomerEntry?.text,
      timelineCount: conversationTimeline.length,
      labeledDomTimelineCount: labeledDomTimeline.length,
      bubbleTimelineCount: bubbleTimeline.length,
      inboundCustomerCount,
      outboundDealerCount,
      internalNoteCount,
      vehicleOfInterestConfidence: resolvedVehicleDetails?.confidence,
      tradeInConfidence: tradeVehicle?.confidence,
      locationConfidence: customerZipCode ? 'zip_confirmed' : customerLocation ? 'page_city_state_candidate' : phoneNumbers.length ? 'phone_area_possible' : 'unknown',
      warnings: parserWarnings,
      vehicleCandidates: vehicleCandidates.slice(0, 16),
    },
    extractedAt: new Date().toISOString(),
  };
  context.personalizationSignals = personalizationSignals(context, visibleText);
  const compliantContext = applyCommunicationCompliance(context);

  return {
    conversationId: conversationIdFromUrl(url, visibleText),
    context: compliantContext,
    isLeadPage: isDriveCentricLeadPage(url, document, config),
  };
}
