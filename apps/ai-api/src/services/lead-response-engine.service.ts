import type {
  AiGenerateRequest,
  LeadContext,
  LeadTemperature,
  LeadTimelineEntry,
  QuickAction,
  Tone,
} from '@drivecentric-ai/shared';
import type { Dealership, User, WorkflowRule } from '@prisma/client';
import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from './llm/provider.js';

export const SAFE_OPENAI_FALLBACK_TEXT =
  "I’m checking the real details now so I don’t waste your time. I’ll get the next step clear before we move anything forward.";

export type LeadIntent =
  | 'availability'
  | 'price'
  | 'payment'
  | 'trade_in'
  | 'financing'
  | 'appointment_test_drive'
  | 'vehicle_question'
  | 'condition_history'
  | 'media_request'
  | 'hold_deposit'
  | 'delivery_shipping'
  | 'out_of_state_purchase'
  | 'ready_to_buy'
  | 'signed_or_paperwork_done'
  | 'objection'
  | 'ghosted'
  | 'angry_confused'
  | 'low_intent'
  | 'general_interest';

export type LocationCategory = 'local' | 'out_of_state' | 'unknown';

export interface LeadResponseEngineInput {
  request: AiGenerateRequest;
  user: User & { dealership: Dealership };
  workflowRules: WorkflowRule[];
  llm: LlmProvider;
}

export interface LeadResponseEngineResult {
  result: LlmGenerateResult;
  prompt: LlmGenerateInput;
  detectedIntent: LeadIntent;
  locationCategory: LocationCategory;
  chosenStrategy: string;
  latestCustomerMessage: string;
}

export interface DealershipResponseSettings {
  dealershipName: string;
  salespersonTone: string;
  preferredCallToAction: string;
  localCustomerStrategy: string;
  outOfStateCustomerStrategy: string;
  financeApplicationLink?: string;
  appointmentLink?: string;
  phoneNumber?: string;
  pushAppointment: boolean;
  pushFinanceApp: boolean;
  pushPhoneCall: boolean;
  pushRemotePurchase: boolean;
  maximumResponseLength: number;
}

type ConversationDigestEntry = {
  label: string;
  actor?: LeadTimelineEntry['actor'];
  direction?: LeadTimelineEntry['direction'];
  channel?: LeadTimelineEntry['channel'];
  speakerName?: string;
  timestamp?: string;
  text?: string;
  canControlReply: boolean;
};

const latestFirst = (messages: LeadTimelineEntry[]) =>
  [...messages].sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
    if (Number.isFinite(leftTime)) return -1;
    if (Number.isFinite(rightTime)) return 1;
    return 0;
  });

