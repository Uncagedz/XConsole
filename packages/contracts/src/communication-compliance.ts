import type { CommunicationCompliance, CommunicationComplianceStatus, LeadContext, LeadTimelineEntry } from './types.js';

interface Signal {
  type: 'opt_out' | 'opt_in';
  status: CommunicationComplianceStatus;
  text: string;
  timestampIso?: string;
  position: number;
}

const footerOptOutPattern = /\b(reply|text)\s+stop\s+(?:at any time|to opt out|to unsubscribe)\b/i;
const footerOptOutOnlyPattern = /^(?:reply|text)\s+stop\s+(?:at any time|to opt out|to unsubscribe)\.?$/i;
const explicitOptOutCommandPattern = /^(?:stop|stopall|unsubscribe|end|quit|cancel)$/i;
const smsOptOutPattern =
  /\b(stop texting|stop sending|stop messaging|no more texts?|unsubscribe|opt\s*out|remove me from (?:texts?|sms|messages)|take me off (?:texts?|sms|messages))\b/i;
const doNotContactPattern =
  /\b(do not contact|don't contact|dont contact|do not call|don't call|dont call|no calls?|leave me alone|wrong number|remove me from (?:your )?(?:list|database)|take me off (?:your )?(?:list|database)|dnc)\b/i;
const explicitOptInPattern =
  /(?:^|[\s:>"'([{.-])(?:start|unstop|subscribe|resume)(?:[\s.!?;:'")\]}-]|$)/i;
const optInPhrasePattern = /\b(you can text me|text me|please text|ok to text|okay to text|yes text|start texting|resume texting)\b/i;
const customerContextPattern = /\b(customer|client|shopper|lead|from customer|text from customer|replied|said|sent)\b/i;
const signalKeywordPattern =
  /\b(stop texting|stop sending|stop messaging|no more texts?|unsubscribe|opt\s*out|remove me|take me off|do not contact|don't contact|dont contact|do not call|don't call|dont call|leave me alone|wrong number|stop|start|unstop|subscribe|resume)\b/gi;

