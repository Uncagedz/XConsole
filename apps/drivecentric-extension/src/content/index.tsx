import type { ContentScriptRequest, ReadInventoryResponse, ReadPageResponse } from '../shared/messages';
import { parseDriveCentricPage } from './drivecentric/parser';
import { parseDealerInventoryPage } from './inventory/parser';
import { insertTextIntoDriveCentric } from './page-actions';
import { extractXmlLeadEnhancement, mergeXmlEnhancement } from './xml/extractor';

type ParsedDriveCentricPage = ReturnType<typeof parseDriveCentricPage>;

function hasCustomerConversation(page: { context: ReadPageResponse['context'] }) {
  return (page.context.conversationTimeline ?? []).some((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim());
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function normalizedText(element: Element) {
  return ((element as HTMLElement).innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
}

function visible(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function activeLeadRoot() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'mat-dialog-container',
        '[role="dialog"]',
        '.cdk-overlay-pane',
        'drc-deal-card',
        '.deal-card',
        '.deal-header',
      ].join(', '),
    ),
  )
    .filter(visible)
    .sort((left, right) => scoreActiveLeadRoot(right) - scoreActiveLeadRoot(left));
  return candidates[0] ?? document.body;
}

function scoreActiveLeadRoot(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const text = normalizedText(element);
  let score = Math.min((rect.width * rect.height) / 50000, 40);
  if (/^MAT-DIALOG-CONTAINER$/i.test(element.tagName)) score += 80;
  if (/^DRC-DEAL-CARD$/i.test(element.tagName)) score += 75;
  if (element.matches('[role="dialog"], .cdk-overlay-pane')) score += 70;
  if (element.querySelector('drc-deal-card, .deal-header')) score += 45;
  if (/\bActivity\b/i.test(text) && /\bConversation\b/i.test(text)) score += 30;
  if (/\bNew Deal\b/i.test(text) && /\bMark as Sold\b/i.test(text)) score += 25;
  if (/\bBest Contact Method\b/i.test(text) && /\bOpen Deal\b/i.test(text)) score += 20;
  if (/\bSales Engagement Hub\b/i.test(text) && /\bAdd Filter\b/i.test(text)) score -= 120;
  if (element.querySelector('table, mat-table, cdk-virtual-scroll-viewport')) score -= 80;
  return score;
}

function clickDriveCentricTab(tabName: 'Activity' | 'Conversation') {
  const root = activeLeadRoot();
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('button, [role="tab"], a, li, div, span'))
    .filter(visible)
    .filter((element) => new RegExp(`^${tabName}$`, 'i').test(normalizedText(element)))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftClickable = ['BUTTON', 'A'].includes(left.tagName) || left.getAttribute('role') === 'tab' ? 1 : 0;
      const rightClickable = ['BUTTON', 'A'].includes(right.tagName) || right.getAttribute('role') === 'tab' ? 1 : 0;
      return rightClickable - leftClickable || leftRect.top - rightRect.top;
    });
  const target = candidates[0]?.closest<HTMLElement>('button, [role="tab"], a, li, div') ?? candidates[0];
  if (!target) return false;
  target.click();
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

function scrollLeadSurfaces(amount: number) {
  const root = activeLeadRoot();
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'))
    .filter(visible)
    .filter((element) => element.scrollHeight > element.clientHeight + 80)
    .sort((left, right) => right.clientWidth * right.clientHeight - left.clientWidth * left.clientHeight);

  const scrollTargets = uniqueElements([
    ...candidates.slice(0, 8),
    document.scrollingElement instanceof HTMLElement ? document.scrollingElement : undefined,
    document.documentElement,
    document.body,
  ]);

  let moved = false;
  for (const target of scrollTargets) {
    const before = target.scrollTop;
    target.scrollTop = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, target.scrollTop + amount));
    if (target.scrollTop !== before) {
      target.dispatchEvent(new Event('scroll', { bubbles: true }));
      moved = true;
    }
  }

  if (!moved) {
    window.scrollBy({ top: amount, behavior: 'instant' });
  }
  return moved;
}

function uniqueElements(elements: Array<HTMLElement | undefined>) {
  const seen = new Set<HTMLElement>();
  const output: HTMLElement[] = [];
  for (const element of elements) {
    if (!element || seen.has(element)) continue;
    seen.add(element);
    output.push(element);
  }
  return output;
}

function clickElement(element: HTMLElement) {
  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  element.click();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function visibleTextCandidates(pattern: RegExp) {
  const root = activeLeadRoot();
  return Array.from(root.querySelectorAll<HTMLElement>('button, a, [role="button"], div, span'))
    .filter(visible)
    .filter((element) => pattern.test(normalizedText(element)))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftClickable = ['BUTTON', 'A'].includes(left.tagName) || left.getAttribute('role') === 'button' ? 1 : 0;
      const rightClickable = ['BUTTON', 'A'].includes(right.tagName) || right.getAttribute('role') === 'button' ? 1 : 0;
      return rightClickable - leftClickable || leftRect.top - rightRect.top;
    });
}

