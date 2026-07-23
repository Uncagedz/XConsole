import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type {
  AiFeedbackRequest,
  AiGenerateResponse,
  AuthResponse,
  Channel,
  InventorySearchResponse,
  LeadContext,
  QuotaStatus,
  QuickAction,
  ResponseRoleMode,
  Tone,
  UserPermission,
} from '@drivecentric-ai/shared';
import {
  analyzeLeadMarket,
  buildBuyerProfile,
  buildNeedsAnalysis,
  buildSalesInfluencePlan,
  buildSalesPressureTest,
  normalizeAccessibleProfileRoles,
  PROFILE_ACCESS_ROLE_LABELS,
  enrichLeadLocation,
  formatLocationStatus,
  locationStrategyReason,
  recommendInventoryForLead,
} from '@drivecentric-ai/shared';
import {
  sendExtensionMessage,
  type AiFeedbackResponse,
  type AuthStatusResponse,
  type ExtensionConfigResponse,
  type ReadPageResponse,
} from '../shared/messages';
import './popup.css';

type ColumnKey = 'sms' | 'email' | 'strategy';
type WorkspaceTab = 'coach' | ColumnKey | 'inventory';
type AuthState = { authenticated: boolean; user: AuthResponse['user'] | undefined };
type WatchState = 'off' | 'watching' | 'waiting';
type ConversationMode = 'continue' | 'meet_greet';
type ControlTab = 'recommended' | 'custom';
type FilterRole = 'salesperson' | 'bdc' | 'manager';
type OwnerViewRole = 'salesperson' | 'bdc' | 'manager';
type FilterConversation = 'first_contact' | 'continue' | 'price' | 'inventory' | 'appointment' | 'reengage';
type FilterGoal = 'rapport' | 'needs' | 'reply' | 'appointment' | 'credit_app' | 'trade' | 'inventory';
type FilterTone = 'direct' | 'friendly' | 'stronger' | 'consultative' | 'manager';
type FilterChannel = 'text' | 'call' | 'voicemail' | 'note';
type FilterLength = 'short' | 'normal' | 'detailed';
type ReplyButtonVariant =
  | 'default'
  | 'rewrite'
  | 'shorter'
  | 'warmer'
  | 'empathy'
  | 'stronger'
  | 'question'
  | 'appointment'
  | 'credit'
  | 'introduce';

const READER_BUILD_LABEL = 'Reader build 2026.05.01.0059';

type AssistantFilters = {
  role: FilterRole;
  conversation: FilterConversation;
  goal: FilterGoal;
  tone: FilterTone;
  channel: FilterChannel;
  length: FilterLength;
};

const defaultAssistantFilters: AssistantFilters = {
  role: 'salesperson',
  conversation: 'continue',
  goal: 'needs',
  tone: 'stronger',
  channel: 'text',
  length: 'short',
};

const roleFilterOptions: Array<{ value: FilterRole; label: string }> = [
  { value: 'salesperson', label: 'Sales Rep' },
  { value: 'bdc', label: 'BDC' },
  { value: 'manager', label: 'Manager' },
];

const conversationFilterOptions: Array<{ value: FilterConversation; label: string }> = [
  { value: 'first_contact', label: 'First Contact' },
  { value: 'continue', label: 'Active Conversation' },
  { value: 'price', label: 'Price' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'appointment', label: 'Appointment Ready' },
  { value: 'reengage', label: 'Re-Engage' },
];

const goalFilterOptions: Array<{ value: FilterGoal; label: string }> = [
  { value: 'rapport', label: 'Build Rapport' },
  { value: 'needs', label: 'Needs Analysis' },
  { value: 'reply', label: 'Reply' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'credit_app', label: 'Credit App' },
  { value: 'trade', label: 'Trade' },
  { value: 'inventory', label: 'Inventory' },
];

const toneFilterOptions: Array<{ value: FilterTone; label: string }> = [
  { value: 'direct', label: 'Direct' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'stronger', label: 'Stronger' },
  { value: 'consultative', label: 'Consultative' },
  { value: 'manager', label: 'Manager' },
];

const channelFilterOptions: Array<{ value: FilterChannel; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'call', label: 'Call' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'note', label: 'Note' },
];

const lengthFilterOptions: Array<{ value: FilterLength; label: string }> = [
  { value: 'short', label: 'Short' },
  { value: 'normal', label: 'Normal' },
  { value: 'detailed', label: 'Detailed' },
];

const columns: Record<
  ColumnKey,
  {
    title: string;
    channel: Channel;
    defaultAction: QuickAction;
    prompt: string;
    helper: string;
  }
> = {
  sms: {
    title: 'Text',
    channel: 'sms',
    defaultAction: 'generate_reply',
    prompt:
      'Write SMS responses that are short, specific, personal, and built from the current conversation. Answer the latest customer message first, then ask the single best next question if one is needed.',
    helper: 'Fast reply, objection handle, and natural next step.',
  },
  email: {
    title: 'Email',
    channel: 'email',
    defaultAction: 'generate_reply',
    prompt:
      'Write email responses that feel personal and sharp. Use real page details, keep it clean, and choose the next step from the customer context.',
    helper: 'Longer structure when the lead needs more context.',
  },
  strategy: {
    title: 'Coach',
    channel: 'crm_note',
    defaultAction: 'generate_reply',
    prompt:
      'Coach the salesperson through the lead: buyer read, needs analysis, reply angle, verification path, and what to avoid.',
    helper: 'What the customer wants, what to ask, and what to say next.',
  },
};

const toneOptions: Array<{ value: Tone; label: string; permission: UserPermission }> = [
  { value: 'standard_closer', label: 'Closer', permission: 'canUseStandardTone' },
  { value: 'soft_consultative', label: 'Consultative', permission: 'canUseSoftTone' },
  { value: 'aggressive_appointment_setter', label: 'Appointment', permission: 'canUseAggressiveTone' },
  { value: 'manager_takeover', label: 'Manager', permission: 'canUseManagerTone' },
];

const leadPlays: Array<{
  label: string;
  action: QuickAction;
  target: ColumnKey;
  permission: UserPermission;
}> = [
  { label: 'Coach + Reply', action: 'generate_reply', target: 'sms', permission: 'canUseAi' },
  { label: 'Appointment', action: 'appointment_push', target: 'sms', permission: 'canUseAppointmentPush' },
  { label: 'Finance', action: 'finance_push', target: 'sms', permission: 'canUseFinancePush' },
  { label: 'Trade', action: 'trade_in_push', target: 'sms', permission: 'canUseTradePush' },
];
const defaultLeadPlay = leadPlays[0]!;

const promptByPlay: Record<QuickAction, string> = {
  generate_reply: '',
  rewrite_shorter: '',
  rewrite_stronger: '',
  humanize: '',
  appointment_push: 'Push for a specific appointment time with two options only after answering the customer first.',
  trade_in_push: 'Push the trade appraisal. Ask for VIN, miles, payoff, and condition if missing, then close for the easiest appraisal path.',
  finance_push: 'Handle the money or credit concern cleanly. Do not imply approval. Offer the easiest next step to get real numbers with our finance process.',
  reengage_ghosted: 'Wake the lead back up without sounding needy. Make it relevant, easy, specific, and conversational.',
  confirm_appointment: 'Confirm the appointment, reduce no-show risk, and make the visit feel easy.',
  missed_appointment_follow_up: 'Recover the missed appointment with a relaxed tone and two fresh next-step options.',
  sold_follow_up: 'Write a polished sold follow-up that thanks them, reinforces value, and opens the door for referrals or future needs.',
};

const refinementPrompts: Record<'rewrite_shorter' | 'rewrite_stronger' | 'humanize', string> = {
  rewrite_shorter: 'BUTTON OVERRIDE: Shorten. The final reply must be clearly shorter than the current draft. Keep only the core answer and one next step.',
  rewrite_stronger: 'BUTTON OVERRIDE: Stronger. The final reply must be more confident, more decisive, and include a clearer next yes.',
  humanize: 'BUTTON OVERRIDE: Warmer. The final reply must sound noticeably more human, relaxed, and easy to answer.',
};

function replyButtonOverridePrompt(variant?: ReplyButtonVariant) {
  if (!variant || variant === 'default') return '';
  const base =
    'HARD BUTTON OVERRIDE. This button intent controls the next draft. Do not treat this as a mild suggestion. The final customer-facing reply must visibly match this button, while still using only true lead facts.';
  const instructions: Record<Exclude<ReplyButtonVariant, 'default'>, string> = {
    rewrite:
      'Button: Regenerate. Write a meaningfully different version from the current draft. Change the opening and close. Keep the same lead facts, but do not reuse the same skeleton.',
    shorter:
      'Button: Shorten. Final reply must be shorter than the current draft. Use 1 to 2 short sentences, remove fluff, keep one clear next step, and do not add new topics.',
    warmer:
      'Button: Warmer. Final reply must feel warmer and more human. Add one natural human line, soften the ask, and avoid stiff dealership language.',
    empathy:
      'Button: Empathy. Final reply must open by validating the customer exact concern, frustration, risk, or hesitation. Make them feel understood before any ask. Do not use generic empathy.',
    stronger:
      'Button: Stronger. Final reply must close harder without being rude. Be direct, confident, and decisive. Ask for a clear commitment, not a vague reply.',
    question:
      'Button: Add Question. Final reply must answer the customer first, then end with exactly one useful question. Do not ask multiple questions.',
    appointment:
      'Button: Appointment Close. Final reply must include an appointment / come-in / see-it / schedule ask. Even if context is thin, create a reasonable bridge to appointment value: vehicle pulled up, condition checked, numbers/trade person ready, less waiting, easier visit. Offer two appointment windows when possible. Do not refuse the appointment angle just because the lead is not fully qualified. If the customer is far or out of state, make it a phone/video appointment or planned pickup/travel appointment first, but still create an appointment-like commitment.',
    credit:
      'Button: Finance Angle. Final reply must include a finance/payment/credit-app angle as the next path. Make it optional and useful, never judgmental. Do not guarantee approval, rate, payment, or discount. If the customer is cash-only, frame finance only as a possible structure to review if it helps them keep cash back or see real options.',
    introduce:
      'Button: Introduce. Final reply must include a natural human introduction because the user requested it. If Sales/BDC, introduce the sender as stepping in or helping on this lead, then connect immediately to the customer latest concern and one next step. If Manager, make it a situational manager introduction: calm, grateful, problem-solving, and not robotic. Mention family-owned/about two years in business and about 15 years in the car business only if it fits naturally. Do not restart an active thread with a stiff "Hi [name], [rep] here" unless the user direction asks for it.',
  };
  return `${base}\n${instructions[variant]}`;
}

