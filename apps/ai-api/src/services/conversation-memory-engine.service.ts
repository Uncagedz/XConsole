import type { LeadContext, LeadTimelineEntry } from '@drivecentric-ai/shared';

export type ConversationStage =
  | 'first_contact'
  | 'customer_reply_needs_answer'
  | 'waiting_on_customer_after_store_message'
  | 'vehicle_verification'
  | 'numbers_or_price'
  | 'payment_structure'
  | 'trade_discovery'
  | 'credit_or_approval'
  | 'appointment_setting'
  | 'remote_purchase'
  | 'vehicle_sold_replacement_needed'
  | 'media_or_document_received'
  | 'objection_or_confusion'
  | 'reengagement'
  | 'unknown';

export type MissingVariable =
  | 'latest_customer_question_answer'
  | 'vehicle_availability'
  | 'exact_vehicle_fit'
  | 'price_or_otd_goal'
  | 'zip_for_taxes'
  | 'cash_finance_or_lease'
  | 'payment_target'
  | 'down_payment'
  | 'trade_details'
  | 'trade_payoff'
  | 'credit_context'
  | 'appointment_time'
  | 'remote_shipping_or_pickup'
  | 'condition_or_history_proof'
  | 'decision_timeline'
  | 'decision_maker'
  | 'customer_objection'
  | 'none';

export type CustomerMood = 'neutral' | 'interested' | 'hot' | 'confused' | 'frustrated' | 'skeptical' | 'low_intent' | 'unknown';

export type BuyerType =
  | 'availability_buyer'
  | 'price_buyer'
  | 'payment_buyer'
  | 'cash_buyer'
  | 'finance_buyer'
  | 'trade_buyer'
  | 'credit_buyer'
  | 'remote_buyer'
  | 'condition_buyer'
  | 'appointment_buyer'
  | 'replacement_buyer'
  | 'comparison_buyer'
  | 'early_browser'
  | 'unknown';

export type ConversationMemory = {
  latestCustomerMessage: string;
  latestCustomerTimestamp?: string;
  latestDealerMessage?: string;
  latestDealerTimestamp?: string;
  conversationStage: ConversationStage;
  customerMood: CustomerMood;
  buyerType: BuyerType;
  questionsAlreadyAsked: string[];
  questionsAlreadyAnswered: string[];
  dealerPromises: string[];
  openObjections: string[];
  knownFacts: string[];
  missingVariables: MissingVariable[];
  nextMissingVariable: MissingVariable;
  nextBestQuestion: string;
  shouldAskQuestion: boolean;
  shouldAvoid: string[];
  responseMission: string;
  customerStateSummary: string;
  memoryDebug: {
    customerMessagesCount: number;
    dealerMessagesCount: number;
    internalMessagesCount: number;
    latestCustomerFound: boolean;
    latestDealerFound: boolean;
    reason: string;
  };
};

const weakWords = new Set(['what', 'when', 'where', 'would', 'could', 'should', 'this', 'that', 'with', 'from', 'your', 'you', 'are', 'were', 'the', 'and', 'for', 'first', 'one', 'here', 'there', 'about', 'thing']);