function clean(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function lower(value: string | undefined | null) {
  return clean(value).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringSetting(settings: Record<string, unknown>, keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function booleanSetting(settings: Record<string, unknown>, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

function numberSetting(settings: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  return values.map((value) => value?.trim()).find(Boolean);
}

function compactText(value: string | undefined, max = 1200) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function vehicleLabel(context: LeadContext) {
  const details = context.vehicleOfInterestDetails;
  const fromDetails = [details?.year, details?.make, details?.model, details?.trim].filter(Boolean).join(' ');
  return firstNonEmpty(context.vehicleOfInterest, fromDetails, details?.rawText);
}

function isOutboundOrInternalTimelineText(entry: LeadTimelineEntry) {
  const combined = `${entry.speakerName ?? ''} ${entry.timestampLabel ?? ''} ${entry.text ?? ''} ${entry.channel ?? ''}`.toLowerCase();

  return /\b(text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail|voicemail left|left a voicemail|note|crm note|manager note|task|planned|automation|claire|system|touchpoint|visit stage|sales touchpoint|deal imported|duplicate lead|website visit)\b/i.test(
    combined,
  );
}

function isTrueCustomerEntry(entry: LeadTimelineEntry) {
  return (
    entry.actor === 'customer' &&
    entry.direction === 'inbound' &&
    entry.channel !== 'note' &&
    Boolean(entry.text?.trim()) &&
    !isOutboundOrInternalTimelineText(entry)
  );
}

function isDealerEntry(entry: LeadTimelineEntry) {
  return (
    Boolean(entry.text?.trim()) &&
    entry.actor !== 'customer' &&
    entry.direction !== 'internal' &&
    (entry.direction === 'outbound' || entry.actor === 'salesperson' || entry.actor === 'manager' || entry.actor === 'automation')
  );
}

function normalizedMessageText(value: string | undefined) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameTextAsDealerOutbound(candidate: LeadTimelineEntry, context: LeadContext) {
  const candidateText = normalizedMessageText(candidate.text);
  if (!candidateText) return false;

  return (context.conversationTimeline ?? []).some((entry) => {
    if (entry === candidate) return false;
    if (!isDealerEntry(entry)) return false;
    return normalizedMessageText(entry.text) === candidateText;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactForSearch(value: string | undefined) {
  return clean(value)
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function textAppearsAsOutboundInRawContext(text: string | undefined, context: LeadContext) {
  const candidate = compactForSearch(text);
  if (!candidate || candidate.length < 4) return false;

  const sources = [
    context.visibleText,
    ...(context.priorMessages ?? []),
    ...(context.conversationTimeline ?? []).map((entry) =>
      [entry.actor, entry.direction, entry.channel, entry.speakerName, entry.timestampLabel, entry.text].filter(Boolean).join(' '),
    ),
  ]
    .filter(Boolean)
    .join('\n');

  if (!sources) return false;

  const normalizedSources = compactForSearch(sources);
  const candidatePattern = escapeRegExp(candidate).replace(/\s+/g, '\\s+');
  const outboundBefore = new RegExp(
    `(?:Text To Customer|Email To Customer|Call To Customer|Outbound Call|Phone Task|DEALERSHIP SENT|HISTORY ONLY)[\\s\\S]{0,500}${candidatePattern}`,
    'i',
  );
  const outboundAfter = new RegExp(
    `${candidatePattern}[\\s\\S]{0,220}(?:Text To Customer|Email To Customer|Call To Customer|Outbound Call|Phone Task|DEALERSHIP SENT|HISTORY ONLY)`,
    'i',
  );

  return outboundBefore.test(normalizedSources) || outboundAfter.test(normalizedSources);
}

function latestCustomerTimelineMessage(context: LeadContext) {
  return latestFirst(context.conversationTimeline ?? []).find(
    (entry) =>
      isTrueCustomerEntry(entry) &&
      !sameTextAsDealerOutbound(entry, context) &&
      !textAppearsAsOutboundInRawContext(entry.text, context),
  );
}

function latestDealerTimelineMessage(context: LeadContext) {
  return latestFirst(context.conversationTimeline ?? []).find(isDealerEntry);
}

export function getLatestCustomerMessage(context: LeadContext) {
  const timelineMessage = latestCustomerTimelineMessage(context);

  if (timelineMessage?.text?.trim()) {
    return timelineMessage.text.trim();
  }

  const priorMessage = (context.priorMessages ?? [])
    .map((message) => message.trim())
    .find(
      (message) =>
        /^(text from customer|email from customer|chat from customer|customer reply|web lead|customer said|customer:)\b/i.test(message) &&
        !/\b(text to customer|email to customer|call to customer|outbound|voicemail|note|task|claire|automation|system)\b/i.test(message),
    );

  if (priorMessage) {
    const cleanedPrior = priorMessage
      .replace(/^(text from customer|email from customer|chat from customer|customer reply|web lead|customer said|customer)\s*:?\s*/i, '')
      .trim();

    if (!textAppearsAsOutboundInRawContext(cleanedPrior, context)) return cleanedPrior;
  }

  return '';
}

function settingsFor(user: User & { dealership: Dealership }): DealershipResponseSettings {
  const settings = asRecord(user.dealership.settings);
  const nested = {
    ...asRecord(settings.aiResponseEngine),
    ...asRecord(settings.responseEngine),
    ...asRecord(settings.leadResponse),
  };
  const merged = { ...settings, ...nested };
  const financeApplicationLink = stringSetting(merged, ['financeApplicationLink', 'creditAppLink', 'financeAppUrl']);
  const appointmentLink = stringSetting(merged, ['appointmentLink', 'schedulerLink']);
  const phoneNumber = stringSetting(merged, ['phoneNumber', 'storePhone', 'salesPhone']);

  const settingsResult: DealershipResponseSettings = {
    dealershipName: firstNonEmpty(stringSetting(merged, ['dealershipName', 'storeName']), user.signatureDealershipName, user.dealership.name)!,
    salespersonTone:
      stringSetting(merged, ['salespersonTone', 'defaultTone'], 'cool, friendly, confident, casual, sharp, and still professional') ??
      'cool, friendly, confident, casual, sharp, and still professional',
    preferredCallToAction:
      stringSetting(merged, ['preferredCallToAction', 'preferredCta'], 'Let the AI choose the best next move from the conversation') ??
      'Let the AI choose the best next move from the conversation',
    localCustomerStrategy:
      stringSetting(
        merged,
        ['localCustomerStrategy'],
        'For local shoppers, answer first and only close for an appointment when it makes sense from the actual conversation.',
      ) ?? 'For local shoppers, answer first and only close for an appointment when it makes sense from the actual conversation.',
    outOfStateCustomerStrategy:
      stringSetting(
        merged,
        ['outOfStateCustomerStrategy', 'remoteCustomerStrategy'],
        'For remote shoppers, verify vehicle, condition, numbers, documents, pickup, or shipping before travel.',
      ) ?? 'For remote shoppers, verify vehicle, condition, numbers, documents, pickup, or shipping before travel.',
    pushAppointment: booleanSetting(merged, ['pushAppointment', 'allowAppointmentPush'], false),
    pushFinanceApp: booleanSetting(merged, ['pushFinanceApp', 'allowFinanceAppPush'], false),
    pushPhoneCall: booleanSetting(merged, ['pushPhoneCall', 'allowPhoneCallPush'], false),
    pushRemotePurchase: booleanSetting(merged, ['pushRemotePurchase', 'allowRemotePurchasePush'], true),
    maximumResponseLength: Math.max(80, Math.min(1200, numberSetting(merged, ['maximumResponseLength', 'maxResponseLength'], 420))),
  };

  if (financeApplicationLink) settingsResult.financeApplicationLink = financeApplicationLink;
  if (appointmentLink) settingsResult.appointmentLink = appointmentLink;
  if (phoneNumber) settingsResult.phoneNumber = phoneNumber;

  return settingsResult;
}

function selectedTone(tone: Tone) {
  const labels: Record<Tone, string> = {
    standard_closer: 'cool, confident, direct, friendly salesperson',
    soft_consultative: 'warm and relaxed, but still useful and forward-moving',
    aggressive_appointment_setter: 'strong and assumptive only when the customer is actually appointment-ready',
    manager_takeover: 'manager-level calm authority, direct, clear, and human',
  };
  return labels[tone] ?? tone;
}

function selectedAction(action: QuickAction) {
  const labels: Record<QuickAction, string> = {
    generate_reply: 'read the whole lead and decide the best reply',
    rewrite_shorter: 'make the reply shorter without losing the actual logic',
    rewrite_stronger: 'make the reply more direct and closing-oriented only if appropriate',
    humanize: 'make it sound more natural and less scripted',
    appointment_push: 'push appointment only if the current conversation supports it',
    trade_in_push: 'focus on trade only if trade is relevant or missing',
    finance_push: 'focus on finance only if finance/payment/approval is relevant or requested',
    reengage_ghosted: 'restart naturally without sounding needy',
    confirm_appointment: 'confirm appointment and reduce friction',
    missed_appointment_follow_up: 'recover the missed appointment naturally',
    sold_follow_up: 'thank customer and continue post-sale relationship',
  };
  return labels[action] ?? action;
}

export function classifyLeadIntent(customerMessage: string, context: LeadContext): LeadIntent {
  const text = lower(customerMessage);
  const full = lower(
    [
      customerMessage,
      context.vehicleOfInterest,
      context.tradeInfo,
      context.paymentBudgetHints,
      ...(context.priorMessages ?? []).slice(0, 8),
    ]
      .filter(Boolean)
      .join('\n'),
  );

  if (!text || text === '.' || text === '👍' || text.length <= 3) return 'media_request';
  if (/\b(i signed|i have signed|ive signed|i’ve signed|signed already|paperwork signed|contract signed|docs signed|documents signed|finished signing|just signed)\b/i.test(text)) {
    return 'signed_or_paperwork_done';
  }
  if (/\b(stop|unsubscribe|do not contact|wrong number|remove me|angry|frustrated|ridiculous|bait|switch|not what i asked)\b/i.test(text)) return 'angry_confused';
  if (/\b(available|availability|still there|still have|in stock|sold|pending|hold it|reserve)\b/i.test(text)) return 'availability';
  if (/\b(out the door|otd|best price|price|numbers?|fees?|tax(es)?|discount|total|cash price|selling price)\b/i.test(text)) return 'price';
  if (/\b(monthly|payment|payments|down payment|money down|per month|budget|too high)\b/i.test(text)) return 'payment';
  if (/\b(trade|trade[-\s]?in|payoff|appraisal|value my|vin|mileage on my|owe on|negative equity|upside down)\b/i.test(text)) return 'trade_in';
  if (/\b(credit|finance|financing|credit app|credit application|approval|approved|pre[-\s]?approved|bad credit|repo|bankruptcy|co[-\s]?signer|apr|rate|term|loan|lender)\b/i.test(text)) {
    return 'financing';
  }
  if (/\b(appointment|test drive|come in|stop by|visit|see it|look at it|drive it|what time|when can|today|tomorrow)\b/i.test(text)) return 'appointment_test_drive';
  if (/\b(picture|pictures|photo|photos|video|walkaround|walk around|window sticker|sticker|monroney|build sheet|spec sheet|send.*pic)\b/i.test(text)) return 'media_request';
  if (/\b(carfax|auto check|autocheck|accident|history report|service records?|one owner|damage|clean title|condition|scratches|dents|rust|inspection|tires|brakes)\b/i.test(text)) {
    return 'condition_history';
  }
  if (/\b(feature|features|option|options|package|trim|leather|hard top|soft top|engine|4x4|awd|color|miles|mileage|hybrid|equipment|tow|towing|third row|captain)\b/i.test(text)) {
    return 'vehicle_question';
  }
  if (/\b(ship|shipping|deliver|delivery|transport|remote|paperwork|out[-\s]?of[-\s]?state|fly in|pickup)\b/i.test(text)) return 'delivery_shipping';
  if (/\b(deposit|hold|secure|lock it|take it off the market)\b/i.test(text)) return 'hold_deposit';
  if (/\b(i want it|ready|move forward|buy|purchase|send paperwork|where do i sign|let'?s do it|take it)\b/i.test(text)) return 'ready_to_buy';
  if (/\b(just looking|not ready|researching|later|maybe|thinking about|shopping around)\b/i.test(text)) return 'low_intent';
  if (/\b(spouse|wife|husband|partner|dad|mom|manager|boss|decision)\b/i.test(full)) return 'objection';

  return 'general_interest';
}

export function classifyLocation(context: LeadContext): LocationCategory {
  if (context.locationIntel?.classification === 'out_of_state') return 'out_of_state';
  if (context.locationIntel?.classification === 'local' || context.locationIntel?.classification === 'local_far') return 'local';

  const combined = `${context.customerLocation ?? ''} ${context.locationIntel?.state ?? ''} ${context.locationIntel?.summary ?? ''}`;
  if (/\bout[-\s]?of[-\s]?state\b/i.test(combined)) return 'out_of_state';
  return 'unknown';
}

export function chooseLeadResponseStrategy(intent: LeadIntent, locationCategory: LocationCategory, settings: DealershipResponseSettings) {
  const remote =
    locationCategory === 'out_of_state'
      ? `Remote buyer rules apply: ${settings.outOfStateCustomerStrategy} Verify condition, numbers, paperwork, pickup/shipping before travel. Never ask them to come in today.`
      : locationCategory === 'local'
        ? 'Local buyer: appointment is useful only if it matches the conversation.'
        : 'Location unknown: do not assume local.';

  const intentStrategy: Record<LeadIntent, string> = {
    price:
      'They asked about price or out-the-door numbers. Address it directly and verify any missing assumptions before quoting.',
    availability:
      'They asked about availability. Check the exact vehicle and do not claim it is available before verification.',
    financing:
      'They asked about financing. Acknowledge completed steps and move toward the single next finance detail without implying approval.',
    payment:
      'They asked about payment or budget. Ask only for the missing assumption that changes the payment most.',
    trade_in:
      'They mentioned a trade. Use verified details and ask only for the highest-value missing trade fact.',
    out_of_state_purchase:
      'They are buying remotely. Build confidence with video, verified condition and numbers, paperwork, and pickup or shipping.',
    delivery_shipping:
      'They asked about delivery or shipping. Explain the path and collect only the detail required for an accurate quote.',
    vehicle_question:
      'They asked about equipment or fit. Answer that exact topic and verify any uncertain vehicle detail.',
    condition_history:
      'They asked about Carfax, history, title, damage, service, or condition. Say you are checking or grabbing the proof now.',
    media_request:
      'They asked for pictures, video, a window sticker, or other media. Actively grab or send it and ask what they want highlighted.',
    hold_deposit:
      'They asked about holding the vehicle or leaving a deposit. Explain only the verified store process and never promise a hold.',
    appointment_test_drive:
      'They asked to see or drive the vehicle. Make the visit useful; for a remote buyer, complete video and remote proof steps first.',
    ready_to_buy:
      'They are ready to buy. Keep it short and move to the next verified concrete step.',
    signed_or_paperwork_done:
      'They completed a document or purchase step. Acknowledge it and move directly to the next practical action.',
    objection:
      'They raised an objection. Address the concern first, add verified proof or clarity, and offer one low-friction path forward.',
    ghosted:
      'This is a re-engagement. Give the customer a useful, specific reason to respond instead of a generic check-in.',
    angry_confused:
      'They are frustrated or correcting the store. Own it briefly, restate the issue, and provide one corrective action.',
    low_intent:
      'They are not ready yet. Keep pressure low and preserve momentum with one useful next step.',
    general_interest:
      'Their request is broad. Ask one useful needs question tied to the vehicle instead of forcing a script.',
  };

  return [
    'GPT decides the best logic from the whole lead.',
    'Do not force a question, appointment, call, finance app, or playbook step.',
    'Read what already happened and choose the next useful move.',
    `Detected intent hint: ${intent}.`,
    remote,
    intentStrategy[intent],
    `Dealership preference: ${settings.preferredCallToAction}.`,
  ].join('\n');
}

function customerText(context: LeadContext) {
  return (context.conversationTimeline ?? [])
    .filter(isTrueCustomerEntry)
    .map((entry) => entry.text ?? '')
    .filter(Boolean)
    .join('\n');
}

function dealerText(context: LeadContext) {
  return (context.conversationTimeline ?? [])
    .filter(isDealerEntry)
    .map((entry) => entry.text ?? '')
    .filter(Boolean)
    .join('\n');
}

function extractQuestions(text: string | undefined, limit = 30) {
  return (text?.match(/[^.!?\n]{4,220}\?/g) ?? [])
    .map((question) => question.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-limit);
}

function extractDealerPromises(text: string | undefined) {
  return (text?.match(
    /\b(?:i['’]?ll|i will|we['’]?ll|we will|let me|i can|we can)\b[^.!?\n]{0,160}\b(?:send|check|verify|confirm|pull|get you|shoot|email|text|call|update|quote|numbers|carfax|video|pictures|sticker|review)\b[^.!?\n]*/gi,
  ) ?? [])
    .map((promise) => promise.replace(/\s+/g, ' ').trim())
    .slice(-10);
}

function knownFacts(context: LeadContext) {
  const facts: string[] = [];
  const vehicle = vehicleLabel(context);

  if (context.customerName) facts.push(`Customer: ${context.customerName}`);
  if (vehicle) facts.push(`Vehicle: ${vehicle}`);
  if (context.stockNumber ?? context.vehicleOfInterestDetails?.stock) facts.push(`Stock: ${context.stockNumber ?? context.vehicleOfInterestDetails?.stock}`);
  if (context.vehicleOfInterestDetails?.vin) facts.push(`VIN: ${context.vehicleOfInterestDetails.vin}`);
  if (context.vehicleOfInterestDetails?.price) facts.push(`Price shown: ${context.vehicleOfInterestDetails.price}`);
  if (context.vehicleOfInterestDetails?.mileage) facts.push(`Mileage shown: ${context.vehicleOfInterestDetails.mileage}`);
  if (context.customerZipCode) facts.push(`ZIP: ${context.customerZipCode}`);
  if (context.customerLocation) facts.push(`Location: ${context.customerLocation}`);
  if (context.tradeInfo) facts.push(`Trade: ${compactText(context.tradeInfo, 260)}`);
  if (context.paymentBudgetHints) facts.push(`Payment/money hint: ${compactText(context.paymentBudgetHints, 260)}`);
  if (context.appointmentStatus) facts.push(`Appointment: ${context.appointmentStatus}`);

  const text = lower(customerText(context));
  if (/\bcash|paying cash|pay in full|paid in full\b/i.test(text)) facts.push('Customer indicated cash.');
  if (/\boutside bank|credit union|my bank|own financing\b/i.test(text)) facts.push('Customer mentioned outside financing.');
  if (/\btrade|payoff|appraisal\b/i.test(text)) facts.push('Customer mentioned trade.');
  if (/\bship|shipping|delivery|out of state|remote\b/i.test(text)) facts.push('Customer may be remote/out-of-state.');

  return [...new Set(facts.filter(Boolean))].slice(0, 18);
}

function buildConversationDigest(context: LeadContext): ConversationDigestEntry[] {
  const entries = latestFirst(context.conversationTimeline ?? [])
    .filter((entry) => Boolean(entry.text?.trim()))
    .slice(0, 45)
    .map((entry) => {
      const customer = isTrueCustomerEntry(entry);
      const dealer = isDealerEntry(entry);
      const label = customer
        ? 'CUSTOMER SAID - CAN CONTROL REPLY'
        : dealer
          ? 'DEALERSHIP SENT - HISTORY ONLY'
          : 'INTERNAL ONLY - DO NOT USE AS CUSTOMER INTENT';

      const digest: ConversationDigestEntry = {
        label,
        actor: entry.actor,
        direction: entry.direction,
        channel: entry.channel,
        canControlReply: customer,
      };

      if (entry.speakerName) digest.speakerName = entry.speakerName;

      const timestamp = entry.timestampLabel ?? entry.timestampIso;
      if (timestamp) digest.timestamp = timestamp;

      const compactedEntryText = compactText(entry.text, 900);
      if (compactedEntryText) {
        digest.text = customer
          ? compactedEntryText
          : `[HISTORY ONLY - DEALERSHIP ALREADY SENT THIS. DO NOT ANSWER THIS AS CUSTOMER INTENT] ${compactedEntryText}`;
      }

      return digest;
    });

  if (entries.length) return entries;

  return (context.priorMessages ?? []).slice(0, 20).map((rawText) => {
    const canControlReply = /^(text from customer|email from customer|chat from customer|customer reply|web lead|customer said|customer:)\b/i.test(rawText);
    const fallbackDigest: ConversationDigestEntry = {
      label: canControlReply ? 'POSSIBLE CUSTOMER CONTEXT' : 'RAW CRM CONTEXT - DO NOT ASSUME CUSTOMER SAID THIS',
      canControlReply,
    };

    const compactedText = compactText(rawText, 900);
    if (compactedText) fallbackDigest.text = compactedText;

    return fallbackDigest;
  });
}

function userProfile(user: User) {
  return {
    name: user.signatureName ?? user.displayName ?? user.name,
    role: user.role,
    hometown: user.hometown,
    yearsSellingCars: user.yearsSellingCars,
    customerBio: user.customerBio,
    personalWhy: user.personalWhy,
  };
}

function salespersonDirectionFromDraft(userDraft: string | undefined) {
  if (!userDraft?.trim()) return undefined;

  const priorityMatch = userDraft.match(/USER_EXTRA_DIRECTION_PRIORITY:\s*([\s\S]*?)\s*END_USER_EXTRA_DIRECTION_PRIORITY/i);
  const normalMatch = userDraft.match(/USER_EXTRA_DIRECTION:\s*([\s\S]*?)\s*END_USER_EXTRA_DIRECTION/i);
  const extraDirectionLabelMatch = userDraft.match(/Extra direction:\s*([\s\S]*)/i);

  const direction = priorityMatch?.[1]?.trim() || normalMatch?.[1]?.trim() || extraDirectionLabelMatch?.[1]?.trim();

  return direction ? direction.slice(0, 3000) : undefined;
}

function salespersonAskFromDraft(userDraft: string | undefined) {
  if (!userDraft?.trim()) return undefined;
  const exactQuestionMatch = userDraft.match(/Question to answer exactly:\s*([^\n]+)/i);
  if (exactQuestionMatch?.[1]?.trim()) return exactQuestionMatch[1].trim().slice(0, 500);
  const extraDirection = salespersonDirectionFromDraft(userDraft);
  if (extraDirection) return extraDirection;
  const askMatch = userDraft.match(/Salesperson ask:\s*([^\n]+)/i);
  if (askMatch?.[1]?.trim()) return askMatch[1].trim().slice(0, 500);
  const filteredMatch = userDraft.match(/Filters selected:\s*([^\n]+)/i);
  if (filteredMatch?.[1]?.trim()) return filteredMatch[1].trim().slice(0, 500);
  return userDraft.length <= 800 ? userDraft.trim() : undefined;
}

function leadContextForPrompt(
  request: AiGenerateRequest,
  user: User & { dealership: Dealership },
  settings: DealershipResponseSettings,
  detectedIntent: LeadIntent,
  locationCategory: LocationCategory,
  chosenStrategy: string,
) {
  const context = request.leadContext;
  const details = context.vehicleOfInterestDetails;
  const trade = context.tradeVehicle;
  const latestCustomer = latestCustomerTimelineMessage(context);
  const latestDealer = latestDealerTimelineMessage(context);
  const salespersonDirection = salespersonDirectionFromDraft(request.userDraft);
  const allDealerText = dealerText(context);
  const allCustomerText = customerText(context);

  return {
    leadId: request.conversationId,
    channel: request.channel,
    selectedTone: selectedTone(request.tone),
    selectedAction: selectedAction(request.action),
    roleMode: request.roleMode,
    detectedIntent,
    locationCategory,
    chosenStrategy,

    latestTrueCustomerMessage: latestCustomer
      ? {
          text: latestCustomer.text,
          timestamp: latestCustomer.timestampLabel ?? latestCustomer.timestampIso,
          channel: latestCustomer.channel,
          speakerName: latestCustomer.speakerName,
        }
      : undefined,

    latestDealershipMessageHistoryOnly_DO_NOT_ANSWER: latestDealer
      ? {
          alreadySentToCustomer: latestDealer.text,
          timestamp: latestDealer.timestampLabel ?? latestDealer.timestampIso,
          channel: latestDealer.channel,
          speakerName: latestDealer.speakerName,
          warning: 'This is dealership outbound history only. Never answer this as if the customer said it.',
        }
      : undefined,

    customer: {
      name: context.customerName,
      phoneNumbers: context.phoneNumbers,
      emails: context.emails,
      location: context.customerLocation,
      zipCode: context.customerZipCode ?? context.locationIntel?.zipCode,
      city: context.locationIntel?.city,
      state: context.locationIntel?.state,
      locationSource: context.locationIntel?.source,
      locationConfidence: context.locationIntel?.confidence,
      locationSummary: context.locationIntel?.summary,
    },
    vehicleOfInterest: {
      label: vehicleLabel(context),
      year: details?.year,
      make: details?.make,
      model: details?.model,
      trim: details?.trim,
      stock: context.stockNumber ?? details?.stock,
      vin: details?.vin,
      price: details?.price,
      mileage: details?.mileage,
      confidence: details?.confidence ?? context.parserDebug?.vehicleOfInterestConfidence,
      source: details?.source,
    },
    tradeIn: trade
      ? {
          year: trade.year,
          make: trade.make,
          model: trade.model,
          trim: trade.trim,
          mileage: trade.mileage,
          vin: trade.vin,
          payoff: context.tradeInfo,
          confidence: trade.confidence ?? context.parserDebug?.tradeInConfidence,
          source: trade.source,
        }
      : {
          notes: context.tradeInfo,
        },
    financeOrPayment: {
      hints: context.paymentBudgetHints,
      qualification: context.qualification,
    },
    appointment: context.appointmentStatus,
    leadSource: context.leadSource,
    customerIntelligence: context.customerIntelligence,

    conversationFacts: {
      knownFacts: knownFacts(context),
      questionsDealershipAlreadyAsked: extractQuestions(allDealerText, 60),
      questionsCustomerAlreadyAsked: extractQuestions(allCustomerText, 30),
      dealerPromises: extractDealerPromises(allDealerText),
      customerMessageCount: (context.conversationTimeline ?? []).filter(isTrueCustomerEntry).length,
      dealershipMessageCount: (context.conversationTimeline ?? []).filter(isDealerEntry).length,
    },

    conversationHistory: buildConversationDigest(context),

    userProfile: userProfile(user),
    salespersonDirection,
    extraDirectionOverride: salespersonDirection
      ? {
          priority: 'highest_non_compliance_instruction',
          instruction: salespersonDirection,
          note:
            'This overrides default style, tone, length, CTA, playbook, button behavior, and strategy unless it violates truth/legal/finance/compliance/safety.',
        }
      : undefined,
    salespersonAsk: salespersonAskFromDraft(request.userDraft),
    generationInstructions: compactText(request.userDraft, 9000),
    dealershipSettings: settings,
    workflowRules: requestWorkflowSummary(request, settings),
    parserWarnings: context.parserDebug?.warnings ?? [],
  };
}

function requestWorkflowSummary(request: AiGenerateRequest, settings: DealershipResponseSettings) {
  return {
    action: request.action,
    tone: request.tone,
    channel: request.channel,
    maxResponseLength: settings.maximumResponseLength,
  };
}

function responseJsonShape(customerReplyAuthor: string) {
  return `{
  "leadType": "short label decided by AI",
  "buyingTemperature": "hot|warm|cold",
  "likelyCustomerGoal": "what the customer is actually trying to accomplish",
  "bestNextQuestion": "only include a question if one is actually needed; otherwise empty string",
  "suggestedResponse": "customer-facing message",
  "commitmentAsk": "what commitment this reply is trying to earn, or none",
  "complianceWarning": "short warning if relevant",
  "nextBestAction": "short internal action for the ${customerReplyAuthor}",
  "leadScore": "hot|warm|cold",
  "detectedIntent": "intent label",
  "chosenStrategy": "short strategy label",
  "options": [
    {
      "label": "Suggested Response",
      "text": "same as suggestedResponse"
    }
  ]
}`;
}

export function buildOpenAILeadResponsePrompt(input: {
  request: AiGenerateRequest;
  user: User & { dealership: Dealership };
  detectedIntent: LeadIntent;
  locationCategory: LocationCategory;
  chosenStrategy: string;
  latestCustomerMessage: string;
  settings: DealershipResponseSettings;
}): LlmGenerateInput {
  const leadContextJson = JSON.stringify(
    leadContextForPrompt(input.request, input.user, input.settings, input.detectedIntent, input.locationCategory, input.chosenStrategy),
    null,
    2,
  );
  const coachingMode = /\bASK BEST NEXT MOVE MODE\b/i.test(input.request.userDraft ?? '');

  if (coachingMode) {
    const system = [
      'You are a direct automotive dealership sales coach.',
      'Return strict JSON only. Do not include markdown.',
      'Read the whole lead like a human. Do not force stages or templates.',
      'You decide the best logic from the conversation: answer, close, ask, confirm, de-escalate, thank, or give next steps.',
      `JSON shape: ${responseJsonShape('salesperson')}`,
      'If extra direction exists, follow it literally unless it violates truth, legal, finance, discrimination, threats, harassment, privacy, or compliance rules.',
    ].join('\n');

    const user = [
      'Lead context:',
      leadContextJson,
      '',
      'Salesperson coaching request and notes:',
      input.request.userDraft ?? '',
      '',
      'Latest true inbound customer message:',
      input.latestCustomerMessage || 'No latest customer message was found. Use the full lead context carefully.',
      '',
      'Instructions:',
      '1. Think like a sharp dealership closer.',
      '2. Decide what is actually happening in the conversation.',
      '3. Decide whether the salesperson should answer, close, confirm, ask, or do nothing but state next steps.',
      '4. Do not force a question.',
      '5. Return a practical answer in options[0].text.',
    ].join('\n');

    return { system, user };
  }

  const managerMode = input.request.roleMode === 'manager';
  const customerReplyAuthor = managerMode ? 'manager' : 'salesperson';

  const system = [
    'You are the brain for a dealership salesperson writing to a real customer.',
    'You are not a script selector. You are not a receptionist. You are not a BDC template. You are not customer support.',
    'Your job is to read the whole lead and decide the best possible logic on your own.',
    'Return strict JSON only. Do not include markdown.',
    `JSON shape: ${responseJsonShape(customerReplyAuthor)}`,

    'CORE OPERATING RULE:',
    'You decide what should happen next from the actual conversation.',

    'HARD SPEAKER FIREWALL:',
    'The ONLY message you are replying to is latestTrueCustomerMessage / Latest true inbound customer message, and only if it is not duplicated as dealership outbound history.',
    'Everything marked DEALERSHIP SENT - HISTORY ONLY or HISTORY ONLY - DEALERSHIP ALREADY SENT THIS is something our store already said to the customer.',
    'Never write a reply that responds to dealership outbound text as if the customer said it.',
    'Never comfort, thank, agree with, or answer the dealership’s own outgoing message.',
    'Use dealership history only to avoid repeating questions and to understand what the customer is replying to.',
    'Example: if dealership history says “I am finishing with a customer” and the latest customer says “any luck today?”, do NOT say “take your time with your customer.” The correct logic is to update the customer or say you are checking now.',
    'If latest customer asks “any luck?”, “update?”, “what happened?”, or “did you find out?”, respond with a status/update/next action. Do not ask what they need before moving forward.',
    'If no latest true inbound customer message exists, do not pretend dealership outbound text is customer text. Write a follow-up from the last dealership action only.',
    'If latestTrueCustomerMessage looks like a dealership outbound row, ignore it and write a safe follow-up instead.',
    'You may answer, explain, confirm, thank, close, set next steps, ask one question, or ask no question.',
    'Do not force a question. Do not force a close. Do not force a playbook step.',
    'The best reply is the one a smart salesperson would actually send next.',
    'If the customer already signed, paid, submitted docs, sent license, sent credit app, or completed a step, do NOT ask what they need before moving forward. Acknowledge completion and move to the next practical step.',
    'If the customer asked a specific question, answer that question first.',
    'If the store already asked a question, do not ask it again.',
    'If no question is needed, do not end with a question.',
    'If the best next move is action, say the action and stop.',

    'VOICE RULE:',
    'Write like a cool, confident, friendly salesperson texting from his phone.',
    'Sound relaxed, sharp, useful, and human. Professional friend, not receptionist.',
    'Do not use canned openers or repeated catchphrases.',
    'Avoid “Got you”, “Perfect”, “Fair question”, “Makes sense”, “To keep things moving”, and customer-name-first openings unless they are genuinely the best wording.',
    'Never use these phrases: Thanks for reaching out, We appreciate your business, assist you directly, best number and time to call, I can help with this one, Let me know the best number, We want to assist, appreciate your interest.',
    'Do not default to phone-number asks. Ask for a call only when the latest customer message makes a call clearly useful or the salesperson asks for it.',
    'No fake hype. No cringe. No long paragraphs.',

    'CONVERSATION TRUTH RULE:',
    'Only CUSTOMER SAID - CAN CONTROL REPLY can be treated as customer intent.',
    'latestTrueCustomerMessage is the controlling message. If anything conflicts with it, follow latestTrueCustomerMessage.',
    'DEALERSHIP SENT - HISTORY ONLY is what the dealership already sent. Use it only to understand what was already asked, promised, or said.',
    'INTERNAL ONLY - DO NOT USE AS CUSTOMER INTENT is internal context only.',
    'Never treat Text To Customer, Email To Customer, Note, Task, Voicemail, Touchpoint, Claire, Automation, Deal Imported From System, Duplicate Lead, or dealership outbound history as customer intent.',
    'If latest inbound is ".", blank, image-only, attachment-only, photo, license picture, proof document, or media upload, treat it as the customer sending the requested item/document/photo.',

    'EXTRA DIRECTION RULE:',
    'If salespersonDirection, extraDirectionOverride, USER_EXTRA_DIRECTION, USER_EXTRA_DIRECTION_PRIORITY, or generationInstructions contains a custom direction, follow it literally.',
    'Extra direction overrides tone, style, length, CTA, playbook, default strategy, and button behavior.',
    'Only truth, legal, finance/compliance, privacy, non-discrimination, no threats/harassment, and no invented facts are higher priority.',

    'TRUTH AND COMPLIANCE:',
    'Do not invent prices, availability, discounts, fees, approvals, policies, Carfax facts, condition, shipping cost, warranty, registration, or location.',
    'Never say guaranteed approval, guaranteed payment, guaranteed rate, locked price, or rebate guaranteed.',
    'Do not hide mandatory fees.',
    'Do not quote OTD without ZIP/taxes/tag assumptions.',
    'Do not quote payment without assumptions such as price, taxes, fees, down, trade, term, rate, and lender approval.',
    'If information is missing, be honest and move the deal forward cleanly.',

    managerMode
      ? [
          'Manager situational mode: write as the dealership manager, not as the salesperson.',
          'First decide the manager job for this lead: resolve heat, correct a mistake, build trust, clarify the process, or make a concise handoff.',
          'For a natural first handoff, you may mention that this is a family-owned dealership about two years in business and that the manager has about 15 years in the car business.',
          'Reference the vehicle only when useful and do not name a specific salesperson.',
        ].join(' ')
      : 'Salesperson mode: write as the assigned salesperson. Direct, conversational, and confident.',

    'OUTPUT RULES:',
    'suggestedResponse is the customer-facing text.',
    'options[0].text must exactly match suggestedResponse.',
    'bestNextQuestion may be an empty string if no question is needed.',
    'Do not include internal reasoning in suggestedResponse.',
  ].join('\n');

  const user = [
    'Lead context:',
    leadContextJson,
    '',
    'Latest true inbound customer message:',
    input.latestCustomerMessage || 'No latest inbound customer message was found. Use the full lead context and last dealership action carefully.',
    '',
    'Instructions:',
    '1. Read the whole lead.',
    '2. Decide what is actually happening based on the latest true inbound customer message, not dealership outbound history.',
    '3. Decide the smartest next move yourself.',
    managerMode
      ? 'Manager handoff: write the one concise response the manager can send now, then stop.'
      : undefined,
    '4. Do not follow a rigid stage/playbook.',
    '5. Do not ask a question unless the deal genuinely needs one. If the customer is asking for an update, give/update/check status instead of asking a qualifier.',
    '6. Write the response like a cool friendly salesperson, not a receptionist.',
    `7. Keep suggestedResponse under about ${input.settings.maximumResponseLength} characters unless extra direction overrides length.`,
  ].join('\n');

  return { system, user };
}

export function fallbackLlmResult(model = 'safe-fallback'): LlmGenerateResult {
  const text = JSON.stringify({
    leadType: 'general',
    buyingTemperature: 'warm',
    likelyCustomerGoal: 'get a clear next step',
    bestNextQuestion: '',
    suggestedResponse: SAFE_OPENAI_FALLBACK_TEXT,
    commitmentAsk: 'none',
    complianceWarning: 'Use safe follow-up only; no claims or numbers.',
    nextBestAction: 'Review the lead manually because AI generation failed.',
    leadScore: 'warm' satisfies LeadTemperature,
    detectedIntent: 'general_interest',
    chosenStrategy: 'safe fallback',
    options: [
      {
        label: 'Suggested Response',
        text: SAFE_OPENAI_FALLBACK_TEXT,
      },
    ],
  });

  return {
    text,
    provider: 'safe-fallback',
    model,
    inputTokens: 0,
    outputTokens: 0,
  };
}

export async function generateLeadResponseWithOpenAI(input: LeadResponseEngineInput): Promise<LeadResponseEngineResult> {
  const settings = settingsFor(input.user);
  const latestCustomerMessage = getLatestCustomerMessage(input.request.leadContext);
  const detectedIntent = classifyLeadIntent(latestCustomerMessage, input.request.leadContext);
  const locationCategory = classifyLocation(input.request.leadContext);
  const chosenStrategy = chooseLeadResponseStrategy(detectedIntent, locationCategory, settings);

  const prompt = buildOpenAILeadResponsePrompt({
    request: input.request,
    user: input.user,
    detectedIntent,
    locationCategory,
    chosenStrategy,
    latestCustomerMessage,
    settings,
  });

  const result = await input.llm.generate(prompt);

  return {
    result,
    prompt,
    detectedIntent,
    locationCategory,
    chosenStrategy,
    latestCustomerMessage,
  };
}
