import { applyCommunicationCompliance, type LeadContext } from '@drivecentric-ai/shared';

interface XmlLeadEnhancement {
  customerName?: string;
  customerLocation?: string;
  phoneNumbers: string[];
  emails: string[];
  vehicleOfInterest?: string;
  stockNumber?: string;
  tradeInfo?: string;
  paymentBudgetHints?: string;
  leadSource?: string;
  priorMessages: string[];
  personalizationSignals: string[];
  visibleText?: string;
}

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim();
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

function normalizePhone(value: string | undefined) {
  const raw = clean(value);
  if (!raw) return undefined;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return undefined;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return undefined;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function collectInlineXml(document: Document) {
  const blocks = Array.from(document.querySelectorAll('pre, code, textarea'))
    .map((node) => clean(node.textContent))
    .filter((text): text is string => Boolean(text && text.includes('<') && text.includes('>')));
  return blocks.find((text) => /<\?xml|<lead|<prospect|<customer|<vehicle/i.test(text));
}

function findXmlUrls(document: Document, pageUrl: string) {
  const urls = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => anchor.href)
    .filter((href) => /\.xml(?:$|[?#])/i.test(href) || /format=xml|xml/i.test(href))
    .map((href) => {
      try {
        return new URL(href, pageUrl).toString();
      } catch {
        return undefined;
      }
    });
  return unique(urls, 3);
}

function pickField(map: Map<string, string[]>, names: string[]) {
  for (const [key, values] of map.entries()) {
    if (names.some((name) => key.includes(name))) {
      const first = values.find(Boolean);
      if (first) return first;
    }
  }
  return undefined;
}

function collectFieldMap(xmlText: string) {
  const parsed = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (parsed.querySelector('parsererror')) return null;

  const fieldMap = new Map<string, string[]>();
  const allElements = Array.from(parsed.querySelectorAll('*'));
  for (const element of allElements) {
    if (element.children.length > 0) continue;
    const key = element.tagName.toLowerCase();
    const value = clean(element.textContent);
    if (!value || value.length > 500) continue;
    const current = fieldMap.get(key) ?? [];
    current.push(value);
    fieldMap.set(key, current);
  }
  return fieldMap;
}

function fieldsToVisibleText(fieldMap: Map<string, string[]>) {
  return Array.from(fieldMap.entries())
    .slice(0, 40)
    .map(([key, values]) => `${key}: ${values.slice(0, 3).join(' | ')}`)
    .join('\n');
}

function parseXmlLead(xmlText: string): XmlLeadEnhancement | null {
  const fieldMap = collectFieldMap(xmlText);
  if (!fieldMap) return null;

  const firstName = pickField(fieldMap, ['firstname', 'first_name']);
  const lastName = pickField(fieldMap, ['lastname', 'last_name']);
  const customerName =
    pickField(fieldMap, ['fullname', 'full_name', 'customername', 'customer_name', 'prospectname', 'name']) ??
    clean([firstName, lastName].filter(Boolean).join(' '));
  const city = pickField(fieldMap, ['city']);
  const state = pickField(fieldMap, ['state', 'province']);
  const zip = pickField(fieldMap, ['zip', 'zipcode', 'postal']);
  const customerLocation = clean([city, state, zip].filter(Boolean).join(' '));
  const year = pickField(fieldMap, ['year']);
  const make = pickField(fieldMap, ['make']);
  const model = pickField(fieldMap, ['model']);
  const trim = pickField(fieldMap, ['trim']);
  const vehicleOfInterest =
    pickField(fieldMap, ['vehicle', 'vehicleofinterest', 'requestedvehicle']) ??
    clean([year, make, model, trim].filter(Boolean).join(' '));
  const stockNumber = pickField(fieldMap, ['stocknumber', 'stock_number', 'stock']);
  const tradeInfo = clean(
    [
      pickField(fieldMap, ['trade', 'tradein', 'trade_in']),
      pickField(fieldMap, ['payoff']),
      pickField(fieldMap, ['mileage']),
      pickField(fieldMap, ['vin']),
    ]
      .filter(Boolean)
      .join(' | '),
  );
  const paymentBudgetHints = clean(
    [
      pickField(fieldMap, ['payment', 'monthly', 'budget']),
      pickField(fieldMap, ['credit']),
      pickField(fieldMap, ['downpayment', 'down_payment']),
    ]
      .filter(Boolean)
      .join(' | '),
  );
  const leadSource = pickField(fieldMap, ['source', 'provider', 'origin']);
  const comments = unique(
    [
      pickField(fieldMap, ['comments']),
      pickField(fieldMap, ['message']),
      pickField(fieldMap, ['notes']),
      pickField(fieldMap, ['description']),
    ],
    6,
  );
  const phoneNumbers = unique(
    Array.from(fieldMap.entries())
      .filter(([key]) => /phone|mobile|cell|sms|dayphone|eveningphone/i.test(key))
      .flatMap(([, values]) => values.map(normalizePhone)),
    6,
  );
  const emails = unique(
    Array.from(fieldMap.entries())
      .filter(([key]) => /email/i.test(key))
      .flatMap(([, values]) => values),
    6,
  );

  return {
    ...(customerName ? { customerName } : {}),
    ...(customerLocation ? { customerLocation } : {}),
    phoneNumbers,
    emails,
    ...(vehicleOfInterest ? { vehicleOfInterest } : {}),
    ...(stockNumber ? { stockNumber } : {}),
    ...(tradeInfo ? { tradeInfo } : {}),
    ...(paymentBudgetHints ? { paymentBudgetHints } : {}),
    ...(leadSource ? { leadSource } : {}),
    priorMessages: comments,
    personalizationSignals: unique(
      [
        'XML lead file loaded.',
        customerLocation ? `XML location: ${customerLocation}` : undefined,
        vehicleOfInterest ? `XML vehicle: ${vehicleOfInterest}` : undefined,
        leadSource ? `XML source: ${leadSource}` : undefined,
      ],
      10,
    ),
    ...(fieldsToVisibleText(fieldMap) ? { visibleText: fieldsToVisibleText(fieldMap) } : {}),
  };
}

export async function extractXmlLeadEnhancement(document: Document, pageUrl: string): Promise<XmlLeadEnhancement | null> {
  const inline = collectInlineXml(document);
  if (inline) return parseXmlLead(inline);

  for (const xmlUrl of findXmlUrls(document, pageUrl)) {
    try {
      const response = await fetch(xmlUrl, { credentials: 'include' });
      if (!response.ok) continue;
      const xmlText = await response.text();
      const parsed = parseXmlLead(xmlText);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export function mergeXmlEnhancement(context: LeadContext, xml: XmlLeadEnhancement | null): LeadContext {
  if (!xml) return context;
  return applyCommunicationCompliance({
    ...context,
    customerName: context.customerName ?? xml.customerName,
    customerLocation: context.customerLocation ?? xml.customerLocation,
    phoneNumbers: unique([...(context.phoneNumbers ?? []), ...xml.phoneNumbers], 12),
    emails: unique([...(context.emails ?? []), ...xml.emails], 12),
    personalizationSignals: unique([...(context.personalizationSignals ?? []), ...xml.personalizationSignals], 30),
    vehicleOfInterest: context.vehicleOfInterest ?? xml.vehicleOfInterest,
    stockNumber: context.stockNumber ?? xml.stockNumber,
    tradeInfo: context.tradeInfo ?? xml.tradeInfo,
    paymentBudgetHints: context.paymentBudgetHints ?? xml.paymentBudgetHints,
    leadSource: context.leadSource ?? xml.leadSource,
    priorMessages: unique([...(context.priorMessages ?? []), ...xml.priorMessages], 60),
    visibleText: clean([context.visibleText, xml.visibleText].filter(Boolean).join('\n\nXML lead data:\n'))?.slice(0, 40000),
  });
}