const vehicleBrands = [
  'Acura',
  'Audi',
  'BMW',
  'Buick',
  'Cadillac',
  'Chevrolet',
  'Chrysler',
  'Dodge',
  'Ford',
  'Genesis',
  'GMC',
  'Honda',
  'Hyundai',
  'Jeep',
  'Kia',
  'Lexus',
  'Mazda',
  'Mercedes-Benz',
  'Nissan',
  'Ram',
  'Subaru',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

const automotiveBookPrompt =
  'Automotive sales book rules: build trust before pressure, answer the exact customer question first, continue the conversation naturally, identify what matters to this buyer, ask one useful needs question only when it helps, then let OpenAI choose the lightest useful next step. Remote or out-of-state buyers get verification, video/condition, real numbers, and pickup/shipping clarity before any travel talk.';

const advancedSalesBookPrompt =
  'Advanced sales book rules: use tactical empathy, mirror the customer language lightly, label the real concern without arguing, ask calibrated what/how questions when resistance is high, sequence the sale with value before the ask, pre-handle predictable objections, protect gross, and only upsell when it honestly improves fit, trust, delivery, finance, protection, or ownership experience.';

const closingMachinePrompt =
  [
    'Closing machine operating system:',
    '1. Diagnose the buyer state from the actual thread: fear, motive, urgency, budget, current vehicle, reason for change, trust level, distance, trade, and decision readiness.',
    '2. Disarm first: agree with the reasonable part of the objection and make the customer feel safe, not handled.',
    '3. Build value before numbers: explain one real reason this dealership, rep, process, car, inspection/reconditioning, or appointment helps this customer.',
    '4. Protect the store: do not race to discount, do not reveal internal limits, do not promise concessions, and do not train the customer to expect thousands off.',
    '5. Create a path: use structure, trade, rebate qualification, manager review, appointment setup, or alternate inventory when it benefits the deal.',
    '6. Ask for the business or the next commitment every time it is appropriate. The close must be specific, easy to answer, and tied to the customer benefit.',
    '7. If the customer says no, keep control by narrowing the objection: number, vehicle, timing, trust, trade, payment, or appointment friction.',
  ].join('\n');

const dealershipEconomicsPrompt =
  [
    'Dealership economics and policy context:',
    'Used vehicles have real cost after acquisition: auction/buying fees, transportation, reconditioning, inspection, marketing/listing promotion, and carrying cost.',
    'Customer-facing fee context when relevant: dealer fee is $1,199, electronic filing fee is $799, then registration/tag and taxes depend on ZIP/location.',
    'Used-car discount posture: max normal discount target is around $499 unless management explicitly approves more. Do not reveal this internal cap to the customer. Present it as limited room because the vehicle has already been bought, transported, reconditioned, marketed, and priced.',
    'Reconditioning story: say the dealership reconditions vehicles it buys when that context helps justify value. Do not overclaim certification, warranty, or perfect condition unless verified.',
    'Finance structure context: banks may require a minimum amount financed, commonly around $7,000 when policy confirms it. Do not suggest a huge down payment that leaves too little to finance. If financing helps bridge a small gap, position it as preserving options, keeping cash back, and allowing payoff/paydown later only if no prepayment penalty is verified.',
  ].join('\n');

const humanNeedsEnginePrompt =
  [
    'Human needs-analysis engine:',
    'Every active lead needs qualification, but never as an interrogation. Ask the single highest-value curiosity question that unlocks the deal right now.',
    'Full qualification map to track over time: why buying, why this exact vehicle/body style, where they saw us, current vehicle, what happened to the previous/current car, accident/repair/lease/end-of-life trigger, trade status, payoff/title/name on trade, cash/finance/outside bank, why outside bank, whether they would let us compete for a better rate, down payment/payment comfort, credit comfort, prior auto-loan history, co-signer/buyer structure, decision maker, timeline, and logistics.',
    'Do not ask the whole map at once. Pick the easiest question that feels like curiosity and gives the salesperson leverage for the next close.',
    'Use the answer later as the close. If they need room for kids, close around convenience and family fit. If the old car is unreliable, close around avoiding another breakdown. If they hate dealerships, close around preparation and no wasted trip. If they love the vehicle, close around securing it before it is gone.',
    'Vehicle-specific discovery: find out what stood out about this exact vehicle: price, miles, look, features, trim, condition, color, availability, or emotional pull.',
    'Hidden qualification: infer seriousness and buying ability gently. If credit/approval matters, ask in non-threatening language about prior financing, comfort, co-signer, or whether they want real approval before moving forward. Do not ask blunt credit-score questions unless the customer brings it up.',
    'Outside-bank handling: if they mention their own bank or credit union, respect it first, then ask if they are open to us trying to beat the rate or making paperwork easier.',
    'BDC version: qualify enough to create a strong appointment reason. Learn the pain point, vehicle fit, trade, timing, and money path, then turn that into why coming in or doing a phone appointment is worth it.',
    'Objection framework: agree with the reasonable part, reframe around customer benefit, clarify the real issue, then move forward with one useful question or commitment.',
  ].join('\n');

function situationalInfluencePrompt(plan: ReturnType<typeof buildSalesInfluencePlan>) {
  return [
    'Situational sales influence plan:',
    `Primary style: ${plan.primaryStyle}. Supporting styles: ${plan.supportingStyles.join(', ')}.`,
    `Why: ${plan.reasoning}`,
    `Open: ${plan.openingMove}`,
    `Discover: ${plan.discoveryMove}`,
    `Proof: ${plan.proofMove}`,
    `Close: ${plan.closeMove}`,
    `Upsell only if useful: ${plan.upsellPath}`,
    `Avoid: ${plan.avoid.join(' ')}`,
  ].join('\n');
}

const tavernaRemoteProofPrompt =
  'Taverna remote-buyer facts: the store is in Plantation, Florida; used vehicle purchases can have a 3 day / 300 mile return policy that should be verified on the exact unit; shipping can be quoted at store-provided wholesale rates around $0.75 per mile; Taverna sells 450+ cars per month and regularly helps out-of-state buyers. Use credit/pre-approval only if the customer is discussing financing or payments. Use only proof points that fit the lead. Do not cram all of them into one text.';

const localRapportPrompt =
  'Local rapport rule: do not invent restaurants, landmarks, neighborhoods, or food spots. Use only confirmed ZIP/city, configured user/dealership profile details, or leadContext.localResearch places when available. If location is phone-area-only, phrase it as "looks like you may be around..." and ask for ZIP.';

function humanStylePrompt(channel: Channel) {
  return channel === 'sms'
    ? 'Human SMS style: write like a professional friend: warm, easy, confident, and lightly personal. Keep it quick, simple, no em dashes, no dash bullets, and no long explanation. Mirror the customer pace and wording when useful. Add one small personable touch when the context gives you a safe hook; make it feel like a salesperson the customer would actually enjoy texting.'
    : 'Human style: sound like a professional friend: conversational, specific, warm, and emotionally aware. No em dashes, no corporate letter tone, no filler. Use light personality and rapport when it is earned by real context.';
}

type BuyerHistoryItem = { at: string; type: string; reason: string };

function buyerTypeFrom(
  context: LeadContext,
  marketInsight: ReturnType<typeof analyzeLeadMarket>,
  salesPressureTest: ReturnType<typeof buildSalesPressureTest>,
  needsAnalysis: ReturnType<typeof buildNeedsAnalysis>,
) {
  const primary = salesPressureTest.detectedObjections[0]?.key;
  const visible = [
    context.visibleText,
    context.paymentBudgetHints,
    context.tradeInfo,
    ...(context.priorMessages ?? []).slice(0, 5),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (context.communicationCompliance?.status && context.communicationCompliance.status !== 'clear') {
    return { type: 'Contact-sensitive buyer', reason: context.communicationCompliance.reason ?? context.communicationCompliance.status };
  }
  if (marketInsight.route === 'remote') {
    return { type: 'Remote confidence buyer', reason: marketInsight.summary };
  }
  if (primary === 'payment_finance' || primary === 'credit_risk' || needsAnalysis.priority === 'finance') {
    return { type: 'Finance-first buyer', reason: context.paymentBudgetHints ?? 'Payment, approval, or budget is the hinge.' };
  }
  if (primary === 'trade_value' || needsAnalysis.priority === 'trade') {
    return { type: 'Trade-driven buyer', reason: context.tradeInfo ?? 'Trade value or appraisal path matters.' };
  }
  if (primary === 'availability_condition' || needsAnalysis.priority === 'trust') {
    return { type: 'Trust and verification buyer', reason: 'They need proof before they commit.' };
  }
  if (primary === 'comparison_shopping' || primary === 'price_shopping') {
    return { type: 'Comparison/value buyer', reason: salesPressureTest.detectedObjections[0]?.evidence ?? 'They are weighing options or price.' };
  }
  if (primary === 'low_commitment') {
    return { type: 'Early-stage browser', reason: 'They need one useful question and a low-pressure next step.' };
  }
  if (/\b(family|kids|work|tow|hauling|commute|daily|feature|leather|sunroof|third row|4x4|awd|diesel)\b/i.test(visible)) {
    return { type: 'Need-fit buyer', reason: 'The vehicle has to match a specific use case or feature need.' };
  }
  return { type: 'Open opportunity buyer', reason: 'Need and urgency are still being discovered.' };
}

function needsSnapshot(context: LeadContext, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>) {
  const known = needsAnalysis.knownSignals.slice(0, 2).join(' | ');
  const missing = needsAnalysis.missingSignals.slice(0, 2).join(' | ');
  if (known && missing) return `${known}. Missing: ${missing}.`;
  if (known) return known;
  return needsAnalysis.customerGoalHypothesis;
}

function shouldUseInventory(context: LeadContext, ask: string) {
  const text = [
    ask,
    context.vehicleOfInterest,
    context.visibleText,
    context.tradeInfo,
    context.paymentBudgetHints,
    ...(context.priorMessages ?? []).slice(0, 6),
  ]
    .filter(Boolean)
    .join('\n');
  return /\b(feature|options?|package|trim|leather|sunroof|moonroof|third row|captain|heated|cooled|ventilated|4x4|awd|diesel|tow|bed|color|miles|mileage|stock|vin|do you have|find me|looking for|similar|another|alternative|inventory)\b/i.test(
    text,
  );
}

function customerPreferenceText(context: LeadContext) {
  return [
    context.customerIntelligence?.customerIntent,
    ...(context.customerIntelligence?.nonNegotiables ?? []),
    ...(context.customerIntelligence?.likelyCaresAbout ?? []),
    ...(context.customerIntelligence?.painPoints ?? []),
    ...(context.priorMessages ?? []).filter((message) =>
      /\b(?:looking for|interested in|need|want|must|hard[-\s]?top|leather|third row|captain|color|miles|mileage|under|over|budget|payment|cash|no\s+\w+|not\s+\w+|avoid|exclude|non[-\s]?hybrid|hybrid|4xe|SUV|truck|Wrangler|Gladiator|Grand Cherokee|Durango|Ram)\b/i.test(
        message,
      ),
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

function coachInstructionPrompt(context: LeadContext, buyerType: { type: string; reason: string }, history: BuyerHistoryItem[]) {
  const historyLine = history.length
    ? `Buyer type history: ${history.map((item) => `${item.type} (${item.reason})`).join(' -> ')}`
    : 'Buyer type history: first read.';
  return [
    'COACH FIRST MODE.',
    `Current buyer type: ${buyerType.type}. Reason: ${buyerType.reason}`,
    historyLine,
    'Give the salesperson a short command card, not a long playbook.',
    'Use this exact format with one short line per section: Buyer, Need, Do now, Say, Call, Voicemail, Video, Avoid.',
    'Each line must be under 18 words. No paragraphs. No repeated generic advice.',
    'Do not repeat generic defaults. Use the newest customer words, location, vehicle, trade, finance, source, and timeline clues.',
  ].join('\n');
}

function buyerHistoryKey(conversationId: string | undefined) {
  return conversationId ? `drivecentric_ai_buyer_history_${conversationId}` : '';
}

function readBuyerHistory(conversationId: string | undefined): BuyerHistoryItem[] {
  const key = buyerHistoryKey(conversationId);
  if (!key) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as BuyerHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeBuyerHistory(conversationId: string | undefined, history: BuyerHistoryItem[]) {
  const key = buyerHistoryKey(conversationId);
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify(history.slice(-8)));
}

function firstOption(response: AiGenerateResponse | null | undefined) {
  return response?.options[0]?.text ?? '';
}

function firstNonEmptyOption(response: AiGenerateResponse | null | undefined) {
  if (!response?.options?.length) return '';
  for (const option of response.options) {
    const text = option.text?.trim();
    if (text) return text;
  }
  return '';
}

function firstNonEmptyDraftOption(response: AiGenerateResponse | null | undefined) {
  if (!response?.options?.length) return null;
  return response.options.find((option) => option.text?.trim()) ?? response.options[0] ?? null;
}

function removeZipAskFromReply(text: string, context: LeadContext) {
  const confirmedZip = confirmedZipFromContext(context);
  if (!confirmedZip) return text.trim();

  const zipAskPattern =
    /\b(?:share|send|confirm|tell me|what|which|give me|need)\b[^.!?]*\bZIP(?:\s+code)?\b|\bZIP(?:\s+code)?\b[^.!?]*\b(?:taxes|fees|shipping|delivery|use|quote|otd|out[-\s]?the[-\s]?door)\b/i;
  const sentencePattern = /[^.!?]+[.!?]?/g;
  const sentences = text.match(sentencePattern) ?? [text];
  const kept = sentences
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence && !zipAskPattern.test(sentence));

  const cleaned = kept
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();

  return cleaned || text.replace(/\s+/g, ' ').trim();
}

function removeWrongRolePhrases(text: string, page: ReadPageResponse | null, context: LeadContext) {
  let cleaned = text.replace(/\s+/g, ' ').trim();
  if (!customerAcknowledgedAndWeOweFollowUp(page, context)) return cleaned;
  cleaned = cleaned.replace(/\b[Tt]hanks for the update!?\s*/g, '');
  cleaned = cleaned.replace(/\bOnce I have that,?\s*/g, '');
  cleaned = cleaned.replace(/\bThat way, we can\b/gi, 'That way, I can');
  cleaned = cleaned.replace(/\bI['’]ll keep an eye out for\b/gi, 'I’ll make sure');
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

function isAcknowledgementOnlyMessage(text: string | undefined) {
  const normalized = text?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
  if (!normalized) return false;
  if (normalized.length > 90) return false;
  if (/[?]/.test(normalized)) return false;
  if (
    /\b(?:thanks|thank you|sounds good|sound good|got it|perfect|okay|ok|will do|appreciate it|that works|cool|great|understood|copy that)\b/i.test(
      normalized,
    )
  ) {
    return !/\b(?:but|however|also|need|want|price|payment|numbers|quote|call me|email me|send me|still|when)\b/i.test(normalized);
  }
  return false;
}

function promisedFollowThroughLine(context: LeadContext) {
  const timeline = (context.conversationTimeline ?? [])
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      (entry) =>
        entry.text &&
        entry.direction === 'outbound' &&
        !looksLikePageChrome(entry.text) &&
        !urlOnlyText(entry.text),
    )
    .sort((left, right) => {
      const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
      const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
      if (!Number.isNaN(leftTime)) return -1;
      if (!Number.isNaN(rightTime)) return 1;
      return left.index - right.index;
    });
  const promise = timeline.find((entry) =>
    /\b(?:i['’]?ll|we['’]?ll|will)\b[^.!?\n]{0,120}\b(?:send|email|follow up|get you|confirm|check|verify|have|update|quote|numbers|carfax)\b/i.test(
      entry.text ?? '',
    ),
  );
  return promise?.text?.replace(/\s+/g, ' ').trim() ?? '';
}

function customerAcknowledgedAndWeOweFollowUp(page: ReadPageResponse | null, context: LeadContext) {
  const latestCustomer = latestCustomerEntry(page);
  const latestExternal = latestExternalEntry(page);
  const latestCustomerText = latestCustomer?.text ?? latestCustomerMessage(page);
  const hasPromise = Boolean(promisedFollowThroughLine(context));
  if (!latestCustomerText || !isAcknowledgementOnlyMessage(latestCustomerText) || !hasPromise) return false;
  if (!latestExternal || latestExternal.actor === 'customer') return true;
  return entryIsNewer(latestExternal, latestCustomer);
}

function firstName(name: string | undefined) {
  return name?.trim().split(/\s+/)[0] ?? '';
}

function ownershipFollowThroughReply(context: LeadContext) {
  const name = firstName(context.customerName);
  const greeting = name ? `Perfect, ${name}.` : 'Perfect.';
  const promise = promisedFollowThroughLine(context).toLowerCase();
  const mentionsPrice = /\$?\s*11,?500|11,?500/.test(promise);
  const mentionsOtd = /\bout[-\s]?the[-\s]?door|otd\b/.test(promise);
  const mentionsDelivery = /\bdelivery|ship|shipping\b/.test(promise);
  const mentionsCarfax = /\bcarfax\b/.test(promise);
  const mentionsFeatures = /\bfeatures?|options?\b/.test(promise);
  const mentionsTomorrow = /\btomorrow\b/.test(promise);
  const mentionsLateMorning = /\blate morning\b/.test(promise);

  const deliverables = [
    mentionsPrice ? '$11,500 status' : undefined,
    mentionsOtd ? 'full out-the-door quote' : undefined,
    mentionsDelivery ? 'delivery breakdown' : undefined,
    mentionsCarfax ? 'Carfax' : undefined,
    mentionsFeatures ? 'feature details' : undefined,
  ].filter(Boolean) as string[];

  const deliverableLine = deliverables.length
    ? deliverables.length === 1
      ? deliverables[0]
      : `${deliverables.slice(0, -1).join(', ')} and ${deliverables.at(-1)}`
    : 'the full update';

  const timing = mentionsLateMorning ? 'by late morning tomorrow' : mentionsTomorrow ? 'tomorrow' : 'as soon as it is ready';

  return `${greeting} Jacoby is set to send ${deliverableLine} ${timing}. If anything changes before then, I’ll update you right away.`;
}

function followThroughReplyForVariant(
  context: LeadContext,
  variant:
    | 'default'
    | 'rewrite'
    | 'shorter'
    | 'warmer'
    | 'empathy'
    | 'stronger'
    | 'question'
    | 'appointment'
    | 'credit'
    | 'introduce',
) {
  const name = firstName(context.customerName);
  const greeting = name ? `Perfect, ${name}.` : 'Perfect.';
  const promise = promisedFollowThroughLine(context).toLowerCase();
  const mentionsPrice = /\$?\s*11,?500|11,?500/.test(promise);
  const mentionsOtd = /\bout[-\s]?the[-\s]?door|otd\b/.test(promise);
  const mentionsDelivery = /\bdelivery|ship|shipping\b/.test(promise);
  const mentionsCarfax = /\bcarfax\b/.test(promise);
  const mentionsFeatures = /\bfeatures?|options?\b/.test(promise);
  const mentionsTomorrow = /\btomorrow\b/.test(promise);
  const mentionsLateMorning = /\blate morning\b/.test(promise);
  const timing = mentionsLateMorning ? 'by late morning tomorrow' : mentionsTomorrow ? 'tomorrow' : 'as soon as it is ready';
  const pricePart = mentionsPrice ? '$11,500 status' : 'pricing update';
  const quotePart = mentionsOtd ? 'full out-the-door quote' : 'full quote';
  const deliveryPart = mentionsDelivery ? 'delivery breakdown' : 'next-step details';
  const detailPart =
    mentionsCarfax && mentionsFeatures
      ? 'Carfax and feature details'
      : mentionsCarfax
        ? 'Carfax'
        : mentionsFeatures
          ? 'feature details'
          : 'vehicle details';

  switch (variant) {
    case 'shorter':
      return `${greeting} Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. I'll update you right away if anything shifts.`;
    case 'warmer':
      return `${greeting} I know you're waiting on real numbers, and I want to make this easy on you. Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. If anything shifts before then, I'll update you right away.`;
    case 'empathy':
      return `${greeting} I know the main thing you need now is a real answer, not another runaround. Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. If anything changes before then, I'll make sure you hear it from me right away.`;
    case 'stronger':
      return `${greeting} I'm making sure Jacoby gets your ${pricePart}, ${quotePart}, and ${deliveryPart} to you ${timing}. If it is not in your hands by then, I'll step in immediately.`;
    case 'question':
      return `${greeting} Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. If you want, I can also have him include the ${detailPart} in that same update.`;
    case 'appointment':
      return `${greeting} Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. If you want, I can also line up a quick call once it lands so we can wrap up the next step fast.`;
    case 'credit':
      return `${greeting} Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}. If you want the finance structure included too, I can make sure that is part of the update.`;
    case 'introduce':
      return `${greeting} I'll help keep this moving and make sure the update is clear. Jacoby is set to send your ${pricePart}, ${quotePart}, and ${deliveryPart} ${timing}, and I'll make sure you are not left guessing.`;
    case 'rewrite':
    case 'default':
    default:
      return ownershipFollowThroughReply(context);
  }
}

function forcedReplyVariantFrom(
  action: QuickAction,
  prompt?: string,
):
  | 'default'
  | 'rewrite'
  | 'shorter'
  | 'warmer'
  | 'empathy'
  | 'stronger'
  | 'question'
  | 'appointment'
  | 'credit'
  | 'introduce' {
  if (action === 'rewrite_shorter') return 'shorter';
  if (action === 'rewrite_stronger') return 'stronger';
  if (action === 'humanize') return 'warmer';
  if (action === 'appointment_push') return 'appointment';
  if (action === 'finance_push') return 'credit';
  const normalized = prompt?.toLowerCase() ?? '';
  if (/\bempathy\b/.test(normalized)) return 'empathy';
  if (/\bmore human|sound more human|professional friend|relaxed|natural\b/.test(normalized)) return 'warmer';
  if (/\bclose harder|more direct|more decisive\b/.test(normalized)) return 'stronger';
  if (/\bexactly one natural needs-analysis question|adds exactly one natural\b/.test(normalized)) return 'question';
  if (/\bappointment ask|visit or call helps\b/.test(normalized)) return 'appointment';
  if (/\bfinance clarity|credit app|finance structure\b/.test(normalized)) return 'credit';
  if (/\bintroduce|introduction|stepping in|taking over\b/.test(normalized)) return 'introduce';
  return 'default';
}

function forcedReplyResponse(
  conversationId: string,
  action: QuickAction,
  context: LeadContext,
  page: ReadPageResponse | null,
  channel: Channel,
  prompt?: string,
): AiGenerateResponse | null {
  if (!page || channel === 'crm_note' || !customerAcknowledgedAndWeOweFollowUp(page, context)) return null;
  const variant = forcedReplyVariantFrom(action, prompt);
  const text = followThroughReplyForVariant(context, variant);
  return {
    conversationId,
    nextBestAction: 'Complete the promised follow-through',
    leadScore: 'warm',
    options: [
      {
        label: 'Best reply',
        text,
        score: 95,
        flags: ['turn_owned_by_store', 'promised_follow_through'],
      },
    ],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
    complianceFlags: [],
  };
}

function sanitizeGeneratedResponse(response: AiGenerateResponse, context: LeadContext, page?: ReadPageResponse | null): AiGenerateResponse {
  return {
    ...response,
    options: response.options.map((option) => ({
      ...option,
      text: removeWrongRolePhrases(removeZipAskFromReply(option.text, context), page ?? null, context),
    })),
  };
}

function latestCustomerMessage(page: ReadPageResponse | null) {
  const latest = latestCustomerEntry(page)?.text?.replace(/\s+/g, ' ').trim();
  if (latest) return latest;
  const customerTruth = (page?.context.priorMessages ?? []).find(
    (message) => /^Customer truth read:/i.test(message) && /Latest customer-authored text:/i.test(message) && !outboundMarketingOrDealerText(message),
  );
  return customerTruth ?? '';
}

function outboundMarketingOrDealerText(text: string | undefined) {
  return /\b(?:flash sales event|reply stop|address:\s*777|777\s+N\s+State\s+Road\s+7|are you on the way to the dealership|sales event|we can uber you|no payments for|coupon|respectfully,|taverna chrysler|taverna automotive)\b/i.test(
    text ?? '',
  );
}

function urlOnlyText(text: string | undefined) {
  const value = compactSnippet(text, 500);
  return Boolean(value && /^https?:\/\/\S+$/i.test(value));
}

function leadReadDiagnostics(page: ReadPageResponse | null) {
  const context = page?.context;
  if (!page || !context) return ['No lead page has been read yet.'];
  const timeline = context.conversationTimeline ?? [];
  const latestCustomer = latestCustomerEntry(page);
  return [
    `URL: ${page.url}`,
    `Lead page: ${page.isLeadPage ? 'yes' : 'no'}`,
    `Messages parsed: ${context.parserDebug?.messagesParsedCount ?? timeline.length}`,
    `Latest customer found: ${context.parserDebug?.latestCustomerMessageFound || Boolean(latestCustomer) ? 'yes' : 'no'}`,
    `Customer: ${context.customerName ?? 'not found'}`,
    `Vehicle: ${context.vehicleOfInterest ?? 'not found'}`,
    `Stock: ${context.stockNumber ?? 'not found'}`,
    `ZIP/location: ${context.customerZipCode ?? context.customerLocation ?? 'not found'}`,
    `Timeline preview: ${
      timeline
        .slice(0, 5)
        .map((entry) => [entry.timestampLabel, entry.actor, entry.direction, entry.channel, compactSnippet(entry.text, 120)].filter(Boolean).join(' | '))
        .join(' || ') || 'none'
    }`,
    `Warnings: ${(context.parserDebug?.warnings?.length ? context.parserDebug.warnings : ['none']).join(' | ')}`,
  ];
}

function inventoryIntentQueryFromPage(page: ReadPageResponse | null, ask = '') {
  const context = page?.context;
  if (!context) return ask.trim();
  const latest = latestCustomerMessage(page);
  const latestLooksLikeInventoryNeed =
    latest &&
    /\b(?:looking for|interested in|need|want|must|find|show|similar|another|option|alternative|hard[-\s]?top|leather|third row|captain|color|miles|mileage|under|over|budget|payment|cash|no\s+\w+|not\s+\w+|avoid|exclude|non[-\s]?hybrid|hybrid|4xe|SUV|truck|Wrangler|Gladiator|Grand Cherokee|Durango|Ram|stock|vin)\b/i.test(
      latest,
    );
  const vehicleDetails = context.vehicleOfInterestDetails;
  const vehicleLine = [
    context.vehicleOfInterest,
    vehicleDetails ? [vehicleDetails.year, vehicleDetails.make, vehicleDetails.model, vehicleDetails.trim].filter(Boolean).join(' ') : '',
    context.stockNumber ? `Stock ${context.stockNumber}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
  return uniqueByText(
    [
      ask,
      vehicleLine,
      customerPreferenceText(context),
      latestLooksLikeInventoryNeed ? latest : '',
      context.paymentBudgetHints ?? '',
      ...(context.mentionedVehicles ?? [])
        .filter((vehicle) => vehicle.role !== 'trade_in')
        .slice(0, 4)
        .map((vehicle) => [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.stock ? `Stock ${vehicle.stock}` : ''].filter(Boolean).join(' ')),
    ],
    14,
  )
    .join('\n')
    .slice(0, 1600);
}

function conversationDigest(page: ReadPageResponse | null, max = 1800) {
  const context = page?.context;
  if (!context) return '';
  const timeline = (context.conversationTimeline ?? [])
    .filter((entry) => entry.direction !== 'internal' && entry.channel !== 'note' && entry.actor !== 'system')
    .slice(0, 14)
    .map((entry) =>
      [
        entry.timestampLabel,
        entry.actor === 'customer' ? 'Customer' : entry.actor === 'automation' ? 'Claire/automation' : entry.actor,
        entry.speakerName,
        entry.text,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  const prior = (context.priorMessages ?? [])
    .filter((message) => !/\bInternal CRM context only|Internal CRM notes|pinned note|call note|created by:|genius summary\b/i.test(message))
    .slice(0, 10)
    .map((message) => `Context | ${message}`);
  return uniqueByText([...timeline, ...prior], 24).join('\n').slice(0, max);
}

function latestCustomerEntry(page: ReadPageResponse | null) {
  const entries = (page?.context.conversationTimeline ?? [])
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim() && !outboundMarketingOrDealerText(entry.text));
  return entries.sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
    if (!Number.isNaN(leftTime)) return -1;
    if (!Number.isNaN(rightTime)) return 1;
    return left.index - right.index;
  })[0];
}

function latestExternalEntry(page: ReadPageResponse | null) {
  const entries = (page?.context.conversationTimeline ?? [])
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      (entry) =>
        entry.text?.trim() &&
        entry.direction !== 'internal' &&
        entry.actor !== 'system' &&
        !looksLikePageChrome(entry.text) &&
        !urlOnlyText(entry.text),
    );
  return entries.sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
    if (!Number.isNaN(leftTime)) return -1;
    if (!Number.isNaN(rightTime)) return 1;
    return left.index - right.index;
  })[0];
}

function entryIsNewer(
  left: { timestampIso?: string | undefined; index: number } | undefined,
  right: { timestampIso?: string | undefined; index: number } | undefined,
) {
  if (!left || !right) return false;
  const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
  const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime > rightTime;
  if (!Number.isNaN(leftTime) && Number.isNaN(rightTime)) return true;
  if (Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return false;
  return left.index < right.index;
}

function latestHumanOutboundEntry(page: ReadPageResponse | null) {
  const entries = (page?.context.conversationTimeline ?? [])
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => (entry.actor === 'salesperson' || entry.actor === 'manager') && entry.direction === 'outbound');
  return entries.sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
    if (!Number.isNaN(leftTime)) return -1;
    if (!Number.isNaN(rightTime)) return 1;
    return left.index - right.index;
  })[0];
}

function customerReplyNeedsResponse(page: ReadPageResponse | null) {
  const customer = latestCustomerEntry(page);
  if (!customer) return false;
  const human = latestHumanOutboundEntry(page);
  if (!human) return true;
  const customerTime = customer.timestampIso ? Date.parse(customer.timestampIso) : Number.NaN;
  const humanTime = human.timestampIso ? Date.parse(human.timestampIso) : Number.NaN;
  if (!Number.isNaN(customerTime) && !Number.isNaN(humanTime)) return customerTime > humanTime;
  return customer.index < human.index;
}

function latestCustomerSignature(page: ReadPageResponse | null) {
  const customer = latestCustomerEntry(page);
  const text = customer?.text?.replace(/\s+/g, ' ').trim() ?? latestCustomerMessage(page);
  if (!text) return '';
  return [page?.conversationId, customer?.timestampIso, customer?.timestampLabel, text].filter(Boolean).join('|');
}

function _uniqueByIndex<T extends { index: number }>(items: Array<T | undefined>) {
  const seen = new Set<number>();
  const output: T[] = [];
  for (const item of items) {
    if (!item || seen.has(item.index)) continue;
    seen.add(item.index);
    output.push(item);
  }
  return output;
}

function uniqueByText(values: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function inventorySummaryFrom(vehicles: InventorySearchResponse['vehicles'] | null | undefined) {
  return (vehicles ?? [])
    .slice(0, 6)
    .map((item) =>
      [
        item.title,
        item.price ? `price ${item.price}` : undefined,
        item.mileage ? `miles ${item.mileage}` : undefined,
        item.stockNumber ? `stock ${item.stockNumber}` : undefined,
        item.recommendationReason ?? item.strategy,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
}

function signalsFrom(page: ReadPageResponse | null) {
  const context = page?.context;
  if (!context) return '';
  return [
    context.customerLocation ? `Location: ${context.customerLocation}` : undefined,
    context.phoneNumbers?.length ? `Phones: ${context.phoneNumbers.join(', ')}` : undefined,
    context.emails?.length ? `Emails: ${context.emails.join(', ')}` : undefined,
    ...(context.personalizationSignals ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function limit(value: string | undefined, max: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function limitList(values: string[] | undefined, maxItems: number, maxLength: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values ?? []) {
    const normalized = limit(value, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
}

function sanitizeContext(context: LeadContext): LeadContext {
  type LeadVehicle = NonNullable<LeadContext['vehicleOfInterestDetails']>;
  const sanitizeVehicle = (vehicle: LeadVehicle | undefined): LeadVehicle | undefined => {
    if (!vehicle) return undefined;
    const sanitized: LeadVehicle = {
      role: vehicle.role,
      confidence: vehicle.confidence,
    };
    if (vehicle.year) sanitized.year = vehicle.year;
    const make = limit(vehicle.make, 80);
    if (make) sanitized.make = make;
    const model = limit(vehicle.model, 120);
    if (model) sanitized.model = model;
    const trim = limit(vehicle.trim, 160);
    if (trim) sanitized.trim = trim;
    const stock = limit(vehicle.stock, 80);
    if (stock) sanitized.stock = stock;
    const vin = limit(vehicle.vin, 80);
    if (vin) sanitized.vin = vin;
    const price = limit(vehicle.price, 80);
    if (price) sanitized.price = price;
    const mileage = limit(vehicle.mileage, 80);
    if (mileage) sanitized.mileage = mileage;
    const source = limit(vehicle.source, 160);
    if (source) sanitized.source = source;
    const rawText = limit(vehicle.rawText, 1000);
    if (rawText) sanitized.rawText = rawText;
    return sanitized;
  };
  const vehicleOfInterestDetails = sanitizeVehicle(context.vehicleOfInterestDetails);
  const tradeVehicle = sanitizeVehicle(context.tradeVehicle);
  const sanitizeVehicleList = (vehicles: LeadVehicle[] | undefined): LeadVehicle[] => {
    const output: LeadVehicle[] = [];
    for (const vehicle of (vehicles ?? []).slice(0, 12)) {
      const sanitized = sanitizeVehicle(vehicle);
      if (sanitized) output.push(sanitized);
    }
    return output;
  };
  return {
    pageUrl: context.pageUrl,
    customerName: limit(context.customerName, 160),
    customerLocation: limit(context.customerLocation, 240),
    customerZipCode: context.customerZipCode,
    locationIntel: context.locationIntel,
    phoneNumbers: limitList(context.phoneNumbers, 6, 80),
    emails: limitList(context.emails, 6, 180).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    personalizationSignals: limitList(context.personalizationSignals, 12, 320),
    vehicleOfInterest: limit(context.vehicleOfInterest, 220),
    ...(vehicleOfInterestDetails ? { vehicleOfInterestDetails } : {}),
    stockNumber: limit(context.stockNumber, 80),
    ...(tradeVehicle ? { tradeVehicle } : {}),
    similarInventory: sanitizeVehicleList(context.similarInventory).slice(0, 8),
    mentionedVehicles: sanitizeVehicleList(context.mentionedVehicles),
    tradeInfo: limit(context.tradeInfo, 1200),
    paymentBudgetHints: limit(context.paymentBudgetHints, 1200),
    leadSource: limit(context.leadSource, 160),
    timestamps: limitList(context.timestamps, 18, 120),
    priorMessages: limitList(context.priorMessages, 40, 3000),
    conversationTimeline: (context.conversationTimeline ?? []).slice(0, 50).map((entry) => ({
      actor: entry.actor,
      direction: entry.direction,
      channel: entry.channel,
      ...(limit(entry.speakerName, 160) ? { speakerName: limit(entry.speakerName, 160) } : {}),
      ...(limit(entry.timestampLabel, 120) ? { timestampLabel: limit(entry.timestampLabel, 120) } : {}),
      ...(entry.timestampIso ? { timestampIso: entry.timestampIso } : {}),
      ...(limit(entry.text, 1200) ? { text: limit(entry.text, 1200) } : {}),
    })),
    appointmentStatus: limit(context.appointmentStatus, 220),
    salespersonName: limit(context.salespersonName, 160),
    callRecordingLinks: limitList(context.callRecordingLinks, 5, 500),
    callTranscript: limit(context.callTranscript, 6000),
    callNotes: limit(context.callNotes, 3000),
    activitySummary: limit(context.activitySummary, 3000),
    crmAutomationHints: limitList(context.crmAutomationHints, 8, 240),
    visibleText: context.visibleText?.slice(0, 80000),
    sentiment: context.sentiment ?? 'unknown',
    leadScore: context.leadScore ?? 'warm',
    communicationCompliance: context.communicationCompliance,
    customerIntelligence: context.customerIntelligence,
    qualification: context.qualification,
    localResearch: context.localResearch,
    parserDebug: context.parserDebug,
    extractedAt: context.extractedAt,
  };
}

function safeDraft(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join('\n\n').slice(0, 9000);
}

function specialistLabel(context: LeadContext) {
  const vehicle = context.vehicleOfInterest;
  const brand = vehicleBrands.find((name) => vehicle?.toLowerCase().includes(name.toLowerCase()));
  return brand ? `${brand} sales specialist` : 'sales specialist';
}

function roleModePrompt(roleMode: ResponseRoleMode, context: LeadContext) {
  if (roleMode === 'salesperson') {
    return 'Role mode: Sales Rep. Write as the assigned salesperson helping the customer directly.';
  }
  return `Role mode: Manager situational response. Write as a dealership manager with calm authority and situational awareness, not as a robotic handoff. If the customer is upset, confused, correcting us, or waiting on a promise, solve that first: own it briefly, lower pressure, and give one clear corrective next step. If it is a clean first manager touch, introduce the dealership naturally, thank them for the opportunity, and if it sounds human mention family-owned/about two years in business and about 15 years in the car business. Say our ${specialistLabel(context)} can help with ${context.vehicleOfInterest ?? 'the vehicle'} without naming a specific salesperson unless the user gave one. Ask one useful prep question about must-haves, non-negotiables, or what the specialist should know. Keep it short, warm, grateful, and real.`;
}

function conversationFlowPrompt(context: LeadContext) {
  const timeline = context.conversationTimeline ?? [];
  const prior = context.priorMessages ?? [];
  const hasConversation = timeline.length > 0 || prior.length > 0;
  const text = [
    ...timeline.map((entry) => [entry.speakerName, entry.actor, entry.text].filter(Boolean).join(' ')),
    ...prior,
  ].join('\n');
  const hasClaire = /\bclaire\b/i.test(text) || timeline.some((entry) => entry.actor === 'automation');
  const hasHumanSalesperson = timeline.some(
    (entry) => (entry.actor === 'salesperson' || entry.actor === 'manager') && !/\bclaire\b/i.test(entry.speakerName ?? entry.text ?? ''),
  );

  if (!hasConversation) {
    return 'Conversation flow: no prior conversation is clear, so a brief intro is okay if it helps.';
  }
  if (hasClaire && !hasHumanSalesperson) {
    return 'Conversation flow: prior outreach appears to be Claire/AI automation, so a brief human handoff is okay. Still keep it short and natural.';
  }
  return 'Conversation flow: this is an existing human conversation. Do not reintroduce yourself, the store, or the vehicle like a new lead. Continue from the latest customer message.';
}

function conversationModePrompt(mode: ConversationMode, context: LeadContext) {
  if (mode === 'meet_greet') {
    return [
      'Conversation mode selected by salesperson: MEET AND GREET.',
      `Open with a brief human greeting as ${context.salespersonName ?? 'the assigned salesperson'} if useful.`,
      'Introduce yourself once, mention the exact vehicle or customer request, then move to one easy next step.',
      'Keep it warm and short. Do not write a long welcome letter.',
    ].join('\n');
  }
  return [
    'Conversation mode selected by salesperson: CONTINUE.',
    'Treat this like an existing conversation. Do not reintroduce yourself unless the only prior outreach is Claire/automation.',
    'Answer the latest customer message first and keep the flow natural.',
  ].join('\n');
}

function recommendedMove(context: LeadContext, route: 'showroom' | 'remote') {
  if (route === 'remote') {
    return 'Build remote confidence first: verify the car, condition, numbers, and pickup/shipping path before any travel talk.';
  }
  if (context.appointmentStatus?.match(/appointment|visit|show/i)) {
    return 'Confirm the appointment, reduce friction, and lock the arrival time.';
  }
  if (context.tradeInfo) {
    return 'Push the trade appraisal and ask for VIN, miles, payoff, and condition.';
  }
  if (context.paymentBudgetHints) {
    return 'Answer the payment question clearly, avoid promises, and offer two easy next steps.';
  }
  if (context.leadScore === 'hot') {
    return 'Answer directly and let OpenAI choose the cleanest next step from the customer context.';
  }
  if (context.sentiment === 'negative') {
    return 'Defuse the friction fast, clarify the gap, and give a low-effort next step.';
  }
  return 'Answer the question first, remove friction, and ask the most useful next question.';
}

function pageFingerprint(page: ReadPageResponse | null) {
  if (!page) return '';
  const context = page.context;
  return [
    page.conversationId,
    context.customerName,
    context.vehicleOfInterest,
    context.stockNumber,
    context.appointmentStatus,
    latestCustomerSignature(page),
    context.priorMessages.at(-1),
    context.visibleText?.slice(0, 600),
    context.visibleText?.slice(-600),
  ]
    .filter(Boolean)
    .join('|');
}

function leadIdentityKey(page: ReadPageResponse | null) {
  if (!page) return '';
  const context = page.context;
  return [
    page.conversationId,
    context.customerName,
    context.phoneNumbers?.[0],
    context.emails?.[0],
    context.vehicleOfInterest,
    context.stockNumber,
    context.vehicleOfInterestDetails?.vin,
    context.customerZipCode ?? context.customerLocation,
  ]
    .map((value) => value?.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

function compactSnippet(text: string | undefined, max = 340) {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function matchCompact(text: string, pattern: RegExp, max = 110) {
  const match = text.match(pattern);
  return compactSnippet(match?.[1] ?? match?.[0], max);
}

function looksLikePageChrome(text: string | undefined) {
  return /\b(?:Trade[-\s]?in\s+Add|Source\s+Phone|Date\s+Created|Open Deal|Wish List|Best Contact|Customer Notes|Sales\s*[12]|Service BDC|Customer #|Deal #|Buyer #|Garage|Add Source|Genius Summary|Generate Summary|No Vehicles Currently|Best Contact Method)\b/i.test(
    text ?? '',
  );
}

function explicitCustomerAddress(context: LeadContext) {
  const text = context.visibleText ?? '';
  const normalized = text.replace(/\r/g, '\n');
  const inlineAddress = normalized.match(/\bAddress\s+([A-Z0-9][A-Za-z0-9 .'#-]+?)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  const multilineAddress = normalized.match(
    /\bAddress\s+([A-Z0-9][A-Za-z0-9 .'#-]+?)\s*\n\s*([A-Z][A-Za-z .'-]+)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i,
  );
  const cityStateZipOnly = normalized.match(/\bAddress\s+([A-Z][A-Za-z .'-]+)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  let line: string | undefined;
  if (inlineAddress) {
    const [, street, state, zip] = inlineAddress;
    line = `${(street ?? '').trim()} ${(state ?? '').toUpperCase()} ${zip ?? ''}`.trim();
  } else if (multilineAddress) {
    const [, street, city, state, zip] = multilineAddress;
    line = `${(street ?? '').trim()} ${(city ?? '').trim()} ${(state ?? '').toUpperCase()} ${zip ?? ''}`.trim();
  } else if (cityStateZipOnly) {
    const [, city, state, zip] = cityStateZipOnly;
    line = `${(city ?? '').trim()} ${(state ?? '').toUpperCase()} ${zip ?? ''}`.trim();
  }
  if (!line) return undefined;
  if (/\b(?:Taverna|777\s+N\s+State\s+Road\s+7|dealership|Customer\s*#|Deal\s*#|Buyer\s*#)\b/i.test(line)) return undefined;
  return line;
}

function invalidZipCandidatesFromContext(context: LeadContext) {
  const text = context.visibleText ?? '';
  const matches = Array.from(text.matchAll(/\b(?:Deal|Customer|Buyer)\s*#?\s*:?\s*(\d{5,})\b/gi));
  return new Set(matches.map((match) => match[1]?.slice(0, 5)).filter(Boolean) as string[]);
}

function validZipForContext(context: LeadContext, zip: string | undefined) {
  if (!zip) return undefined;
  const normalized = zip.slice(0, 5);
  if (!/^\d{5}$/.test(normalized)) return undefined;
  if (invalidZipCandidatesFromContext(context).has(normalized)) return undefined;
  return normalized;
}

function confirmedZipFromContext(context: LeadContext) {
  return (
    validZipForContext(context, context.customerZipCode) ??
    validZipForContext(context, explicitCustomerAddress(context)?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]) ??
    validZipForContext(context, context.customerLocation?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0])
  );
}

function displayLocationSummary(context: LeadContext) {
  const explicit = explicitCustomerAddress(context);
  if (explicit) return `${explicit} (verify before quoting taxes/fees)`;
  if (
    context.customerLocation &&
    !/\b(?:Customer\s*#|Deal\s*#|Buyer\s*#|DMS|Atlas)\b/i.test(context.customerLocation) &&
    (!context.customerLocation.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || validZipForContext(context, context.customerLocation.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]))
  ) {
    return `${context.customerLocation} (verify before quoting taxes/fees)`;
  }
  if (context.locationIntel?.confidence === 'estimated_from_phone') return `Phone area suggests ${context.locationIntel.label}; ask ZIP before quoting`;
  return 'Verify ZIP before quoting taxes/fees';
}

function cleanStaffName(value: string | undefined) {
  return compactSnippet(
    value
      ?.replace(/\b(?:AS|ZW|AF|BV|GT)\b\s*/g, '')
      .replace(/\b(?:Sales|BDC|Service BDC|Add)\b.*$/i, '')
      .trim(),
    50,
  );
}

function customerFacingText(context: LeadContext) {
  return (context.conversationTimeline ?? [])
    .filter((entry) => entry.text && entry.direction !== 'internal' && entry.actor !== 'system' && !outboundMarketingOrDealerText(entry.text))
    .map((entry) => entry.text!)
    .join('\n')
    .toLowerCase();
}

function assignmentSummary(context: LeadContext) {
  const text = context.visibleText ?? '';
  const sales1 = cleanStaffName(context.salespersonName || matchCompact(text, /\bSales\s*1\s+(?:[A-Z]{1,3}\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})/i, 80));
  const sales2 = cleanStaffName(matchCompact(text, /\bSales\s*2\s+(?:[A-Z]{1,3}\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})/i, 80));
  const bdc = cleanStaffName(matchCompact(text, /\bBDC\s+(?:[A-Z]{1,3}\s+)?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})/i, 80));
  return [
    sales1 ? `Sales 1: ${sales1}` : undefined,
    sales2 ? `Sales 2: ${sales2}` : undefined,
    bdc ? `BDC: ${bdc}` : undefined,
  ].filter(Boolean).join(' | ') || 'Owner not found';
}

function dealOriginSummary(context: LeadContext) {
  const text = context.visibleText ?? '';
  const lines = text.split(/\n|\r/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const cleanLeadSource = context.leadSource && !looksLikePageChrome(context.leadSource) && context.leadSource.length < 80 ? context.leadSource : undefined;
  const sourceLine = lines.find((line) => /^Source\s+(Phone|Text|Email|Internet|Website|Facebook|Chat|ILM)\b/i.test(line));
  const source = cleanLeadSource || sourceLine?.replace(/^Source\s*/i, '') || matchCompact(text, /\bSource\s+(Phone|Text|Email|Internet|Website|Facebook|Chat|ILM)\b/i, 40);
  const created =
    matchCompact(text, /\bDate Created\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i, 50) ||
    matchCompact(text, /\b(?:Deal Created|New Customer)\s*[^\n]{0,80}/i, 90);
  return [source ? `Source: ${source}` : undefined, created].filter(Boolean).join(' | ') || 'Creation path not found';
}

function moneySummary(context: LeadContext) {
  const text = customerFacingText(context) || conversationTextFrom(context);
  const cleanHint = context.paymentBudgetHints && !outboundMarketingOrDealerText(context.paymentBudgetHints) && !/reply stop/i.test(context.paymentBudgetHints) ? context.paymentBudgetHints : undefined;
  const explicit = cleanHint || matchCompact(text, /\b(?:\d{2,3}\s*fico|fico\s*\d{2,3}|tier\s*\w+|payment|finance|cash|down|credit|out[-\s]?the[-\s]?door|otd)[^\n.]{0,160}/i, 160);
  return explicit || 'Finance/payment not clear yet';
}

function tradeSummary(context: LeadContext) {
  const text = customerFacingText(context) || conversationTextFrom(context);
  if (context.tradeInfo && !looksLikePageChrome(context.tradeInfo) && !outboundMarketingOrDealerText(context.tradeInfo)) return compactSnippet(context.tradeInfo, 150);
  const trade = matchCompact(text, /\b(?:currently driving|trade|payoff|owe)[^\n.]{0,160}/i, 150);
  if (looksLikePageChrome(trade) || outboundMarketingOrDealerText(trade)) return 'Trade not clear yet';
  return trade || 'Trade not clear yet';
}

function whySummary(context: LeadContext, latestLine: string) {
  const text = conversationTextFrom(context);
  if (/\bnumbers\b/i.test(text)) return 'Asked for numbers on the deal';
  const customerText = (context.conversationTimeline ?? [])
    .filter((entry) => entry.actor === 'customer' || entry.direction === 'inbound')
    .map((entry) => entry.text)
    .filter(Boolean)
    .join('\n');
  const reason = matchCompact(customerText || text, /\b(?:because|looking for|need|want|interested|driving|available|payment|price|trade)[^\n.]{0,170}/i, 170);
  if (reason && !looksLikePageChrome(reason)) return reason;
  const latest = compactSnippet(latestLine, 170);
  return latest && !looksLikePageChrome(latest) ? latest : 'Buying reason not clear yet';
}

function lastCommunicationSummary(page: ReadPageResponse | null, context: LeadContext) {
  const entry = (context.conversationTimeline ?? [])
    .map((item, index) => ({ ...item, index }))
    .filter(
      (item) =>
        item.text &&
        item.direction !== 'internal' &&
        item.actor !== 'system' &&
        item.actor !== 'automation' &&
        !outboundMarketingOrDealerText(item.text) &&
        !looksLikePageChrome(item.text) &&
        !urlOnlyText(item.text),
    )
    .sort((left, right) => {
      const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
      const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
      if (!Number.isNaN(leftTime)) return -1;
      if (!Number.isNaN(rightTime)) return 1;
      return left.index - right.index;
    })[0];
  if (entry?.text) {
    const speaker = entry.actor === 'customer' ? 'Customer' : entry.speakerName || 'Sales';
    return compactSnippet(`${speaker}: ${entry.text}`, 160);
  }
  const latest = latestCustomerMessage(page);
  return latest && !urlOnlyText(latest) ? compactSnippet(`Customer: ${latest}`, 160) : 'No real customer message found yet';
}

function customerGoalSummary(context: LeadContext, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) {
    return 'Already acknowledged. Customer is waiting on the promised quote/update.';
  }
  const text = customerFacingText(context);
  if (/\bavailable until\b.*\bcall\b|\bavailable\b.*\bfor a call\b|\bcall me\b|\bgive me a call\b/i.test(text)) {
    return 'Open to a live call now if the numbers and trade path make sense.';
  }
  if (/\bnumbers\b|out[-\s]?the[-\s]?door|\botd\b|price|payment/i.test(text)) return 'Wants real numbers and a clear path before committing.';
  if (/\bdriving\b|currently drive|trade|payoff|owe|miles\b/i.test(text)) return 'Trade/current vehicle is part of the deal.';
  if (/\bavailable|still have|in stock|photos?|pictures?|video\b/i.test(text)) return 'Trying to verify the vehicle before moving forward.';
  if (/\bappointment|come in|stop by|test drive|see it\b/i.test(text)) return 'Close to a visit or test drive.';
  if (context.callNotes && /\bnumbers\b/i.test(context.callNotes)) return 'Asked for numbers on the phone; needs a real deal path.';
  return 'Needs discovery: why this vehicle, current car, budget, and timing.';
}

function leadStageSummary(context: LeadContext, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) return 'Awaiting store follow-through';
  const text = customerFacingText(context);
  if (/\bavailable until\b.*\bcall\b|\bavailable\b.*\bfor a call\b|\bcall me\b|\bgive me a call\b/i.test(text)) return 'Call window open';
  if (/\bappointment|come in|stop by|test drive|see it\b/i.test(text)) return 'Appointment path';
  if (/\bnumbers\b|out[-\s]?the[-\s]?door|\botd\b|price|payment/i.test(text) || /\bnumbers\b/i.test(context.callNotes ?? '')) return 'Working numbers';
  if (/\btrade|payoff|currently drive|driving\b/i.test(text)) return 'Trade discovery';
  if ((context.conversationTimeline ?? []).some((entry) => entry.actor === 'customer' && entry.direction === 'inbound')) return 'Active conversation';
  return context.appointmentStatus && !looksLikePageChrome(context.appointmentStatus) ? compactSnippet(context.appointmentStatus, 40) : 'Needs discovery';
}

function useCaseSummary(context: LeadContext) {
  const text = customerFacingText(context);
  const reason = matchCompact(text, /\b(?:because|need|want|looking for|replacing|for my|for our|for the family|for work)[^\n.]{0,150}/i, 120);
  if (reason && !looksLikePageChrome(reason)) return reason;
  if (/\bnumbers\b|out[-\s]?the[-\s]?door|\botd\b|payment|price/i.test(text)) return 'Focused on whether the deal works before they commit time.';
  return 'Ask why they want this vehicle and what changed with the current one.';
}

function currentVehicleSummary(context: LeadContext) {
  const text = customerFacingText(context);
  const current = matchCompact(text, /\b(?:currently driving|driving now|i drive|my car is|trading in|trade[-\s]?in is|have a)\b[^\n.]{0,150}/i, 120);
  return current && !looksLikePageChrome(current) ? current : 'Ask what they drive now and what happened to the current vehicle.';
}

function financeSummary(context: LeadContext) {
  const text = customerFacingText(context);
  const known = context.paymentBudgetHints && !outboundMarketingOrDealerText(context.paymentBudgetHints) ? compactSnippet(context.paymentBudgetHints, 120) : '';
  if (known) return known;
  const finance = matchCompact(text, /\b(?:payment|monthly|cash|finance|financing|lease|down payment|tier one|fico|credit)[^\n.]{0,150}/i, 120);
  return finance || 'Ask cash/finance, payment comfort, and down-payment plan.';
}

function buyerStructureSummary(context: LeadContext) {
  const text = customerFacingText(context);
  if (/\b(?:co[-\s]?signer|cosigner)\b/i.test(text)) return 'Co-signer is already part of the conversation.';
  if (/\b(?:wife|husband|spouse|partner|mom|dad|parent|family|friend|boss)\b/i.test(text)) return 'Another decision maker may be involved.';
  if (/\b(?:financed a car before|first time buyer|first car|auto loan)\b/i.test(text)) return 'Some prior finance history is visible.';
  return 'Ask if anyone else is involved and whether they have financed a car before.';
}

function timelineSummary(context: LeadContext) {
  const text = customerFacingText(context);
  const liveCall = matchCompact(text, /\bavailable until\b[^\n.]{0,60}\bcall\b|\bavailable\b[^\n.]{0,40}\bfor a call\b/i, 90);
  if (liveCall) return liveCall;
  const timing = matchCompact(text, /\b(?:today|tomorrow|this week|weekend|soon|ready|appointment|coming in|come in|stop by|when can|time)\b[^\n.]{0,120}/i, 110);
  return timing || 'Ask buying timeline and the next realistic step.';
}

function nextAskSummary(context: LeadContext, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) {
    return 'No customer ask right now. Complete the promised quote/update first.';
  }
  const text = customerFacingText(context);
  const hasZip = Boolean(confirmedZipFromContext(context));
  if (/\bavailable until\b.*\bcall\b|\bavailable\b.*\bfor a call\b|\bcall me\b|\bgive me a call\b/i.test(text)) {
    return 'Call now, confirm the current offer, and work trade/price live.';
  }
  if (/\bnumbers\b|out[-\s]?the[-\s]?door|\botd\b|price\b/i.test(text) && /\btrade\b/i.test(text)) {
    return 'Ask what trade they are factoring so the numbers are real.';
  }
  if (/\bnumbers\b|out[-\s]?the[-\s]?door|\botd\b|price\b/i.test(text) && !context.tradeInfo) {
    return hasZip ? 'Ask the one number input missing for real figures: trade or cash/finance.' : 'Ask the one number input missing for real figures: trade, cash/finance, or ZIP.';
  }
  const highestValueQuestion = context.qualification?.highestValueQuestion;
  if (highestValueQuestion && hasZip && /\bzip\b/i.test(highestValueQuestion)) {
    return needsAnalysis.nextBestQuestion.replace(/\bZIP\b/gi, 'trade or finance setup');
  }
  return highestValueQuestion || needsAnalysis.nextBestQuestion;
}

function summaryChecklist(context: LeadContext, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>, page?: ReadPageResponse | null) {
  const missing = (
    context.qualification?.missing?.length
      ? context.qualification.missing
      : needsAnalysis.missingSignals.length
        ? needsAnalysis.missingSignals
        : ['Need current vehicle, trade plan, finance/cash, and buying timeline.']
  )
    .slice(0, 3)
    .join(', ');
  const bullets = [
    `Ownership: ${assignmentSummary(context)}`,
    `Lead path: ${dealOriginSummary(context)}`,
    `Need: ${customerGoalSummary(context, page)}`,
    `Why buying: ${useCaseSummary(context)}`,
    `Current vehicle: ${currentVehicleSummary(context)}`,
    `Trade: ${tradeSummary(context)}`,
    `Finance: ${financeSummary(context)}`,
    `Buyer: ${buyerStructureSummary(context)}`,
    `Timing: ${timelineSummary(context)}`,
    `Missing: ${missing}`,
    `Ask next: ${nextAskSummary(context, needsAnalysis, page)}`,
  ];
  return bullets.slice(0, 9);
}

function bestMoveChecklist(context: LeadContext, customerBrief: ReturnType<typeof buildCustomerBrief>, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) {
    const promise = promisedFollowThroughLine(context);
    return [
      promise ? `Honor the store promise: ${compactSnippet(promise, 120)}` : 'Honor the promised store follow-through first.',
      'Get the OTD, delivery breakdown, and any quoted details out cleanly.',
      'Only text again if the update is ready or the timing changes.',
    ];
  }
  const text = customerFacingText(context);
  if (/\bavailable until\b.*\bcall\b|\bavailable\b.*\bfor a call\b|\bcall me\b|\bgive me a call\b/i.test(text)) {
    return [
      'Call the customer in the window they gave you.',
      'Confirm the current offer and what they are factoring in the trade.',
      'If the numbers line up, set the next commitment before hanging up.',
    ];
  }
  return [
    `Say first: ${customerBrief.recommendedMove}`,
    `Then ask exactly: "${customerBrief.bestQuestion || 'What would make this next step worth your time?'}"`,
    `If they engage: move to the next concrete yes, not another broad question. Goal is ${customerGoalSummary(context, page)}.`,
    'Avoid: do not restart with a generic intro, do not stack multiple questions, and do not promise numbers or availability unless verified.',
  ].filter(Boolean) as string[];
}

function bdcBestMoveReason(context: LeadContext) {
  if (latestCustomerVehicleCorrection(context)) {
    return 'Spoon-feed plan: call, own the mix-up in the first sentence, tell them exactly what you will fix, then close for either a corrected walkaround/video or a ready-to-see appointment.';
  }
  if (context.locationIntel?.classification === 'out_of_state') {
    return 'Spoon-feed plan: call today, remove travel risk fast, verify the vehicle/numbers/process, then lock a same-day phone/video appointment that can lead to pickup, travel, deposit, or shipping.';
  }
  if (context.locationIntel?.classification === 'unknown') {
    return 'Spoon-feed plan: call today, ask where they are coming from, uncover why they want this vehicle, then turn that reason into a specific same-day appointment window.';
  }
  return 'Spoon-feed plan: answer the concern, make today feel easy and controlled, then ask for one of two appointment windows.';
}

function bdcPhoneCallTips(context: LeadContext, customerBrief: ReturnType<typeof buildCustomerBrief>, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) {
    return [
      'Say: "I saw your message. I am making sure the promised update gets handled instead of leaving you hanging."',
      'Then say what is ready, what is still being verified, and the exact time you will follow back up.',
      'Close: "Once I send that over, if it lines up, do you want me to set a time for you to see it or keep this remote?"',
    ];
  }
  const vehicle = context.vehicleOfInterest ?? 'the vehicle';
  if (context.locationIntel?.classification === 'out_of_state') {
    return [
      `Say: "I saw you are on ${vehicle}. Since you are not right around the corner, I want to make this easy before you spend time traveling."`,
      'Ask: "What has you looking at this one, and are you replacing something or adding another vehicle?"',
      'Then qualify softly: cash/finance/outside bank, trade, timeline, and who needs to be on the decision.',
      'Value: promise only the process: correct photos/video, condition check, numbers review, and remote steps. Do not invent approvals or fees.',
      'Close: "Let us set a quick phone/video appointment today so you know if it is worth the trip. Would now or later this afternoon be easier?"',
    ];
  }
  if (context.locationIntel?.classification === 'unknown') {
    return [
      `Say: "I saw you were looking at ${vehicle}. I want to point you the right way instead of wasting your time."`,
      'Ask: "Where would you be coming from, and what would make the visit worth it for you?"',
      'If local: "I can have it pulled up and ready so you are not waiting around. Would earlier today or later this afternoon work better?"',
      'If far: switch to remote confidence first: video, numbers, condition, and pickup/shipping path.',
    ];
  }
  return [
    `Say: "I saw you were looking at ${vehicle}. What caught your eye most on this one?"`,
    'Qualify with curiosity: what they drive now, what changed, trade, payment/cash plan, timing, and decision maker.',
    'Build value: "I can have it pulled up, condition checked, and the right person ready so you are not standing around."',
    `Ask if needed: "${customerBrief.bestQuestion || 'What would make it worth coming in today?'}"`,
    'Close with two choices: "Would earlier today or later this afternoon be easier to see it?"',
  ];
}

function vehicleCandidateDisplay(vehicle: LeadContext['vehicleOfInterestDetails']) {
  if (!vehicle) return 'Unknown';
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  return [title || vehicle.rawText || 'Vehicle', vehicle.stock, vehicle.vin, `${vehicle.confidence}% confidence`].filter(Boolean).join(' | ');
}

function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'unlimited';
  if (value >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10}M`;
  if (value >= 1_000) return `${Math.round((value / 1_000) * 10) / 10}k`;
  return String(value);
}

function quotaIsOwner(quota: QuotaStatus | null, user: AuthResponse['user'] | undefined) {
  return Boolean(quota?.isUnlimited && user?.role === 'owner');
}

function quotaPrimary(quota: QuotaStatus | null, user: AuthResponse['user'] | undefined) {
  if (!quota) return 'AI usage';
  if (quotaIsOwner(quota, user)) return 'Owner override';
  if (typeof quota.estimatedCreditTokensRemaining === 'number') {
    return `${compactNumber(quota.estimatedCreditTokensRemaining)} tokens left`;
  }
  if (typeof quota.dailyTokensRemaining === 'number') {
    return `${compactNumber(quota.dailyTokensRemaining)} daily tokens left`;
  }
  return 'Token tracking';
}

function quotaSecondary(quota: QuotaStatus | null, user: AuthResponse['user'] | undefined) {
  if (!quota) return 'checking';
  if (quotaIsOwner(quota, user)) return 'Unlimited internal usage';
  if (typeof quota.creditBalanceUsd === 'number') {
    const dailyCap =
      typeof quota.dailyTokenLimit === 'number'
        ? ` | cap ${compactNumber(quota.dailyTokenLimit)}`
        : '';
    return `Budget $${quota.creditBalanceUsd.toFixed(2)}${dailyCap}`;
  }
  return 'Budget tracking';
}

function quotaTone(quota: QuotaStatus | null, user: AuthResponse['user'] | undefined) {
  if (!quota || quotaIsOwner(quota, user)) return 'ok';
  if (typeof quota.creditBalanceUsd === 'number') {
    if (quota.creditBalanceUsd <= 0.05) return 'danger';
    if (quota.creditBalanceUsd <= 0.25) return 'warning';
  }
  return 'ok';
}

function inventoryMeta(item: InventorySearchResponse['vehicles'][number]) {
  return [item.price, item.mileage, item.stockNumber].filter(Boolean).join(' | ');
}

function inventoryCountsLabel(inventory: InventorySearchResponse | null) {
  const counts = inventory?.counts;
  if (!counts) return 'New 0 / Used 0';
  return `New ${counts.totalNew} / Used ${counts.totalUsed}`;
}

function manualInventoryQueryActive(query: string) {
  return query.trim().length >= 2;
}

function inventoryLooksReal(item: InventorySearchResponse['vehicles'][number]) {
  return Boolean(item.title.match(/\b(?:19|20)\d{2}\b/) || item.price || item.stockNumber || item.vin);
}

function roleModeFromFilter(role: FilterRole): ResponseRoleMode {
  return role === 'manager' ? 'manager' : 'salesperson';
}

function accessibleViewRoles(user: AuthResponse['user'] | undefined): OwnerViewRole[] {
  if (!user) return ['salesperson'];
  return normalizeAccessibleProfileRoles(user.role, user.accessibleProfileRoles) as OwnerViewRole[];
}

function effectiveUserRoleForView(user: AuthResponse['user'] | undefined, selectedViewRole: OwnerViewRole) {
  const allowed = accessibleViewRoles(user);
  return allowed.includes(selectedViewRole) ? selectedViewRole : allowed[0] ?? 'salesperson';
}

function effectiveRoleModeForView(
  user: AuthResponse['user'] | undefined,
  roleMode: ResponseRoleMode,
  selectedViewRole: OwnerViewRole,
): ResponseRoleMode {
  const effectiveRole = effectiveUserRoleForView(user, selectedViewRole);
  if (effectiveRole === 'manager') return 'manager';
  return roleMode;
}

function conversationModeFromFilter(conversation: FilterConversation): ConversationMode {
  return conversation === 'first_contact' ? 'meet_greet' : 'continue';
}

function toneFromFilter(filterTone: FilterTone): Tone {
  if (filterTone === 'manager') return 'manager_takeover';
  if (filterTone === 'consultative' || filterTone === 'friendly') return 'soft_consultative';
  if (filterTone === 'stronger') return 'aggressive_appointment_setter';
  return 'standard_closer';
}

function actionFromGoal(goal: FilterGoal): QuickAction {
  if (goal === 'appointment') return 'appointment_push';
  if (goal === 'credit_app') return 'finance_push';
  if (goal === 'trade') return 'trade_in_push';
  return 'generate_reply';
}

function columnFromChannel(channel: FilterChannel): ColumnKey {
  return channel === 'text' ? 'sms' : 'strategy';
}

function labelFor<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function leadHasHumanConversation(context: LeadContext) {
  const timeline = context.conversationTimeline ?? [];
  const prior = context.priorMessages ?? [];
  if (!timeline.length && !prior.length) return false;
  return timeline.some(
    (entry) => (entry.actor === 'salesperson' || entry.actor === 'manager') && !/\bclaire\b/i.test(entry.speakerName ?? entry.text ?? ''),
  );
}

function conversationTextFrom(context: LeadContext) {
  return [
    context.vehicleOfInterest,
    context.stockNumber,
    context.tradeInfo && !outboundMarketingOrDealerText(context.tradeInfo) ? context.tradeInfo : undefined,
    context.paymentBudgetHints && !outboundMarketingOrDealerText(context.paymentBudgetHints) ? context.paymentBudgetHints : undefined,
    context.leadSource && !looksLikePageChrome(context.leadSource) ? context.leadSource : undefined,
    context.appointmentStatus && !looksLikePageChrome(context.appointmentStatus) ? context.appointmentStatus : undefined,
    ...(context.priorMessages ?? []).filter((message) => !outboundMarketingOrDealerText(message) && !looksLikePageChrome(message)),
    ...(context.conversationTimeline ?? [])
      .filter((entry) => entry.direction !== 'internal' && entry.channel !== 'note' && entry.actor !== 'system' && !outboundMarketingOrDealerText(entry.text))
      .map((entry) => entry.text ?? ''),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function matchesConversation(context: LeadContext, pattern: RegExp) {
  return pattern.test(conversationTextFrom(context));
}

function hasCashOnlySignal(context: LeadContext) {
  return matchesConversation(context, /\b(cash|pay in full|paid in full|paying in full|cash budget|have \$?\d[\d,]* cash)\b/i);
}

function latestCustomerTextFromContext(context: LeadContext) {
  const entries = (context.conversationTimeline ?? [])
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.actor === 'customer' && item.direction === 'inbound' && item.text?.trim());
  const latest = entries.sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return rightTime - leftTime;
    if (!Number.isNaN(leftTime)) return -1;
    if (!Number.isNaN(rightTime)) return 1;
      return left.index - right.index;
  })[0];
  return latest?.text?.replace(/\s+/g, ' ').trim() ?? '';
}

function latestCustomerVehicleCorrection(context: LeadContext) {
  const latest = latestCustomerTextFromContext(context);
  if (!latest) return false;
  return (
    /\b(?:wrong|all other|one i want|non[-\s]?existent|black one|green one|not the|sent over)\b/i.test(latest) ||
    (/\b(?:photos?|pictures?|gladiators?)\b/i.test(latest) && /\b(?:other|wrong|one i want|sent|non[-\s]?existent)\b/i.test(latest))
  );
}

function conversationStageFor(
  context: LeadContext,
  marketInsight: ReturnType<typeof analyzeLeadMarket>,
  salesPressureTest: ReturnType<typeof buildSalesPressureTest>,
  needsAnalysis: ReturnType<typeof buildNeedsAnalysis>,
): FilterConversation {
  if (context.communicationCompliance?.status && context.communicationCompliance.status !== 'clear') return 'continue';

  const hasHuman = leadHasHumanConversation(context);
  const priceSignal =
    needsAnalysis.priority === 'finance' ||
    Boolean(context.paymentBudgetHints) ||
    matchesConversation(context, /\b(otd|out[-\s]?the[-\s]?door|price|payment|monthly|budget|numbers|fees|tax|cash|finance|financing|approval|apr|rate|\$\d)/i);
  const inventorySignal =
    matchesConversation(context, /\b(stock\s*#?|vin|wrangler|rubicon|sahara|sport|trim|miles|mileage|leather|cloth|hard[-\s]?top|soft[-\s]?top|color|red|white|neon|hybrid|4xe|similar|inventory|features|equipment)\b/i) ||
    Boolean(context.vehicleOfInterest || context.stockNumber);
  const remoteOrFar = context.locationIntel?.classification === 'out_of_state' || context.locationIntel?.classification === 'local_far' || marketInsight.route === 'remote';
  const appointmentReady =
    (Boolean(context.appointmentStatus) && !remoteOrFar) ||
    matchesConversation(context, /\b(appointment|test drive|coming in|come in|stop by|be there|schedule|see it|look at it|ready to buy|ready today|buy today)\b/i) ||
    salesPressureTest.detectedObjections.some((objection) => objection.key === 'availability_condition') ||
    context.leadScore === 'hot';

  if (remoteOrFar) {
    if (priceSignal) return 'price';
    if (inventorySignal) return 'inventory';
    return hasHuman ? 'continue' : 'first_contact';
  }
  if (appointmentReady && priceSignal && hasHuman) return 'appointment';
  if (priceSignal) return 'price';
  if (inventorySignal && hasHuman) return 'inventory';
  if (!hasHuman) return 'first_contact';
  if (context.leadScore === 'cold') return 'reengage';
  return 'continue';
}

function bestQuestionForStage(stage: FilterConversation, context: LeadContext, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>) {
  const text = conversationTextFrom(context);
  const zipRelevantNow =
    /\b(otd|out[-\s]?the[-\s]?door|tax|taxes|tag|title|registration|register|fees|incentive|rebate|discount|delivery|ship|shipping|distance|how far|come in|drive in)\b/i.test(text) ||
    stage === 'price' ||
    stage === 'appointment';
  const knowsCurrentVehicle = /\b(currently driving|driving now|my car|trade|trade-in|paid off|financed|lease|miles|mileage|accident)\b/i.test(text);
  const knowsWhyNow = /\b(need|because|kids|family|work|commute|broke|issue|problem|accident|totaled|upgrade|replace|room|space|payment|gas|reliable)\b/i.test(text);
  if (latestCustomerVehicleCorrection(context)) {
    return 'Confirm the exact Gladiator they wanted, own the photo/color mix-up, and verify availability or service status before asking for anything else.';
  }
  if (context.locationIntel?.classification === 'unknown' && zipRelevantNow) {
    return 'Before I point you the wrong way, what ZIP are you in? It helps me check the right taxes, incentives, and best next step.';
  }
  if (stage === 'first_contact') {
    return 'What caught your eye on this one: the equipment, the miles, the price, or just finding the right fit?';
  }
  if (!knowsWhyNow && stage !== 'price') {
    return 'What made you start looking right now: replacing something, needing more room, or just found the right one?';
  }
  if (!knowsCurrentVehicle && stage !== 'price') {
    return 'What are you driving now, and are you thinking about trading it or keeping it?';
  }
  if (stage === 'price') {
    return 'What do you want me to verify first so the numbers are real: total price, dealer fees, or how it fits your budget?';
  }
  if (stage === 'inventory') {
    return 'What matters most on the vehicle itself: equipment, miles, color, condition, or the deal?';
  }
  if (stage === 'appointment') {
    if (context.locationIntel?.classification === 'out_of_state' || context.locationIntel?.classification === 'local_far') {
      return 'Before we talk travel, what do you want verified first: availability, condition, numbers, or pickup/shipping options?';
    }
    return 'If the numbers and condition check out, what time window would make it easy to see it?';
  }
  if (stage === 'reengage') {
    return 'Are you still looking for this kind of vehicle, or did your priorities change?';
  }
  return needsAnalysis.nextBestQuestion;
}

function recommendedFiltersFor(
  context: LeadContext,
  marketInsight: ReturnType<typeof analyzeLeadMarket>,
  salesPressureTest: ReturnType<typeof buildSalesPressureTest>,
  needsAnalysis: ReturnType<typeof buildNeedsAnalysis>,
  userRole: AuthResponse['user']['role'] | undefined,
  responseRoleMode: ResponseRoleMode,
) {
  const complianceBlocked = Boolean(context.communicationCompliance && context.communicationCompliance.status !== 'clear');
  const location = context.locationIntel;
  const locationClass = location?.classification;
  const primaryObjection = salesPressureTest.detectedObjections[0]?.key;
  const remoteOrFar = locationClass === 'out_of_state' || locationClass === 'local_far' || marketInsight.route === 'remote';
  const financeSignal =
    needsAnalysis.priority === 'finance' ||
    primaryObjection === 'payment_finance' ||
    primaryObjection === 'credit_risk' ||
    primaryObjection === 'price_shopping' ||
    Boolean(context.paymentBudgetHints);
  const tradeSignal = needsAnalysis.priority === 'trade' || primaryObjection === 'trade_value' || Boolean(context.tradeInfo);
  const trustSignal = needsAnalysis.priority === 'trust' || primaryObjection === 'availability_condition';
  const cashOnly = hasCashOnlySignal(context);
  const vehicleCorrection = latestCustomerVehicleCorrection(context);
  const conversation = vehicleCorrection ? 'inventory' : conversationStageFor(context, marketInsight, salesPressureTest, needsAnalysis);

  const role: FilterRole =
    responseRoleMode === 'manager' || userRole === 'manager' ? 'manager' : userRole === 'bdc' ? 'bdc' : 'salesperson';
  let goal: FilterGoal = 'reply';
  if (complianceBlocked) {
    goal = 'reply';
  } else if (vehicleCorrection) {
    goal = 'reply';
  } else if (role === 'manager') {
    goal = 'rapport';
  } else if (role === 'bdc') {
    goal = vehicleCorrection ? 'reply' : 'appointment';
  } else if (remoteOrFar) {
    goal = financeSignal && !cashOnly ? 'needs' : 'reply';
  } else if (tradeSignal) {
    goal = 'trade';
  } else if (conversation === 'first_contact') {
    goal = 'rapport';
  } else if (conversation === 'price') {
    goal = 'needs';
  } else if (conversation === 'inventory') {
    goal = 'inventory';
  } else if (conversation === 'appointment' && !remoteOrFar) {
    goal = 'appointment';
  } else if (trustSignal || locationClass === 'unknown' || needsAnalysis.priority === 'discover') {
    goal = 'needs';
  }
  const tone: FilterTone =
    role === 'manager'
      ? 'manager'
      : vehicleCorrection || trustSignal || conversation === 'price' || remoteOrFar
        ? 'consultative'
        : conversation === 'first_contact'
          ? 'friendly'
          : context.leadScore === 'hot'
            ? 'stronger'
            : 'direct';
  const channel: FilterChannel = complianceBlocked ? 'call' : 'text';
  const length: FilterLength = 'short';

  return { role, conversation, goal, tone, channel, length };
}

function nextMoveLabel(filters: AssistantFilters, context: LeadContext, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) return 'Deliver the promised quote update';
  if (context.communicationCompliance?.status && context.communicationCompliance.status !== 'clear') return 'Use phone only';
  if (latestCustomerVehicleCorrection(context)) return 'Fix vehicle/photo mix-up';
  if (filters.role === 'manager') return 'Manager situational save';
  if (filters.role === 'bdc') {
    if (context.locationIntel?.classification === 'out_of_state') return 'Today phone/video appointment';
    if (context.locationIntel?.classification === 'unknown') return 'Call today, qualify, set visit';
    return 'Today appointment close';
  }
  if (context.locationIntel?.classification === 'out_of_state') return 'Remote confidence';
  if (context.locationIntel?.classification === 'local_far') return 'Verify before trip';
  if (context.locationIntel?.classification === 'unknown' && (filters.goal === 'reply' || filters.goal === 'needs')) return 'Ask for ZIP';
  if (filters.goal === 'rapport') return 'Build rapport';
  if (filters.goal === 'needs') return 'Ask smart needs question';
  if (filters.goal === 'reply') return 'Answer latest message';
  if (filters.goal === 'credit_app') return 'Finance only if relevant';
  if (filters.goal === 'appointment') return 'Only if customer is ready';
  if (filters.goal === 'trade') return 'Get trade info';
  if (filters.goal === 'inventory') return 'Find matching cars';
  return 'Continue naturally';
}

function customerInsightLine(page: ReadPageResponse | null, context: LeadContext, buyerType: { type: string; reason: string }) {
  const latest = compactSnippet(latestCustomerMessage(page), 150);
  if (latest) return `Customer said: "${latest}" ${buyerType.reason ? `Read: ${compactSnippet(buyerType.reason, 110)}` : ''}`.trim();
  if (context.paymentBudgetHints) return `Money is the hinge. ${compactSnippet(context.paymentBudgetHints, 150)}`;
  if (context.tradeInfo) return `Trade may drive the deal. ${compactSnippet(context.tradeInfo, 150)}`;
  return `${buyerType.type}. ${compactSnippet(buyerType.reason, 150) || 'Need one clear next step.'}`;
}

function localAngleLine(context: LeadContext) {
  const location = context.locationIntel;
  if (!location || location.classification === 'unknown') return 'Need ZIP to personalize distance and local angle.';
  if (location.confidence === 'estimated_from_phone') {
    return `${location.label} is estimated from phone. Confirm ZIP before committing to the travel path.`;
  }
  if (location.classification === 'local') return 'Local path. Verify the right car and numbers first, then make the visit easy when they are ready.';
  if (location.classification === 'local_far') return 'Acknowledge the drive. Verify condition and numbers first; only discuss a visit if they ask or are clearly ready.';
  return 'Remote buyer path. Build confidence with video, exact numbers, and pickup/shipping plan before any travel talk.';
}

function salespersonRapportLine(user: AuthResponse['user'] | undefined, context: LeadContext) {
  const pieces: string[] = [];
  const displayName = user?.displayName ?? user?.signatureName ?? user?.name;
  if (displayName) pieces.push(`Rep name: ${displayName}`);
  if (context.locationIntel?.confidence === 'estimated_from_phone') {
    pieces.push(`Location cue is phone-area only: ${context.locationIntel.label}. Say "looks like you may be around ${context.locationIntel.label}" or ask ZIP; do not state it as fact.`);
  } else if (context.locationIntel?.label) {
    pieces.push(`Customer location cue: ${context.locationIntel.label}.`);
  }
  return pieces.length ? pieces.join('\n') : 'No salesperson bio is used. Build rapport from the customer words only.';
}

function responseVarietyLine(context: LeadContext, filters: AssistantFilters) {
  const latest = latestCustomerTextFromContext(context);
  const text = conversationTextFrom(context);
  const options: string[] = [];
  if (context.sentiment === 'negative' || /\b(play games|smooth transaction|go somewhere else|proper dealership|frustrat|no where|now youre saying)\b/i.test(latest)) {
    options.push('Recovery angle: own the friction and make one clear promise. Do not sell, pitch, or ask appointment in the first response.');
  }
  if (/\b(price|fees|numbers|otd|out[-\s]?the[-\s]?door|\$|dealer fees)\b/i.test(latest)) {
    options.push('Numbers angle: ask only for the missing number input, usually ZIP or trade/cash-finance, instead of saying price/fees/availability all together.');
  }
  if (/\b(discount|rebate|incentive|qualif|best price|lowest|out[-\s]?the[-\s]?door|otd|payment|monthly|down payment)\b/i.test(text)) {
    options.push('Qualification angle: explain that ZIP, payment/down, trade, finance path, CDJR ownership/lease bank, military, and first responder status can change the real number. Ask as a short checklist, not an interrogation.');
  }
  if (context.locationIntel?.confidence === 'estimated_from_phone') {
    options.push('Location angle: phone-area is only a clue. Use it lightly once, then ask ZIP if exact taxes/fees matter.');
  }
  if (/\bemail\b/i.test(latest) || /\bvia email|not phone|dont talk numbers via phone|don't talk numbers via phone\b/i.test(text)) {
    options.push('Channel-respect angle: respect email/text preference and do not push a call unless the salesperson explicitly asked for call.');
  }
  if (filters.conversation === 'first_contact') {
    options.push('Intro angle: introduce the rep and ask what matters most about the vehicle. No apology if nothing went wrong yet.');
  }
  if (!options.length) {
    options.push('Continue angle: answer the latest line first, then ask the smallest useful question.');
  }
  return options.join(' ');
}

function qualificationChecklistLine(context: LeadContext) {
  const missing: string[] = [];
  const text = conversationTextFrom(context);
  if (!context.customerZipCode) missing.push('registration ZIP');
  if (!/\b(cash|finance|financing|lease|payment|monthly|apr|rate|through you|own bank|credit union)\b/i.test(text)) missing.push('cash/finance/lease path');
  if (!/\b(down payment|money down|\$[0-9,]+\s*down|zero down|0 down)\b/i.test(text)) missing.push('down payment or payment target');
  if (!/\b(trade|trade-in|trading|payoff|vin|miles|mileage)\b/i.test(text)) missing.push('trade-in yes/no');
  if (!/\b(military|veteran|active duty|first responder|police|firefighter|ems|nurse)\b/i.test(text)) missing.push('military/first responder eligibility');
  if (!/\b(chrysler|dodge|jeep|ram|fiat|cdjr|stellantis|ally|chrysler capital|santander|ccap|own a|lease a)\b/i.test(text)) {
    missing.push('current CDJR/Stellantis ownership or lease bank');
  }
  if (!missing.length) return 'Most discount/payment qualifiers are already visible. Do not ask the full checklist again.';
  return `Missing discount/payment qualifiers: ${missing.join(', ')}. Ask only the 2 to 4 that matter most for the latest customer request; if the customer is resisting, explain these prevent fake numbers and can unlock rebates.`;
}

function roleMissionLine(filters: AssistantFilters, context: LeadContext) {
  const localClass = context.locationIntel?.classification ?? 'unknown';
  if (filters.role === 'bdc') {
    if (localClass === 'local' || localClass === 'local_far') {
      return 'BDC mission: the win is a confirmed same-day appointment. Answer the concern, make today feel easy and prepared, create a reason to come in, then offer two time windows. Use curiosity and value, not pressure.';
    }
    if (localClass === 'out_of_state') {
      return 'BDC mission: still create a same-day appointment path, but make it a phone/video appointment first. Remove travel risk with vehicle proof, numbers/process clarity, and pickup/shipping plan before asking for travel.';
    }
    return 'BDC mission: call today, learn where they are coming from and why they want it, then turn that reason into a same-day appointment or phone appointment.';
  }
  if (filters.role === 'manager') {
    return 'Manager mission: read the situation first. If there is heat or confusion, calm it and solve the immediate problem. If it is a clean first manager touch, make a short human intro, show gratitude, mention family-owned/about two years and 15 years in the business only if natural, then ask one prep question before the specialist helps.';
  }
  return 'Sales Rep mission: act like the person responsible for getting the deal done. Keep the customer engaged, remove friction, ask for the next commitment, and advance toward numbers, appointment, trade, credit, or purchase based on the situation.';
}

function detectNonNegotiables(context: LeadContext) {
  const text = conversationTextFrom(context);
  const items: string[] = [];
  if (context.stockNumber) items.push(`Specific stock ${context.stockNumber}`);
  if (/\b(otd|out[-\s]?the[-\s]?door)\b/i.test(text)) items.push('Wants exact out-the-door total');
  if (/\b(no hybrid|no hybird|non[-\s]?hybrid|do not want a hybrid|don't want a hybrid|no 4xe)\b/i.test(text)) items.push('No hybrid / no 4xe');
  if (/\b(leather seats?|leather)\b/i.test(text)) items.push('Leather seats');
  if (/\b(hard[-\s]?top)\b/i.test(text)) items.push('Hard top');
  const mileage = text.match(/\b(?:under|less than)\s*([\d,]{2,6})\s*(?:miles|mi)?/i);
  if (mileage?.[1]) items.push(`Under ${mileage[1]} miles`);
  if (/\b(not interested in|avoid|no)\s+(?:red|white|neon|red, white|red or white)/i.test(text)) items.push('Avoid red, white, or neon colors');
  const budget = text.match(/\$[\d,]+(?:\.\d{2})?\s*(?:cash|budget|spend)?/i);
  if (budget?.[0]) items.push(`Budget clue: ${budget[0].trim()}`);
  return uniqueByText(items, 8);
}

function intentFromContext(context: LeadContext, page: ReadPageResponse | null, stage: FilterConversation) {
  const latest = compactSnippet(latestCustomerMessage(page), 120);
  if (latest) return latest;
  if (stage === 'price') return 'Needs pricing or out-the-door clarity.';
  if (stage === 'inventory') return 'Shopping a specific vehicle or feature set.';
  if (stage === 'first_contact') return 'New lead needs a warm human start.';
  return 'Need to read the active lead conversation.';
}

function likelyCaresAbout(context: LeadContext, stage: FilterConversation, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>) {
  const cares: string[] = [];
  if (latestCustomerVehicleCorrection(context)) cares.push('getting the exact vehicle/photos right');
  if (stage === 'price' || needsAnalysis.priority === 'finance') cares.push('real numbers');
  if (stage === 'inventory') cares.push('right vehicle fit');
  if (context.locationIntel?.classification === 'local_far' || context.locationIntel?.classification === 'out_of_state') {
    cares.push('not wasting a trip');
  }
  if (context.sentiment === 'negative' || needsAnalysis.priority === 'trust') cares.push('trust and accuracy');
  if (context.tradeInfo) cares.push('trade value');
  if (!cares.length) cares.push('being understood before being closed');
  return cares.join(', ');
}

function knownFactsFor(context: LeadContext, page: ReadPageResponse | null) {
  const vehicleLabel = context.vehicleOfInterest
    ? `Vehicle of interest: ${context.vehicleOfInterest}${context.vehicleOfInterestDetails?.confidence ? ` (${context.vehicleOfInterestDetails.confidence}% confidence)` : ''}`
    : 'Vehicle of interest: unknown';
  const tradeLabel = context.tradeVehicle
    ? `Trade-in: ${compactSnippet(context.tradeVehicle.rawText ?? [context.tradeVehicle.year, context.tradeVehicle.make, context.tradeVehicle.model, context.tradeVehicle.trim].filter(Boolean).join(' '), 90)}`
    : context.tradeInfo
      ? `Trade-in: ${compactSnippet(context.tradeInfo, 90)}`
      : undefined;
  const facts = [
    context.customerName ? `Name: ${context.customerName}` : undefined,
    context.phoneNumbers?.[0] ? `Phone: ${context.phoneNumbers[0]}` : undefined,
    context.emails?.[0] ? `Email: ${context.emails[0]}` : undefined,
    context.customerZipCode ? `ZIP: ${context.customerZipCode}` : context.locationIntel?.label ? `Location: ${context.locationIntel.label}` : 'Location: unknown',
    vehicleLabel,
    context.stockNumber ? `Stock: ${context.stockNumber}` : undefined,
    tradeLabel,
    context.paymentBudgetHints ? `Money: ${compactSnippet(context.paymentBudgetHints, 90)}` : undefined,
    context.appointmentStatus ? `Appointment: ${context.appointmentStatus}` : undefined,
    latestCustomerMessage(page) ? `Last customer: ${compactSnippet(latestCustomerMessage(page), 120)}` : undefined,
  ].filter(Boolean) as string[];
  return facts.slice(0, 9);
}

function valueStoryLine(filters: AssistantFilters, context: LeadContext, user: AuthResponse['user'] | undefined) {
  const text = conversationTextFrom(context);
  const reasons: string[] = [];
  if (filters.role === 'bdc') {
    reasons.push('why BDC: make the visit efficient, confirm the vehicle is worth their time, and connect them with the right person instead of starting from zero');
  } else if (filters.role === 'manager') {
    reasons.push('why manager: restore confidence, clarify what is approved, and give a straight path forward');
  } else {
    reasons.push('why this rep: be the customer advocate inside the store and do the legwork before asking for a bigger commitment');
  }
  if (user?.dealershipName) {
    reasons.push(`why this dealership: ${user.dealershipName} should be positioned around straight answers, transparent process, and respecting the customer's time`);
  } else {
    reasons.push('why this dealership: use only verified store strengths from context; if none are available, sell the process: transparency, preparation, and not wasting the customer time');
  }
  if (context.vehicleOfInterest) {
    reasons.push(`why this vehicle: ${context.vehicleOfInterest} should be tied to the customer's actual need, listed facts, condition, mileage, availability, value, or fit; do not invent features`);
  }
  if (/\b(service|maintain|inspection|recon|certified|warranty|history|carfax)\b/i.test(text)) {
    reasons.push('why our service: mention verified inspection/reconditioning/service history only if present; otherwise offer to check it');
  } else {
    reasons.push('why our service: do not invent service claims; offer to verify condition, inspection, history, or photos when trust matters');
  }
  return reasons.join(' | ');
}

function painPointsFor(context: LeadContext, stage: FilterConversation, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>) {
  const text = conversationTextFrom(context);
  const points: string[] = [];
  if (latestCustomerVehicleCorrection(context)) points.push('Wrong vehicle/photo frustration; recover trust before qualifying.');
  if (stage === 'price') points.push('Needs clear numbers before committing.');
  if (context.locationIntel?.classification === 'local_far' || context.locationIntel?.classification === 'out_of_state') {
    points.push('Distance-sensitive; verify condition and numbers first.');
  }
  if (context.sentiment === 'negative' || needsAnalysis.priority === 'trust') points.push('Trust risk; avoid canned or inaccurate replies.');
  if (/\bwrong vehicle|mis[-\s]?read|misread|confus/i.test(text)) points.push('Prior confusion; recover by reading back the corrected need.');
  if (hasCashOnlySignal(context)) points.push('Cash path; do not push finance unless they ask.');
  return points.length ? points : ['Do not rush the close before learning the buying reason.'];
}

function missingInfoFor(context: LeadContext, needsAnalysis: ReturnType<typeof buildNeedsAnalysis>) {
  const vehicleCorrection = latestCustomerVehicleCorrection(context);
  const missing = vehicleCorrection
    ? needsAnalysis.missingSignals.filter((item) => !/\bzip|tax|distance|finance|payment|cash|trade\b/i.test(item))
    : [...needsAnalysis.missingSignals];
  if (vehicleCorrection) missing.unshift('correct vehicle/photos/status');
  if (!vehicleCorrection && context.locationIntel?.classification === 'unknown') missing.unshift('ZIP for taxes, incentives, and distance');
  if (!vehicleCorrection && !context.tradeInfo) missing.push('trade status');
  if (!vehicleCorrection && !context.paymentBudgetHints && !hasCashOnlySignal(context)) missing.push('cash/finance preference or payment comfort');
  return uniqueByText(missing, 5);
}

function recommendedMoveForBrief(filters: AssistantFilters, context: LeadContext, page?: ReadPageResponse | null) {
  if (page && customerAcknowledgedAndWeOweFollowUp(page, context)) {
    return 'Finish the promised quote/update first, then follow through exactly when you said you would.';
  }
  if (context.communicationCompliance?.status && context.communicationCompliance.status !== 'clear') {
    return 'Respect the contact restriction and use phone/manager review only.';
  }
  if (latestCustomerVehicleCorrection(context)) {
    return 'Own the mix-up, confirm the exact Gladiator, and verify/send the correct photos before asking for ZIP, finance, or appointment.';
  }
  if (context.locationIntel?.classification === 'out_of_state') {
    return 'Out-of-state lead: verify vehicle, condition, numbers, and pickup/shipping path before any travel or appointment talk.';
  }
  if (context.locationIntel?.classification === 'local_far') {
    return 'Distance-sensitive lead: verify condition and numbers before asking for the drive.';
  }
  if (filters.goal === 'rapport') return 'Warm intro, acknowledge the vehicle, ask one human fit question.';
  if (filters.goal === 'needs') return 'Answer what they said, then ask the next useful needs-analysis question.';
  if (filters.goal === 'credit_app') return 'Use finance clarity only if the customer is talking financing/payment. Do not pitch approval.';
  if (filters.goal === 'appointment') return 'Appointment only if the customer is local or explicitly ready after value is clear.';
  if (filters.goal === 'trade') return 'Get trade basics naturally so numbers can become real.';
  if (filters.goal === 'inventory') return 'Confirm the must-haves and use only connected inventory.';
  return 'Continue the thread naturally and keep them talking.';
}

function buildCustomerBrief(
  page: ReadPageResponse | null,
  context: LeadContext,
  filters: AssistantFilters,
  needsAnalysis: ReturnType<typeof buildNeedsAnalysis>,
) {
  return {
    intent: intentFromContext(context, page, filters.conversation),
    stage: labelFor(conversationFilterOptions, filters.conversation),
    cares: likelyCaresAbout(context, filters.conversation, needsAnalysis),
    knownFacts: knownFactsFor(context, page),
    painPoints: painPointsFor(context, filters.conversation, needsAnalysis),
    nonNegotiables: detectNonNegotiables(context),
    missingInfo: missingInfoFor(context, needsAnalysis),
    bestQuestion: bestQuestionForStage(filters.conversation, context, needsAnalysis),
    recommendedMove: recommendedMoveForBrief(filters, context, page),
  };
}

function buildFilteredPrompt({
  filters,
  page,
  context,
  buyerType,
  needsAnalysis,
  ask: _ask,
  additionalContext,
  variant,
  user,
}: {
  filters: AssistantFilters;
  page: ReadPageResponse | null;
  context: LeadContext;
  buyerType: { type: string; reason: string };
  needsAnalysis: ReturnType<typeof buildNeedsAnalysis>;
  ask: string;
  additionalContext: string;
  variant: 'best' | 'another';
  user: AuthResponse['user'] | undefined;
}) {
  const channelInstruction =
    filters.channel === 'call'
      ? 'Output one live phone call talk track only. Keep it short, natural, and focused on the next yes.'
      : filters.channel === 'voicemail'
        ? 'Output one voicemail script under 20 seconds. No fake urgency, no unverified pricing, no text-back language.'
        : filters.channel === 'note'
          ? 'Output a concise CRM note for the salesperson with exact next action and what to avoid.'
          : 'Output one customer-facing text message only. Do not add coaching notes inside the reply.';
  const lengthInstruction =
    filters.length === 'short'
      ? 'Length: short by default. Text must be 1 to 2 sentences, usually under 320 characters. It still needs personality: one human empathy/rapport clause, one useful answer, and one confident next step or easy question only if needed.'
      : filters.length === 'detailed'
        ? 'Length: detailed only where useful. Still keep it skimmable and practical.'
        : 'Length: normal. Say enough to move the deal, then stop.';
  const toneInstruction =
    filters.tone === 'stronger'
      ? 'Tone: stronger closer. Personable, confident, and deal-moving. Sound like a high-performing salesperson who can lower tension, make the customer feel understood, and guide them to the next yes without being rude.'
      : filters.tone === 'friendly'
        ? 'Tone: friendly and human. Warm, simple, and easy to reply to.'
        : filters.tone === 'consultative'
          ? 'Tone: consultative. Clarify the need, remove risk, and earn trust.'
          : filters.tone === 'manager'
            ? 'Tone: manager. Calm authority, clean handoff, no salesperson pretending.'
            : 'Tone: direct. Answer first, then close for one next step.';
  const vehicleCorrection = latestCustomerVehicleCorrection(context);
  const managerHandoffInstruction =
    filters.role === 'manager'
      ? [
          'Manager situational hard rule: this is not a generic salesperson reply.',
          'Write as the dealership manager with situational awareness.',
          'First decide what the manager must do here: calm a heat case, own a mistake, fix confusion, make the first human handoff, clarify a process, or move a serious buyer to the right specialist.',
          'If the customer is upset, confused, correcting us, or waiting on something, solve that specific issue first and do not dump a bio.',
          'If it is a clean first manager touch, keep it short: 2 to 3 short sentences max.',
          'Use a natural intro from the manager/dealership, thank them for the opportunity and for choosing us, and mention the dealership is family-owned and about two years in business only if it sounds human.',
          'Mention the manager has been in the car business about 15 years only if it adds trust and does not sound forced.',
          `Reference ${context.vehicleOfInterest ?? 'the vehicle they asked about'} only if it fits naturally.`,
          `Say our ${specialistLabel(context)} will reach out/help with the next step. Do not name a specific salesperson.`,
          'Ask exactly one useful question about must-haves, non-negotiables, the situation, or anything the customer wants the specialist to know before reaching out.',
          'Do not ask for credit app, trade details, appointment time, price, ZIP, or availability unless the customer explicitly asked for that exact thing.',
        ].join(' ')
      : '';
  return safeDraft([
    'FILTER GENERATE MODE. Generate only because the user clicked Generate. This must be real AI reasoning from the current lead, not a canned or rule-built response.',
    'Use the selected filters as style and objective guidance, not as a script. Read the full current conversation, answer the newest customer-authored message first, and only ask for missing info if a good human salesperson would ask for it right now.',
    'Current-lead-only rule: ignore old browser/page/sidebar/admin text, other customers, prior generated drafts, and generic examples unless they are inside this active lead context.',
    'Language/translation rule: if the customer wrote Spanish or another non-English language, reply in that language when it helps the customer, and return English translations in the API fields customerTranslation, replyTranslation, and options[0].translation. Do not include the translation inside the customer-facing reply text.',
    `Selected filters: Role=${labelFor(roleFilterOptions, filters.role)}; Conversation=${labelFor(conversationFilterOptions, filters.conversation)}; Goal=${labelFor(goalFilterOptions, filters.goal)}; Tone=${labelFor(toneFilterOptions, filters.tone)}; Channel=${labelFor(channelFilterOptions, filters.channel)}; Length=${labelFor(lengthFilterOptions, filters.length)}.`,
    additionalContext.trim()
      ? `USER_EXTRA_DIRECTION:\n${additionalContext.trim()}\nEND_USER_EXTRA_DIRECTION`
      : '',
    additionalContext.trim()
      ? `IMPORTANT SALESPERSON DIRECTION FOR THIS GENERATION. Treat this as current truth from the rep/manager and a high-priority instruction for deciding the reply. Use it with the lead context, let it override generic strategy, and do not reveal internal-only details to the customer:\n${additionalContext.trim()}`
      : 'No extra live salesperson context was provided. Do not invent manager approvals, payment gaps, discount limits, or deal desk facts.',
    additionalContext.trim()
      ? 'Extra Direction hard rule: if the salesperson typed a direct goal like "get credit app", "bring him in", "introduce me", "ask for trade", or "set appointment", the generated reply must pursue that goal directly unless it would be dishonest, unsafe, or impossible. Do not ignore it because of generic best-practice strategy.'
      : '',
    `Role mission: ${roleMissionLine(filters, context)}`,
    managerHandoffInstruction,
    `Customer insight: ${customerInsightLine(page, context, buyerType)}`,
    `Best next move: ${nextMoveLabel(filters, context, page)}.`,
    `Needs analysis input, not a script: known=${needsAnalysis.knownSignals.slice(0, 3).join(' | ') || 'not enough yet'}; missing=${needsAnalysis.missingSignals.slice(0, 3).join(' | ') || 'none obvious'}; possible next question=${needsAnalysis.nextBestQuestion}`,
    `Salesperson relationship context. Use one safe hook only if it fits naturally; do not dump a bio:\n${salespersonRapportLine(user, context)}`,
    `Value story to consider. Use only the relevant part, and do not invent claims:\n${valueStoryLine(filters, context, user)}`,
    `Response variety guidance: ${responseVarietyLine(context, filters)}`,
    'Redundancy guard: before writing, compare the newest customer message, whole conversation digest, prior outbound messages, and any current draft being rewritten. Do not repeat the same intro, ask, ZIP request, appointment close, finance/credit-app ask, availability/price phrase, or value claim unless repeating it is genuinely needed to move this deal. If the same point must come back, reframe it with fresh wording and one new customer benefit or reason.',
    `Discount/payment qualification: ${qualificationChecklistLine(context)}`,
    customerAcknowledgedAndWeOweFollowUp(page, context)
      ? `Critical judgment rule for this lead: the latest customer message is only an acknowledgment, and the dealership already promised the next step. Best Next Move should tell the salesperson to complete the promised follow-through. Generate Reply should still produce a short customer-facing ownership text from the dealership side, not a no-reply note and not a customer-sounding response. Good pattern: reassure, restate what the store is delivering, give the timing, and stop. Do not say "once I have that" or anything that sounds like we are the customer waiting on someone else.`
      : '',
    confirmedZipFromContext(context)
      ? `Confirmed customer ZIP/location: ${explicitCustomerAddress(context) ?? context.customerLocation ?? confirmedZipFromContext(context)}. ZIP is already known on this lead. Do not ask the customer for ZIP again unless they explicitly say the address changed or they want a different registration address used.`
      : '',
    `Parser vehicle read: vehicleOfInterest=${context.vehicleOfInterest ?? 'UNKNOWN'}; vehicleConfidence=${context.vehicleOfInterestDetails?.confidence ?? 'none'}; tradeIn=${context.tradeVehicle?.rawText ?? context.tradeInfo ?? 'unknown'}; parserWarnings=${context.parserDebug?.warnings?.join(' | ') || 'none'}. Never substitute the trade-in as the vehicle the customer wants.`,
    context.customerIntelligence
      ? `Customer intelligence: intent=${context.customerIntelligence.customerIntent ?? 'unknown'}; cares=${context.customerIntelligence.likelyCaresAbout.join(' | ') || 'unknown'}; pain=${context.customerIntelligence.painPoints.join(' | ') || 'none detected'}; non-negotiables=${context.customerIntelligence.nonNegotiables.join(' | ') || 'none detected'}; bestQuestion=${context.customerIntelligence.bestNextQuestion ?? 'unknown'}.`
      : '',
    context.qualification
      ? `Qualification reasoning input: known=${context.qualification.known.join(' | ') || 'none'}; missing=${context.qualification.missing.join(' | ') || 'none'}; highestValueQuestion=${context.qualification.highestValueQuestion ?? 'unknown'}; creditAppAppropriate=${context.qualification.creditAppAppropriate}; appointmentAppropriate=${context.qualification.appointmentAppropriate}; reason=${context.qualification.reason ?? 'none'}.`
      : '',
    vehicleCorrection
      ? 'Location angle: do not ask for ZIP, finance setup, credit app, or appointment in this reply. The latest customer needs wrong-vehicle/photo recovery first.'
      : `Location angle: ${localAngleLine(context)} ${locationStrategyReason(context.locationIntel)}`,
    latestCustomerMessage(page) ? `Latest customer-authored message:\n${latestCustomerMessage(page)}` : '',
    conversationDigest(page) ? `Whole conversation digest. Use this to continue the thread instead of restarting it:\n${conversationDigest(page)}` : '',
    additionalContext.trim()
      ? 'Live-context behavior: if the rep says we are too far from the number, do not draft as if the target is reachable. Bridge honestly: acknowledge the gap, protect trust, offer structure, alternate vehicle, trade, money-down/finance path, or manager-reviewed best offer. Ask for one realistic commitment.'
      : '',
    channelInstruction,
    toneInstruction,
    lengthInstruction,
    closingMachinePrompt,
    dealershipEconomicsPrompt,
    humanNeedsEnginePrompt,
    'Professional friend voice: write like a sharp, warm salesperson the customer would actually like. The message should have a little human softness: "I get you", "I got you", "that is exactly why", "let me make this easier", "I do not want you stuck here all day" when it naturally fits. Do not overdo it. One warm human line is enough.',
    'No straight-face rule: avoid sounding stern, legal, defensive, or like a policy explanation. If a sentence sounds like it could be read with a rude straight face, rewrite it warmer while keeping control of the deal.',
    'Emotional texture rule: include one small emotional cue when the customer is difficult: relief, protection, respect, humor-lightness, or "I am on your side." The response still must be short and professional.',
    'Originality mandate: the draft must not sound like a stored template. Before writing, infer the customer state: fear, objection, leverage point, urgency, and best next commitment. Then write one fresh message from those facts. If two leads have different facts, the replies should not share the same opening or closing sentence.',
    'No redundant echo rule: do not stack the same idea twice in one reply, and do not resend the same ask the dealership already sent unless the customer ignored it and it is still the highest-value next step. Even then, change the angle so it feels like progress, not a loop.',
    'Internal strategy selection: choose exactly one primary strategy for this reply: disarm distrust, protect time, clarify money, respect channel preference, recover from mistake, create urgency, earn appointment, qualify rebates, or get manager-ready facts. Do not mention the strategy label. Do not combine all strategies.',
    'Value-story mandate: when a customer resists, the reply must answer at least one real "why" before asking for commitment: why this dealership, why this rep, why this process, why this vehicle, why our reconditioning/inspection, or why coming in helps. Use verified facts only; if a fact is unknown, offer to check it instead of claiming it. This should feel like a reason to trust, not a slogan.',
    'Reason-before-ask rule: do not ask for ZIP, appointment, call, trade, down payment, or finance path as a naked request. Pair the ask with the customer benefit: accurate OTD, stronger manager request, better rebate check, less time in store, vehicle pulled up, or avoiding surprises.',
    'Situational awareness mandate: do not rely on a precoded scenario. Infer the real situation from the latest customer message, the whole conversation, lead source, stage, distance/location confidence, vehicle, trade, timing, sentiment, and what the salesperson already tried. Decide the best next commitment for this exact moment. If the situation is unusual, reason from first principles: what does the customer need to feel safe enough to take the next step?',
    'Commitment ladder: always try to earn the strongest reasonable next yes, not just a reply. Possible commitments include answering one qualifier, sharing why they are looking, saying what they drive now, sending ZIP, confirming trade basics, agreeing to a call, picking an appointment time, sending photos/docs, completing a credit app, confirming the vehicle, giving permission to have a manager work numbers, leaving a deposit, or agreeing to buy if approved. Pick one, make it easy, and do not ask for multiple commitments at once.',
    'Money-impact rule: anything that could cost the dealership money or create a binding expectation must be framed as needing approval. Do not promise a discount, coupon, trade value, payment, rate, fee waiver, free delivery, repair, accessory, price match, hold, deposit terms, or manager approval unless it is already explicitly verified in the lead context. Instead say you can ask, check, push for it, or have a manager confirm it.',
    'Approval language: when the customer asks for money-impacting concessions, sound like their advocate without committing dealership money. Make clear you can pursue, check, or get approval, but cannot promise what has not been approved. Ask for the one input that helps the customer get taken seriously, not the store.',
    'Finance structure rule: think like a dealership and a customer advocate at the same time. Do not suggest huge down payments that leave only a tiny financed balance. If discussing pay-later strategy, preserve a financeable amount and mention bank minimums only if verified; otherwise ask for permission to structure it. If policy says minimum amount financed is available, use it as a reason to keep some cash back, finance enough to qualify, and pay down or pay off later if there is no prepayment penalty. Do not promise no prepayment penalty unless verified in context or dealership policy.',
    'Payment transparency rule: do not hide or misrepresent finance terms, APR, term length, down payment, fees, or lender conditions. If discussing payment expectations, say they are estimates until approved and make clear final term/APR/down payment must be confirmed in writing. You may guide the customer toward a comfortable payment conversation, but never create a misleading payment expectation.',
    'Gross/profit protection rule: do not train customers to expect thousands off on a used vehicle. When a customer has a hard cash ceiling, pivot to structure, vehicle fit, trade, alternate inventory, or manager-reviewed best move instead of immediately discounting. Make the structure sound customer-beneficial: keeping cash in pocket, meeting bank rules, preserving options, and still getting the vehicle they actually want.',
    'Closer framework: every customer-facing reply should feel like the salesperson is on the customer side inside the dealership. Relate to the person, name their concern fairly, reassure them you will protect their time/money, explain the next step as leverage for them, then close for one small commitment. Do not merely collect data. Do not sound like support. Sound like someone who wants the deal and is willing to work for the customer.',
    'Emotional disarm rule: the first line should lower the customer defenses, not just acknowledge facts. Make them feel safe by agreeing with the reasonable part of their objection, removing pressure, and showing you understand why they are guarded. Write the line from the actual customer situation; do not reuse canned empathy phrases.',
    'Customer-advocate requirement: the customer should feel the rep understands them and is trying to help them win. Show the rep is protecting their time, money, and leverage inside the dealership. Use one specific advocate thought based on the conversation, not a generic "I understand" line.',
    'Empathy requirement: if the customer is frustrated, skeptical, correcting the dealership, or asking for numbers, open by validating the exact emotion or risk in plain language before any ask. Prefer specific empathy over generic empathy: wasted trip, surprise fees, dealership runaround, unclear numbers, pressure, time off work, long drive, or distrust from earlier messages. Do not use sterile phrases like "totally fair question" if a warmer line fits.',
    'Personable closer requirement: sound like a real high-trust salesperson, not a phrase bank. The close should feel like relief, not pressure. It should make the requested micro-commitment feel useful to the customer, not useful to the dealership. Avoid stiff corporate wording. Prefer relaxed spoken phrasing over perfect grammar when it sounds more human.',
    'Trust-building close rule: after empathy, invite a micro-commitment that feels safe and useful. Do not close with a cold data demand. Explain what the customer gets in return for the commitment, using fresh wording tied to their latest objection.',
    'Anti-template rule: do not keep reusing the same skeleton. Never copy or lightly paraphrase example lines from these instructions. Internally choose one strategy angle, then write a fresh reply using details from this lead. Avoid repeating the cluster "verify availability, price, and fees" unless that exact full cluster is the best move.',
    'Banned lazy endings for text unless truly necessary: "before we talk about any trip", "before making a trip", "let me verify price, fees, and availability", "what ZIP should I use" repeated after already asking ZIP. Use fresh wording tied to the latest customer line.',
    'Rapport requirement: make the message sound like a real person. Use at most one natural relationship hook from the live lead context. Do not mention random hobbies or local spots unless it clearly helps the customer feel safer.',
    'Location requirement: use confirmed ZIP/city when available. If the lead already contains a confirmed ZIP or visible address, do not ask for ZIP again. If only phone area is available, phrase it as an estimate and ask for ZIP only when taxes, fees, distance, delivery, or incentives matter. Do not say the customer is local from phone number alone.',
    'Withheld-info playbook: when a customer refuses ZIP, down payment, payment goal, finance path, trade info, military/first responder, or CDJR ownership info, do not fight them and do not become a questionnaire. First lower the guard and take their side in fresh language. Then explain the ask as leverage for the customer: the info helps avoid fake OTD, missed rebates, wrong tax/title, or a weak desk request. Ask the smallest useful question, or at most a short checklist.',
    'Difficult local OTD customer: do not immediately defend dealership process. First say you understand they are trying to avoid wasting hours at the store or getting surprised by fees. Then position yourself as the person who will make the visit unnecessary unless the number makes sense. Then ask for the minimum info needed to make the OTD real.',
    'Banned gatekeeper wording: avoid anything that sounds like the dealership is making the customer jump through hoops. The missing information must be framed as helping the customer get an accurate, useful, stronger answer.',
    'Discount qualifier wording: if asking several qualifiers, make it sound like you are protecting the customer from missing money or getting the wrong number. Keep it short, conversational, and never like a credit interrogation.',
    filters.conversation === 'first_contact'
      ? 'Stage: first contact. Warm human intro is allowed once, then ask one natural question about why this vehicle caught their eye. Do not push appointment, credit app, or down payment yet.'
      : filters.conversation === 'price'
        ? 'Stage: price/payment. Answer the money concern honestly, clarify missing inputs, and explain that exact numbers must be verified. Do not overpromise discounts or call it best price unless verified.'
        : filters.conversation === 'inventory'
          ? 'Stage: inventory/vehicle interest. Understand the exact must-haves and why this car matters. Offer similar vehicles only from connected inventory.'
          : filters.conversation === 'appointment'
            ? 'Stage: appointment-ready. Make the visit or call useful and easy, but still answer the latest message first.'
            : filters.conversation === 'reengage'
              ? 'Stage: stale/re-engage. Restart naturally with a useful reason to answer. No needy "just checking in."'
              : 'Stage: active conversation. Continue the existing thread. Do not start with "Hi [name], [rep] here" unless there was no human rep before or the customer is cold.',
    filters.goal === 'rapport'
      ? 'Goal: build trust. Acknowledge the customer like a person and ask one easy needs-analysis question. No appointment pressure.'
      : '',
    filters.goal === 'needs'
      ? `Goal: needs analysis. Ask only one or two natural questions max, but choose the question using OpenAI judgment from the latest customer message. Learn what the customer drives now, why they are looking, what changed or happened to the current vehicle, who/what the vehicle is for, timing, budget comfort, trade, and must-haves. Use that reason later to close, not just to fill a form. Possible question to consider, not force: ${bestQuestionForStage(filters.conversation, context, needsAnalysis)}`
      : '',
    filters.goal === 'credit_app'
      ? 'Credit app path: use only when financing, payment, approval, or remote finance options are actually part of the customer request. Distance alone is not a credit-app reason. If they said cash or paying in full but the all-in number is slightly above budget, position financing as a structure option only if it helps them keep cash back or bridge a gap; do not push credit as pressure.'
      : '',
    filters.goal === 'appointment'
      ? 'Appointment path: only ask after creating value. Explain why the visit or call helps this specific customer, then offer one or two clean options. Never ask an out-of-state or far customer to come in unless they ask or are explicitly planning travel; remote verification comes first.'
      : '',
    filters.role === 'bdc'
      ? 'BDC-specific behavior: your main job is to create a same-day showed appointment or a committed same-day phone/video appointment. Do not sound like a desk manager working a full deal by text. Answer the newest concern first, then build value in today: vehicle pulled up, condition checked, trade/appraisal path ready, numbers person available, similar options ready, and less waiting. Use psychological appointment setting: reduce friction, make it feel prepared and low-risk, give two specific windows, and tie the visit to the customer own reason for looking. For out-of-state customers, do not ask them to blindly come in today; create a today phone/video appointment that can earn travel, pickup, deposit, or shipping after confidence is built. If Channel=Call, output a live BDC phone talk track with opener, value reason, curiosity question, and appointment close.'
      : '',
    filters.role === 'salesperson'
      ? 'Salesperson-specific behavior: own the deal. Build enough value to ask for business directly. When the customer is close, ask for a real commitment: buy today if approved, leave a deposit, submit the structure to management, or come in for a ready-to-finish appointment. Use this only when the conversation supports it and never before answering their concern.'
      : '',
    filters.goal === 'inventory'
      ? 'Inventory path: discuss exact matching needs and recommend real stock only if inventory context is present. If not present, say you will check exact matches.'
      : '',
    vehicleCorrection
      ? 'HARD RULE FOR THIS LEAD: the customer is correcting a wrong vehicle/photo/color issue. First own it briefly, confirm the exact vehicle they meant, and say you will verify/send the correct photos or availability/service status. Do not ask for ZIP, finance, trade, appointment, credit app, or generic "what should I verify first" in this response.'
      : '',
    promptByPlay[actionFromGoal(filters.goal)],
    variant === 'another' ? 'Try a different angle from the last draft, but keep the same selected filters.' : '',
    'Personality mandate: every generated reply should feel handcrafted, relaxed, and lightly charming. Use one safe human line, a tiny bit of warmth, or a natural smile when possible. Do not force jokes, do not be corny, and do not make up personal/local facts. The customer should feel like texting this salesperson back would be easy. If the draft has no warmth, rewrite it before output.',
    'Rapport before goal: answer like you understood the person first, then move the deal. Hide internal labels like appointment push or credit app behind normal human language.',
    'Early conversation rule: do not ask when they can come in, ask for down payment, or push a credit app unless the latest customer message clearly makes that the correct next step.',
    'Qualification rule: before numbers, discounts, appointments, or credit apps, decide what key setup is missing: reason for purchase, why this vehicle/body style, where they saw us, current or previous vehicle, what happened to it, accident/repair/lease trigger, trade/payoff/title, finance/cash/outside bank, whether we can compete for rate, co-signer/buyer structure, credit comfort, down payment/payment goal, timing, logistics, and decision maker. Ask the least abrasive single curiosity question only when it prevents fake numbers or gives the salesperson leverage.',
    'Continue mode hard rule: if Conversation=Active Conversation, do not reintroduce yourself, do not say "[name], [rep] here", and do not restart the lead. Acknowledge or answer the latest customer message directly, then ask one useful follow-up.',
    'Ask bar separation rule: ignore the Ask Closer coaching question field when generating a customer-facing reply. Only use the Extra Direction / salesperson live deal context field as additional instruction for Generate.',
    'Local research rule: do not name restaurants, landmarks, or neighborhoods unless localResearch.status=available and the place is listed there. If location is phone-area-only, say "looks like you may be around..." and ask for ZIP.',
    'No em dashes. No generic "just checking in." No repeated name unless it improves the conversation. No fabricated location, inventory, pricing, approval, rebates, or OpenAI credit balance.',
  ]);
}

function Sidebar() {
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, user: undefined });
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [apiBaseUrl, setApiBaseUrlState] = useState('');
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [ask, setAsk] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [dictatingContext, setDictatingContext] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState<'idle' | 'starting' | 'listening' | 'stopping' | 'error'>('idle');
  const additionalContextRef = useRef<HTMLTextAreaElement | null>(null);
  const additionalContextValueRef = useRef('');
  const dictationRef = useRef<any>(null);
  const dictationBaseContextRef = useRef('');
  const dictationTranscriptRef = useRef('');
  const dictationStopResolverRef = useRef<((value: string) => void) | null>(null);
  const [tone, setTone] = useState<Tone>('standard_closer');
  const [roleMode, setRoleMode] = useState<ResponseRoleMode>('salesperson');
  const [ownerViewRole, setOwnerViewRole] = useState<OwnerViewRole>('salesperson');
  const [conversationMode, setConversationMode] = useState<ConversationMode>('continue');
  const [controlTab, setControlTab] = useState<ControlTab>('recommended');
  const [customFilters, setCustomFilters] = useState<AssistantFilters>(defaultAssistantFilters);
  const [selectedLeadAction, setSelectedLeadAction] = useState<QuickAction>('generate_reply');
  const [page, setPage] = useState<ReadPageResponse | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ColumnKey, AiGenerateResponse>>>({});
  const [draftActions, setDraftActions] = useState<Partial<Record<ColumnKey, QuickAction>>>({});
  const [readPageDraft, setReadPageDraft] = useState<AiGenerateResponse | null>(null);
  const [askCoachDraft, setAskCoachDraft] = useState<AiGenerateResponse | null>(null);
  const [primaryOutputColumn, setPrimaryOutputColumn] = useState<ColumnKey>('sms');
  const [inventory, setInventory] = useState<InventorySearchResponse | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [loading, setLoading] = useState<ColumnKey | 'all' | 'inventory' | 'read' | 'play' | 'ask' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchState, setWatchState] = useState<WatchState>('waiting');
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('coach');
  const [, setBuyerHistory] = useState<BuyerHistoryItem[]>([]);
  const fingerprintRef = useRef('');
  const activeLeadKeyRef = useRef('');
  const leadScopedInputsStaleRef = useRef(false);
  const latestCustomerSignatureRef = useRef('');
  const lastAutoDraftSignatureRef = useRef('');

  useEffect(() => {
    additionalContextValueRef.current = additionalContext;
  }, [additionalContext]);

  useEffect(() => {
    if (ask.trim() || additionalContext.trim()) {
      leadScopedInputsStaleRef.current = false;
    }
  }, [ask, additionalContext]);

  useEffect(() => {
    const allowed = accessibleViewRoles(auth.user);
    if (!allowed.includes(ownerViewRole)) {
      setOwnerViewRole(allowed[0] ?? 'salesperson');
    }
  }, [auth.user, ownerViewRole]);

  useEffect(() => {
    const listener = (message: { type?: string; transcript?: string; state?: string; error?: string; level?: number }) => {
      if (message.type === 'MIC_TRANSCRIPT_UPDATE') {
        dictationTranscriptRef.current = message.transcript ?? '';
        const liveContext = mergeDictationContext(dictationBaseContextRef.current, dictationTranscriptRef.current);
        additionalContextValueRef.current = liveContext;
        setAdditionalContext(liveContext);
      }
      if (message.type === 'MIC_LEVEL') {
        setMicLevel(typeof message.level === 'number' ? Math.max(0, Math.min(1, message.level)) : 0);
      }
      if (message.type === 'MIC_STATE' && message.state === 'listening') {
        setDictatingContext(true);
        setMicStatus('listening');
      }
      if (message.type === 'MIC_STATE' && message.state === 'stopped' && dictationRef.current) {
        if (message.transcript) dictationTranscriptRef.current = message.transcript;
        finishDictation();
      }
      if (message.type === 'MIC_ERROR') {
        dictationRef.current = null;
        setDictatingContext(false);
        setMicStatus('error');
        setMicLevel(0);
        setNotice(`Mic could not start: ${message.error ?? 'permission blocked'}. Check extension microphone permission, then click Mic again.`);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function can(permission: UserPermission) {
    return auth.user?.role === 'owner' || Boolean(auth.user?.permissions?.includes(permission));
  }

  function updateAsk(value: string) {
    setAsk(value);
    setAskCoachDraft(null);
  }

  function clearDraftState() {
    setDrafts({});
    setDraftActions({});
    setReadPageDraft(null);
  }

  function clearLeadScopedState() {
    clearDraftState();
    setInventory(null);
    setInventoryQuery('');
    setAsk('');
    setAskCoachDraft(null);
    setAdditionalContext('');
    additionalContextValueRef.current = '';
    dictationBaseContextRef.current = '';
    dictationTranscriptRef.current = '';
    lastAutoDraftSignatureRef.current = '';
  }

  function enrichContext(rawContext: LeadContext): LeadContext {
    const sanitized = sanitizeContext(rawContext);
    const permissionSafeContext = can('canUsePhoneTranscriptContext')
      ? sanitized
      : (() => {
          const { callTranscript: _callTranscript, ...rest } = sanitized;
          return { ...rest, callRecordingLinks: [] };
        })();
    return enrichLeadLocation(permissionSafeContext, auth.user?.dealershipLocation);
  }

  function canSwitchRoleMode() {
    return accessibleViewRoles(auth.user).length > 1;
  }

  async function refreshQuota(silent = true) {
    try {
      const status = await sendExtensionMessage<QuotaStatus>({ type: 'USAGE_QUOTA' });
      setQuota(status);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Quota check failed');
    }
  }

  async function refreshAuth() {
    const status = await sendExtensionMessage<AuthStatusResponse>({ type: 'AUTH_STATUS' });
    setAuth({ authenticated: status.authenticated, user: status.user });
    if (status.apiBaseUrl) setApiBaseUrlState((current) => current || status.apiBaseUrl || '');
    if (status.authenticated) void refreshQuota(true);
    else setQuota(null);
  }

  useEffect(() => {
    refreshAuth().catch((err) => setError(err.message));
    const interval = window.setInterval(() => {
      refreshAuth().catch(() => {
        setAuth({ authenticated: false, user: undefined });
        setQuota(null);
      });
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return;
    void refreshQuota(true);
    const interval = window.setInterval(() => void refreshQuota(true), 30000);
    return () => window.clearInterval(interval);
  }, [auth.authenticated, auth.user?.id]);

  const availableTones = useMemo(() => toneOptions.filter((option) => can(option.permission)), [auth.user?.role, auth.user?.permissions?.join('|')]);

  useEffect(() => {
    if (!availableTones.some((option) => option.value === tone) && availableTones[0]) {
      setTone(availableTones[0].value);
    }
  }, [availableTones, tone]);

  useEffect(() => {
    if (!can('canUseLiveWatch')) {
      setWatchEnabled(false);
      setWatchState('off');
      return;
    }
    if (watchEnabled) setWatchState((current) => (current === 'off' ? 'waiting' : current));
  }, [auth.user?.role, auth.user?.permissions?.join('|'), watchEnabled]);

  const context: LeadContext =
    page?.context ??
    enrichContext({
      timestamps: [],
      priorMessages: [],
      conversationTimeline: [],
      callRecordingLinks: [],
      crmAutomationHints: [],
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      visibleText: ask || undefined,
      sentiment: 'unknown',
      leadScore: 'warm',
    });
  const marketInsight = analyzeLeadMarket(context);
  const buyerProfile = buildBuyerProfile(context, marketInsight);
  const salesPressureTest = buildSalesPressureTest(context, 'generate_reply');
  const needsAnalysis = buildNeedsAnalysis(context);
  const salesInfluencePlan = buildSalesInfluencePlan(context, selectedLeadAction);
  const buyerType = buyerTypeFrom(context, marketInsight, salesPressureTest, needsAnalysis);
  const communicationCompliance = context.communicationCompliance;
  const contactBlocked = Boolean(communicationCompliance && communicationCompliance.status !== 'clear');
  const complianceMessage =
    communicationCompliance?.status === 'do_not_contact'
      ? 'Do not contact. Manager/compliance review required before outreach.'
      : communicationCompliance?.status === 'sms_opt_out'
        ? 'SMS opt-out found. Do not text; use call or voicemail only if allowed.'
        : '';
  const recommendedInventory = recommendInventoryForLead(context, inventory?.vehicles ?? [], marketInsight)
    .filter(inventoryLooksReal)
    .slice(0, 5);
  const selectedLeadPlay = leadPlays.find((play) => play.action === selectedLeadAction) ?? defaultLeadPlay;

  useEffect(() => {
    const conversationId = page?.conversationId;
    if (!conversationId || !page?.context.extractedAt) return;
    const current = readBuyerHistory(conversationId);
    const previous = current.at(-1);
    const next =
      previous?.type === buyerType.type && previous.reason === buyerType.reason
        ? current
        : [...current, { at: new Date().toISOString(), type: buyerType.type, reason: buyerType.reason }].slice(-6);
    writeBuyerHistory(conversationId, next);
    setBuyerHistory(next);
  }, [page?.conversationId, page?.context.extractedAt, buyerType.type, buyerType.reason]);

  async function login() {
    setError('');
    setNotice('');
    try {
      if (apiBaseUrl.trim()) {
        const config = await sendExtensionMessage<ExtensionConfigResponse>({
          type: 'CONFIG_SET',
          apiBaseUrl: apiBaseUrl.trim(),
        });
        setApiBaseUrlState(config.apiBaseUrl);
      }
      const response = await sendExtensionMessage<AuthResponse>({ type: 'AUTH_LOGIN', userId: userId.trim(), password });
      setAuth({ authenticated: true, user: response.user });
      setPassword('');
      setNotice('Signed in.');
      void refreshQuota(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  async function logout() {
    await sendExtensionMessage({ type: 'AUTH_LOGOUT' });
    setAuth({ authenticated: false, user: undefined });
    setPage(null);
    setDrafts({});
    setDraftActions({});
    setReadPageDraft(null);
    setAskCoachDraft(null);
    setInventory(null);
    setQuota(null);
    setWatchState('off');
    fingerprintRef.current = '';
    activeLeadKeyRef.current = '';
    leadScopedInputsStaleRef.current = false;
    latestCustomerSignatureRef.current = '';
    lastAutoDraftSignatureRef.current = '';
  }

  function canWriteColumn(columnKey: ColumnKey) {
    if (columnKey === 'sms') return can('canGenerateSms');
    if (columnKey === 'email') return can('canGenerateEmail');
    return can('canGenerateCrmNote') && can('canUseDealStrategy');
  }

  async function loadInventory(
    query =
      inventoryQuery ||
      inventoryIntentQueryFromPage(page, leadScopedInputsStaleRef.current ? '' : ask) ||
      context.vehicleOfInterest ||
      '',
  ) {
    if (!can('canUseInventoryLookup')) return null;
    const normalizedQuery = query.trim();
    setError('');
    setLoading('inventory');
    try {
      const response = await sendExtensionMessage<InventorySearchResponse>({
        type: 'INVENTORY_SEARCH',
        query: normalizedQuery,
        limit: 8,
      });
      setInventory(response);
      setInventoryQuery(normalizedQuery);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inventory load failed');
      return null;
    } finally {
      setLoading('');
    }
  }

  async function syncPage({
    draftStrategy = false,
    fetchInventory = false,
    freshRead = false,
    silent = false,
  }: {
    draftStrategy?: boolean;
    fetchInventory?: boolean;
    freshRead?: boolean;
    silent?: boolean;
  } = {}) {
    if (!can('canReadAnyPage')) {
      setError('This user does not have page-reading permission.');
      return null;
    }

    if (!silent) {
      setError('');
      setNotice('');
      setLoading('read');
      if (freshRead) {
        activeLeadKeyRef.current = '';
        fingerprintRef.current = '';
        latestCustomerSignatureRef.current = '';
        leadScopedInputsStaleRef.current = true;
        setPage(null);
        clearLeadScopedState();
      }
    }

    try {
      const activePage = await sendExtensionMessage<ReadPageResponse>({ type: 'READ_PAGE' });
      const cleanPage = { ...activePage, context: enrichContext(activePage.context) };
      const nextFingerprint = pageFingerprint(cleanPage);
      const changed = Boolean(fingerprintRef.current && fingerprintRef.current !== nextFingerprint);
      const nextLeadKey = leadIdentityKey(cleanPage);
      const leadChanged = Boolean(activeLeadKeyRef.current && nextLeadKey && activeLeadKeyRef.current !== nextLeadKey);
      if (!activeLeadKeyRef.current && nextLeadKey) activeLeadKeyRef.current = nextLeadKey;
      if (leadChanged) {
        activeLeadKeyRef.current = nextLeadKey;
        latestCustomerSignatureRef.current = '';
        clearDraftState();
        setInventory(null);
        setInventoryQuery('');
      } else if (changed) {
        clearDraftState();
      }
      fingerprintRef.current = nextFingerprint;
      const nextCustomerSignature = latestCustomerSignature(cleanPage);
      const newCustomerReply = Boolean(
        silent &&
          !leadChanged &&
          nextCustomerSignature &&
          latestCustomerSignatureRef.current &&
          latestCustomerSignatureRef.current !== nextCustomerSignature &&
          customerReplyNeedsResponse(cleanPage),
      );
      if (nextCustomerSignature) latestCustomerSignatureRef.current = nextCustomerSignature;
      setPage(cleanPage);
      setLastSyncedAt(new Date().toLocaleTimeString());
      setWatchState(watchEnabled && can('canUseLiveWatch') ? 'watching' : 'waiting');
      if (!silent) {
        const messageCount = cleanPage.context.parserDebug?.messagesParsedCount ?? cleanPage.context.conversationTimeline?.length ?? 0;
        const callOrActivityFound = Boolean(cleanPage.context.callNotes || cleanPage.context.activitySummary || /\bCall Summary|visible image attachment/i.test(cleanPage.context.visibleText ?? ''));
        const latestFound = cleanPage.context.parserDebug?.latestCustomerMessageFound || Boolean(latestCustomerMessage(cleanPage)) || callOrActivityFound;
        const latestSnippet = latestCustomerMessage(cleanPage).replace(/^Customer truth read:\s*/i, '').slice(0, 90);
        const readTarget = [cleanPage.context.customerName, cleanPage.context.vehicleOfInterest].filter(Boolean).join(' | ');
        setNotice(
          latestFound
            ? `Lead read: ${readTarget || `${messageCount} message${messageCount === 1 ? '' : 's'}`} ${latestSnippet ? `| Latest: ${latestSnippet}` : '| Activity/call notes checked.'}`
            : `Lead read, but latest customer message was not found. Open Lead Details / Debug to see what Closer saw.`,
        );
      }

      const scopedAsk = '';
      const currentAdditionalContext = additionalContextValueRef.current || additionalContext;
      const scopedAdditionalContext = leadScopedInputsStaleRef.current ? '' : currentAdditionalContext.trim();
      const nextQuery = inventoryIntentQueryFromPage(cleanPage, scopedAsk);

      let nextInventory = leadScopedInputsStaleRef.current ? null : inventory;
      if (fetchInventory && nextQuery && can('canUseInventoryLookup')) {
        nextInventory = await loadInventory(nextQuery);
      }
      const cleanMarketInsight = analyzeLeadMarket(cleanPage.context);
      const cleanBuyerProfile = buildBuyerProfile(cleanPage.context, cleanMarketInsight);
      const cleanSalesPressureTest = buildSalesPressureTest(cleanPage.context, 'generate_reply');
      const cleanNeedsAnalysis = buildNeedsAnalysis(cleanPage.context);
      const cleanSalesInfluencePlan = buildSalesInfluencePlan(cleanPage.context, 'generate_reply');
      const cleanBuyerType = buyerTypeFrom(cleanPage.context, cleanMarketInsight, cleanSalesPressureTest, cleanNeedsAnalysis);
      const cleanEffectiveRole = effectiveUserRoleForView(auth.user, ownerViewRole);
      const cleanEffectiveRoleMode = effectiveRoleModeForView(auth.user, roleMode, ownerViewRole);
      const cleanRecommendations = recommendInventoryForLead(cleanPage.context, nextInventory?.vehicles ?? [], cleanMarketInsight)
        .filter(inventoryLooksReal)
        .slice(0, 4);

      if (leadChanged && silent) {
        setNotice('Different lead detected. Previous lead context cleared.');
      } else if (changed && silent) {
        setNotice(newCustomerReply ? 'New customer reply detected. Recommended filters updated.' : 'Lead page updated. Click Generate when ready.');
      }

      if (!draftStrategy) return { page: cleanPage, inventory: nextInventory ?? null, newCustomerReply, customerSignature: nextCustomerSignature };

      const rawResponse = await sendExtensionMessage<AiGenerateResponse>({
        type: 'AI_GENERATE',
        payload: {
          action: 'generate_reply',
          channel: 'crm_note',
          tone,
          roleMode: cleanEffectiveRoleMode,
          conversationId: cleanPage.conversationId,
          leadContext: cleanPage.context,
          userDraft: safeDraft([
            'READ PAGE MODE.',
            'Read the full active webpage context, not just the obvious CRM fields.',
            'Use every useful detail available: customer name, city/state, phone area code, email, family clue, trade, credit, budget, lead source, timing, behavior, prior messages, Claire automation notes, XML lead data, and objections.',
            scopedAdditionalContext
              ? `Salesperson live deal context. Treat this as current truth from the desk/rep. Do not reveal internal-only details directly:\n${scopedAdditionalContext}`
              : '',
            automotiveBookPrompt,
            advancedSalesBookPrompt,
            situationalInfluencePrompt(cleanSalesInfluencePlan),
            tavernaRemoteProofPrompt,
            localRapportPrompt,
            humanStylePrompt('crm_note'),
            coachInstructionPrompt(cleanPage.context, cleanBuyerType, readBuyerHistory(cleanPage.conversationId)),
            cleanEffectiveRole === 'bdc'
              ? 'BDC view mode: summarize the lead through a same-day appointment-setting lens. Best next move should spoon-feed the call: exact opener, curiosity question, value reason to come in today, two time windows, and fallback phone/video appointment if distance makes travel unrealistic.'
              : cleanEffectiveRole === 'manager'
                ? 'Manager view mode: summarize the lead through a situational manager lens. Best next move should explain whether to calm a heat case, fix confusion, make a warm first intro, clarify process, or hand the lead to the specialist, with exact words and one prep/non-negotiable question.'
              : '',
            roleModePrompt(cleanEffectiveRoleMode, cleanPage.context),
            conversationModePrompt(conversationMode, cleanPage.context),
            conversationFlowPrompt(cleanPage.context),
            cleanPage.context.customerName
              ? `Customer name: ${cleanPage.context.customerName}. Use the first name only when it helps, not as a repeated opener on an active thread.`
              : 'If the customer name is visible in the page text, infer it from the lead header but do not force a greeting.',
            latestCustomerMessage(cleanPage) ? `Latest customer-authored context:\n${latestCustomerMessage(cleanPage)}` : '',
            cleanPage.context.callNotes ? `Call summary / phone context:\n${cleanPage.context.callNotes}` : '',
            cleanPage.context.activitySummary ? `Activity notes / internal CRM context:\n${cleanPage.context.activitySummary}` : '',
            `Difficult-customer pressure test:\n${JSON.stringify(cleanSalesPressureTest, null, 2)}`,
            'Act like the best car salesperson in the world: specific, relaxed, persuasive, practical, and always moving toward the close.',
            'Return the best next move, exact words to send next, what to verify, and the objection handle if one is needed.',
            scopedAsk ? `Specific salesperson question: ${scopedAsk}` : '',
            signalsFrom(cleanPage) ? `Personalization signals:\n${signalsFrom(cleanPage)}` : '',
            `Market read: ${cleanMarketInsight.summary}`,
            `Next step path: ${cleanMarketInsight.nextStep}`,
            cleanBuyerProfile.summary ? `Buyer read: ${cleanBuyerProfile.summary}` : '',
            cleanBuyerProfile.affordabilityRead ? `Affordability read: ${cleanBuyerProfile.affordabilityRead}` : '',
            cleanBuyerProfile.fitRead ? `Vehicle-fit read: ${cleanBuyerProfile.fitRead}` : '',
            inventorySummaryFrom(cleanRecommendations) ? `Recommended inventory:\n${inventorySummaryFrom(cleanRecommendations)}` : '',
          ]),
        },
      });
      const response = sanitizeGeneratedResponse(rawResponse, cleanPage.context, cleanPage);
      leadScopedInputsStaleRef.current = false;
      setReadPageDraft(response);
      setDrafts((current) => ({ ...current, strategy: response }));
      setDraftActions((current) => ({ ...current, strategy: 'generate_reply' }));
      void refreshQuota(true);
      return { page: cleanPage, inventory: nextInventory ?? null, newCustomerReply, customerSignature: nextCustomerSignature };
    } catch (err) {
      setWatchState(watchEnabled && can('canUseLiveWatch') ? 'waiting' : 'off');
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Read Page failed');
      }
      return null;
    } finally {
      if (!silent) setLoading('');
    }
  }

  useEffect(() => {
    if (!auth.authenticated || !watchEnabled || !can('canUseLiveWatch') || !can('canReadAnyPage')) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const synced = await syncPage({ draftStrategy: false, fetchInventory: false, silent: true });
      if (
        !cancelled &&
        synced?.newCustomerReply &&
        synced.customerSignature &&
        lastAutoDraftSignatureRef.current !== synced.customerSignature
      ) {
        lastAutoDraftSignatureRef.current = synced.customerSignature;
        setNotice('New customer reply detected. Click the main button when you are ready to spend a request.');
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [auth.authenticated, auth.user?.id, auth.user?.role, auth.user?.permissions?.join('|'), watchEnabled, tone, roleMode, ownerViewRole, conversationMode]);

  async function ensurePage() {
    const synced = await syncPage({ draftStrategy: false, fetchInventory: false, silent: false });
    if (!synced?.page) {
      setPage(null);
      clearDraftState();
      return null;
    }
    return synced.page;
  }

  async function generateColumn(
    columnKey: ColumnKey,
    options?: {
      action?: QuickAction;
      prompt?: string;
      draftSeed?: string;
      inventoryOverride?: InventorySearchResponse | null;
      pageOverride?: ReadPageResponse | null;
      loadingKey?: ColumnKey | 'play';
      toneOverride?: Tone;
      roleModeOverride?: ResponseRoleMode;
      conversationModeOverride?: ConversationMode;
      replyVariant?: ReplyButtonVariant;
    },
  ) {
    const column = columns[columnKey];
    const action = options?.action ?? column.defaultAction;
    const outputTone = options?.toneOverride ?? tone;
    const outputRoleMode = options?.roleModeOverride ?? roleMode;
    const outputConversationMode = options?.conversationModeOverride ?? conversationMode;
    setError('');
    setNotice('');
    setLoading(options?.loadingKey ?? columnKey);
    try {
      const activePage = options?.pageOverride ?? (await ensurePage());
      if (!activePage) throw new Error('I could not read the active page.');
      const leadContext = enrichContext(activePage.context);
      const currentAdditionalContext = additionalContextValueRef.current || additionalContext;
      const scopedAdditionalContext = leadScopedInputsStaleRef.current ? '' : currentAdditionalContext.trim();
      const nextInventory =
        options?.inventoryOverride ??
        (leadScopedInputsStaleRef.current ? null : inventory) ??
        null;
      const activeMarketInsight = analyzeLeadMarket(leadContext);
      const activeBuyerProfile = buildBuyerProfile(leadContext, activeMarketInsight);
      const activeSalesPressureTest = buildSalesPressureTest(leadContext, action);
      const activeNeedsAnalysis = buildNeedsAnalysis(leadContext);
      const activeSalesInfluencePlan = buildSalesInfluencePlan(leadContext, action);
      const activeBuyerType = buyerTypeFrom(leadContext, activeMarketInsight, activeSalesPressureTest, activeNeedsAnalysis);
      const generationEffectiveRole = effectiveUserRoleForView(auth.user, ownerViewRole);
      const activeRecommendations = recommendInventoryForLead(leadContext, nextInventory?.vehicles ?? [], activeMarketInsight)
        .filter(inventoryLooksReal)
        .slice(0, 4);

      const rawResponse = await sendExtensionMessage<AiGenerateResponse>({
        type: 'AI_GENERATE',
        payload: {
          action,
          channel: column.channel,
          tone: outputTone,
          roleMode: outputRoleMode,
          conversationId: activePage.conversationId,
          leadContext: sanitizeContext(leadContext),
          userDraft: safeDraft([
            replyButtonOverridePrompt(options?.replyVariant),
            options?.prompt ?? column.prompt,
            'Do not write a generic response. Each option should prove you read this exact page.',
            scopedAdditionalContext ? `USER_EXTRA_DIRECTION:\n${scopedAdditionalContext}\nEND_USER_EXTRA_DIRECTION` : '',
            scopedAdditionalContext
              ? `IMPORTANT SALESPERSON DIRECTION FOR THIS GENERATION. Treat this as current desk/rep truth and a high-priority instruction for deciding what is realistic. Use it with the lead context. Do not reveal internal-only details directly:\n${scopedAdditionalContext}`
              : 'No extra live salesperson context was provided.',
            scopedAdditionalContext
              ? 'Extra Direction hard rule: if the salesperson typed a direct goal like "get credit app", "bring him in", "introduce me", "ask for trade", or "set appointment", the generated reply must pursue that goal directly unless it would be dishonest, unsafe, or impossible. Do not ignore it because of generic best-practice strategy.'
              : '',
            automotiveBookPrompt,
            advancedSalesBookPrompt,
            situationalInfluencePrompt(activeSalesInfluencePlan),
            tavernaRemoteProofPrompt,
            localRapportPrompt,
            humanStylePrompt(column.channel),
            `Location read: ${leadContext.locationIntel?.label ?? 'Unknown'} | ${formatLocationStatus(leadContext.locationIntel)} | ${leadContext.locationIntel?.summary ?? 'No reliable location yet.'}`,
            `Location strategy: ${locationStrategyReason(leadContext.locationIntel)}`,
            leadContext.localResearch?.status === 'available' && leadContext.localResearch.places.length
              ? `Verified local rapport options: ${leadContext.localResearch.places.join(' | ')}`
              : 'No verified local place lookup is connected. Do not name restaurants or landmarks.',
            columnKey === 'strategy' ? coachInstructionPrompt(leadContext, activeBuyerType, readBuyerHistory(activePage.conversationId)) : '',
            generationEffectiveRole === 'bdc'
              ? 'BDC view mode: this generation should behave like a BDC rep whose win is a same-day showed appointment. Answer first, then build value in coming in today with preparation, less waiting, two time windows, and a specific reason tied to the customer pain point. For out-of-state shoppers, make the appointment a today phone/video appointment that earns pickup, travel, deposit, or shipping after confidence is built.'
              : generationEffectiveRole === 'manager'
                ? 'Manager view mode: this generation should behave like a situational manager response. If there is heat or confusion, solve that first. If it is a clean first touch, introduce the dealership/manager naturally with gratitude, mention family-owned/about two years and about 15 years in the business only if it sounds human, hand off to the vehicle specialist without naming a salesperson, and ask one prep/non-negotiable question.'
              : '',
            roleModePrompt(outputRoleMode, leadContext),
            conversationModePrompt(outputConversationMode, leadContext),
            conversationFlowPrompt(leadContext),
            'No redundant repeat rule: read the prior outbound customer-facing messages and any draft seed before writing. Do not repeat a previous intro, close, ZIP ask, appointment ask, finance ask, or "I will verify/check" phrase unless it is the only honest next step. If the same goal is still needed, change the wording and add a new customer benefit so it feels like forward movement.',
            leadContext.customerName
              ? `Customer name: ${leadContext.customerName}. Use the first name only when it helps the thread: first human outreach, meet-and-greet, re-engage, cold lead, or manager handoff. For active continuation, do not force the name.`
              : 'If the customer name is visible in the page text, infer it from the lead header but do not force a greeting.',
            latestCustomerMessage(activePage) ? `Latest customer-authored context:\n${latestCustomerMessage(activePage)}` : '',
            leadContext.callNotes ? `Call summary / phone context:\n${leadContext.callNotes}` : '',
            leadContext.activitySummary ? `Activity notes / internal CRM context:\n${leadContext.activitySummary}` : '',
            scopedAdditionalContext
              ? 'If this context says the store is too far from the customer target, do not write a fake close. Be honest, empathetic, and create a realistic bridge: structure, trade, alternate vehicle, manager-approved best offer, or a clear yes/no commitment.'
              : '',
            `Difficult-customer pressure test:\n${JSON.stringify(activeSalesPressureTest, null, 2)}`,
            'Personalize naturally, like a real salesperson who noticed useful context. Do not sound creepy; if something is inferred, say it softly.',
            'Use hard numbers only if they came from the active page or inventory list. Otherwise say you will verify exact figures.',
            options?.draftSeed ?? '',
            signalsFrom({ ...activePage, context: leadContext }) ? `Personalization signals:\n${signalsFrom({ ...activePage, context: leadContext })}` : '',
            `Market read: ${activeMarketInsight.summary}`,
            `Next step path: ${activeMarketInsight.nextStep}`,
            activeBuyerProfile.summary ? `Buyer read: ${activeBuyerProfile.summary}` : '',
            activeBuyerProfile.affordabilityRead ? `Affordability read: ${activeBuyerProfile.affordabilityRead}` : '',
            activeBuyerProfile.fitRead ? `Vehicle-fit read: ${activeBuyerProfile.fitRead}` : '',
            inventorySummaryFrom(activeRecommendations) ? `Recommended inventory:\n${inventorySummaryFrom(activeRecommendations)}` : '',
          ]),
        },
      });
      const response = sanitizeGeneratedResponse(rawResponse, leadContext, activePage);
      leadScopedInputsStaleRef.current = false;
      setDrafts((current) => ({ ...current, [columnKey]: response }));
      if (columnKey === 'strategy') setReadPageDraft(response);
      setDraftActions((current) => ({ ...current, [columnKey]: action }));
      void refreshQuota(true);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      return null;
    } finally {
      setLoading('');
    }
  }

  async function generateAll() {
    setLoading('all');
    try {
      const synced = await syncPage({
        draftStrategy: false,
        fetchInventory: false,
        freshRead: true,
        silent: false,
      });
      const activePage = synced?.page;
      if (!activePage) throw new Error('I could not read the active page.');
      const scopedAsk = '';
      const scopedInventoryQuery = leadScopedInputsStaleRef.current ? '' : inventoryQuery;
      const nextInventory = shouldUseInventory(activePage.context, scopedAsk)
        ? await loadInventory(inventoryIntentQueryFromPage(activePage, scopedAsk) || scopedInventoryQuery)
        : synced?.inventory ?? (leadScopedInputsStaleRef.current ? null : inventory);
      const selectedOptions =
        selectedLeadPlay.action === 'generate_reply'
          ? undefined
          : {
              action: selectedLeadPlay.action,
              prompt: promptByPlay[selectedLeadPlay.action],
            };
      const primaryColumn: ColumnKey = selectedLeadPlay.action === 'generate_reply' ? 'strategy' : selectedLeadPlay.target;
      await generateColumn(primaryColumn, {
        pageOverride: activePage,
        inventoryOverride: nextInventory,
        ...(selectedOptions ?? {}),
      });
      setActiveTab('coach');
    } finally {
      setLoading('');
    }
  }

  async function generatePrimaryReply(variant: 'best' | 'another' = 'best') {
    const liveContextFromMic = dictationRef.current ? await stopAdditionalContextDictation() : additionalContextValueRef.current || additionalContext;
    const scopedAsk = '';
    const scopedAdditionalContext = leadScopedInputsStaleRef.current ? '' : liveContextFromMic;
    const scopedInventoryQuery = leadScopedInputsStaleRef.current ? '' : inventoryQuery;
    setError('');
    setNotice('');
    const activePage = await ensurePage();
    if (!activePage) {
      setError('I could not read the active page.');
      return;
    }

    const leadContext = enrichContext(activePage.context);
    const activeMarketInsight = analyzeLeadMarket(leadContext);
    const activeSalesPressureTest = buildSalesPressureTest(leadContext, selectedLeadAction);
    const activeNeedsAnalysis = buildNeedsAnalysis(leadContext);
    const activeBuyerType = buyerTypeFrom(leadContext, activeMarketInsight, activeSalesPressureTest, activeNeedsAnalysis);
    const effectiveRole = effectiveUserRoleForView(auth.user, ownerViewRole);
    const effectiveRoleMode = effectiveRoleModeForView(auth.user, roleMode, ownerViewRole);
    const filters =
      controlTab === 'recommended'
        ? recommendedFiltersFor(leadContext, activeMarketInsight, activeSalesPressureTest, activeNeedsAnalysis, effectiveRole, effectiveRoleMode)
        : customFilters;
    const action = actionFromGoal(filters.goal);
    const outputTone = toneFromFilter(filters.tone);
    const outputRoleMode = roleModeFromFilter(filters.role);
    const outputConversationMode = conversationModeFromFilter(filters.conversation);
    const targetColumn = columnFromChannel(filters.channel);
    const inventoryNeeded = filters.goal === 'inventory' || shouldUseInventory(leadContext, scopedAsk);
    const nextInventory =
      inventoryNeeded && can('canUseInventoryLookup')
        ? await loadInventory(
            scopedInventoryQuery || inventoryIntentQueryFromPage(activePage, scopedAsk) || leadContext.vehicleOfInterest || leadContext.stockNumber || scopedAsk,
          )
        : leadScopedInputsStaleRef.current ? null : inventory;

    setSelectedLeadAction(action);
    setTone(outputTone);
    setRoleMode(outputRoleMode);
    setConversationMode(outputConversationMode);
    setPrimaryOutputColumn(targetColumn);
    await generateColumn(targetColumn, {
      action,
      loadingKey: 'play',
      pageOverride: activePage,
      inventoryOverride: nextInventory,
      toneOverride: outputTone,
      roleModeOverride: outputRoleMode,
      conversationModeOverride: outputConversationMode,
      prompt: buildFilteredPrompt({
        filters,
        page: activePage,
        context: leadContext,
        buyerType: activeBuyerType,
        needsAnalysis: activeNeedsAnalysis,
        ask: scopedAsk,
        additionalContext: scopedAdditionalContext,
        variant,
        user: auth.user,
      }),
    });
  }

  async function askLeadQuestion() {
    const question = ask.trim();
    if (!question || !can('canUseAskBar')) return;
    const liveContextFromMic = dictationRef.current ? await stopAdditionalContextDictation() : additionalContextValueRef.current || additionalContext;
    const scopedAdditionalContext = leadScopedInputsStaleRef.current ? '' : liveContextFromMic.trim();
    setError('');
    setNotice('');
    setLoading('ask');
    try {
      const synced = await syncPage({ draftStrategy: false, fetchInventory: false, silent: true });
      const activePage = synced?.page ?? page;
      if (!activePage) throw new Error('I could not read the active page.');
      const leadContext = enrichContext(activePage.context);
      const coachingRoleMode = effectiveRoleModeForView(auth.user, roleMode, ownerViewRole);
      const rawResponse = await sendExtensionMessage<AiGenerateResponse>({
        type: 'AI_GENERATE',
        payload: {
          action: 'generate_reply',
          channel: 'crm_note',
          tone,
          roleMode: coachingRoleMode,
          conversationId: activePage.conversationId,
          leadContext: sanitizeContext(leadContext),
          userDraft: safeDraft([
            'ASK BEST NEXT MOVE MODE.',
            'This is a direct AI Q&A lane for the salesperson. Do not generate a customer-facing reply. Do not use this question as context for the next Generate Reply.',
            'Answer the salesperson exact question first, like ChatGPT would: direct, practical, empathetic, and based on this active lead only. If they ask "is he serious", answer seriousness. If they ask "how do I bring him in", give a bring-in plan. Do not pivot to a canned package/video/availability answer.',
            'SPOON-FEED MODE. Do not give a high-level gist. Give exact execution every time: what to say first, what to ask next, what to avoid, and the exact close. Use quoted talk-track lines the rep can say on a phone call or send by text.',
            `Question to answer exactly: ${question}`,
            scopedAdditionalContext
              ? `Salesperson lead-specific note/context. Use this as current truth for the coaching answer:\n${scopedAdditionalContext}`
              : 'No extra salesperson context was provided.',
            latestCustomerMessage(activePage)
              ? `Latest customer-authored message:\n${latestCustomerMessage(activePage)}`
              : 'Latest customer message was not found. Use the whole lead digest carefully.',
            conversationDigest(activePage)
              ? `Whole conversation digest. Do not mix in other leads:\n${conversationDigest(activePage)}`
              : '',
            'Format the answer as a specific playbook, not a gist: Answer: ... Read: ... Say: "..."; Ask: "..."; If yes: ...; If no/hesitates: ...; Close: "..."; Avoid: ... Keep it tight but spoon-fed.',
            'Do not default to packages, videos, price, or availability unless the salesperson question asks for that or the lead evidence makes it clearly relevant.',
          ]),
        },
      });
      const response = sanitizeGeneratedResponse(rawResponse, leadContext, activePage);
      setAskCoachDraft(response);
      leadScopedInputsStaleRef.current = false;
      setNotice('Best Next Move updated from your question.');
      void refreshQuota(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setLoading('');
    }
  }

  async function learnFromDraft(
    columnKey: ColumnKey,
    text: string,
    outcome: AiFeedbackRequest['outcome'],
    reason?: string,
  ) {
    const conversationId = page?.conversationId ?? drafts[columnKey]?.conversationId;
    if (!conversationId || !text.trim() || !auth.authenticated) {
      setError('Generate a draft first so feedback can be tied to the lead.');
      return;
    }
    try {
      const response = await sendExtensionMessage<AiFeedbackResponse>({
        type: 'AI_FEEDBACK',
        payload: {
          conversationId,
          channel: columns[columnKey].channel,
          action: draftActions[columnKey] ?? columns[columnKey].defaultAction,
          selectedText: text,
          outcome,
          ...(reason ? { reason } : {}),
          ...(page?.context ? { leadContext: sanitizeContext(page.context) } : {}),
        },
      });
      setNotice(response.learned ? `Feedback saved: ${reason ?? outcome}.` : 'Feedback saved for this draft.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback failed');
    }
  }

  async function copy(text: string, columnKey?: ColumnKey) {
    if (!can('canCopyDrafts')) {
      setError('This user cannot copy drafts.');
      return;
    }
    await navigator.clipboard.writeText(text);
    if (columnKey) void learnFromDraft(columnKey, text, 'copied');
    setNotice('Copied.');
  }

  async function insert(text: string, columnKey?: ColumnKey) {
    if (!can('canInsertIntoCrm')) {
      setError('This user cannot insert drafts into the page.');
      return;
    }
    try {
      await sendExtensionMessage<{ inserted: boolean }>({ type: 'INSERT_INTO_PAGE', text });
      if (columnKey) void learnFromDraft(columnKey, text, 'inserted');
      setNotice('Inserted into the page.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Insert failed');
    }
  }

  async function refineDraft(columnKey: ColumnKey, action: keyof typeof refinementPrompts) {
    if (dictationRef.current) await stopAdditionalContextDictation();
    const seed = firstOption(drafts[columnKey]);
    const replyVariant =
      action === 'rewrite_shorter'
        ? 'shorter'
        : action === 'rewrite_stronger'
          ? 'stronger'
          : action === 'humanize'
            ? 'warmer'
            : action === 'generate_reply'
              ? 'rewrite'
              : undefined;
    await generateColumn(columnKey, {
      action,
      prompt: refinementPrompts[action],
      ...(replyVariant ? { replyVariant } : {}),
      ...(seed ? { draftSeed: `Rewrite this draft:\n${seed}` } : {}),
    });
  }

  async function refinePrimaryReply(
    kind: 'rewrite' | 'shorter' | 'stronger' | 'human' | 'empathy' | 'question' | 'appointment' | 'credit' | 'introduce',
  ) {
    if (dictationRef.current) await stopAdditionalContextDictation();
    const seed = bestReply || firstOption(drafts[primaryOutputColumn]);
    const variant: ReplyButtonVariant =
      kind === 'human'
        ? 'warmer'
        : kind === 'credit'
          ? 'credit'
          : kind;
    const prompt = replyButtonOverridePrompt(variant);
    await generateColumn(primaryOutputColumn, {
      action: kind === 'appointment' ? 'appointment_push' : kind === 'credit' ? 'finance_push' : 'generate_reply',
      loadingKey: 'play',
      prompt,
      replyVariant: variant,
      ...(seed ? { draftSeed: `Current draft to rewrite because the "${kind}" button was clicked:\n${seed}` } : {}),
    });
  }

  const liveStatusText =
    contactBlocked
      ? complianceMessage
      : watchState === 'watching'
        ? lastSyncedAt
          ? `Watching the page. Last sync ${lastSyncedAt}.`
          : 'Watching the page.'
        : watchState === 'waiting'
          ? 'Ready to watch when a readable page is open.'
          : 'Live watch is off for this user.';

  const personalizationLines = signalsFrom(page).split('\n').filter(Boolean);
  const inventoryCardsSource = manualInventoryQueryActive(inventoryQuery)
    ? inventory?.vehicles ?? []
    : recommendedInventory.length
      ? recommendedInventory
      : inventory?.vehicles ?? [];
  const inventoryCards = inventoryCardsSource
    .filter(inventoryLooksReal)
    .slice(0, 5);
  const activeColumn = activeTab === 'sms' || activeTab === 'email' || activeTab === 'strategy' ? activeTab : 'sms';
  const activeDraft = drafts[activeColumn];
  const preferredDraft =
    (firstNonEmptyOption(drafts[primaryOutputColumn]) ? drafts[primaryOutputColumn] : null) ??
    (firstNonEmptyOption(drafts.sms) ? drafts.sms : null) ??
    (firstNonEmptyOption(drafts.email) ? drafts.email : null) ??
    (firstNonEmptyOption(drafts.strategy) ? drafts.strategy : null) ??
    (firstNonEmptyOption(readPageDraft) ? readPageDraft : null) ??
    null;
  const bestReplyRaw = firstNonEmptyOption(preferredDraft) || firstOption(preferredDraft);
  const bestReply = bestReplyRaw.trim();
  const bestReplyOption = firstNonEmptyDraftOption(preferredDraft);
  const customerTranslation = preferredDraft?.customerTranslation?.trim() ?? '';
  const replyTranslation = (bestReplyOption?.translation ?? preferredDraft?.replyTranslation ?? '').trim();
  const showTranslationBox = Boolean(customerTranslation || replyTranslation);
  const hasBestReply = bestReply.length > 0;
  const isGeneratingReply = loading === 'play' || loading === 'sms' || loading === 'strategy' || loading === 'read' || loading === 'all';
  const isAskingLead = loading === 'ask';
  const leadLine = [context.customerName ?? 'Open lead', context.vehicleOfInterest ?? 'Read page'].filter(Boolean).join(' / ');
  const locationIntel = context.locationIntel;
  const locationLabel = locationIntel?.label ?? 'Unknown location';
  const locationStatus = formatLocationStatus(locationIntel);
  const intentLabel = contactBlocked
    ? communicationCompliance?.status === 'sms_opt_out'
      ? 'SMS opt-out'
      : 'Do not contact'
    : context.leadScore === 'hot'
      ? 'Hot buyer'
      : context.leadScore === 'cold'
        ? 'Cold lead'
        : context.sentiment === 'negative'
          ? 'Needs save'
          : buyerType.type || 'Warm lead';
  const effectiveRole = effectiveUserRoleForView(auth.user, ownerViewRole);
  const effectiveRoleMode = effectiveRoleModeForView(auth.user, roleMode, ownerViewRole);
  const recommendedFilters = recommendedFiltersFor(context, marketInsight, salesPressureTest, needsAnalysis, effectiveRole, effectiveRoleMode);
  const activeFilters = controlTab === 'recommended' ? recommendedFilters : customFilters;
  const activeFilterLabels = [
    labelFor(roleFilterOptions, activeFilters.role),
    labelFor(conversationFilterOptions, activeFilters.conversation),
    labelFor(goalFilterOptions, activeFilters.goal),
    labelFor(toneFilterOptions, activeFilters.tone),
    labelFor(channelFilterOptions, activeFilters.channel),
    labelFor(lengthFilterOptions, activeFilters.length),
  ];
  const primaryButtonLabel = 'Generate';
  const primaryHelp = `${nextMoveLabel(activeFilters, context, page)}. AI runs only when you click.`;
  const outputKicker =
    activeFilters.channel === 'call'
      ? 'Call Plan'
      : activeFilters.channel === 'voicemail'
        ? 'Voicemail'
        : activeFilters.channel === 'note'
          ? 'Manager Note'
          : 'Suggested Reply';
  const needsKnown = needsAnalysis.knownSignals.length ? needsAnalysis.knownSignals.slice(0, 3) : [needsAnalysis.customerGoalHypothesis];
  const customerInsight = customerInsightLine(page, context, buyerType);
  const bestNextMove = nextMoveLabel(activeFilters, context, page);
  const localAngle = localAngleLine(context);
  const customerBrief = buildCustomerBrief(page, context, activeFilters, needsAnalysis);
  const missingKeyInfo = (context.qualification?.missing?.length ? context.qualification.missing : customerBrief.missingInfo).slice(0, 4).join(', ') || 'No major gap detected';
  const latestCustomerText = latestCustomerMessage(page);
  const latestLine =
    latestCustomerText && !urlOnlyText(latestCustomerText)
      ? compactSnippet(latestCustomerText, 190)
      : compactSnippet(context.callNotes, 190) || compactSnippet(context.activitySummary, 190) || 'Latest customer message not found';
  const briefVehicleLine = [context.vehicleOfInterest ?? 'Vehicle unknown', context.stockNumber ? `Stock ${context.stockNumber}` : undefined].filter(Boolean).join(' | ');
  const readStatusLabel = page ? 'Lead read' : 'Lead not read';
  const zipStatusLabel = context.locationIntel?.classification === 'unknown' ? 'ZIP missing' : formatLocationStatus(context.locationIntel);
  const pageUpdatedLabel = lastSyncedAt ? `Page updated ${lastSyncedAt}` : 'Page not synced';
  const roleBadgeLabel = labelFor(roleFilterOptions, activeFilters.role);
  const aiStatus =
    error ? 'Error' : loading === 'read' ? 'Reading' : isGeneratingReply ? 'Thinking' : page ? 'Ready' : 'Needs Lead';
  const userInitials = (auth.user?.displayName ?? auth.user?.signatureName ?? auth.user?.name ?? 'AI')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AI';
  const snapshotCustomer = context.customerName ?? 'Unknown customer';
  const snapshotVehicle = context.vehicleOfInterest ?? 'Vehicle not found yet';
  const snapshotLocation =
    explicitCustomerAddress(context) ??
    context.customerLocation ??
    (confirmedZipFromContext(context) ? `ZIP ${confirmedZipFromContext(context)}` : undefined) ??
    (context.locationIntel?.confidence === 'estimated_from_phone' ? context.locationIntel.label : undefined) ??
    'Ask for ZIP';
  const stageLabel = leadStageSummary(context, page);
  const lastCommunicationLine = lastCommunicationSummary(page, context);
  const customerGoalLine = customerGoalSummary(context, page);
  const intentConfidence =
    page ? (context.leadScore === 'hot' ? 88 : context.sentiment === 'negative' ? 76 : context.customerIntelligence?.customerIntent ? 82 : 72) : 0;
  const emotionalState =
    context.sentiment === 'negative'
      ? 'Guarded'
      : /\b(payment|monthly|down|finance|approval|credit)\b/i.test(conversationTextFrom(context))
        ? 'Payment-focused'
        : /\b(price|otd|out[-\s]?the[-\s]?door|fee|discount|cheap|budget)\b/i.test(conversationTextFrom(context))
          ? 'Price-sensitive'
          : context.leadScore === 'hot'
            ? 'Serious'
            : page
              ? 'Curious'
              : 'Needs lead';
  const bestMoveReason =
    activeFilters.role === 'bdc'
      ? bdcBestMoveReason(context)
      : /\bavailable until\b.*\bcall\b|\bavailable\b.*\bfor a call\b|\bcall me\b|\bgive me a call\b/i.test(customerFacingText(context))
      ? 'Use the live window they gave you and move the deal forward in real time.'
      : context.locationIntel?.classification === 'unknown'
      ? 'Get enough clarity to avoid fake numbers and a wasted next step.'
      : 'Use the smallest next commitment that keeps the deal moving.';
  const topCustomerSummary = summaryChecklist(context, needsAnalysis, page);
  const bestMoveBullets =
    activeFilters.role === 'bdc'
      ? bdcPhoneCallTips(context, customerBrief, page)
      : bestMoveChecklist(context, customerBrief, page);
  const askCoachAnswer = (firstNonEmptyOption(askCoachDraft).trim() || askCoachDraft?.nextBestAction?.trim() || '').trim();
  const askCoachHeading = askCoachDraft
    ? `Asked: ${compactSnippet(ask || askCoachDraft.nextBestAction || 'your question', 84)}`
    : 'Do this next';
  const followUpPlan = [
    hasBestReply ? 'Now: send the suggested reply.' : 'Now: read the lead and generate the best reply.',
    'If no response in 2 hours: send a softer follow-up tied to their concern.',
    activeFilters.role === 'bdc' ? 'Tomorrow: offer a ready-to-see appointment window.' : 'Tomorrow: tighten the objection and ask for the next commitment.',
  ];
  const showInventoryPanel =
    can('canUseInventoryLookup') &&
    (Boolean(page && (context.vehicleOfInterest || context.stockNumber)) ||
      loading === 'inventory' ||
      inventoryCards.length > 0 ||
      activeFilters.goal === 'inventory' ||
      /\b(option|similar|cheaper|lower payment|available|inventory)\b/i.test(conversationTextFrom(context)));

  function updateCustomFilter<K extends keyof AssistantFilters>(key: K, value: AssistantFilters[K]) {
    setControlTab('custom');
    setCustomFilters((current) => ({ ...current, [key]: value }));
  }

  function useRecommendedFilters() {
    setCustomFilters(recommendedFilters);
    setControlTab('recommended');
  }

  function focusAdditionalContextForManualDictation(message?: string) {
    additionalContextRef.current?.focus();
    const input = additionalContextRef.current;
    if (input) {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    setNotice(message ?? 'Context box is focused. Press Win + H to use Windows voice typing, or type the situation.');
  }

  function useWindowsDictationFallback() {
    focusAdditionalContextForManualDictation('Browser blocked the mic. Allow microphone access, then click Mic again. The context box is focused if you want to type it.');
  }

  function mergeDictationContext(base: string, transcript: string) {
    return [base.trim(), transcript.trim()].filter(Boolean).join(base.trim() && transcript.trim() ? '\n' : '');
  }

  function finishDictation() {
    const finalContext = mergeDictationContext(dictationBaseContextRef.current, dictationTranscriptRef.current);
    if (finalContext) {
      additionalContextValueRef.current = finalContext;
      setAdditionalContext(finalContext);
    }
    dictationStopResolverRef.current?.(finalContext);
    dictationStopResolverRef.current = null;
    dictationRef.current = null;
    setDictatingContext(false);
    setMicStatus('idle');
    setMicLevel(0);
    if (finalContext) setNotice('Added your spoken context. Generate will use it.');
    return finalContext;
  }

  function stopAdditionalContextDictation() {
    if (!dictationRef.current) return Promise.resolve(additionalContextValueRef.current || additionalContext);
    setNotice('Stopping mic and adding your context...');
    setMicStatus('stopping');
    return new Promise<string>((resolve) => {
      dictationStopResolverRef.current = resolve;
      sendExtensionMessage<{ stopped: boolean; transcript: string }>({ type: 'MIC_STOP' })
        .then((response) => {
          if (response.transcript) dictationTranscriptRef.current = response.transcript;
          resolve(finishDictation());
        })
        .catch((error) => {
          setNotice(error instanceof Error ? error.message : 'Mic stop failed.');
          resolve(finishDictation());
        });
      window.setTimeout(() => {
        if (dictationStopResolverRef.current) resolve(finishDictation());
      }, 1400);
    });
  }

  async function requestMicrophoneAccess() {
    try {
      const permissions = navigator.permissions;
      if (permissions?.query) {
        const status = await permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'denied') {
          useWindowsDictationFallback();
          return false;
        }
      }
    } catch {
      // Some extension contexts do not expose microphone permission state.
    }

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const blocked = name === 'NotAllowedError' || name === 'SecurityError';
      if (blocked) {
        useWindowsDictationFallback();
      } else {
        focusAdditionalContextForManualDictation('Mic was unavailable. Press Win + H now because the context box is focused.');
      }
      return false;
    }
  }

  async function startAdditionalContextDictation() {
    if (dictationRef.current) {
      await stopAdditionalContextDictation();
      return;
    }
    dictationBaseContextRef.current = (additionalContextValueRef.current || additionalContext).trim();
    dictationTranscriptRef.current = '';
    dictationRef.current = { offscreen: true };
    setDictatingContext(true);
    setMicStatus('starting');
    setMicLevel(0);
    setNotice('Starting mic...');
    try {
      const response = await sendExtensionMessage<{ started: boolean }>({ type: 'MIC_START' });
      if (!response.started) throw new Error('Browser did not start speech recognition.');
      setMicStatus('listening');
      setNotice('Listening. Say the real situation, then click Stop or Generate Reply.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await sendExtensionMessage<{ opened: boolean }>({ type: 'MIC_WINDOW_OPEN' });
        dictationRef.current = null;
        setDictatingContext(false);
        setMicStatus('idle');
        setMicLevel(0);
        setNotice(`Mic needs the dedicated dictation window. Click Start Listening there. Reason: ${message}`);
      } catch {
        dictationRef.current = null;
        setDictatingContext(false);
        setMicStatus('error');
        setMicLevel(0);
        focusAdditionalContextForManualDictation(`Mic could not start: ${message}. Allow microphone access for the extension, then click Mic again.`);
      }
    }
  }

  const micButtonText = dictatingContext ? (micStatus === 'stopping' ? 'Saving' : 'Stop') : 'Mic';
  const micMeterClass = `mic-meter ${dictatingContext ? (micLevel > 0.08 ? 'talking' : 'quiet') : 'idle'}`;
  const micBars = [0, 1, 2, 3, 4].map((bar) => {
    const boost = bar === 2 ? 1 : bar === 1 || bar === 3 ? 0.75 : 0.45;
    const height = dictatingContext ? Math.max(3, Math.round(4 + micLevel * 34 * boost)) : 3;
    return <span key={bar} style={{ height: `${height}px` }} />;
  });
  const micIndicator = (
    <span className={micMeterClass} aria-hidden="true">
      {micBars}
    </span>
  );

  const renderDraftWorkspace = (columnKey: ColumnKey) => (
    <section className="panel workspace">
      <div className="workspace-head">
        <div>
          <h2>{columns[columnKey].title}</h2>
          <p className="subtle">{columns[columnKey].helper}</p>
        </div>
        <div className="action-row">
          <button className="mini" disabled={Boolean(loading) || !canWriteColumn(columnKey)} onClick={() => void generateColumn(columnKey)}>
            {loading === columnKey ? 'Writing' : 'Write'}
          </button>
          <button className="mini" disabled={Boolean(loading) || !canWriteColumn(columnKey)} onClick={() => void refineDraft(columnKey, 'rewrite_shorter')}>
            Shorter
          </button>
          <button className="mini" disabled={Boolean(loading) || !canWriteColumn(columnKey)} onClick={() => void refineDraft(columnKey, 'rewrite_stronger')}>
            Stronger
          </button>
          <button className="mini" disabled={Boolean(loading) || !canWriteColumn(columnKey)} onClick={() => void refineDraft(columnKey, 'humanize')}>
            Human
          </button>
        </div>
      </div>
      {activeDraft?.options?.length ? (
        <div className="option-list">
          {activeDraft.options.map((option) => (
            <article className="option-card" key={`${columnKey}-${option.label}-${option.text.slice(0, 16)}`}>
              <div className="option-head">
                <strong>{option.label}</strong>
                <span>{option.score}/100</span>
              </div>
              <p>{option.text}</p>
              {option.flags.length > 0 && <small>{option.flags.join(', ')}</small>}
              <div className="option-actions">
                <button className="mini" disabled={!can('canCopyDrafts')} onClick={() => void copy(option.text, columnKey)}>
                  Copy
                </button>
                <button className="mini" disabled={!can('canInsertIntoCrm') || contactBlocked} onClick={() => void insert(option.text, columnKey)}>
                  {contactBlocked ? 'Copy Only' : 'Insert'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No draft yet.</strong>
          <p>Read the page, then write this lane.</p>
        </div>
      )}
    </section>
  );

  return (
    <main className="sidebar">
      <header className="topbar">
        <div>
          <p className="kicker">DriveCentric AI</p>
          <h1>Closer</h1>
        </div>
        {auth.authenticated && (
          <div className="header-actions">
            <button className={`quota-pill ${quotaTone(quota, auth.user)}`} title={quota?.refreshedAt ? `Updated ${new Date(quota.refreshedAt).toLocaleTimeString()}` : 'Checking usage'} onClick={() => void refreshQuota(false)}>
              <strong>{quotaPrimary(quota, auth.user)}</strong>
              <span>{quotaSecondary(quota, auth.user)}</span>
            </button>
            <span className="pill neutral">{auth.user?.signatureName ?? auth.user?.name}</span>
            <button className="button small ghost" onClick={logout}>
              Logout
            </button>
          </div>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {notice && !/^Lead read:/i.test(notice) && <p className="notice">{notice}</p>}
      {!auth.authenticated ? (
        <section className="panel login-grid">
          <div className="section-title">
            <div>
              <h2>Sign in</h2>
              <p className="subtle">Use your dealership login to unlock the side panel.</p>
            </div>
          </div>
          <input className="input" placeholder="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="button" onClick={login}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <section className="closer-shell">
            <header className="closer-header">
              <div className="brand-lockup">
                <strong>Closer AI</strong>
                <span>Dealership Lead Coach</span>
                <span className="build-label">{READER_BUILD_LABEL}</span>
              </div>
              <div className="header-cluster">
                <span className={`status-pill status-${aiStatus.toLowerCase().replace(/\s+/g, '-')}`}>{aiStatus}</span>
                <span className="user-pill">{userInitials}</span>
                <button className="icon-button" type="button" title="Settings" onClick={() => setNotice('Settings live inside your profile and extension permissions.')}>
                  ...
                </button>
                <button className="icon-button" type="button" title="Close" onClick={() => window.close()}>
                  x
                </button>
              </div>
            </header>

            {error && <p className="soft-alert error-soft">{error}</p>}

            <section className="closer-dashboard" aria-label="Closer lead dashboard">
              <div className="dashboard-topline">
                <div>
                  <p className="section-label">Live Lead</p>
                  <h2>{snapshotCustomer}</h2>
                  <p>{snapshotVehicle}</p>
                </div>
                <div className="dashboard-top-actions">
                  {canSwitchRoleMode() && (
                    <div className="owner-view-switch" aria-label="View as role">
                      <span>View as</span>
                      {accessibleViewRoles(auth.user).map((viewRole) => (
                        <button
                          key={viewRole}
                          type="button"
                          className={ownerViewRole === viewRole ? 'active' : ''}
                          onClick={() => {
                            setOwnerViewRole(viewRole);
                            setRoleMode(viewRole === 'manager' ? 'manager' : 'salesperson');
                            setControlTab('recommended');
                            if (viewRole === 'manager') setTone('manager_takeover');
                            clearDraftState();
                            setAskCoachDraft(null);
                          }}
                        >
                          {PROFILE_ACCESS_ROLE_LABELS[viewRole]}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className={`dashboard-read-state ${page ? 'is-ready' : ''}`}>
                    {page ? 'Read' : loading === 'read' ? 'Reading' : 'Needs Lead'}
                  </span>
                </div>
              </div>

              <div className="dashboard-read-row">
                <button
                  className="secondary-action"
                  disabled={Boolean(loading) || !can('canReadAnyPage')}
                  onClick={() => void syncPage({ draftStrategy: false, fetchInventory: true, freshRead: true, silent: false })}
                >
                  {loading === 'read' ? 'Reading...' : 'Read Page'}
                </button>
                <span>{page ? 'Activity, notes, calls, images, and conversation checked.' : 'Read before generating.'}</span>
              </div>

              <div className="dashboard-proof">
                {page ? `Last communication: ${lastCommunicationLine}` : 'Open the lead, read the customer, then add the real situation before Generate.'}
              </div>

              <div className="dashboard-summary">
                <ul className="dashboard-summary-list">
                  {topCustomerSummary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="dashboard-grid">
                <div>
                  <span>Last communication</span>
                  <strong>{lastCommunicationLine}</strong>
                </div>
                <div>
                  <span>Customer goal</span>
                  <strong>{customerGoalLine}</strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>{snapshotLocation}</strong>
                </div>
                <div>
                  <span>Stage</span>
                  <strong>{stageLabel}</strong>
                </div>
              </div>

              <form
                className="dashboard-ask"
                onSubmit={(event) => {
                  event.preventDefault();
                  void askLeadQuestion();
                }}
              >
                <input
                  className="ask-closer-input"
                  placeholder="Ask Closer anything about this lead..."
                  value={ask}
                  disabled={!can('canUseAskBar') || isAskingLead}
                  onChange={(event) => updateAsk(event.target.value)}
                />
                <button
                  className="secondary-action"
                  type="submit"
                  disabled={Boolean(loading) || !can('canUseAskBar') || !ask.trim()}
                >
                  {isAskingLead ? 'Thinking...' : 'Ask'}
                </button>
              </form>

              <div className="dashboard-move">
                <div>
                  <p className="section-label">Best Next Move</p>
                  <h3>{askCoachHeading}</h3>
                  <p>{askCoachAnswer || bestMoveReason}</p>
                  {!askCoachAnswer && (
                    <ul className="dashboard-move-list">
                      {bestMoveBullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="confidence-chip">
                  <strong>{intentConfidence}%</strong>
                  <span>{emotionalState}</span>
                </div>
              </div>

              <section className="dashboard-context">
                <div className="dashboard-context-head">
                  <span>Extra direction before Generate</span>
                  <button
                    className={`mic-action ${dictatingContext ? 'listening' : ''}`}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void startAdditionalContextDictation();
                    }}
                  >
                    {micIndicator}
                    {dictatingContext && <span className="stop-icon" aria-hidden="true" />}
                    <span>{micButtonText}</span>
                  </button>
                </div>
                <textarea
                  className="live-context-input"
                  ref={additionalContextRef}
                  placeholder="Add lead-specific direction: I'm taking over this lead, introduce me as Ani, customer only wants black, manager approved $500 more, avoid appointment push, etc."
                  value={additionalContext}
                  onChange={(event) => {
                    additionalContextValueRef.current = event.target.value;
                    leadScopedInputsStaleRef.current = false;
                    setAdditionalContext(event.target.value);
                  }}
                />
                {dictatingContext && <p className="dictation-fallback">Listening now. Click Stop to save it, or click Generate Reply and Closer will stop first.</p>}
              </section>

              <div className="dashboard-actions">
                <button
                  className="primary-action"
                  disabled={Boolean(loading) || !canWriteColumn(columnFromChannel(activeFilters.channel)) || !can('canReadAnyPage')}
                  onClick={() => void generatePrimaryReply()}
                >
                  {isGeneratingReply ? 'Writing...' : 'Generate Reply'}
                </button>
              </div>
            </section>

            <section className="coach-card lead-reader-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">Lead Reader</p>
                  <h2>Read the customer</h2>
                </div>
                <span className="mini-state">{page ? 'Lead read successfully' : loading === 'read' ? 'Reading lead…' : 'Open a lead page'}</span>
              </div>
              <div className="ask-closer-bar">
                <input
                  className="ask-closer-input"
                  placeholder="Ask Closer anything about this lead…"
                  value={ask}
                  disabled={!can('canUseAskBar')}
                  onChange={(event) => updateAsk(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void askLeadQuestion();
                    }
                  }}
                />
              </div>
              <p className="helper-copy">
                {page
                  ? 'Closer checked Activity, Conversation, notes, call summaries, and visible media. Generate will read again before writing.'
                  : 'Open a lead page, then tap Read Page.'}
              </p>
              <div className="button-pair">
                <button
                  className="primary-action"
                  disabled={Boolean(loading) || !can('canReadAnyPage')}
                  onClick={() => void syncPage({ draftStrategy: false, fetchInventory: true, freshRead: true, silent: false })}
                >
                  {loading === 'read' ? 'Reading…' : 'Read Page'}
                </button>
                <button className="secondary-action" type="button" onClick={() => setNotice('Paste the lead or customer message into Ask Closer, then Generate Reply.')}>
                  Paste Lead
                </button>
              </div>
            </section>

            <section className="coach-card live-context-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">Additional Context</p>
                  <h2>Tell Closer the real situation</h2>
                </div>
                <button className={`mic-action ${dictatingContext ? 'listening' : ''}`} type="button" onClick={startAdditionalContextDictation}>
                  {micIndicator}
                  {dictatingContext && <span className="stop-icon" aria-hidden="true" />}
                  <span>{micButtonText}</span>
                </button>
              </div>
              <textarea
                className="live-context-input"
                ref={additionalContextRef}
                placeholder="Example: Customer wants $1,000 but we are at $1,300. Management cannot get there. Need a realistic bridge, finance structure, trade, or alternate vehicle."
                value={additionalContext}
                onChange={(event) => {
                  additionalContextValueRef.current = event.target.value;
                  leadScopedInputsStaleRef.current = false;
                  setAdditionalContext(event.target.value);
                }}
              />
              {dictatingContext && <p className="dictation-fallback">Listening now. Click Stop to save it, or click Generate Reply and Closer will stop first.</p>}
              <p className="helper-copy">This is not saved as a template. It only guides this lead and this Generate.</p>
            </section>

            <section className="coach-card snapshot-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">Customer Snapshot</p>
                  <h2>{snapshotCustomer}</h2>
                </div>
                <span className="stage-token">{stageLabel}</span>
              </div>
              <div className="snapshot-grid">
                <p>
                  <span>Customer</span>
                  <strong>{snapshotCustomer}</strong>
                </p>
                <p>
                  <span>Vehicle</span>
                  <strong>{snapshotVehicle}</strong>
                </p>
                <p>
                  <span>Location</span>
                  <strong>{snapshotLocation}</strong>
                </p>
                <p>
                  <span>Stage</span>
                  <strong>{stageLabel}</strong>
                </p>
              </div>
              <div className="friendly-badges">
                <span>{readStatusLabel}</span>
                <span className={context.locationIntel?.classification === 'unknown' ? 'amber' : ''}>
                  {context.locationIntel?.classification === 'unknown' ? 'Ask for ZIP' : zipStatusLabel}
                </span>
                <span>{context.leadScore === 'hot' ? 'High intent' : 'Needs reply'}</span>
              </div>
            </section>

            <section className="coach-card diagnosis-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">What the customer wants</p>
                  <h2>{customerBrief.intent}</h2>
                </div>
                <div className="confidence-badge">
                  <strong>{intentConfidence}%</strong>
                  <span>confidence</span>
                </div>
              </div>
              <div className="emotion-row">
                <span>{emotionalState}</span>
                <p>{customerBrief.cares}</p>
              </div>
              <details className="soft-details">
                <summary>Why?</summary>
                <p>{customerInsight}</p>
                <p>{latestLine}</p>
              </details>
            </section>

            <section className="best-move-card">
              <p className="section-label">Best Next Move</p>
              <h2>{askCoachDraft ? askCoachHeading : bestMoveBullets[0] ?? customerBrief.recommendedMove}</h2>
              <p>{askCoachAnswer || bestMoveReason}</p>
              <div className="button-pair">
                <button className="primary-action" type="button" onClick={() => void generatePrimaryReply()}>
                  Use This Strategy
                </button>
                <button className="secondary-action" type="button" onClick={() => setControlTab('custom')}>
                  Change Strategy
                </button>
              </div>
            </section>

            <section className="coach-card composer-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">Reply Composer</p>
                  <h2>Generate the next message</h2>
                </div>
                <div className="segmented-tabs">
                  <button className={controlTab === 'recommended' ? 'active' : ''} onClick={useRecommendedFilters}>
                    Recommended
                  </button>
                  <button className={controlTab === 'custom' ? 'active' : ''} onClick={() => setControlTab('custom')}>
                    Custom
                  </button>
                </div>
              </div>
              {controlTab === 'recommended' ? (
                <div className="recommended-summary">
                  <p>
                    <span>Tone</span>
                    <strong>{labelFor(toneFilterOptions, activeFilters.tone)}</strong>
                  </p>
                  <p>
                    <span>Goal</span>
                    <strong>{labelFor(goalFilterOptions, activeFilters.goal)}</strong>
                  </p>
                  <p>
                    <span>Channel</span>
                    <strong>{labelFor(channelFilterOptions, activeFilters.channel)}</strong>
                  </p>
                  <p>
                    <span>Length</span>
                    <strong>{labelFor(lengthFilterOptions, activeFilters.length)}</strong>
                  </p>
                </div>
              ) : (
                <div className="custom-grid">
                  <label>
                    Role
                    <select value={customFilters.role} onChange={(event) => updateCustomFilter('role', event.target.value as FilterRole)}>
                      {roleFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Conversation
                    <select value={customFilters.conversation} onChange={(event) => updateCustomFilter('conversation', event.target.value as FilterConversation)}>
                      {conversationFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Goal
                    <select value={customFilters.goal} onChange={(event) => updateCustomFilter('goal', event.target.value as FilterGoal)}>
                      {goalFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tone
                    <select value={customFilters.tone} onChange={(event) => updateCustomFilter('tone', event.target.value as FilterTone)}>
                      {toneFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Channel
                    <select value={customFilters.channel} onChange={(event) => updateCustomFilter('channel', event.target.value as FilterChannel)}>
                      {channelFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Length
                    <select value={customFilters.length} onChange={(event) => updateCustomFilter('length', event.target.value as FilterLength)}>
                      {lengthFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <button
                className="primary-action generate-action"
                disabled={isGeneratingReply || !canWriteColumn(columnFromChannel(activeFilters.channel)) || !can('canReadAnyPage')}
                onClick={() => void generatePrimaryReply()}
              >
                {isGeneratingReply ? 'Writing reply…' : 'Generate Reply'}
              </button>
              <p className="helper-copy">Generate re-reads the page first, then uses Activity, notes, call summaries, visible media, and your live context.</p>
            </section>

            {isGeneratingReply && !hasBestReply && (
              <div className="thinking-card" aria-live="polite">
                <span />
                <p>Reading the lead and writing the best next message…</p>
              </div>
            )}

            {contactBlocked && (
              <p className="soft-alert error-soft">{complianceMessage || 'Contact restriction found. Do not send SMS until reviewed.'}</p>
            )}

            {hasBestReply && (
              <section
                className="reply-surface"
                style={{
                  display: 'grid',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#171819',
                }}
              >
                <div style={{ display: 'grid', gap: '4px' }}>
                  <p className="section-label">{outputKicker}</p>
                  <h2 style={{ margin: 0, fontSize: '18px', lineHeight: 1.1 }}>Suggested Reply</h2>
                </div>
                <div
                  aria-label="Suggested reply"
                  style={{
                    minHeight: '132px',
                    maxHeight: '240px',
                    overflow: 'auto',
                    padding: '12px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.22)',
                    color: '#f7f7f8',
                    fontSize: '13px',
                    lineHeight: 1.42,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {bestReply}
                </div>
                {showTranslationBox && (
                  <div className="translation-stack" aria-label="Translation for salesperson">
                    {customerTranslation && (
                      <div className="translation-box">
                        <span>Customer translation</span>
                        <p>{customerTranslation}</p>
                      </div>
                    )}
                    {replyTranslation && (
                      <div className="translation-box">
                        <span>Reply translation</span>
                        <p>{replyTranslation}</p>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                  <button className="primary-action" disabled={!can('canCopyDrafts')} onClick={() => void copy(bestReply, primaryOutputColumn)}>
                    Copy
                  </button>
                  <button className="secondary-action" disabled={!can('canInsertIntoCrm') || contactBlocked} onClick={() => void insert(bestReply, primaryOutputColumn)}>
                    {contactBlocked ? 'SMS Blocked' : 'Send Reply'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  <button onClick={() => void refinePrimaryReply('rewrite')}>Regenerate</button>
                  <button onClick={() => void refinePrimaryReply('shorter')}>Shorten</button>
                  <button onClick={() => void refinePrimaryReply('human')}>Warmer</button>
                  <button onClick={() => void refinePrimaryReply('empathy')}>Empathy</button>
                  <button onClick={() => void refinePrimaryReply('stronger')}>Stronger</button>
                  <button onClick={() => void refinePrimaryReply('question')}>Add Question</button>
                  <button onClick={() => void refinePrimaryReply('appointment')}>Appointment Close</button>
                  <button onClick={() => void refinePrimaryReply('credit')}>Finance Angle</button>
                  <button onClick={() => void refinePrimaryReply('introduce')}>Introduce</button>
                </div>
              </section>
            )}

            <section className="coach-card followup-card">
              <div className="card-title-row">
                <div>
                  <p className="section-label">Follow-Up Plan</p>
                  <h2>Keep the lead moving</h2>
                </div>
              </div>
              <ol className="followup-list">
                {followUpPlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <div className="button-pair">
                <button className="secondary-action" type="button" onClick={() => setNotice('Follow-up plan ready. Calendar/task creation can be connected next.')}>
                  Create Follow-Up
                </button>
                <button className="secondary-action" type="button" onClick={() => void copy(followUpPlan.join('\n'), 'strategy')}>
                  Copy Follow-Up
                </button>
              </div>
            </section>

            {!isGeneratingReply && bestReplyRaw && !hasBestReply && (
              <p className="soft-alert error-soft">Reply came back empty. Click Regenerate and I’ll try again.</p>
            )}

            {showInventoryPanel && (
              <section
                className="inventory-surface"
                style={{
                  display: 'grid',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141516',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <p className="section-label">Similar Inventory</p>
                    <h2>
                      {inventoryCards.length
                        ? `${inventoryCards.length} possible matches`
                        : manualInventoryQueryActive(inventoryQuery)
                          ? 'No matches found'
                          : 'Find options if needed'}
                    </h2>
                  </div>
                  {inventoryCards[0]?.url ? (
                    <button
                      type="button"
                      className="secondary-action"
                      style={{ minWidth: '96px' }}
                      onClick={() => window.open(inventoryCards[0]?.url ?? '#', '_blank', 'noopener,noreferrer')}
                    >
                      Open Match
                    </button>
                  ) : null}
                </div>
                <form
                  className="inventory-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadInventory(inventoryQuery || inventoryIntentQueryFromPage(page, ask) || context.vehicleOfInterest || ask);
                  }}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' }}
                >
                  <input
                    value={inventoryQuery}
                    onChange={(event) => setInventoryQuery(event.target.value)}
                    placeholder="Find similar inventory…"
                    style={{ minHeight: '42px', borderRadius: '12px', padding: '0 12px' }}
                  />
                  <button disabled={loading === 'inventory'} style={{ padding: '0 14px' }}>
                    {loading === 'inventory' ? 'Searching' : 'Find'}
                  </button>
                </form>
                {inventoryCards.length ? (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {inventoryCards.slice(0, 3).map((item) => (
                      <a
                        key={item.id}
                        href={item.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'grid',
                          gap: '4px',
                          padding: '10px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.06)',
                          background: 'rgba(255,255,255,0.03)',
                          color: '#f5f5f7',
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span style={{ color: '#b8b8bc', fontSize: '11px', lineHeight: 1.3 }}>
                          {inventoryMeta(item) || item.recommendationReason || 'Possible alternative'}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="helper-copy">
                    {manualInventoryQueryActive(inventoryQuery)
                      ? `No inventory matched "${inventoryQuery.trim()}".`
                      : 'No visible matches yet. Click Find to search similar units.'}
                  </p>
                )}
              </section>
            )}

            <details className="debug-drawer">
              <summary>Lead Details / Debug</summary>
              <div className="debug-grid">
                <p>
                  <strong>Reader Diagnostic:</strong> {leadReadDiagnostics(page).join(' || ')}
                </p>
                <p>
                  <strong>Parsed Lead Data:</strong> {customerBrief.knownFacts.join(' | ') || 'No lead read yet'}
                </p>
                <p>
                  <strong>Raw Page Data:</strong> {latestLine}
                </p>
                <p>
                  <strong>AI Prompt Data:</strong> {activeFilterLabels.join(' / ')}
                </p>
                <p>
                  <strong>Debug Logs:</strong> {(context.parserDebug?.warnings?.length ? context.parserDebug.warnings : ['No warnings']).join(' | ')}
                </p>
              </div>
            </details>
          </section>

          <section className="trigger-shell legacy-workspace-hidden">
            <div className="ask-bar">
              <input
                className="ask-input"
                placeholder="Ask naturally: what does this customer want, what should I say next, explain price, ask about trade..."
                value={ask}
                disabled={!can('canUseAskBar')}
                onChange={(event) => updateAsk(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void askLeadQuestion();
                  }
                }}
              />
              <div className="ask-actions">
                <button
                  className="button small read-page"
                  disabled={Boolean(loading) || !can('canReadAnyPage')}
                  onClick={() => void syncPage({ draftStrategy: false, fetchInventory: true, freshRead: true, silent: false })}
                >
                  {loading === 'read' ? 'Reading' : 'Read Page'}
                </button>
                <span>{ask.trim() ? 'Ask bar will guide the next Generate.' : 'Read the lead, then generate when ready.'}</span>
              </div>
            </div>
            <div className="lead-primer">
              <div className="lead-meta">
                <span>Lead</span>
                <strong>{leadLine}</strong>
              </div>
              <div className="lead-meta">
                <span>Intent</span>
                <strong>{intentLabel}</strong>
              </div>
              <div className="lead-meta location-meta">
                <span>{locationStatus}</span>
                <strong>{locationLabel}</strong>
              </div>
            </div>
            <div className="status-strip" aria-label="Lead status">
              <span>{readStatusLabel}</span>
              <span className={context.locationIntel?.classification === 'unknown' ? 'warn' : ''}>{zipStatusLabel}</span>
              <span>{pageUpdatedLabel}</span>
              <span>{roleBadgeLabel}</span>
            </div>

            <section className="customer-brief" aria-label="Customer brief">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Customer Brief</p>
                  <h2>{customerBrief.intent}</h2>
                </div>
                <span className="stage-badge">{customerBrief.stage}</span>
              </div>
              <div className="brief-focus">
                <span>Likely cares about</span>
                <strong>{customerBrief.cares}</strong>
              </div>
              <div className="brief-quick">
                <p>
                  <span>Latest customer</span>
                  <strong>{latestLine}</strong>
                </p>
                <p>
                  <span>Vehicle</span>
                  <strong>{briefVehicleLine}</strong>
                </p>
                <p>
                  <span>Best next move</span>
                  <strong>{customerBrief.recommendedMove}</strong>
                </p>
              </div>
              <details className="brief-details">
                <summary>More lead details</summary>
                <div className="brief-grid">
                  <article>
                    <span>Known Facts</span>
                    <ul>
                      {customerBrief.knownFacts.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article>
                    <span>Pain Points</span>
                    <ul>
                      {customerBrief.painPoints.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article>
                    <span>Non-Negotiables</span>
                    <ul>
                      {(customerBrief.nonNegotiables.length ? customerBrief.nonNegotiables : ['None detected yet']).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article>
                    <span>Missing Info</span>
                    <ul>
                      {customerBrief.missingInfo.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </details>
            </section>

            <section className="smart-controls" aria-label="AI controls">
              <div className="easy-controls">
                <div className="control-summary">
                  <span>{controlTab === 'recommended' ? 'Recommended setup' : 'Custom setup'}</span>
                  <strong>{activeFilterLabels.slice(0, 4).join(' / ')}</strong>
                </div>
                <div className="watch-line">
                  <div>
                    <strong>Watch page {watchEnabled ? 'on' : 'off'}</strong>
                    <span>{liveStatusText}</span>
                  </div>
                  <button
                    className={watchEnabled ? 'filter-chip active' : 'filter-chip'}
                    disabled={!can('canUseLiveWatch')}
                    onClick={() => setWatchEnabled((current) => !current)}
                  >
                    {watchEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              <details className="advanced-panel">
                <summary>Change style</summary>
                <div className="custom-panel advanced-body">
                  <button className="use-recommended" onClick={useRecommendedFilters}>
                    Use Recommended Setup
                  </button>
                  <div className="filter-section">
                    <span>Role</span>
                    <div className="filter-row">
                      {roleFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.role === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('role', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <span>Conversation</span>
                    <div className="filter-row">
                      {conversationFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.conversation === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('conversation', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <span>Goal</span>
                    <div className="filter-row">
                      {goalFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.goal === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('goal', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <span>Tone</span>
                    <div className="filter-row">
                      {toneFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.tone === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('tone', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <span>Channel</span>
                    <div className="filter-row">
                      {channelFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.channel === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('channel', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-section">
                    <span>Length</span>
                    <div className="filter-row">
                      {lengthFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          className={customFilters.length === option.value ? 'filter-chip active' : 'filter-chip'}
                          onClick={() => updateCustomFilter('length', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </details>

              <button
                className="primary-trigger"
                disabled={isGeneratingReply || !canWriteColumn(columnFromChannel(activeFilters.channel)) || !can('canReadAnyPage')}
                onClick={() => void generatePrimaryReply()}
              >
                <span>{isGeneratingReply ? 'Generating...' : primaryButtonLabel}</span>
                <small>{primaryHelp}</small>
              </button>
            </section>

            <details className="context-drawer lead-data-drawer">
              <summary>Lead details</summary>
              <div className="lead-data-body">
                <section className="needs-panel" aria-label="Needs analysis">
                  <div>
                    <p className="eyebrow">Needs Analysis</p>
                    <h2>{customerBrief.bestQuestion}</h2>
                  </div>
                  <div className="filter-row">
                    {needsKnown.map((item) => (
                      <span className="filter-chip ghost-chip" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="recommended-action" aria-label="Recommended action">
                  <div>
                    <p className="eyebrow">Recommended Action</p>
                    <h2>{customerBrief.recommendedMove}</h2>
                    <p>{localAngle}</p>
                  </div>
                </section>

                {context.vehicleOfInterest && (
                  <article className="vehicle-snapshot">
                    <span>Vehicle</span>
                    <strong>{context.vehicleOfInterest}</strong>
                    <small>
                      {[context.stockNumber ? `Stock ${context.stockNumber}` : undefined, inventoryCards[0]?.price, inventoryCards[0]?.mileage]
                        .filter(Boolean)
                        .join(' | ') || 'Availability will be verified before quoting.'}
                    </small>
                  </article>
                )}

                <div className="parsed-block">
                  <p>
                    <strong>Vehicle of interest:</strong> {vehicleCandidateDisplay(context.vehicleOfInterestDetails)}
                  </p>
                  <p>
                    <strong>Trade-in:</strong> {vehicleCandidateDisplay(context.tradeVehicle)}
                  </p>
                  <p>
                    <strong>Location:</strong> {context.customerZipCode ?? context.locationIntel?.summary ?? 'Unknown'} ({formatLocationStatus(context.locationIntel)})
                  </p>
                  <p>
                    <strong>Latest customer:</strong> {compactSnippet(latestCustomerMessage(page), 220) || 'Not found'}
                  </p>
                  <p>
                    <strong>Messages parsed:</strong> {context.parserDebug?.messagesParsedCount ?? context.conversationTimeline?.length ?? 0}
                  </p>
                  <p>
                    <strong>Warnings:</strong> {(context.parserDebug?.warnings?.length ? context.parserDebug.warnings : ['None']).join(' | ')}
                  </p>
                  {context.parserDebug?.vehicleCandidates?.length ? (
                    <div className="drawer-list">
                      {context.parserDebug.vehicleCandidates.slice(0, 6).map((candidate, index) => (
                        <p key={`${candidate.role}-${candidate.stock ?? candidate.rawText ?? index}`}>
                          {candidate.role}: {vehicleCandidateDisplay(candidate)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                {can('canUseInventoryLookup') && (
                  <section className="inventory-block">
                    <p className="eyebrow">Similar Inventory</p>
                    <form
                      className="inline-search"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void loadInventory(inventoryQuery || inventoryIntentQueryFromPage(page, ask) || context.vehicleOfInterest || ask);
                      }}
                    >
                      <input
                        className="input"
                        value={inventoryQuery}
                        onChange={(event) => setInventoryQuery(event.target.value)}
                        placeholder="Ask naturally: Wrangler hard-top, leather, under 55k"
                      />
                      <button className="mini" disabled={loading === 'inventory'}>
                        {loading === 'inventory' ? 'Searching' : 'Ask'}
                      </button>
                    </form>
                    <p>{inventoryCountsLabel(inventory)}</p>
                    {inventory?.warning && <p className="inventory-warning">{inventory.warning}</p>}
                    {inventoryCards.length ? (
                      <div className="inventory-list compact">
                        {inventoryCards.slice(0, 3).map((item) => (
                          <a key={item.id} href={item.url ?? '#'} target="_blank" rel="noreferrer" className="vehicle">
                            <div className="vehicle-top">
                              <strong>{item.title}</strong>
                              <span>{inventoryMeta(item) || item.source.toUpperCase()}</span>
                            </div>
                            <p>{item.recommendationReason ?? item.strategy}</p>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p>Ask for exact needs or search inventory when the customer asks for options.</p>
                    )}
                  </section>
                )}
              </div>
            </details>

            {isGeneratingReply && !bestReply && (
              <div className="instant-state" aria-live="polite">
                Reading the lead and writing the best next message.
              </div>
            )}

            {contactBlocked && (
              <p className="contact-note">{complianceMessage || 'Contact restriction found. Do not send SMS until reviewed.'}</p>
            )}

            {bestReply && (
              <article className="reply-stage">
                <p className="eyebrow">{outputKicker}</p>
                <div className="insight-stack">
                  <p>
                    <strong>Customer insight:</strong> {customerInsight}
                  </p>
                  <p>
                    <strong>Missing key info:</strong> {missingKeyInfo}
                  </p>
                  <p>
                    <strong>Best next move:</strong> {bestNextMove}
                  </p>
                  <p>
                    <strong>Local angle:</strong> {localAngle}
                  </p>
                </div>
                <p className="reply-copy">
                  <strong>Suggested response:</strong> {bestReply}
                </p>
                {showTranslationBox && (
                  <div className="translation-stack" aria-label="Translation for salesperson">
                    {customerTranslation && (
                      <div className="translation-box">
                        <span>Customer translation</span>
                        <p>{customerTranslation}</p>
                      </div>
                    )}
                    {replyTranslation && (
                      <div className="translation-box">
                        <span>Reply translation</span>
                        <p>{replyTranslation}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="reply-actions">
                  <button className="button action-copy" disabled={!can('canCopyDrafts')} onClick={() => void copy(bestReply, primaryOutputColumn)}>
                    {primaryOutputColumn === 'strategy' ? 'Copy Plan' : 'Copy & Send'}
                  </button>
                  <button
                    className="button action-insert"
                    disabled={!can('canInsertIntoCrm') || contactBlocked}
                    onClick={() => void insert(bestReply, primaryOutputColumn)}
                  >
                    {contactBlocked ? 'SMS Blocked' : primaryOutputColumn === 'strategy' ? 'Insert Note' : 'Insert into CRM'}
                  </button>
                </div>
                <div className="secondary-actions" aria-label="Rewrite options">
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('rewrite')}>
                    Rewrite
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('shorter')}>
                    Shorter
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('stronger')}>
                    Stronger
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('human')}>
                    More Human
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('empathy')}>
                    Empathy
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('question')}>
                    Add Question
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('appointment')}>
                    Make Appointment Ask
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('credit')}>
                    Make Credit App Ask
                  </button>
                  <button className="filter-chip" disabled={Boolean(loading)} onClick={() => void refinePrimaryReply('introduce')}>
                    Introduce
                  </button>
                </div>
              </article>
            )}
          </section>

          <div className="legacy-workspace-hidden" aria-hidden="true">
          <section className="command-card compact-command">
            <div className="command-top">
              <div>
                <p className="eyebrow">Lead</p>
                <h2>
                  {[context.customerName ?? 'Open lead', context.vehicleOfInterest ?? 'Read page'].filter(Boolean).join(' / ')}
                </h2>
                <p className="subtle next-line">{readPageDraft?.nextBestAction ?? recommendedMove(context, marketInsight.route)}</p>
                <p className="subtle">{liveStatusText}</p>
              </div>
              <div className="command-pills">
                {canSwitchRoleMode() && (
                  <div className="role-switch" aria-label="Response role">
                    <button className={`segment role-segment ${roleMode === 'salesperson' ? 'active' : ''}`} onClick={() => setRoleMode('salesperson')}>
                      Sales Rep
                    </button>
                    <button className={`segment role-segment ${roleMode === 'manager' ? 'active' : ''}`} onClick={() => setRoleMode('manager')}>
                      Manager
                    </button>
                  </div>
                )}
                <span className={`pill ${watchState}`}>{watchState === 'watching' ? 'Watching' : watchState === 'waiting' ? 'Standby' : 'Watch Off'}</span>
              </div>
            </div>

            <section className="top-ai-controls">
              <div className="control-head">
                <div>
                  <p className="eyebrow">Conversation</p>
                  <h2>{conversationMode === 'continue' ? 'Continue the thread' : 'Meet & greet'}</h2>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={watchEnabled}
                    disabled={!can('canUseLiveWatch')}
                    onChange={(event) => setWatchEnabled(event.target.checked)}
                  />
                  <span>{watchEnabled ? 'Change Watch On' : 'Change Watch Off'}</span>
                </label>
              </div>
              <div className="mode-row">
                <button
                  className={`segment mode-segment ${conversationMode === 'continue' ? 'active' : ''}`}
                  onClick={() => setConversationMode('continue')}
                >
                  Continue
                </button>
                <button
                  className={`segment mode-segment ${conversationMode === 'meet_greet' ? 'active' : ''}`}
                  onClick={() => setConversationMode('meet_greet')}
                >
                  Meet & Greet
                </button>
              </div>
              <textarea
                className="input ask"
                placeholder="Optional note: payment, trade, manager handoff, video, call close..."
                value={ask}
                disabled={!can('canUseAskBar')}
                onChange={(event) => updateAsk(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void askLeadQuestion();
                  }
                }}
              />
              <div className="chip-grid simple-goals">
                {leadPlays.map((play) => {
                  const allowed = play.permission === 'canUseAi' ? can('canUseAi') : can(play.permission);
                  return (
                    <button
                      key={play.label}
                      className={`chip ${selectedLeadAction === play.action ? 'active' : ''}`}
                      disabled={Boolean(loading) || !allowed}
                      onClick={() => setSelectedLeadAction(play.action)}
                    >
                      {play.label === 'Coach + Reply' ? 'Coach' : play.label}
                    </button>
                  );
                })}
              </div>
              <details className="mini-settings">
                <summary>Style</summary>
                <div className="segment-row">
                  {toneOptions.map((option) => {
                    const allowed = can(option.permission);
                    return (
                      <button
                        key={option.value}
                        className={`segment ${tone === option.value ? 'active' : ''}`}
                        disabled={!allowed}
                        onClick={() => setTone(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </details>
            </section>

            <div className="action-strip">
              <button className="button read" disabled={Boolean(loading) || !can('canReadAnyPage') || !can('canUseReadAllDraft')} onClick={generateAll}>
                {loading === 'all' || loading === 'read' ? 'Reading + Coaching' : 'Read Page + Coach'}
              </button>
            </div>

            <div className="quick-read">
              <article>
                <span>Buyer</span>
                <strong>{buyerType.type}</strong>
              </article>
              <article>
                <span>Need</span>
                <strong>{compactSnippet(needsSnapshot(context, needsAnalysis), 72)}</strong>
              </article>
              <article>
                <span>Next</span>
                <strong>{compactSnippet(readPageDraft?.nextBestAction ?? salesInfluencePlan.closeMove, 72)}</strong>
              </article>
            </div>
          </section>

          {contactBlocked && (
            <section className="panel alert-card critical">
              <div className="alert-head">
                <div>
                  <p className="eyebrow">Contact Compliance</p>
                  <h2>{communicationCompliance?.status === 'do_not_contact' ? 'Do Not Contact' : 'SMS Opt-Out'}</h2>
                </div>
                <span className="pill alert critical">Blocked</span>
              </div>
              <p className="alert-reason">{communicationCompliance?.reason ?? complianceMessage}</p>
              {communicationCompliance?.evidence?.[0] && <p className="subtle">Evidence: {communicationCompliance.evidence[0]}</p>}
            </section>
          )}

          <nav className="tab-row">
            <button className={`tab ${activeTab === 'coach' ? 'active' : ''}`} onClick={() => setActiveTab('coach')}>
              Coach
            </button>
            <button className={`tab ${activeTab === 'sms' ? 'active' : ''}`} onClick={() => setActiveTab('sms')}>
              Text
            </button>
            <button className={`tab ${activeTab === 'strategy' ? 'active' : ''}`} onClick={() => setActiveTab('strategy')}>
              Call Plan
            </button>
            <button
              className={`tab ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('inventory');
                if (!inventory && can('canUseInventoryLookup')) void loadInventory(inventoryQuery || inventoryIntentQueryFromPage(page, ask) || context.vehicleOfInterest || '');
              }}
            >
              Inventory
            </button>
          </nav>

          {activeTab === 'coach' && (
            <div className="stack">
              <section className="panel spotlight">
                <div className="workspace-head">
                  <div>
                    <h2>Coach</h2>
                    <p className="subtle">{conversationMode === 'continue' ? 'Continue the conversation naturally.' : 'Start with a clean human greeting.'}</p>
                  </div>
                  {readPageDraft ? (
                    <div className="option-actions">
                      <button className="mini" disabled={!can('canCopyDrafts')} onClick={() => void copy(firstOption(readPageDraft), 'strategy')}>
                        Copy
                      </button>
                      <button className="mini" disabled={!can('canInsertIntoCrm')} onClick={() => void insert(firstOption(readPageDraft), 'strategy')}>
                        Insert
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="spotlight-copy">
                  {firstOption(readPageDraft) ||
                    'Read the page once. You will get the buyer read, what to ask, what to say, and the next move.'}
                </p>
              </section>

              <section className="quick-coach-grid">
                <article className="coach-card">
                  <span>Buyer</span>
                  <strong>{buyerType.type}</strong>
                </article>
                <article className="coach-card">
                  <span>Need</span>
                  <strong>{compactSnippet(needsSnapshot(context, needsAnalysis), 105)}</strong>
                </article>
                <article className="coach-card">
                  <span>Ask</span>
                  <strong>{compactSnippet(needsAnalysis.nextBestQuestion, 105)}</strong>
                </article>
                <article className="coach-card">
                  <span>Do</span>
                  <strong>{compactSnippet(salesInfluencePlan.closeMove, 105)}</strong>
                </article>
              </section>

              <section className="panel mini-play">
                <div>
                  <span>Call</span>
                  <strong>{compactSnippet(salesPressureTest.closePath[0] ?? salesInfluencePlan.openingMove, 130)}</strong>
                </div>
                <div>
                  <span>Video</span>
                  <strong>{compactSnippet(`Show ${context.vehicleOfInterest ?? 'the unit'}, one useful detail, and the next step.`, 130)}</strong>
                </div>
              </section>

              <details className="drawer compact-details">
                <summary>More lead details</summary>
                <div className="drawer-grid">
                  <article className="mini-card">
                    <span>Customer</span>
                    <strong>{context.customerName ?? 'Open lead'}</strong>
                  </article>
                  <article className="mini-card">
                    <span>Vehicle</span>
                    <strong>{context.vehicleOfInterest ?? 'Read page'}</strong>
                  </article>
                  <article className="mini-card">
                    <span>Location</span>
                    <strong>{marketInsight.city ? `${marketInsight.city}, ${marketInsight.state ?? ''}` : context.customerLocation ?? context.phoneNumbers?.[0] ?? 'Need clue'}</strong>
                  </article>
                  <article className="mini-card">
                    <span>Mode</span>
                    <strong>{conversationMode === 'continue' ? 'Continue' : 'Meet & greet'}</strong>
                  </article>
                </div>
                <div className="drawer-list">
                  {[latestCustomerMessage(page) ? `Latest: ${compactSnippet(latestCustomerMessage(page), 220)}` : undefined, marketInsight.summary, buyerProfile.summary, ...personalizationLines.slice(0, 3)]
                    .filter((line): line is string => Boolean(line))
                    .map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                </div>
              </details>
            </div>
          )}

          {activeTab === 'sms' && renderDraftWorkspace('sms')}
          {activeTab === 'strategy' && renderDraftWorkspace('strategy')}

          {activeTab === 'inventory' && (
            <section className="panel workspace">
              <div className="workspace-head">
                <div>
                  <h2>Inventory Angles</h2>
                  <p className="subtle">
                    Real store options scored against the lead, with the best fit first.
                  </p>
                </div>
                <span className="pill neutral">{inventory?.live ? 'Live' : inventory ? 'Fallback' : 'Ready'}</span>
              </div>
              <form
                className="inventory-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadInventory(inventoryQuery || inventoryIntentQueryFromPage(page, ask));
                }}
              >
                <input
                  className="input"
                  value={inventoryQuery}
                  onChange={(event) => setInventoryQuery(event.target.value)}
                  placeholder="Ask like a customer: Need a Wrangler hard-top with leather under 55k. No red, white, neon, or hybrid."
                />
                <button className="mini" disabled={loading === 'inventory' || !can('canUseInventoryLookup')}>
                  {loading === 'inventory' ? 'Searching' : 'Ask Inventory'}
                </button>
              </form>
              <div className="inventory-counts">
                <span>{inventoryCountsLabel(inventory)}</span>
                <span>
                  Matches {inventory?.counts?.matchedTotal ?? inventoryCards.length}
                </span>
              </div>
              {inventoryCards.length ? (
                <div className="inventory-list">
                  {inventoryCards.map((item) => (
                    <a key={item.id} href={item.url ?? '#'} target="_blank" rel="noreferrer" className="vehicle">
                      <div className="vehicle-top">
                        <strong>{item.title}</strong>
                        <span>{inventoryMeta(item) || item.source.toUpperCase()}</span>
                      </div>
                      <p>{item.recommendationReason ?? item.strategy}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No clean matches yet.</strong>
                  <p>Read the page, then refresh inventory so the assistant can score real alternatives.</p>
                </div>
              )}
            </section>
          )}

          </div>
        </>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sidebar />
  </React.StrictMode>,
);
