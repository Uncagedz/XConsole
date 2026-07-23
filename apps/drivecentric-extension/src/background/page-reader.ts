import { applyCommunicationCompliance, extractZipCodeFromText, type LeadContext } from '@drivecentric-ai/shared';
import type { ReadPageResponse } from '../shared/messages';

interface InjectedPageSnapshot {
  title: string;
  url: string;
  isLeadPage: boolean;
  context: LeadContext;
  conversationId?: string;
}

const maxVisibleTextLength = 80000;

function snapshotFromReadPage(page: ReadPageResponse): InjectedPageSnapshot {
  return {
    title: page.pageTitle,
    url: page.url,
    isLeadPage: page.isLeadPage,
    context: page.context,
    conversationId: page.conversationId,
  };
}

function driveCentricSnapshotScore(snapshot: InjectedPageSnapshot, frameId?: number) {
  const context = snapshot.context;
  const visibleText = context.visibleText ?? '';
  let score = frameId === 0 ? 120 : 0;
  if (context.customerName) score += 45;
  if (context.phoneNumbers?.length) score += 20;
  if (context.emails?.length) score += 15;
  if (context.vehicleOfInterest) score += 25;
  if (context.customerZipCode || context.customerLocation) score += 15;
  if (context.conversationTimeline?.some((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text)) score += 45;
  score += Math.min(context.conversationTimeline?.length ?? 0, 20);
  if (/\bBest Contact Method\b|\bCustomer #\b|\bDeal #\b|\bText From Customer\b/i.test(visibleText)) score += 35;
  if (/\bSales Engagement Hub\b|\bAdd Filter\b|\bNext level mode\b/i.test(visibleText)) score -= 160;
  return score;
}

function insertIntoEditable(text: string) {
  function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    setNativeValue(active, text);
    active.focus();
    return true;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    active.textContent = text;
    active.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    active.focus();
    return true;
  }

  return false;
}

function collectReadablePage(): InjectedPageSnapshot {
  const areaCodeHints: Record<string, string> = {
    '229': 'South Georgia',
    '404': 'Atlanta, Georgia',
    '470': 'Atlanta metro, Georgia',
    '478': 'Macon / central Georgia',
    '678': 'Atlanta metro, Georgia',
    '706': 'north Georgia / Augusta / Columbus',
    '762': 'north Georgia / Augusta / Columbus',
    '770': 'Atlanta suburbs, Georgia',
    '912': 'Savannah / coastal Georgia',
    '943': 'Atlanta metro, Georgia',
    '405': 'Oklahoma City / central Oklahoma',
    '539': 'Tulsa / northeast Oklahoma',
    '580': 'western or southern Oklahoma',
    '918': 'Tulsa / northeast Oklahoma',
    '214': 'Dallas, Texas',
    '469': 'Dallas, Texas',
    '972': 'Dallas, Texas',
    '817': 'Fort Worth, Texas',
    '682': 'Fort Worth, Texas',
    '940': 'north Texas',
    '316': 'Wichita, Kansas',
    '620': 'southern Kansas',
    '479': 'northwest Arkansas',
    '501': 'central Arkansas',
    '870': 'Arkansas',
    '417': 'southwest Missouri',
    '573': 'Missouri',
    '314': 'St. Louis, Missouri',
    '816': 'Kansas City, Missouri',
    '303': 'Denver, Colorado',
    '720': 'Denver, Colorado',
    '719': 'Colorado Springs, Colorado',
  };

  function clean(value: string | undefined | null) {
    return value?.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function compact(value: string | undefined | null) {
    return value?.replace(/\s+/g, ' ').trim();
  }

  function unique(values: Array<string | undefined | null>, limit: number) {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      const normalized = compact(value);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
      if (output.length >= limit) break;
    }
    return output;
  }

  function visible(element: Element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0;
  }

  function visibleImageContext(root: ParentNode = document) {
    return unique(
      Array.from(root.querySelectorAll('img'))
        .filter(visible)
        .map((image) => {
          const src = image.currentSrc || image.src;
          const alt = image.alt || image.title || image.getAttribute('aria-label') || '';
          const rect = image.getBoundingClientRect();
          const nearby = compact((image.closest('li, article, [class*="message" i], [class*="timeline" i], [class*="media" i], [class*="content" i]') as HTMLElement | null)?.innerText);
          if (!src && !alt && !nearby) return undefined;
          if (/minilogo|avatar|profile|intercom|sprite|favicon|logo/i.test(`${src} ${alt}`)) return undefined;
          const size = rect.width && rect.height ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : undefined;
          return [
            'Visible image attachment/context',
            alt ? `alt/title: ${alt}` : undefined,
            size ? `size: ${size}` : undefined,
            src ? `url: ${src}` : undefined,
            nearby ? `nearby text: ${nearby.slice(0, 500)}` : undefined,
          ]
            .filter(Boolean)
            .join(' | ');
        }),
      12,
    );
  }

  function labelFor(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    const labels = 'labels' in input && input.labels ? Array.from(input.labels).map((label) => label.textContent).join(' ') : '';
    return compact(
      labels ||
        input.getAttribute('aria-label') ||
        input.getAttribute('placeholder') ||
        input.name ||
        input.id ||
        input.closest('label')?.textContent,
    );
  }

  function controlText() {
    const controls = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((item): item is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
        if (!(item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement)) {
          return false;
        }
        if (item instanceof HTMLInputElement && ['hidden', 'password', 'submit', 'button'].includes(item.type)) return false;
        return visible(item);
      })
      .map((item) => {
        const label = labelFor(item);
        const value = item instanceof HTMLSelectElement ? item.selectedOptions[0]?.textContent : item.value;
        return compact([label, value].filter(Boolean).join(': '));
      });

    const editableText = Array.from(document.querySelectorAll('[contenteditable="true"]'))
      .filter(visible)
      .map((item) => compact(item.textContent));

    return unique([...controls, ...editableText], 120).join('\n');
  }

  function metaText() {
    return Array.from(document.querySelectorAll('meta[name], meta[property]'))
      .map((meta) => {
        const name = meta.getAttribute('name') ?? meta.getAttribute('property');
        const content = meta.getAttribute('content');
        return name && content ? `${name}: ${content}` : undefined;
      })
      .filter(Boolean)
      .join('\n');
  }

  function conversationDomText() {
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
      selectors.flatMap((selector) => {
        try {
          return Array.from(document.querySelectorAll(selector)).map((item) => compact(item.textContent));
        } catch {
          return [];
        }
      }),
      140,
    ).join('\n');
  }

  const rawBodyText = document.body?.innerText ?? '';
  const fullText = clean([document.title, location.href, metaText(), controlText(), rawBodyText, conversationDomText()].filter(Boolean).join('\n')) ?? '';
  const lines = unique(fullText.split(/\n+/), 1000);
  const noisyFieldPattern =
    /Reason Bought Elsewhere|Cross Sell|Bad Contact Info|Bad Lead|Test Lead|Transferred:|Dealer Purchase|Handraiser|Service \/ Parts/i;

  function limit(value: string | undefined | null, max: number) {
    const normalized = compact(value);
    return normalized ? normalized.slice(0, max) : undefined;
  }

  function usefulField(value: string | undefined | null) {
    const normalized = compact(value);
    if (!normalized) return undefined;
    if (/^(number|stock number|vehicle|model|source|name|city|state|location|from|it)$/i.test(normalized)) return undefined;
    if (noisyFieldPattern.test(normalized)) return undefined;
    return normalized;
  }

  function findField(labels: string[]) {
    const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const direct = new RegExp(`^\\s*(?:${labelPattern})\\s*(?:[:#-]|\\s)\\s*([^\\n]{2,180})$`, 'i');
    for (const line of lines) {
      const match = line.match(direct);
      const value = usefulField(match?.[1]);
      if (value && !labels.some((label) => value.toLowerCase() === label.toLowerCase())) {
        return limit(value, 180);
      }
    }
    return undefined;
  }

  function matchingLines(pattern: RegExp, maxItems: number, maxLength = 1200) {
    return (
      unique(
        lines
          .filter((line) => line.length <= 520 && pattern.test(line) && !noisyFieldPattern.test(line))
          .map((line) => limit(line, 260)),
        maxItems,
      )
        .join('\n')
        .slice(0, maxLength) || undefined
    );
  }

  function normalizePhone(candidate: string | undefined | null) {
    const raw = compact(candidate);
    if (!raw) return undefined;
    if (/^\d{6}\s+\d{4}$/.test(raw)) return undefined;
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    if (digits.length !== 10) return undefined;
    const area = digits.slice(0, 3);
    const exchange = digits.slice(3, 6);
    if (!/^[2-9]\d{2}$/.test(area)) return undefined;
    if (!/^[2-9]\d{2}$/.test(exchange)) return undefined;
    if (/^[2-9]11$/.test(exchange)) return undefined;
    if (/^(\d)\1+$/.test(digits)) return undefined;
    return `(${area}) ${exchange}-${digits.slice(6)}`;
  }

  function extractPhones() {
    const phonePattern = /(?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]+[2-9]\d{2}[\s.-]+\d{4}\b/g;
    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]')).map((link) => link.getAttribute('href')?.replace(/^tel:/i, ''));
    const labeledPhones = lines
      .filter((line) => /\b(phone|mobile|cell|text|sms|call)\b/i.test(line) && !noisyFieldPattern.test(line))
      .flatMap((line) => line.match(phonePattern) ?? []);
    return unique([...telLinks, ...labeledPhones].map(normalizePhone), 6);
  }

  function extractEmails(text: string) {
    return unique(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [], 12);
  }

  function extractZip(text: string) {
    const nonStoreLines = text
      .split('\n')
      .filter((line) => !/\b(777\s+N\s+State\s+Road\s+7|Taverna|Sales:\s*\d|Service:\s*\d|Parts:\s*\d|dealership|customer\s*#|deal\s*#|buyer\s*#)\b/i.test(line));
    const labeled = nonStoreLines.find((line) => /\b(zip|postal|address|city|state|shopper|located|from)\b/i.test(line) && /\b\d{5}(?:-\d{4})?\b/.test(line));
    return (labeled ?? nonStoreLines.join('\n')).match(/\b\d{5}(?:-\d{4})?\b/)?.[0].slice(0, 5);
  }

  function extractCallRecordingLinks() {
    const links = Array.from(document.querySelectorAll('a[href]')).flatMap((link) => {
      const href = link.getAttribute('href') ?? '';
      const text = compact(link.textContent) ?? '';
      if (!/\b(recording|call[-\s]?record|transcript|twilio|callrail|voice|voicemail|mp3|wav)\b/i.test(`${href}\n${text}`)) {
        return [];
      }
      try {
        return [new URL(href, location.href).toString()];
      } catch {
        return [];
      }
    });
    // Surface recording/transcript links only. The extension does not fetch private audio.
    return unique(links, 5);
  }

  function labeledBlock(labelPattern: RegExp, maxLength: number) {
    const start = lines.findIndex((line) => labelPattern.test(line));
    if (start < 0) return undefined;
    return lines
      .slice(start, start + 8)
      .filter((line) => !noisyFieldPattern.test(line))
      .join('\n')
      .slice(0, maxLength);
  }

  function phoneSignals(phoneNumbers: string[]) {
    return phoneNumbers
      .map((phone) => {
        const areaCode = phone.replace(/\D/g, '').replace(/^1/, '').slice(0, 3);
        const hint = areaCodeHints[areaCode];
        return hint ? `Phone area code ${areaCode} suggests ${hint}` : undefined;
      })
      .filter(Boolean) as string[];
  }

  function locationFromText(text: string, phones: string[]) {
    const customerish = text
      .split('\n')
      .filter((line) => !/\b(777\s+N\s+State\s+Road\s+7|Taverna|Sales:\s*\d|Service:\s*\d|Parts:\s*\d)\b/i.test(line))
      .join('\n');
    const cityState = customerish.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}),\s*(OK|TX|KS|AR|MO|CO|LA|NM|GA|SC|NC|AL|TN)\b/);
    if (cityState) return `${cityState[1]}, ${cityState[2]}`;
    const phoneHint = phoneSignals(phones)[0]?.replace(/^Phone area code \d+ suggests /, '');
    return phoneHint;
  }

  function detectVehicle(text: string) {
    const direct = findField(['Vehicle of Interest', 'Interested Vehicle', 'Requested Vehicle', 'Interested In']);
    if (direct) return direct;
    const vehicleMatch = text.match(
      /\b(?:19|20)\d{2}\s+(?:Chrysler|Dodge|Jeep|Ram|Fiat|Toyota|Honda|Ford|Chevrolet|Chevy|GMC|Nissan|Hyundai|Kia|BMW|Mercedes|Audi|Volkswagen|Subaru|Mazda|Lexus|Acura|Cadillac|Lincoln)\s+[A-Z][A-Za-z0-9-]+(?:\s+[A-Z][A-Za-z0-9-]+){0,3}\b/,
    );
    return compact(vehicleMatch?.[0]);
  }

  function detectSentiment(text: string): LeadContext['sentiment'] {
    if (/angry|frustrated|too high|bad experience|not happy|stop texting|remove me|unsubscribe/i.test(text)) return 'negative';
    if (/thanks|thank you|sounds good|perfect|great|see you|interested|ready|love it/i.test(text)) return 'positive';
    return 'neutral';
  }

  function scoreLead(text: string): LeadContext['leadScore'] {
    if (/today|now|appointment|test drive|call me|trade|credit app|ready|buy|deposit|hold it/i.test(text)) return 'hot';
    if (/price|available|photos|payment|interested|more info|still have|out the door|otd/i.test(text)) return 'warm';
    return 'cold';
  }

  function messageCandidates() {
    const selectors = [
      '[data-testid*="message" i]',
      '[class*="message" i]',
      '[class*="conversation" i]',
      '[class*="chat" i]',
      '[class*="sms" i]',
      '[class*="email" i]',
      '[class*="note" i]',
      'article',
      'li',
    ];
    const nodeTexts = selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector)).filter(visible).map((item) => compact(item.textContent));
      } catch {
        return [];
      }
    });
    const lineTexts = lines.filter((line) => /customer|shopper|client|lead|sms|email|said|asked|replied|sent|message/i.test(line));
    return unique([...nodeTexts, ...lineTexts], 100).filter((item) => item.length > 10 && item.length < 3000);
  }

  function timestamps() {
    return unique(
      lines.filter((line) =>
        /\b(?:today|yesterday|tomorrow|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}:\d{2}\s?(?:am|pm)?|mon|tue|wed|thu|fri|sat|sun)\b/i.test(
          line,
        ),
      ),
      24,
    );
  }

  function automationHints(text: string) {
    const hints: string[] = [];
    if (/\bclaire\b/i.test(text)) {
      hints.push('Claire appears in the page context. Claire is DriveCentric AI bot automation, not the shopper.');
    }
    if (/\bblast\b/i.test(text)) {
      hints.push('Blast appears in the page context. Treat blast outreach as automation, not a human salesperson or customer-authored reply.');
    }
    if (/\bauto(?:mated|mation)?\b/i.test(text)) {
      hints.push('Auto/automated appears in the page context. Treat automated outreach as automation, not human conversation.');
    }
    return hints;
  }

  const phoneNumbers = extractPhones();
  const emails = extractEmails(fullText);
  const customerLocation =
    findField(['Customer Location', 'Customer City', 'Customer State', 'City', 'State', 'ZIP', 'Zip Code']) ??
    locationFromText(fullText, phoneNumbers);
  const customerZipCode = extractZip(customerLocation ?? '');
  const vehicleOfInterest = limit(detectVehicle(fullText), 220);
  const stockNumber = limit(findField(['Stock Number', 'Stock #', 'Stock']), 80);
  const tradeInfo = matchingLines(/trade|trade-in|payoff|vin|miles|mileage|condition/i, 8);
  const paymentBudgetHints = matchingLines(/\$|payment|budget|monthly|down|finance|credit|approval|apr|term|otd|out the door/i, 10);
  const leadSource = limit(findField(['Lead Source', 'Source', 'Provider', 'Origin']), 160);
  const appointmentStatus = limit(findField(['Appointment', 'Appointment Status', 'Visit', 'Showroom Visit']), 220);
  const salespersonName = limit(findField(['Salesperson', 'Assigned To', 'Owner', 'BDC Rep']), 160);
  const callRecordingLinks = extractCallRecordingLinks();
  const callTranscript = labeledBlock(/\b(call transcript|transcript)\b/i, 6000);
  const callNotes = labeledBlock(/\b(call notes?|phone notes?|voicemail notes?)\b/i, 3000);
  const activitySummary = labeledBlock(/\b(activity history|activity summary|timeline)\b/i, 3000);

  const personalizationSignals = unique(
    [
      customerLocation ? `Customer location clue: ${customerLocation}` : undefined,
      ...phoneSignals(phoneNumbers),
      vehicleOfInterest ? `Vehicle of interest: ${vehicleOfInterest}` : undefined,
      stockNumber ? `Stock number on page: ${stockNumber}` : undefined,
      tradeInfo ? `Trade clue: ${tradeInfo}` : undefined,
      paymentBudgetHints ? `Payment or budget clue: ${paymentBudgetHints}` : undefined,
      leadSource ? `Lead source: ${leadSource}` : undefined,
      /out[-\s]?of[-\s]?state|shipping|delivery|distance|drive from/i.test(fullText)
        ? 'Distance or out-of-market logistics may matter; reduce friction and offer a simple path.'
        : undefined,
      /cash|finance|monthly|payment|down|credit|pre[-\s]?approval/i.test(fullText)
        ? 'Money conversation is present; give a clear next step without implying approval.'
        : undefined,
      /trade|payoff|vin|miles|mileage/i.test(fullText)
        ? 'Trade conversation is present; ask for VIN, miles, payoff, and condition if missing.'
        : undefined,
    ].map((signal) => limit(signal, 320)),
    30,
  );

  const visibleText = fullText.slice(0, 80000);
  return {
    title: document.title,
    url: location.href,
    isLeadPage: /drivecentric|crm|lead|customer|opportunity|deal|appointment/i.test(`${location.href}\n${document.title}\n${visibleText}`),
    context: {
      pageUrl: location.href,
      customerName: limit(findField(['Customer Name', 'Client Name', 'Shopper Name', 'Name']), 160),
      customerLocation: limit(customerLocation, 240),
      customerZipCode,
      phoneNumbers,
      emails,
      personalizationSignals,
      vehicleOfInterest,
      stockNumber,
      tradeInfo,
      paymentBudgetHints,
      leadSource,
      timestamps: timestamps(),
      priorMessages: messageCandidates(),
      conversationTimeline: [],
      appointmentStatus,
      salespersonName,
      callRecordingLinks,
      callTranscript,
      callNotes,
      activitySummary,
      crmAutomationHints: automationHints(fullText),
      visibleText,
      sentiment: detectSentiment(fullText),
      leadScore: scoreLead(fullText),
      extractedAt: new Date().toISOString(),
    },
  };
}