function clean(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFooterOrDisclosure(text: string) {
  const normalized = clean(text) ?? '';
  return (
    footerOptOutOnlyPattern.test(normalized) ||
    (normalized.length <= 180 && footerOptOutPattern.test(normalized) && /\b(?:rates?|data rates|unsubscribe)\b/i.test(normalized)) ||
    (normalized.length <= 220 && /\bstandard message and data rates\b/i.test(normalized))
  );
}

function classifyOptOut(text: string, actor?: LeadTimelineEntry['actor']): CommunicationComplianceStatus | null {
  const normalized = clean(text);
  if (!normalized || isFooterOrDisclosure(normalized)) return null;
  if (actor && ['automation', 'system', 'salesperson', 'manager'].includes(actor)) return null;
  const textWithoutFooter = clean(normalized.replace(footerOptOutPattern, '')) ?? normalized;
  if (doNotContactPattern.test(textWithoutFooter)) return 'do_not_contact';
  if (smsOptOutPattern.test(textWithoutFooter)) return 'sms_opt_out';

  const stripped = textWithoutFooter
    .replace(/^(text|sms|message|customer|shopper|client|lead|from customer|text from customer)\s*[:\-]?\s*/i, '')
    .replace(/^(replied|said|sent)\s*[:\-]?\s*/i, '')
    .replace(/^(reply|text|sms)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (explicitOptOutCommandPattern.test(stripped)) {
    return 'sms_opt_out';
  }
  if (
    /\b(?:today|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}\s*(?:am|pm))\b/i.test(stripped) &&
    /\b(?:stop|stopall|unsubscribe|end|quit|cancel)$/i.test(stripped)
  ) {
    return 'sms_opt_out';
  }
  return null;
}

function classifyOptIn(text: string, actor?: LeadTimelineEntry['actor'], sourceKind: 'message' | 'page' = 'page') {
  const normalized = clean(text);
  if (!normalized || isFooterOrDisclosure(normalized)) return false;
  if (actor && ['automation', 'system', 'salesperson', 'manager'].includes(actor)) return false;
  if (optInPhrasePattern.test(normalized)) return true;
  if (!explicitOptInPattern.test(normalized)) return false;
  const stripped = normalized
    .replace(/^(text|sms|message|customer|shopper|client|lead|from customer|text from customer)\s*[:\-]?\s*/i, '')
    .replace(/^(replied|said|sent)\s*[:\-]?\s*/i, '')
    .trim();
  if (/^(start|unstop|subscribe|resume)$/i.test(stripped)) {
    return actor === 'customer' || sourceKind === 'message' || customerContextPattern.test(normalized);
  }
  return actor === 'customer' || sourceKind === 'message' || customerContextPattern.test(normalized);
}

function signalSortValue(signal: Signal) {
  if (signal.timestampIso) {
    const parsed = Date.parse(signal.timestampIso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return signal.position;
}

function evidence(text: string) {
  const normalized = clean(text) ?? '';
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
}

function pushSignal(signals: Signal[], signal: Signal) {
  const key = `${signal.type}|${signal.status}|${signal.timestampIso ?? signal.position}|${signal.text.toLowerCase()}`;
  if (signals.some((existing) => `${existing.type}|${existing.status}|${existing.timestampIso ?? existing.position}|${existing.text.toLowerCase()}` === key)) {
    return;
  }
  signals.push(signal);
}

function signalCandidates(source: string) {
  const seen = new Set<string>();
  const output: string[] = [];
  const add = (value: string | undefined | null) => {
    const normalized = clean(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  };

  const lines = source.split(/\r?\n+/);
  for (const [index, line] of lines.entries()) {
    add(line);
    if (signalKeywordPattern.test(line)) {
      add([lines[index - 1], line].filter(Boolean).join(' '));
    }
    signalKeywordPattern.lastIndex = 0;
  }

  for (const match of source.matchAll(signalKeywordPattern)) {
    const index = match.index ?? 0;
    add(source.slice(Math.max(0, index - 120), Math.min(source.length, index + 180)));
  }

  if (source.length <= 1000) add(source);
  return output.slice(0, 80);
}

function hasStructuredConversation(context: LeadContext) {
  return (context.conversationTimeline ?? []).some((entry) => Boolean(entry.text?.trim()) && entry.direction !== 'unknown');
}

function fallbackLooksCustomerAuthored(text: string, context: LeadContext, sourceKind: 'message' | 'page') {
  if (sourceKind === 'message') return true;
  if (/\b(?:text|email)\s+from\s+customer\b/i.test(text)) return true;
  if (/\b(?:text|email)\s+to\s+customer\b/i.test(text)) return false;
  if (/\b(?:reply|text)\s+stop\s+(?:at any time|to opt out|to unsubscribe)\b/i.test(text)) return false;
  if (customerContextPattern.test(text) && !/\b(?:salesperson|manager|owner admin|claire parker|to customer)\b/i.test(text)) return true;

  const firstName = clean(context.customerName)?.split(/\s+/)[0];
  if (!firstName) return false;
  const timestampLike = /\b(?:today|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}\s*(?:am|pm))\b/i;
  return new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'i').test(text) && timestampLike.test(text);
}

export function detectCommunicationCompliance(context: LeadContext): CommunicationCompliance {
  const signals: Signal[] = [];
  const hasTimeline = hasStructuredConversation(context);

  for (const [index, entry] of (context.conversationTimeline ?? []).entries()) {
    if (entry.actor !== 'customer' || entry.direction !== 'inbound') continue;
    const text = clean([entry.speakerName, entry.timestampLabel, entry.text].filter(Boolean).join(' '));
    if (!text) continue;
    const status = classifyOptOut(entry.text ?? text, entry.actor);
    if (status) {
      pushSignal(signals, {
        type: 'opt_out',
        status,
        text: evidence(entry.text ?? text),
        position: index,
        ...(entry.timestampIso ? { timestampIso: entry.timestampIso } : {}),
      });
    }
    if (classifyOptIn(entry.text ?? text, entry.actor, 'message')) {
      pushSignal(signals, {
        type: 'opt_in',
        status: 'clear',
        text: evidence(entry.text ?? text),
        position: index,
        ...(entry.timestampIso ? { timestampIso: entry.timestampIso } : {}),
      });
    }
  }

  if (!hasTimeline) {
    const textualSources: Array<{ value: string | undefined; sourceKind: 'message' | 'page' }> = [
      ...(context.priorMessages ?? []).map((value) => ({ value, sourceKind: 'message' as const })),
      ...(context.personalizationSignals ?? []).map((value) => ({ value, sourceKind: 'page' as const })),
      { value: context.appointmentStatus, sourceKind: 'page' },
      { value: context.visibleText, sourceKind: 'page' },
    ];
    let textPosition = 10_000;
    for (const source of textualSources) {
      const candidates = source.value ? signalCandidates(source.value) : [];
      if (!candidates.length) {
        textPosition += 100;
        continue;
      }
      for (const text of candidates) {
        if (!fallbackLooksCustomerAuthored(text, context, source.sourceKind)) {
          textPosition += 1;
          continue;
        }
        const status = classifyOptOut(text);
        if (status) {
          pushSignal(signals, {
            type: 'opt_out',
            status,
            text: evidence(text),
            position: textPosition,
          });
        }
        if (classifyOptIn(text, undefined, source.sourceKind)) {
          pushSignal(signals, {
            type: 'opt_in',
            status: 'clear',
            text: evidence(text),
            position: textPosition,
          });
        }
        textPosition += 1;
      }
      textPosition += 100;
    }
  }

  const optOuts = signals.filter((signal) => signal.type === 'opt_out').sort((left, right) => signalSortValue(left) - signalSortValue(right));
  if (!optOuts.length) {
    return { status: 'clear', evidence: [] };
  }

  const lastOptOut = optOuts[optOuts.length - 1]!;
  const laterOptIn = signals
    .filter((signal) => signal.type === 'opt_in')
    .some((signal) => signalSortValue(signal) > signalSortValue(lastOptOut));

  if (laterOptIn) {
    return {
      status: 'clear',
      reason: 'Customer opted back in after a prior opt-out signal.',
      evidence: [lastOptOut.text],
      ...(lastOptOut.timestampIso ? { lastOptOutAt: lastOptOut.timestampIso } : {}),
    };
  }

  const status: CommunicationComplianceStatus = optOuts.some((signal) => signal.status === 'do_not_contact') ? 'do_not_contact' : 'sms_opt_out';
  return {
    status,
    reason:
      status === 'do_not_contact'
        ? 'Customer appears to have asked not to be contacted. Do not generate outreach without manager/compliance review.'
        : 'Customer appears to have opted out of text/SMS and no later START/opt-in was found.',
    evidence: optOuts.slice(-3).map((signal) => signal.text),
    ...(lastOptOut.timestampIso ? { lastOptOutAt: lastOptOut.timestampIso } : {}),
  };
}

export function applyCommunicationCompliance(context: LeadContext): LeadContext {
  const communicationCompliance = detectCommunicationCompliance(context);
  if (communicationCompliance.status === 'clear') {
    return { ...context, communicationCompliance };
  }
  const signal =
    communicationCompliance.status === 'do_not_contact'
      ? 'Do-not-contact signal detected. Do not send outreach unless a manager verifies compliance.'
      : 'SMS opt-out detected. Do not text or email this customer unless a later START/opt-in is verified.';
  return {
    ...context,
    communicationCompliance,
    leadScore: 'cold',
    sentiment: 'negative',
    personalizationSignals: [signal, ...(context.personalizationSignals ?? [])].slice(0, 30),
  };
}