function clean(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function lower(value: string | undefined | null) {
  return clean(value).toLowerCase();
}

function compact(value: string | undefined | null, max = 600) {
  const normalized = clean(value);
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function latestFirst(entries: LeadTimelineEntry[]) {
  return [...entries].sort((left, right) => {
    const leftTime = left.timestampIso ? Date.parse(left.timestampIso) : Number.NaN;
    const rightTime = right.timestampIso ? Date.parse(right.timestampIso) : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
    if (Number.isFinite(leftTime)) return -1;
    if (Number.isFinite(rightTime)) return 1;
    return 0;
  });
}

function outboundOrInternalText(text: string | undefined) {
  return /\b(text to customer|email to customer|call to customer|outbound call|phone task completed|voicemail|voicemail left|left a voicemail|note|crm note|manager note|task|planned|automation|claire|system|touchpoint|deal imported|duplicate lead|website visit|visit stage|sales touchpoint)\b/i.test(text ?? '');
}

function usableCustomerEntry(entry: LeadTimelineEntry) {
  const combined = [entry.speakerName, entry.timestampLabel, entry.channel, entry.text].filter(Boolean).join(' ');
  return entry.actor === 'customer' && entry.direction === 'inbound' && entry.channel !== 'note' && Boolean(entry.text?.trim()) && !outboundOrInternalText(combined);
}

function usableDealerEntry(entry: LeadTimelineEntry) {
  return Boolean(entry.text?.trim()) && (entry.direction === 'outbound' || entry.actor === 'salesperson' || entry.actor === 'manager' || entry.actor === 'automation') && entry.actor !== 'customer' && entry.direction !== 'internal';
}

function internalEntry(entry: LeadTimelineEntry) {
  return entry.direction === 'internal' || entry.actor === 'system' || entry.channel === 'note';
}

function extractQuestions(text: string | undefined, limit = 20) {
  const matches = clean(text).match(/[^.!?\n]{4,220}\?/g) ?? [];
  return matches.map((question) => clean(question)).filter(Boolean).slice(-limit);
}

function normalizeQuestion(question: string) {
  return lower(question).replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function questionCore(question: string) {
  return normalizeQuestion(question).split(' ').filter((word) => word.length >= 4 && !weakWords.has(word));
}

function semanticallySameQuestion(left: string, right: string) {
  const a = questionCore(left);
  const b = new Set(questionCore(right));
  if (!a.length || !b.size) return false;
  const overlap = a.filter((word) => b.has(word)).length;
  return overlap / Math.max(a.length, 1) >= 0.6;
}

function questionAlreadyAsked(candidate: string, askedQuestions: string[]) {
  const normalizedCandidate = normalizeQuestion(candidate);
  if (!normalizedCandidate) return false;
  return askedQuestions.some((asked) => {
    const normalizedAsked = normalizeQuestion(asked);
    if (normalizedAsked === normalizedCandidate) return true;
    if (/what caught your eye/.test(normalizedCandidate) && /what caught your eye|price payment|features|miles/.test(normalizedAsked)) return true;
    if (/vehicle.*numbers.*approval|numbers.*approval/.test(normalizedCandidate) && /vehicle.*numbers.*approval|numbers.*approval|solve.*first/.test(normalizedAsked)) return true;
    if (/best number|phone|call|time to call/.test(normalizedCandidate) && /best number|phone|call|time to call|call you back/.test(normalizedAsked)) return true;
    if (/today|tomorrow|appointment|come in|see it/.test(normalizedCandidate) && /today|tomorrow|appointment|come in|see it|test drive/.test(normalizedAsked)) return true;
    if (/zip|register|tax/.test(normalizedCandidate) && /zip|register|tax|otd|out the door/.test(normalizedAsked)) return true;
    if (/trade|payoff|miles|condition/.test(normalizedCandidate) && /trade|payoff|miles|condition|vin/.test(normalizedAsked)) return true;
    if (/payment|down|monthly/.test(normalizedCandidate) && /payment|down|monthly|term|rate/.test(normalizedAsked)) return true;
    return semanticallySameQuestion(candidate, asked);
  });
}

function firstFreshQuestion(candidates: string[], askedQuestions: string[], fallback: string) {
  return candidates.find((candidate) => !questionAlreadyAsked(candidate, askedQuestions)) ?? fallback;
}

function allCustomerText(customerEntries: LeadTimelineEntry[], context: LeadContext) {
  return [
    ...customerEntries.map((entry) => entry.text ?? ''),
    context.customerIntelligence?.customerIntent,
    ...(context.customerIntelligence?.nonNegotiables ?? []),
    ...(context.customerIntelligence?.painPoints ?? []),
  ].filter(Boolean).join('\n');
}

function allDealerText(dealerEntries: LeadTimelineEntry[], context: LeadContext) {
  return [
    ...dealerEntries.map((entry) => entry.text ?? ''),
    ...(context.priorMessages ?? []).filter((message) => outboundOrInternalText(message)),
  ].filter(Boolean).join('\n');
}

function mediaOnly(text: string | undefined) {
  const normalized = clean(text);
  return !normalized || normalized === '.' || normalized === '👍' || normalized.length <= 3;
}

function vehicleSold(text: string) {
  return /\b(just sold|sold already|has sold|vehicle sold|car sold|no longer available|not available anymore|already pending|pending sale|someone bought|customer.*interested.*sold)\b/i.test(text);
}

function classifyMood(latestCustomer: string, customerText: string): CustomerMood {
  const text = lower(`${latestCustomer}\n${customerText}`);
  if (/\b(upset|mad|angry|frustrated|ridiculous|waste|wasted|bait|switch|stop playing|annoyed)\b/i.test(text)) return 'frustrated';
  if (/\b(confused|wrong|not what i asked|dont understand|don't understand|what do you mean)\b/i.test(text)) return 'confused';
  if (/\b(scam|trust|real|legit|in writing|fees|hidden|surprise)\b/i.test(text)) return 'skeptical';
  if (/\b(today|tomorrow|ready|buy|purchase|deposit|hold|send paperwork|where do i sign|test drive|come in)\b/i.test(text)) return 'hot';
  if (/\b(interested|like|available|price|payment|trade|carfax|photos|video|sticker|more info)\b/i.test(text)) return 'interested';
  if (/\b(just looking|not ready|later|maybe|thinking|researching|shopping around)\b/i.test(text)) return 'low_intent';
  return latestCustomer ? 'neutral' : 'unknown';
}

function classifyBuyerType(latestCustomer: string, customerText: string, context: LeadContext): BuyerType {
  const text = lower(`${latestCustomer}\n${customerText}\n${context.paymentBudgetHints ?? ''}\n${context.tradeInfo ?? ''}`);
  if (/\b(cash|paying cash|pay in full|paid in full)\b/i.test(text)) return 'cash_buyer';
  if (/\b(monthly|payment|down payment|money down|per month|budget)\b/i.test(text)) return 'payment_buyer';
  if (/\b(best price|price|otd|out the door|discount|fees|tax|total)\b/i.test(text)) return 'price_buyer';
  if (/\b(trade|trade in|payoff|appraisal|value my|vin|miles on my)\b/i.test(text)) return 'trade_buyer';
  if (/\b(credit|approval|approved|finance|financing|repo|bankruptcy|co[-\s]?signer|rate|apr)\b/i.test(text)) return 'credit_buyer';
  if (/\b(ship|shipping|delivery|transport|out of state|fly in|remote|registering in)\b/i.test(text)) return 'remote_buyer';
  if (/\b(carfax|accident|history|condition|scratch|dent|rust|inspection|tires|brakes)\b/i.test(text)) return 'condition_buyer';
  if (/\b(appointment|test drive|come in|stop by|see it|drive it|today|tomorrow)\b/i.test(text)) return 'appointment_buyer';
  if (/\b(available|still have|in stock|sold|pending|hold)\b/i.test(text)) return 'availability_buyer';
  if (vehicleSold(text)) return 'replacement_buyer';
  if (/\b(compare|another dealer|other dealer|cheaper|quote|offer)\b/i.test(text)) return 'comparison_buyer';
  if (/\b(just looking|not ready|researching|shopping around)\b/i.test(text)) return 'early_browser';
  if (context.locationIntel?.classification === 'out_of_state') return 'remote_buyer';
  return 'unknown';
}

function detectOpenObjections(latestCustomer: string, customerText: string) {
  const text = lower(`${latestCustomer}\n${customerText}`);
  const objections: string[] = [];
  if (/\b(too high|expensive|over budget|can't afford|cant afford|payment is high)\b/i.test(text)) objections.push('money/payment objection');
  if (/\b(another dealer|cheaper|better price|better deal|beat this)\b/i.test(text)) objections.push('competitor comparison');
  if (/\b(fees|dealer fee|hidden|surprise|out the door|otd)\b/i.test(text)) objections.push('fee/transparency concern');
  if (/\b(talk to my wife|talk to my husband|spouse|partner|dad|mom|boss|manager)\b/i.test(text)) objections.push('decision-maker involved');
  if (/\b(not ready|later|need time|thinking|just looking)\b/i.test(text)) objections.push('timing objection');
  if (/\b(bad credit|approval|repo|bankruptcy|down payment)\b/i.test(text)) objections.push('credit/approval concern');
  if (/\b(trade|payoff|negative equity|upside down|trade value)\b/i.test(text)) objections.push('trade concern');
  if (/\b(condition|accident|history|carfax|clean title|rust|damage)\b/i.test(text)) objections.push('vehicle trust/condition concern');
  return [...new Set(objections)].slice(0, 8);
}

function detectDealerPromises(dealerText: string) {
  const promises = dealerText.match(/\b(?:i['’]?ll|i will|we['’]?ll|we will|let me|i can|we can)\b[^.!?\n]{0,160}\b(?:send|check|verify|confirm|pull|get you|shoot|email|text|call|update|quote|numbers|carfax|video|pictures|sticker)\b[^.!?\n]*/gi);
  return [...new Set((promises ?? []).map((promise) => clean(promise)))].slice(-10);
}

function detectKnownFacts(context: LeadContext, customerText: string) {
  const facts: string[] = [];
  if (context.customerName) facts.push(`Customer: ${context.customerName}`);
  if (context.vehicleOfInterest) facts.push(`Vehicle: ${context.vehicleOfInterest}`);
  if (context.vehicleOfInterestDetails?.stock || context.stockNumber) facts.push(`Stock: ${context.stockNumber ?? context.vehicleOfInterestDetails?.stock}`);
  if (context.vehicleOfInterestDetails?.price) facts.push(`Price shown: ${context.vehicleOfInterestDetails.price}`);
  if (context.vehicleOfInterestDetails?.mileage) facts.push(`Mileage shown: ${context.vehicleOfInterestDetails.mileage}`);
  if (context.customerZipCode) facts.push(`ZIP: ${context.customerZipCode}`);
  if (context.customerLocation) facts.push(`Location: ${context.customerLocation}`);
  if (context.tradeInfo) facts.push(`Trade info: ${compact(context.tradeInfo, 220)}`);
  if (context.paymentBudgetHints) facts.push(`Money/payment hint: ${compact(context.paymentBudgetHints, 220)}`);
  const text = lower(customerText);
  if (/\bcash|paying cash|pay in full|paid in full\b/i.test(text)) facts.push('Customer indicated cash buyer.');
  if (/\boutside bank|credit union|my bank|own financing\b/i.test(text)) facts.push('Customer mentioned outside financing.');
  if (/\btrade|payoff|appraisal\b/i.test(text)) facts.push('Customer mentioned trade.');
  if (/\bship|shipping|delivery|out of state|remote\b/i.test(text)) facts.push('Customer may be remote/out-of-state.');
  return [...new Set(facts)].slice(0, 14);
}

function customerAnsweredQuestions(customerText: string) {
  const text = lower(customerText);
  const answered: string[] = [];
  if (/\bcash|finance|financing|lease|outside bank|credit union\b/i.test(text)) answered.push('cash/finance/lease path');
  if (/\b\d{5}\b|register|registration|tag|plate|florida|georgia|texas|new york|california\b/i.test(text)) answered.push('registration/location clue');
  if (/\bpayment|monthly|\$\d|down\b/i.test(text)) answered.push('payment/budget clue');
  if (/\btrade|payoff|miles|vin|condition|year|make|model\b/i.test(text)) answered.push('trade clue');
  if (/\btoday|tomorrow|this week|soon|ready|not ready|later\b/i.test(text)) answered.push('timeline clue');
  if (/\bwife|husband|spouse|partner|dad|mom|boss\b/i.test(text)) answered.push('decision maker clue');
  if (/\bprice|miles|features|color|availability|condition|carfax|history\b/i.test(text)) answered.push('what they care about');
  return answered;
}

function missingVariablesFor(args: { buyerType: BuyerType; stage: ConversationStage; latestCustomer: string; customerText: string; context: LeadContext; openObjections: string[] }) {
  const text = lower(`${args.latestCustomer}\n${args.customerText}`);
  const missing: MissingVariable[] = [];
  if (args.latestCustomer && !mediaOnly(args.latestCustomer)) missing.push('latest_customer_question_answer');
  if (args.buyerType === 'availability_buyer' && !/\b(confirmed|available|here|pending|sold)\b/i.test(text)) missing.push('vehicle_availability');
  if (!/\b(price|payment|miles|features|color|trim|condition|carfax|availability|cash|finance|trade)\b/i.test(text)) missing.push('exact_vehicle_fit');
  if (args.buyerType === 'price_buyer') {
    if (!args.context.customerZipCode && !/\b\d{5}\b/.test(text)) missing.push('zip_for_taxes');
    if (!/\bcash|finance|financing|lease|outside bank|credit union\b/i.test(text)) missing.push('cash_finance_or_lease');
    missing.push('price_or_otd_goal');
  }
  if (args.buyerType === 'payment_buyer') {
    if (!/\b\$\d|\d+\s*(?:a month|month|mo|monthly)|payment.*\d/i.test(text)) missing.push('payment_target');
    if (!/\bdown|money down|\$\d/i.test(text)) missing.push('down_payment');
    if (!/\btrade|payoff\b/i.test(text)) missing.push('trade_details');
  }
  if (args.buyerType === 'trade_buyer') {
    if (!/\b(year|make|model|vin|miles|mileage|condition)\b/i.test(text)) missing.push('trade_details');
    if (!/\bpayoff|paid off|owe|leased|financed\b/i.test(text)) missing.push('trade_payoff');
  }
  if (args.buyerType === 'credit_buyer' && !/\bincome|job|employment|down|auto loan|repo|bankruptcy|co[-\s]?signer|score|open auto\b/i.test(text)) missing.push('credit_context');
  if (args.buyerType === 'appointment_buyer' && !/\b\d{1,2}(:\d{2})?\s*(am|pm)|morning|afternoon|evening|today|tomorrow\b/i.test(text)) missing.push('appointment_time');
  if (args.buyerType === 'remote_buyer') {
    if (!/\bship|shipping|transport|fly|pickup|register|registration|state|zip\b/i.test(text)) missing.push('remote_shipping_or_pickup');
    missing.push('condition_or_history_proof');
  }
  if (args.buyerType === 'condition_buyer') missing.push('condition_or_history_proof');
  if (args.openObjections.length) missing.push('customer_objection');
  if (!/\btoday|tomorrow|this week|soon|ready|not ready|later|just looking\b/i.test(text)) missing.push('decision_timeline');
  return [...new Set(missing)].slice(0, 8);
}

function stageFor(args: { latestCustomer: LeadTimelineEntry | undefined; latestDealer: LeadTimelineEntry | undefined; latestCustomerText: string; latestDealerText: string; customerText: string; dealerText: string; buyerType: BuyerType; mood: CustomerMood }) {
  if (mediaOnly(args.latestCustomerText)) return 'media_or_document_received';
  if (vehicleSold(`${args.latestCustomerText}\n${args.customerText}\n${args.dealerText}`)) return 'vehicle_sold_replacement_needed';
  if (args.mood === 'frustrated' || args.mood === 'confused' || args.mood === 'skeptical') return 'objection_or_confusion';
  if (args.latestCustomer) {
    if (args.buyerType === 'price_buyer' || /\botd|out the door|price|fees|discount\b/i.test(args.latestCustomerText)) return 'numbers_or_price';
    if (args.buyerType === 'payment_buyer') return 'payment_structure';
    if (args.buyerType === 'trade_buyer') return 'trade_discovery';
    if (args.buyerType === 'credit_buyer') return 'credit_or_approval';
    if (args.buyerType === 'appointment_buyer') return 'appointment_setting';
    if (args.buyerType === 'remote_buyer') return 'remote_purchase';
    if (args.buyerType === 'condition_buyer') return 'vehicle_verification';
    if (args.buyerType === 'availability_buyer') return 'vehicle_verification';
    return 'customer_reply_needs_answer';
  }
  if (args.latestDealer && !args.latestCustomer) return 'waiting_on_customer_after_store_message';
  if (!args.latestDealer && !args.latestCustomer) return 'first_contact';
  return 'unknown';
}

function nextQuestionFor(variable: MissingVariable, memoryBase: { buyerType: BuyerType; stage: ConversationStage; askedQuestions: string[]; context: LeadContext; latestCustomer: string }) {
  const vehicle = clean(memoryBase.context.vehicleOfInterest ?? memoryBase.context.vehicleOfInterestDetails?.rawText);
  const questionsByVariable: Record<MissingVariable, string[]> = {
    latest_customer_question_answer: [],
    vehicle_availability: ['If I confirm it is still here, are you trying to see it today or just verify before deciding?', 'Are you asking on this exact one, or should I watch for the closest backup too?', 'If it is here and clean, do you want first shot at it?'],
    exact_vehicle_fit: [vehicle ? `What is the must-have on this ${vehicle}: miles, condition, features, or price?` : 'What is the must-have here: miles, condition, features, or price?', 'What would make this one worth choosing over the others you are looking at?', 'Is there anything missing on this one that would stop you?'],
    price_or_otd_goal: ['Are you comparing total out-the-door, monthly payment, or the final difference with your trade?', 'What number would make this one make sense?', 'Are you trying to beat another written number or just get the clean real total?'],
    zip_for_taxes: ['What ZIP are you registering it in so I can keep the taxes and tag side accurate?', 'Are you registering it in Florida or out of state?'],
    cash_finance_or_lease: ['Are you paying cash, using your bank, or looking at financing options?', 'How are you planning to structure it: cash, your bank, or our lenders?'],
    payment_target: ['What monthly range would actually feel comfortable?', 'What payment would make you say yes if the vehicle checks out?', 'Are you solving for lowest payment or lowest total cost?'],
    down_payment: ['How much cash down are you comfortable with if the structure looks right?', 'Would you rather keep cash in pocket or lower the payment?'],
    trade_details: ['What are you trading: year, make, model, miles, and condition?', 'What are you driving now, and would that be part of the deal?'],
    trade_payoff: ['Is the trade paid off, financed, or leased?', 'About what is the payoff on it right now?'],
    credit_context: ['Have you had an auto loan before, and how much down is realistic?', 'Are we working with strong credit, rebuilding credit, or first-time buyer situation?'],
    appointment_time: ['Would earlier today or later today be easier?', 'What time should I have it ready if you want to put eyes on it?'],
    remote_shipping_or_pickup: ['Are you thinking shipping, flying in, or sending someone to inspect it?', 'Where would it be registered and delivered if we get that far?'],
    condition_or_history_proof: ['What do you want me to verify first: Carfax, tires, interior, exterior, or startup video?', 'Is your main concern history, current condition, or how it drives?'],
    decision_timeline: ['Are you trying to handle this soon, or just making sure it is the right one first?', 'If it checks out, are you looking to move quickly or still comparing?'],
    decision_maker: ['Who else needs to be comfortable with it before you decide?', 'What part will matter most to the other decision maker?'],
    customer_objection: ['Is the real concern the vehicle, the money, the timing, the trade, credit, or trust?', 'What part needs to change for this to make sense?', 'If I solve that part, are we close?'],
    none: [],
  };
  const candidates = questionsByVariable[variable] ?? [];
  if (!candidates.length) return '';
  return firstFreshQuestion(candidates, memoryBase.askedQuestions, candidates[0] ?? '');
}

function buildMission(args: { stage: ConversationStage; buyerType: BuyerType; nextMissingVariable: MissingVariable; latestCustomer: string; shouldAskQuestion: boolean }) {
  if (args.stage === 'media_or_document_received') return 'Acknowledge the received photo/document and tell the customer the next review step. Do not answer old dealership text.';
  if (args.stage === 'vehicle_sold_replacement_needed') return 'Acknowledge the sold vehicle casually and move into closest replacement path without sounding apologetic or generic.';
  if (args.stage === 'objection_or_confusion') return 'Clear up the confusion or objection first, then ask one precise next-step question only if needed.';
  if (args.stage === 'waiting_on_customer_after_store_message') return 'Follow up from the last dealership message without restarting the lead or repeating the same ask.';
  if (!args.shouldAskQuestion) return 'Answer the latest customer message directly and stop. No forced question.';
  if (args.nextMissingVariable === 'latest_customer_question_answer') return 'Answer the customer’s actual latest question first, then ask only the next useful missing-variable question if needed.';
  return `Answer the latest customer message first, then naturally uncover ${args.nextMissingVariable.replace(/_/g, ' ')}.`;
}

export function buildConversationMemory(context: LeadContext): ConversationMemory {
  const timeline = latestFirst(context.conversationTimeline ?? []);
  const customerEntries = timeline.filter(usableCustomerEntry);
  const dealerEntries = timeline.filter(usableDealerEntry);
  const internalEntries = timeline.filter(internalEntry);
  const latestCustomer = customerEntries[0];
  const latestDealer = dealerEntries[0];
  const latestCustomerMessage = clean(latestCustomer?.text);
  const latestDealerMessage = clean(latestDealer?.text);
  const customerText = allCustomerText(customerEntries, context);
  const dealerText = allDealerText(dealerEntries, context);
  const questionsAlreadyAsked = [...extractQuestions(dealerText, 60), ...(context.priorMessages ?? []).filter((message) => outboundOrInternalText(message)).flatMap((message) => extractQuestions(message, 6))];
  const questionsAlreadyAnswered = customerAnsweredQuestions(customerText);
  const customerMood = classifyMood(latestCustomerMessage, customerText);
  const buyerType = classifyBuyerType(latestCustomerMessage, customerText, context);
  const conversationStage = stageFor({ latestCustomer, latestDealer, latestCustomerText: latestCustomerMessage, latestDealerText: latestDealerMessage, customerText, dealerText, buyerType, mood: customerMood });
  const openObjections = detectOpenObjections(latestCustomerMessage, customerText);
  const dealerPromises = detectDealerPromises(dealerText);
  const knownFacts = detectKnownFacts(context, customerText);
  const missingVariables = missingVariablesFor({ buyerType, stage: conversationStage, latestCustomer: latestCustomerMessage, customerText, context, openObjections });
  const nextMissingVariable = missingVariables.find((variable) => variable !== 'latest_customer_question_answer') ?? missingVariables[0] ?? 'none';
  const nextBestQuestion = nextQuestionFor(nextMissingVariable, { buyerType, stage: conversationStage, askedQuestions: questionsAlreadyAsked, context, latestCustomer: latestCustomerMessage });
  const shouldAskQuestion = Boolean(nextBestQuestion) && conversationStage !== 'media_or_document_received' && !questionAlreadyAsked(nextBestQuestion, questionsAlreadyAsked);
  const shouldAvoid = [
    'Do not sound like a receptionist or BDC template.',
    'Do not reuse Got you, To keep things moving, or vehicle/numbers/approval first.',
    'Do not ask for phone number or quick call unless the latest customer message makes that clearly useful.',
    'Do not repeat questions already asked by the dealership.',
    'Do not answer Text To Customer or internal notes as if the customer said them.',
  ];
  if (buyerType === 'cash_buyer') shouldAvoid.push('Do not push financing unless phrased as optional and genuinely useful.');
  if (conversationStage === 'vehicle_sold_replacement_needed') shouldAvoid.push('Do not ask the same first-contact discovery question again.');
  if (mediaOnly(latestCustomerMessage)) shouldAvoid.push('Do not answer old outbound messages; treat this as received media/document.');
  const responseMission = buildMission({ stage: conversationStage, buyerType, nextMissingVariable, latestCustomer: latestCustomerMessage, shouldAskQuestion });
  const customerStateSummary = [
    `Stage: ${conversationStage}`,
    `Buyer type: ${buyerType}`,
    `Mood: ${customerMood}`,
    latestCustomerMessage ? `Latest customer: ${compact(latestCustomerMessage, 240)}` : 'Latest customer: none found',
    latestDealerMessage ? `Latest dealership sent: ${compact(latestDealerMessage, 240)}` : undefined,
    nextMissingVariable !== 'none' ? `Missing: ${nextMissingVariable.replace(/_/g, ' ')}` : 'Missing: none obvious',
    nextBestQuestion ? `Fresh next question: ${nextBestQuestion}` : 'Fresh next question: none needed',
  ].filter(Boolean).join(' | ');
  const memory: ConversationMemory = {
    latestCustomerMessage,
    conversationStage,
    customerMood,
    buyerType,
    questionsAlreadyAsked: [...new Set(questionsAlreadyAsked.map((question) => compact(question)))].filter(Boolean).slice(-30),
    questionsAlreadyAnswered,
    dealerPromises,
    openObjections,
    knownFacts,
    missingVariables,
    nextMissingVariable,
    nextBestQuestion,
    shouldAskQuestion,
    shouldAvoid,
    responseMission,
    customerStateSummary,
    memoryDebug: {
      customerMessagesCount: customerEntries.length,
      dealerMessagesCount: dealerEntries.length,
      internalMessagesCount: internalEntries.length,
      latestCustomerFound: Boolean(latestCustomerMessage),
      latestDealerFound: Boolean(latestDealerMessage),
      reason: responseMission,
    },
  };

  const latestCustomerTimestamp = latestCustomer?.timestampLabel ?? latestCustomer?.timestampIso;
  if (latestCustomerTimestamp) memory.latestCustomerTimestamp = latestCustomerTimestamp;

  if (latestDealerMessage) memory.latestDealerMessage = latestDealerMessage;

  const latestDealerTimestamp = latestDealer?.timestampLabel ?? latestDealer?.timestampIso;
  if (latestDealerTimestamp) memory.latestDealerTimestamp = latestDealerTimestamp;

  return memory;
}

export function conversationMemoryPrompt(memory: ConversationMemory) {
  return [
    'CONVERSATION MEMORY ENGINE:',
    'Use this memory as the source of truth for stage, what was already asked, what was already answered, and what should happen next.',
    JSON.stringify(memory, null, 2),
    '',
    'MEMORY RULES:',
    '1. Answer latestCustomerMessage first when it exists.',
    '2. Do not repeat questionsAlreadyAsked or reword the same question.',
    '3. Do not ask a question if shouldAskQuestion is false.',
    '4. If nextBestQuestion is empty, do not force a closing question.',
    '5. Follow responseMission.',
    '6. Avoid everything in shouldAvoid.',
    '7. Use knownFacts only as facts; do not invent missing facts.',
    '8. Dealer messages are history only. They show what we already asked/sent.',
  ].join('\n');
}