function closeDriveCentricModal() {
  const modal = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], .cdk-overlay-pane, mat-dialog-container'))
    .filter(visible)
    .sort((left, right) => right.getBoundingClientRect().width * right.getBoundingClientRect().height - left.getBoundingClientRect().width * left.getBoundingClientRect().height)[0];
  const closeButton = modal
    ? Array.from(modal.querySelectorAll<HTMLElement>('button, [role="button"], .close, [class*="close" i], [aria-label*="close" i]'))
        .filter(visible)
        .find((element) => /^(x|×|close)$/i.test(normalizedText(element)) || /close/i.test(element.getAttribute('aria-label') ?? element.className))
    : undefined;
  if (closeButton) {
    clickElement(closeButton);
    return true;
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  return false;
}

async function collectCallSummaryReads(pages: ParsedDriveCentricPage[]) {
  const candidates = visibleTextCandidates(/\bCall Summary\b/i)
    .map((element) => element.closest<HTMLElement>('button, a, [role="button"], div') ?? element)
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .slice(0, 3);

  for (const candidate of candidates) {
    clickElement(candidate);
    await sleep(900);
    const parsed = parseDriveCentricPage(document, window.location.href);
    pages.push(parsed);
    if (/\bCall Summary\b/i.test(parsed.context.visibleText ?? '') || parsed.context.callNotes) {
      closeDriveCentricModal();
      await sleep(350);
    }
  }
}

function pageReadScore(page: ParsedDriveCentricPage) {
  const timeline = page.context.conversationTimeline ?? [];
  const inbound = timeline.filter((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim()).length;
  const outbound = timeline.filter((entry) => entry.direction === 'outbound' && entry.text?.trim()).length;
  const hasCallSummary = /\b(call summary|best payment|down payment|wants to finalize|ready to close|calling for you)\b/i.test(
    [page.context.callNotes, page.context.activitySummary, page.context.visibleText].filter(Boolean).join('\n'),
  );
  const imageSignals = (page.context.priorMessages ?? []).filter((message) => /visible image attachment/i.test(message)).length;
  return (
    inbound * 1000 +
    outbound * 100 +
    (hasCallSummary ? 750 : 0) +
    imageSignals * 80 +
    timeline.length * 40 +
    (page.context.priorMessages?.length ?? 0) * 4 +
    (page.context.customerName ? 25 : 0) +
    (page.context.vehicleOfInterest ? 20 : 0) +
    (page.context.customerZipCode ? 10 : 0)
  );
}

function bestRead(pages: ParsedDriveCentricPage[]): ParsedDriveCentricPage {
  return pages.slice().sort((left, right) => pageReadScore(right) - pageReadScore(left))[0] ?? pages[0]!;
}

function lastRead(pages: ParsedDriveCentricPage[]) {
  return pages[pages.length - 1]!;
}

async function collectActivityReads(pages: ParsedDriveCentricPage[]) {
  if (!clickDriveCentricTab('Activity')) return;
  await sleep(800);
  pages.push(parseDriveCentricPage(document, window.location.href));

  await collectCallSummaryReads(pages);

  for (const amount of [650, 650, 650, -650, -650, -650, 650]) {
    scrollLeadSurfaces(amount);
    await sleep(450);
    pages.push(parseDriveCentricPage(document, window.location.href));
    await collectCallSummaryReads(pages);
  }
}

async function collectConversationReads(pages: ParsedDriveCentricPage[]) {
  if (!clickDriveCentricTab('Conversation')) return;
  await sleep(900);
  pages.push(parseDriveCentricPage(document, window.location.href));
  await collectCallSummaryReads(pages);

  for (const amount of [550, 550, -550, -550]) {
    scrollLeadSurfaces(amount);
    await sleep(350);
    pages.push(parseDriveCentricPage(document, window.location.href));
    await collectCallSummaryReads(pages);
  }
}

async function readDriveCentricPage() {
  const first = parseDriveCentricPage(document, window.location.href);
  if (!/drivecentric\.com/i.test(window.location.href)) return first;

  const pages: ParsedDriveCentricPage[] = [first];
  await collectActivityReads(pages);
  await collectConversationReads(pages);
  return bestRead(pages);
}

chrome.runtime.onMessage.addListener((message: ContentScriptRequest, _sender, sendResponse) => {
  if (message.type === 'CONTENT_READ_PAGE' || message.type === 'CONTENT_READ_PAGE_V2') {
    void (async () => {
      const parsed = await readDriveCentricPage();
      const xmlEnhancement = await extractXmlLeadEnhancement(document, window.location.href);
      sendResponse({
        ...parsed,
        context: mergeXmlEnhancement(parsed.context, xmlEnhancement),
        pageTitle: document.title,
        url: window.location.href,
      } satisfies ReadPageResponse);
    })();
    return true;
  }

  if (message.type === 'CONTENT_INSERT_TEXT') {
    sendResponse({ inserted: insertTextIntoDriveCentric(message.text) });
    return true;
  }

  if (message.type === 'CONTENT_READ_INVENTORY') {
    sendResponse({
      url: window.location.href,
      vehicles: parseDealerInventoryPage(document, window.location.href),
    } satisfies ReadInventoryResponse);
    return true;
  }

  return false;
});