function unique(values: Array<string | undefined>, limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function collectDriveCentricLeadPage(): InjectedPageSnapshot {
  const visibleTextLimit = 80000;
  function text(element: Element | Document | null | undefined) {
    if (!element) return '';
    return (((element as HTMLElement).innerText || element.textContent || '') as string).replace(/\s+/g, ' ').trim();
  }

  function visible(element: Element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function clean(value: string | undefined | null) {
    return value?.replace(/\s+/g, ' ').trim();
  }

  function cleanVehicleTail(value: string | undefined | null) {
    return clean(
      value
        ?.replace(/\b(?:Trade[-\s]?in\s+Add|Add Source|Source\s+Phone|Date\s+Created|Open Deal|Wish List|Best Contact Method|Customer Notes|Sales\s*[12]|Service BDC|BDC|Customer #|Garage|Interested|Trade[-\s]?in|Source|Phone|Internet|ILM|RunMyLease)\b.*$/i, '')
        .replace(/\b\d{2,5}\s+lease\b.*$/i, '')
        .replace(/\blease\s+special\b.*$/i, ''),
    );
  }

  function unique<T>(values: T[]) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function visibleImageContext(root: ParentNode = document) {
    return unique(
      Array.from(root.querySelectorAll('img'))
        .filter(visible)
        .map((image) => {
          const src = image.currentSrc || image.src;
          const alt = image.alt || image.title || image.getAttribute('aria-label') || '';
          const rect = image.getBoundingClientRect();
          const nearby = clean((image.closest('li, article, [class*="message" i], [class*="timeline" i], [class*="media" i], [class*="content" i]') as HTMLElement | null)?.innerText);
          if (!src && !alt && !nearby) return undefined;
          if (/minilogo|avatar|profile|intercom|sprite|favicon|logo/i.test(`${src} ${alt}`)) return undefined;
          const size = rect.width && rect.height ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : undefined;
          return [
            'Visible image attachment/context',
            alt ? `alt/title: ${alt}` : undefined,
            size ? `size: ${size}` : undefined,
            src ? `url: ${src}` : undefined,
            nearby ? `nearby text: ${nearby.slice(0, 500)}` : undefined,
          ]
            .filter(Boolean)
            .join(' | ');
        }),
    ).slice(0, 12);
  }

  function automationHints(value: string) {
    const hints: string[] = [];
    if (/\bclaire\b/i.test(value)) hints.push('Claire appears in the page context. Claire is DriveCentric AI bot automation, not the shopper.');
    if (/\bblast\b/i.test(value)) hints.push('Blast appears in the page context. Treat blast outreach as automation, not a human salesperson or customer-authored reply.');
    if (/\bauto(?:mated|mation)?\b/i.test(value)) hints.push('Auto/automated appears in the page context. Treat automated outreach as automation, not human conversation.');
    return hints;
  }

  function scoreRoot(element: Element) {
    const rootText = text(element);
    const rect = (element as HTMLElement).getBoundingClientRect();
    let score = Math.min((rect.width * rect.height) / 50000, 30);
    if (/^MAT-DIALOG-CONTAINER$/i.test(element.tagName)) score += 100;
    if (/^DRC-DEAL-CARD$/i.test(element.tagName)) score += 90;
    if (element.matches('[role="dialog"], .cdk-overlay-pane')) score += 70;
    if (element.querySelector('.deal-header, drc-deal-card')) score += 50;
    if (/\bActivity\b/i.test(rootText) && /\bConversation\b/i.test(rootText)) score += 40;
    if (/\bBest Contact Method\b/i.test(rootText) && /\bOpen Deal\b/i.test(rootText)) score += 35;
    if (/\bText From Customer\b/i.test(rootText)) score += 25;
    if (/\bSales Engagement Hub\b/i.test(rootText) && /\bAdd Filter\b/i.test(rootText)) score -= 150;
    if (element.querySelector('table, mat-table, cdk-virtual-scroll-viewport')) score -= 100;
    return score;
  }

  const roots = Array.from(
    document.querySelectorAll('mat-dialog-container, .cdk-overlay-pane drc-deal-card, drc-deal-card, [role="dialog"], [aria-modal="true"], .cdk-overlay-pane'),
  )
    .filter(visible)
    .filter((element) => /\b(Activity|Conversation|Best Contact Method|Open Deal|New Deal|Text From Customer)\b/i.test(text(element)))
    .sort((left, right) => scoreRoot(right) - scoreRoot(left));
  const root = roots[0] ?? document.body;
  const rootText = text(root);
  const lines = unique(rootText.split(/\n|\r/).map(clean).filter(Boolean) as string[]);
  const imageContext = visibleImageContext(root);

  const header = root.querySelector('.deal-header') ?? root.querySelector('header') ?? root;
  const headerText = text(header);
  const headerLines = unique(headerText.split(/\n|\r/).map(clean).filter(Boolean) as string[]);
  const customerName =
    clean(text(header.querySelector('h1, h2, .cust-name, .card-customer__name'))) ??
    headerLines.find((line) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/i.test(line ?? '') && !/Taverna|Chrysler|Dodge|Jeep|Ram|Fiat|Activity|Conversation|Mobile|Email|Address/i.test(line ?? ''));

  const phoneMatches = unique((rootText.match(/(?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]*[2-9]\d{2}[\s.-]*\d{4}\b/g) ?? []).map((phone) => {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : phone;
  }));
  const emails = unique(rootText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);

  const sourceLine = lines.find((line) => /\bILM\s*\/|RunMyLease|source\b/i.test(line ?? ''));
  const vehicleLine = lines.find(
    (line) =>
      /\b(?:19|20)\d{2}\s+(?:Chrysler|Dodge|Jeep|Ram|Fiat|Toyota|Honda|Ford|Chevrolet|Chevy|GMC|Nissan|Hyundai|Kia|BMW|Mercedes|Audi|Volkswagen|Subaru|Mazda|Lexus|Acura|Cadillac|Lincoln)\b/i.test(
        line ?? '',
      ) && !/\b(?:Trade[-\s]?in\s+Add|Add Source|Source\s+Phone|Date\s+Created|Open Deal|Wish List|Best Contact|Customer Notes)\b/i.test(line ?? ''),
  );
  const vehicleSource = [vehicleLine, rootText, sourceLine].filter(Boolean).join(' ');
  const slugVehicle = vehicleSource
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[/_?=&]+/g, ' ')
    .replace(/-/g, ' ')
    .match(/\b((?:19|20)\d{2})\s+(Chrysler|Dodge|Jeep|Ram|Fiat|Toyota|Honda|Ford|Chevrolet|Chevy|GMC|Nissan|Hyundai|Kia|BMW|Mercedes|Audi|Volkswagen|Subaru|Mazda|Lexus|Acura|Cadillac|Lincoln)\s+([A-Za-z0-9 ]{1,80})/i);
  const vehicleOfInterest = slugVehicle
    ? clean(
        [
          slugVehicle[1],
          slugVehicle[2]?.replace(/^Chevy$/i, 'Chevrolet'),
          cleanVehicleTail(slugVehicle[3])
            ?.split(/\s+/)
            .map((part) => (/^\d/.test(part) || /^[A-Z0-9]{2,}$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
            .join(' '),
        ]
          .filter(Boolean)
          .join(' '),
      )
    : undefined;

  const addressLine = lines.find((line) => /^Address\s+[A-Z][A-Za-z .'-]+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(line ?? ''));
  const customerLocation = addressLine?.replace(/^Address\s+/i, '');
  const customerZipCode = customerLocation?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
  const appointmentStatus = lines.find((line) => /\b(Engaged|Visit|Proposal|Sold|Delivered|First Contact|Price)\b/i.test(line ?? ''));
  const salespersonName = rootText.match(/\bSales\s*1\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})\b/i)?.[1];

  const timeline = Array.from(root.querySelectorAll('li[drctimelineitem], [drctimelineitem], .timeline-item'))
    .filter(visible)
    .map((item) => {
      const itemClass = item.getAttribute('class') ?? '';
      const header = item.querySelector('.cmp-tml-hd');
      const body = item.querySelector('.cmp-tml-bd.is-content, .cmp-tml-bd:not(.is-media), .note-message, .deal-import-message');
      const eventType = clean(text(header?.querySelector('span') ?? header)) || (/customer/i.test(itemClass) ? 'Text From Customer' : /user/i.test(itemClass) ? 'Text To Customer' : undefined);
      const speakerName = clean(text(item.querySelector('.item-user-fullname'))?.replace(/^[\s•]+/, ''));
      const timestampLabel = clean(text(item.querySelector('.item-details, time, [class*="timestamp" i]'))?.replace(/^[\s•]+/, ''));
      const bodyText = clean(text(body));
      if (!bodyText && !eventType) return undefined;
      const automationText = `${eventType ?? ''} ${itemClass} ${speakerName ?? ''} ${bodyText ?? ''}`;
      const isDealerMarketing = /\b(?:flash sales event|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|are you on the way to the dealership|sales event|we can uber you|no payments for|coupon|respectfully,|taverna chrysler|taverna automotive)\b/i.test(
        automationText,
      );
      const actor = isDealerMarketing
        ? 'automation'
        : /from customer|\bcustomer\b/i.test(`${eventType ?? ''} ${itemClass}`)
        ? 'customer'
        : /\b(claire|blast|auto(?:mated|mation)?|caddy)\b/i.test(automationText)
          ? 'automation'
          : /note|task|deal imported|deal created/i.test(eventType ?? '')
            ? 'system'
            : 'salesperson';
      const direction = actor === 'customer' ? 'inbound' : actor === 'system' ? 'internal' : 'outbound';
      const channel = /email/i.test(`${eventType ?? ''} ${itemClass}`) ? 'email' : /phone|call/i.test(`${eventType ?? ''} ${itemClass}`) ? 'call' : /video/i.test(`${eventType ?? ''} ${itemClass}`) ? 'video' : /note/i.test(`${eventType ?? ''} ${itemClass}`) ? 'note' : 'text';
      return {
        actor,
        direction,
        channel,
        ...(speakerName ? { speakerName } : {}),
        ...(timestampLabel ? { timestampLabel } : {}),
        ...(bodyText ? { text: bodyText.slice(0, 3000) } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 80) as NonNullable<LeadContext['conversationTimeline']>;
  const mediaTimeline: NonNullable<LeadContext['conversationTimeline']> = imageContext.filter((image): image is string => Boolean(image)).map((image) => ({
    actor: 'system' as const,
    direction: 'internal' as const,
    channel: 'video' as const,
    speakerName: 'Visible Media',
    text: image.slice(0, 3000),
  }));
  const fullTimeline: NonNullable<LeadContext['conversationTimeline']> = [...timeline, ...mediaTimeline].slice(0, 80);
  const customerTimeline = fullTimeline.filter(
    (entry) =>
      entry.actor === 'customer' &&
      entry.direction === 'inbound' &&
      entry.text &&
      !/\b(?:flash sales event|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|are you on the way to the dealership|sales event|we can uber you|no payments for|coupon|respectfully,|taverna chrysler|taverna automotive)\b/i.test(entry.text),
  );
  const timelineText = fullTimeline
    .map((entry) => [entry.timestampLabel, entry.actor === 'customer' ? 'Customer' : entry.actor, entry.direction, entry.channel, entry.speakerName, entry.text].filter(Boolean).join(' | '))
    .join('\n');
  const latestCustomer = customerTimeline[0]?.text;
  const priorMessages = unique([
    latestCustomer ? `Customer truth read: Latest customer-authored text: "${latestCustomer}"` : undefined,
    ...fullTimeline.map((entry) => [entry.timestampLabel, entry.actor === 'customer' ? 'Customer' : entry.actor, entry.text].filter(Boolean).join(' | ')),
  ].filter(Boolean) as string[]).slice(0, 80);

  return {
    title: document.title,
    url: location.href,
    isLeadPage: true,
    conversationId: `drivecentric-${Math.abs(rootText.split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0))}`,
    context: {
      pageUrl: location.href,
      customerName,
      customerLocation,
      customerZipCode,
      phoneNumbers: phoneMatches,
      emails,
      personalizationSignals: [],
      similarInventory: [],
      mentionedVehicles: [],
      vehicleOfInterest,
      leadSource: sourceLine,
      appointmentStatus,
      salespersonName,
      priorMessages,
      conversationTimeline: fullTimeline,
      timestamps: unique(fullTimeline.map((entry) => entry.timestampLabel).filter(Boolean) as string[]),
      callRecordingLinks: [],
      crmAutomationHints: automationHints(rootText),
      visibleText: [
        `DriveCentric structured timeline (newest first):`,
        timelineText,
        imageContext.length ? ['Visible image attachments / media context:', ...imageContext].join('\n') : undefined,
        rootText,
      ].filter(Boolean).join('\n').slice(0, visibleTextLimit),
      sentiment: latestCustomer ? 'positive' : 'unknown',
      leadScore: latestCustomer ? 'hot' : 'warm',
      customerIntelligence: {
        customerIntent: latestCustomer,
        likelyCaresAbout: latestCustomer ? ['responding to the latest customer activity'] : [],
        painPoints: [],
        nonNegotiables: [],
        buyingSignals: latestCustomer ? ['Customer replied in the activity timeline'] : [],
        objections: [],
        missingInfo: customerZipCode ? [] : ['ZIP for taxes, incentives, and distance'],
        bestNextQuestion: latestCustomer ? 'Acknowledge the latest customer message and guide the next step.' : 'Open the visible Activity/Conversation history or paste the customer message.',
        bestNextMove: latestCustomer ? 'Respond to the latest customer message.' : 'Get the latest customer-authored message before generating.',
        suggestedTone: 'warm, direct, and helpful',
      },
      qualification: {
        known: unique([customerZipCode ? `ZIP ${customerZipCode}` : undefined, vehicleOfInterest].filter(Boolean) as string[]),
        missing: customerZipCode ? [] : ['ZIP for taxes, incentives, and distance'],
        highestValueQuestion: customerZipCode ? 'Confirm the customer is still coming in and who they should ask for.' : 'What ZIP should I use for taxes and fees?',
        creditAppAppropriate: false,
        appointmentAppropriate: Boolean(latestCustomer && /driving|on my way|coming|today/i.test(latestCustomer)),
        reason: 'Use the visible DriveCentric activity timeline as the source of truth.',
      },
      parserDebug: {
        messagesParsedCount: fullTimeline.length,
        latestCustomerMessageFound: Boolean(latestCustomer),
        warnings: [
          ...(latestCustomer ? [] : ['Latest customer message not found']),
          ...(imageContext.length ? [`${imageContext.length} visible image attachment(s) detected. Use as decision context; do not pretend pixel details unless described.`] : []),
        ],
        ...(vehicleOfInterest ? { vehicleOfInterestConfidence: 80 } : {}),
        locationConfidence: customerZipCode ? 'zip_confirmed' : 'unknown',
        vehicleCandidates: [],
      },
      extractedAt: new Date().toISOString(),
    },
  };
}

function hash(input: string) {
  let output = 0;
  for (let index = 0; index < input.length; index += 1) {
    output = (output * 31 + input.charCodeAt(index)) >>> 0;
  }
  return output.toString(16);
}

function mergeSnapshots(tab: chrome.tabs.Tab, snapshots: InjectedPageSnapshot[]): ReadPageResponse {
  const title = tab.title ?? snapshots[0]?.title ?? 'Active page';
  const url = tab.url ?? snapshots[0]?.url ?? '';
  const contexts = snapshots.map((snapshot) => snapshot.context);
  const authoritativeSnapshot = snapshots.find(
    (snapshot) =>
      (snapshot.context.conversationTimeline ?? []).length > 0 ||
      /DriveCentric structured timeline \(newest first\)/i.test(snapshot.context.visibleText ?? ''),
  );
  const textSnapshots = authoritativeSnapshot ? [authoritativeSnapshot] : snapshots;
  const textContexts = authoritativeSnapshot ? [authoritativeSnapshot.context] : contexts;
  const scopedContexts = authoritativeSnapshot ? textContexts : contexts;
  const visibleText = snapshots
    .map((snapshot, index) => [`Frame ${index + 1}: ${snapshot.title || snapshot.url}`, snapshot.context.visibleText].filter(Boolean).join('\n'))
    .join('\n\n')
    .slice(0, maxVisibleTextLength);
  const authoritativeVisibleText = textSnapshots
    .map((snapshot, index) => [`Frame ${index + 1}: ${snapshot.title || snapshot.url}`, snapshot.context.visibleText].filter(Boolean).join('\n'))
    .join('\n\n')
    .slice(0, maxVisibleTextLength);
  const firstFrom = <K extends keyof LeadContext>(source: LeadContext[], key: K) => source.find((context) => Boolean(context[key]))?.[key];
  const first = <K extends keyof LeadContext>(key: K) => firstFrom(contexts, key);
  const firstText = <K extends keyof LeadContext>(key: K) => firstFrom(textContexts, key) ?? first(key);

  const phoneNumbers = unique(scopedContexts.flatMap((context) => context.phoneNumbers ?? []), 12);
  const emails = unique(scopedContexts.flatMap((context) => context.emails ?? []), 12);
  const callRecordingLinks = unique(scopedContexts.flatMap((context) => context.callRecordingLinks ?? []), 5);
  const personalizationSignals = unique(textContexts.flatMap((context) => context.personalizationSignals ?? []), 30);
  const priorMessages = unique(textContexts.flatMap((context) => context.priorMessages ?? []), 80);
  const conversationTimeline = textContexts
    .flatMap((context) => context.conversationTimeline ?? [])
    .filter((entry) => entry.text || entry.timestampLabel || entry.speakerName)
    .reduce<LeadContext['conversationTimeline']>((output, entry) => {
      const key = [entry.actor, entry.direction, entry.channel, entry.speakerName, entry.timestampLabel, entry.text].filter(Boolean).join('|');
      if (!output.some((item) => [item.actor, item.direction, item.channel, item.speakerName, item.timestampLabel, item.text].filter(Boolean).join('|') === key)) {
        output.push(entry);
      }
      return output;
    }, [])
    .slice(0, 60);
  const timestamps = unique(scopedContexts.flatMap((context) => context.timestamps ?? []), 24);
  const crmAutomationHints = unique(scopedContexts.flatMap((context) => context.crmAutomationHints ?? []), 12);

  const context: LeadContext = {
    pageUrl: url,
    customerName: firstText('customerName') as string | undefined,
    customerLocation: firstText('customerLocation') as string | undefined,
    customerZipCode: (firstText('customerZipCode') as string | undefined) ?? extractZipCodeFromText(contexts.map((context) => context.customerLocation).join('\n')),
    phoneNumbers,
    emails,
    personalizationSignals,
    vehicleOfInterest: firstText('vehicleOfInterest') as string | undefined,
    stockNumber: firstText('stockNumber') as string | undefined,
    tradeInfo: firstText('tradeInfo') as string | undefined,
    paymentBudgetHints: firstText('paymentBudgetHints') as string | undefined,
    leadSource: firstText('leadSource') as string | undefined,
    timestamps,
    priorMessages,
    conversationTimeline,
    appointmentStatus: firstText('appointmentStatus') as string | undefined,
    salespersonName: firstText('salespersonName') as string | undefined,
    callRecordingLinks,
    callTranscript: firstText('callTranscript') as string | undefined,
    callNotes: firstText('callNotes') as string | undefined,
    activitySummary: firstText('activitySummary') as string | undefined,
    crmAutomationHints,
    visibleText: authoritativeVisibleText || visibleText,
    sentiment: (first('sentiment') as LeadContext['sentiment'] | undefined) ?? 'unknown',
    leadScore: (first('leadScore') as LeadContext['leadScore'] | undefined) ?? 'warm',
    extractedAt: new Date().toISOString(),
  };

  const compliantContext = applyCommunicationCompliance(context);

  return {
    conversationId: authoritativeSnapshot?.conversationId ?? `active-page-${hash(`${url}|${authoritativeVisibleText.slice(0, 500)}`)}`,
    context: compliantContext,
    isLeadPage: snapshots.some((snapshot) => snapshot.isLeadPage),
    pageTitle: title,
    url,
  };
}

async function readPageFromTab(tab: chrome.tabs.Tab) {
  if (!tab?.id) throw new Error('Open a webpage first, then click Read Page again.');
  if (!tab.url || /^(chrome|edge|brave|about|chrome-extension):/i.test(tab.url)) {
    throw new Error('Chrome blocks extensions from reading this page. Open the customer page in a normal website tab.');
  }

  let preferredSnapshot: InjectedPageSnapshot | null = null;
  if (/drivecentric\.com/i.test(tab.url)) {
    let driveCentricReaderError = '';
    try {
      const driveCentricResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: collectDriveCentricLeadPage,
      });
      preferredSnapshot =
        driveCentricResults
          .map((result) => ({ snapshot: result.result, frameId: result.frameId }))
          .filter((item): item is { snapshot: InjectedPageSnapshot; frameId: number } => Boolean(item.snapshot))
          .sort((left, right) => driveCentricSnapshotScore(right.snapshot, right.frameId) - driveCentricSnapshotScore(left.snapshot, left.frameId))[0]
          ?.snapshot ?? null;
    } catch (error) {
      driveCentricReaderError = error instanceof Error ? error.message : String(error);
      preferredSnapshot = null;
    }
    if (!preferredSnapshot) {
      throw new Error(
        `DriveCentric reader did not attach to this tab, so Closer refused to use the generic page reader. Reload the unpacked extension, refresh DriveCentric, and try again. ${driveCentricReaderError}`.trim(),
      );
    }
  }

  let results: chrome.scripting.InjectionResult<InjectedPageSnapshot>[] = [];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: collectReadablePage,
    });
  } catch (error) {
    if (/drivecentric\.com/i.test(tab.url) && !preferredSnapshot) {
      throw new Error(
        `Closer found DriveCentric, but could not read the lead page. Refresh DriveCentric once, then click Read Lead again. ${error instanceof Error ? error.message : ''}`.trim(),
      );
    }
    throw error;
  }
  const snapshots = results.map((result) => result.result).filter((snapshot): snapshot is InjectedPageSnapshot => Boolean(snapshot));
  const merged = preferredSnapshot ? [preferredSnapshot, ...snapshots] : snapshots;
  if (!merged.length) throw new Error('I could not read this page. Refresh the tab and try Read Page again.');
  const page = mergeSnapshots(tab, merged);
  if (/drivecentric\.com/i.test(tab.url) && preferredSnapshot) {
    return {
      ...preferredSnapshot,
      pageTitle: tab.title ?? preferredSnapshot.title,
      url: tab.url,
      conversationId: preferredSnapshot.conversationId ?? `drivecentric-${hash(`${tab.url}|${preferredSnapshot.context.visibleText?.slice(0, 500) ?? ''}`)}`,
    };
  }
  if (
    /drivecentric\.com/i.test(tab.url) &&
    !(page.context.conversationTimeline ?? []).length &&
    !page.context.priorMessages?.length
  ) {
    throw new Error('Closer read DriveCentric, but no lead conversation was visible. Open the customer/deal card with the message history, then click Read Lead.');
  }
  return page;
}

function readableTab(tab: chrome.tabs.Tab | undefined) {
  if (!tab?.id || !tab.url) return false;
  return !/^(chrome|edge|brave|about|chrome-extension):/i.test(tab.url);
}

function driveCentricTab(tab: chrome.tabs.Tab | undefined) {
  return readableTab(tab) && /drivecentric\.com/i.test(tab?.url ?? '');
}

async function bestReadableTab() {
  const [currentActive] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (readableTab(currentActive)) return currentActive;

  const [lastFocusedActive] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (readableTab(lastFocusedActive)) return lastFocusedActive;

  const driveCentricTabs = await chrome.tabs.query({ url: ['https://*.drivecentric.com/*'] });
  const sortedDriveCentricTabs = driveCentricTabs
    .filter(driveCentricTab)
    .sort((left, right) => (right.active ? 1 : 0) - (left.active ? 1 : 0) || (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0));
  if (sortedDriveCentricTabs[0]) return sortedDriveCentricTabs[0];

  const allTabs = await chrome.tabs.query({});
  return allTabs
    .filter(readableTab)
    .sort((left, right) => (right.active ? 1 : 0) - (left.active ? 1 : 0) || (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
}

export async function readAnyActivePage() {
  const tab = await bestReadableTab();
  if (!tab) throw new Error('Open a webpage first, then click Read Page again.');
  return readPageFromTab(tab);
}

export async function readPageFromTabId(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  return readPageFromTab(tab);
}

export async function insertIntoActivePage(text: string) {
  const tab = await bestReadableTab();
  if (!tab?.id) throw new Error('Open a webpage first, then click Insert again.');
  if (!tab.url || /^(chrome|edge|brave|about|chrome-extension):/i.test(tab.url)) {
    throw new Error('Chrome blocks inserting text into this page.');
  }

  if (/drivecentric\.com/i.test(tab.url)) {
    try {
      const inserted = (await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_INSERT_TEXT', text })) as { inserted?: boolean };
      if (inserted?.inserted) return { inserted: true };
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['assets/content.js'],
        });
        const inserted = (await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_INSERT_TEXT', text })) as { inserted?: boolean };
        if (inserted?.inserted) return { inserted: true };
      } catch {
        // Fall through to active-element insertion when the content script is not ready.
      }
    }
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: insertIntoEditable,
    args: [text],
  });
  const inserted = results.some((result) => Boolean(result.result));
  if (!inserted) {
    throw new Error('Click the reply box on the page first, then try Insert again.');
  }
  return { inserted: true };
}
