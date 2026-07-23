import type { LeadContext, QuickAction } from './types.js';
import { detectCommunicationCompliance } from './communication-compliance.js';

export type SalesResistanceKey =
  | 'price_shopping'
  | 'payment_finance'
  | 'credit_risk'
  | 'trade_value'
  | 'availability_condition'
  | 'distance_logistics'
  | 'third_party_decision'
  | 'comparison_shopping'
  | 'low_commitment'
  | 'trust_escalation';

export interface SalesResistance {
  key: SalesResistanceKey;
  label: string;
  evidence: string;
  hardCustomerReply: string;
  winningMove: string;
}

export interface SalesPressureTest {
  resistanceLevel: 'low' | 'moderate' | 'high';
  decisionStyle: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  buyerState: string;
  detectedObjections: SalesResistance[];
  sourcePrinciples: string[];
  selfChallenge: string[];
  closePath: string[];
  financePath: string[];
  trustBuilders: string[];
  responseChecklist: string[];
}

export interface NeedsAnalysis {
  needsScore: number;
  priority: 'discover' | 'finance' | 'trade' | 'appointment' | 'trust';
  customerGoalHypothesis: string;
  knownSignals: string[];
  missingSignals: string[];
  nextBestQuestion: string;
  financeGoal: string;
  financePath: string[];
  closeAngle: string;
  proofNeeded: string[];
  responseChecklist: string[];
}

export type SalesInfluenceStyle =
  | 'tactical_empathy'
  | 'service_trust'
  | 'clarity_teacher'
  | 'harder_close'
  | 'finance_path'
  | 'trade_value'
  | 'remote_confidence'
  | 'low_pressure_nurture'
  | 'manager_restore'
  | 'ethical_upsell';

export interface SalesInfluencePlan {
  primaryStyle: SalesInfluenceStyle;
  supportingStyles: SalesInfluenceStyle[];
  reasoning: string;
  openingMove: string;
  discoveryMove: string;
  proofMove: string;
  closeMove: string;
  upsellPath: string;
  avoid: string[];
  coachChecklist: string[];
}

const sourcePrinciples = [
  'Attunement: read the buyer situation before pushing; match the reply to the actual objection and decision style.',
  'Buoyancy: expect resistance without sounding defensive; keep the next yes small and easy.',
  'Clarity: reveal the real problem under the stated objection, then make the next step obvious.',
  'Automotive trust: answer the vehicle question first, prove helpfulness with specifics, then guide the customer down the road to the sale.',
  'Discovery before pressure: ask only the question that helps move the deal, not a survey.',
  'Serve the buyer: make the choice easier, reduce risk, and protect the dealership from promises the rep cannot verify.',
];

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim();
}

function recentCustomerMessages(context: LeadContext) {
  const messages = (context.conversationTimeline ?? [])
    .filter((entry) => entry.actor === 'customer' && clean(entry.text))
    .map((entry, index) => ({
      text: clean(entry.text)!,
      index,
      timestamp: entry.timestampIso ? Date.parse(entry.timestampIso) : Number.NaN,
    }));

  if (!messages.length) return clean(context.priorMessages?.at(-1));

  const allDated = messages.every((item) => !Number.isNaN(item.timestamp));
  const ordered = allDated ? [...messages].sort((left, right) => left.timestamp - right.timestamp) : messages;
  const recent = allDated ? ordered.slice(-3) : uniqueCustomerMessages([ordered[0], ...ordered.slice(-2)]);

  return recent.map((item) => item.text).join('\n');
}

function uniqueCustomerMessages<T extends { index: number }>(items: Array<T | undefined>) {
  const seen = new Set<number>();
  const output: T[] = [];
  for (const item of items) {
    if (!item || seen.has(item.index)) continue;
    seen.add(item.index);
    output.push(item);
  }
  return output;
}

function contextText(context: LeadContext) {
  return [
    context.customerName,
    context.customerLocation,
    context.vehicleOfInterest,
    context.stockNumber,
    context.tradeInfo,
    context.paymentBudgetHints,
    context.leadSource,
    context.appointmentStatus,
    recentCustomerMessages(context),
    ...(context.personalizationSignals ?? []),
    ...(context.priorMessages ?? []).slice(-8),
    context.visibleText?.slice(0, 7000),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function matches(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function pushIfPresent(items: string[], condition: boolean, value: string) {
  if (condition) items.push(value);
}

export function buildNeedsAnalysis(context: LeadContext): NeedsAnalysis {
  const compliance = detectCommunicationCompliance(context);
  if (compliance.status !== 'clear') {
    return {
      needsScore: 0,
      priority: 'trust',
      customerGoalHypothesis:
        compliance.status === 'do_not_contact'
          ? 'The customer appears to have requested no contact. The sales goal is paused until a manager verifies compliance.'
          : 'The customer appears to have opted out of text/SMS. The sales goal must move away from messaging and into a compliant phone-only path if allowed.',
      knownSignals: [`Contact compliance: ${compliance.reason ?? compliance.status}`, ...compliance.evidence.map((item) => `Evidence: ${item}`)].slice(0, 8),
      missingSignals: ['whether dealership policy allows a phone call after this opt-out signal'],
      nextBestQuestion:
        compliance.status === 'do_not_contact'
          ? 'Manager/compliance review required before any outreach.'
          : 'If calling is allowed, ask by phone whether a phone conversation is acceptable before discussing the vehicle.',
      financeGoal: 'Do not move into finance until contact compliance is clear or a permitted phone conversation is active.',
      financePath: [
        'Do not text or email finance prompts after an SMS opt-out.',
        'If a compliant phone call is allowed, only discuss finance after the customer agrees to continue the call.',
        'Never imply approval, payment, rate, or lender outcome.',
      ],
      closeAngle:
        compliance.status === 'do_not_contact'
          ? 'Close the outreach path and route to manager/compliance review.'
          : 'Use a respectful call or voicemail script only if policy permits; otherwise close the file cleanly.',
      proofNeeded: ['contact status', 'manager/compliance review', 'verified opt-in before messaging resumes'],
      responseChecklist: [
        'Do not draft a text reply.',
        'Do not ask the customer to reply by text.',
        'Lead with respect for the opt-out.',
        'Use phone/voicemail only if allowed.',
      ],
    };
  }
  const latest = recentCustomerMessages(context);
  const signalText = [
    latest,
    context.paymentBudgetHints,
    context.tradeInfo,
    context.customerLocation,
    context.vehicleOfInterest,
    context.stockNumber,
    context.leadSource,
    ...(context.personalizationSignals ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  const text = signalText.trim() || contextText(context);
  const remoteOrFar = context.locationIntel?.classification === 'out_of_state' || context.locationIntel?.classification === 'local_far' || context.locationIntel?.route === 'remote';
  const hasVehicle = Boolean(clean(context.vehicleOfInterest) || matches(text, /\b(?:19|20)\d{2}\s+[a-z]+/i));
  const hasUseCase = matches(text, /\b(family|kids|work|commute|tow|off[-\s]?road|business|daily|safe|safety|room|space|fuel|gas|miles|reliable|reliability|because|replacing|upgrade|downsizing|for my|for our)\b/i);
  const hasCurrentVehicleReason = hasUseCase || matches(text, /\b(current(?:ly)? driving|driving now|my car|previous car|old car|replacing|trade|accident|totaled|repair|repairs|lease is up|lease end|payoff)\b/i);
  const hasPayment =
    Boolean(clean(context.paymentBudgetHints)) || matches(text, /\b(payment|monthly|budget|down payment|money down|cash|paying cash|pay in full|outside bank|credit union|own bank|finance|financing|credit app|approval|approved|apr|rate|term|lease|\$\d)/i);
  const hasFinanceStructure = hasPayment || matches(text, /\b(cash|finance|financing|outside bank|credit union|own bank|pre[-\s]?approved|approval|rate|apr|term)\b/i);
  const hasCreditOrBuyerStructure = matches(text, /\b(credit|score|fico|approved|approval|co[-\s]?signer|cosigner|alone|joint|wife|husband|spouse|parent|mom|dad|business|company|title|loan)\b/i);
  const hasTrade = Boolean(clean(context.tradeInfo)) || matches(text, /\b(trade|payoff|vin|miles|mileage|appraisal|title|negative equity)\b/i);
  const hasTimeline = matches(text, /\b(today|tomorrow|this week|weekend|soon|ready|appointment|coming|visit|stop by|when can|time)\b/i);
  const hasAppointmentReadySignal =
    !remoteOrFar &&
    (Boolean(clean(context.appointmentStatus)) ||
      context.leadScore === 'hot' ||
      matches(text, /\b(appointment|test drive|coming in|come in|stop by|be there|schedule|see it|look at it|ready to buy|ready today|buy today)\b/i));
  const hasDecisionMaker = matches(text, /\b(wife|husband|spouse|partner|mom|dad|parent|family|friend|boss|manager)\b/i);
  const hasTrustConcern = context.sentiment === 'negative' || matches(text, /\b(trust|honest|runaround|waste of time|available|sold|condition|carfax|inspection|accident|manager|complaint)\b/i);
  const hasLocation = Boolean(clean(context.customerLocation) || context.phoneNumbers?.length);

  const knownSignals: string[] = [];
  pushIfPresent(knownSignals, Boolean(context.customerName), `Customer name: ${context.customerName}`);
  pushIfPresent(knownSignals, hasVehicle, `Vehicle interest: ${context.vehicleOfInterest ?? 'vehicle mentioned on page'}`);
  pushIfPresent(knownSignals, hasUseCase, 'Use case or ownership reason is visible.');
  pushIfPresent(knownSignals, hasCurrentVehicleReason, 'Current vehicle or reason-for-change clue is visible.');
  pushIfPresent(knownSignals, hasPayment, 'Payment, budget, credit, or finance signal is visible.');
  pushIfPresent(knownSignals, hasCreditOrBuyerStructure, 'Credit comfort or buyer structure clue is visible.');
  pushIfPresent(knownSignals, hasTrade, 'Trade or appraisal path is visible.');
  pushIfPresent(knownSignals, hasTimeline, 'Timing or appointment intent is visible.');
  pushIfPresent(knownSignals, hasDecisionMaker, 'Another decision maker may be involved.');
  pushIfPresent(knownSignals, hasLocation, 'Location or phone-area clue is visible.');
  pushIfPresent(knownSignals, Boolean(latest), 'Latest customer message is available.');

  const missingSignals: string[] = [];
  pushIfPresent(missingSignals, !hasUseCase, 'why they want this vehicle/body style and what it must do for them');
  pushIfPresent(missingSignals, !hasCurrentVehicleReason, 'what they drive now and what happened or changed with the current vehicle');
  pushIfPresent(missingSignals, !hasFinanceStructure, 'cash/finance/outside-bank plan, down payment, and payment comfort');
  pushIfPresent(missingSignals, !hasTrade, 'trade status, VIN, miles, payoff, and condition');
  pushIfPresent(missingSignals, hasFinanceStructure && !hasCreditOrBuyerStructure, 'prior auto-loan comfort, co-signer/buyer structure, and who will be on the title if financing matters');
  pushIfPresent(missingSignals, !hasTimeline, remoteOrFar ? 'buying timeline and best remote next step' : 'buying timeline and best appointment window');
  pushIfPresent(missingSignals, !hasDecisionMaker, 'whether anyone else needs to be part of the decision');

  const importantSignals = [hasVehicle, hasUseCase, hasCurrentVehicleReason, hasFinanceStructure, hasTrade, hasTimeline, hasLocation, Boolean(latest)];
  const needsScore = Math.round((importantSignals.filter(Boolean).length / importantSignals.length) * 100);
  const priority: NeedsAnalysis['priority'] = hasTrustConcern
    ? 'trust'
    : hasPayment
      ? 'finance'
      : hasTrade
        ? 'trade'
        : hasAppointmentReadySignal
          ? 'appointment'
          : 'discover';

  const nextBestQuestion =
    priority === 'finance'
      ? hasTrade
        ? 'Are you thinking cash, your own bank, or would you let us compare options if we can make the numbers easier?'
        : 'Before I throw numbers at you, are you trading anything in or is this just the new vehicle by itself?'
      : priority === 'trade'
        ? 'Do you have the VIN, miles, payoff, and condition on the trade so I can help get a real appraisal path started?'
        : priority === 'appointment'
          ? 'If the vehicle and numbers check out, what time window would make it easy to see it?'
          : priority === 'trust'
            ? 'What do you want me to verify first so you do not waste a trip?'
            : hasCurrentVehicleReason
              ? 'What caught your eye on this vehicle: payment, equipment, condition, miles, or the deal itself?'
              : 'What are you driving now, and what has you looking to switch into this one?';

  return {
    needsScore,
    priority,
    customerGoalHypothesis: hasUseCase
      ? 'They have a real ownership reason. Tie the next step to that reason before asking for commitment.'
      : 'The reason behind the purchase is still thin. Learn the pain point before pushing numbers, finance, or appointment too hard.',
    knownSignals: knownSignals.slice(0, 8),
    missingSignals: missingSignals.slice(0, 5),
    nextBestQuestion,
    financeGoal: hasPayment
      ? 'Move the customer from rough payment talk to a compliant finance review, credit app, or verified numbers step.'
      : 'Keep finance available as the path to real options once payment, cash/down, trade, and timeline are clear.',
    financePath: [
      'Position financing as comparing real options with the store, not as a promise of approval, rate, or payment.',
      'Ask for only the missing input that changes the next step: cash/finance/outside-bank plan, target payment, cash/down, trade payoff, title/buyer structure, timeline, or credit-app willingness.',
      'When the buyer is ready, ask for the credit app or a finance-manager numbers review with the vehicle and trade details in hand.',
    ],
    closeAngle:
      priority === 'trust'
        ? 'Verify the risk first, then ask one low-friction question that keeps the customer talking.'
        : priority === 'finance'
          ? 'Make the next yes a finance or real-numbers clarity step without implying approval or pushing a visit too early.'
          : priority === 'trade'
            ? 'Make the next yes an appraisal path that starts with trade basics before asking for an in-store look.'
            : priority === 'appointment'
              ? 'Answer the current question, explain why the next step is worth it, then offer a visit or call window.'
              : 'Answer the current question, build rapport, and ask one useful needs-analysis question.',
    proofNeeded: [
      'availability',
      'condition or inspection proof',
      hasPayment ? 'finance inputs needed for real numbers' : 'exact price/payment only if verified',
      hasTrade ? 'trade appraisal inputs' : 'trade status',
    ],
    responseChecklist: [
      'Use the customer name only when it helps the moment; do not repeat it on every active-thread reply.',
      'Do not repeat the same ask, close, or value claim from prior outbound messages unless it is deliberate; if it must be repeated, use fresh wording and add a new customer benefit.',
      'Answer their latest message before asking a new question.',
      'Ask one curiosity-based qualification question, not a survey. Build the customer pain point over time.',
      'Move toward financing only when payment, approval, or finance options are actually part of the customer conversation; distance alone is not a credit-app reason and cash-only buyers should not get credit-app language.',
      'Track trade, current vehicle, reason for buying, outside bank, buyer structure, credit comfort, timeline, and decision maker before assuming the right close.',
      'Do not push an appointment until the conversation is appointment-ready.',
      'End with one small yes that fits the stage: a needs answer, numbers review, call, video, trade detail, or visit time only when ready.',
    ],
  };
}

function detectDecisionStyle(text: string): SalesPressureTest['decisionStyle'] {
  const visual = matches(text, /\b(see|look|watch|photo|picture|video|walkaround|show me|view)\b/i);
  const auditory = matches(text, /\b(call|talk|hear|listen|sounds|phone|voicemail)\b/i);
  const kinesthetic = matches(text, /\b(test drive|drive|feel|fit|comfort|touch|sit|stain|condition)\b/i);
  const count = [visual, auditory, kinesthetic].filter(Boolean).length;
  if (count !== 1) return count > 1 ? 'mixed' : 'mixed';
  if (visual) return 'visual';
  if (auditory) return 'auditory';
  return 'kinesthetic';
}

const resistanceDefinitions: Array<{
  key: SalesResistanceKey;
  label: string;
  pattern: RegExp;
  evidence: string;
  hardCustomerReply: string;
  winningMove: string;
}> = [
  {
    key: 'price_shopping',
    label: 'Price shopper',
    pattern: /\b(best price|lowest price|lowest|discount|internet price|out[-\s]?the[-\s]?door|otd|too high|cheaper|price match|match this|what'?s the price|send price)\b/i,
    evidence: 'Price, discount, or OTD language is present.',
    hardCustomerReply: 'Just send your best price. I am comparing dealers.',
    winningMove: 'Acknowledge price, avoid fake discounts, verify exact figures, and move to a manager/numbers review or visit.',
  },
  {
    key: 'payment_finance',
    label: 'Payment or finance concern',
    pattern: /\b(payment|monthly|budget|down payment|credit app|finance app|financing options|apr|rate|term|lease)\b/i,
    evidence: 'Payment, budget, APR, term, lease, or finance language is present.',
    hardCustomerReply: 'I only care about the monthly payment.',
    winningMove: 'Sell clarity, not approval: ask for the useful missing input and offer a quick finance review or credit app.',
  },
  {
    key: 'credit_risk',
    label: 'Credit uncertainty',
    pattern: /\b(credit|score|approval|approved|pre[-\s]?approved|bank|lender|cosign|co[-\s]?sign|negative equity)\b/i,
    evidence: 'Credit, lender, approval, cosigner, or negative-equity language is present.',
    hardCustomerReply: 'Can you get me approved before I waste time?',
    winningMove: 'Use compliant uncertainty language, invite the finance path, and never imply approval or guaranteed terms.',
  },
  {
    key: 'trade_value',
    label: 'Trade value risk',
    pattern: /\b(trade|trade[-\s]?in|payoff|vin|miles|mileage|condition|appraisal|title)\b/i,
    evidence: 'Trade, payoff, VIN, mileage, condition, or appraisal language is present.',
    hardCustomerReply: 'I need to know what you will give me for my trade first.',
    winningMove: 'Ask for VIN, miles, payoff, and condition if missing; explain that a real number depends on appraisal.',
  },
  {
    key: 'availability_condition',
    label: 'Availability or condition doubt',
    pattern: /\b(available|still have|sold|hold|deposit|scratch|damage|stain|accident|carfax|inspection|service|history)\b/i,
    evidence: 'Availability, hold, condition, accident, inspection, or history language is present.',
    hardCustomerReply: 'I do not want to come in if the car is gone or rough.',
    winningMove: 'Verify status and condition, offer proof or a video/walkaround, then close for the lowest-friction next step.',
  },
  {
    key: 'distance_logistics',
    label: 'Distance or logistics friction',
    pattern: /\b(out[-\s]?of[-\s]?state|shipping|ship|delivery|deliver|drive from|flight|remote|facetime|video|location|plantation|family nearby)\b/i,
    evidence: 'Distance, shipping, remote review, location, or third-party viewing language is present.',
    hardCustomerReply: 'I am not coming in until I know this is worth it.',
    winningMove: 'Offer a remote numbers review, walkaround, or trusted-person visit before asking for travel.',
  },
  {
    key: 'third_party_decision',
    label: 'Third-party decision maker',
    pattern: /\b(wife|husband|fiance|fiancee|spouse|partner|mom|dad|parent|family|friend|someone on my behalf|boss)\b/i,
    evidence: 'A spouse, family member, friend, or proxy decision maker is mentioned.',
    hardCustomerReply: 'I need to talk to them first.',
    winningMove: 'Make it easy to include the other person: call, video, or appointment with both decision makers.',
  },
  {
    key: 'comparison_shopping',
    label: 'Comparison shopper',
    pattern: /\b(looking at|shopping|compare|another dealer|other vehicles|more cars|options|carvana|carmax|cargurus|autotrader)\b/i,
    evidence: 'The buyer is comparing vehicles, dealers, or marketplaces.',
    hardCustomerReply: 'I have two more cars to look at before I decide.',
    winningMove: 'Respect the comparison, differentiate the unit and process, then secure a time-sensitive proof step.',
  },
  {
    key: 'low_commitment',
    label: 'Low commitment',
    pattern: /\b(just looking|thinking|maybe|not sure|later|not ready|only browsing|no rush)\b/i,
    evidence: 'The buyer is signaling low urgency or reluctance.',
    hardCustomerReply: 'I am just looking right now.',
    winningMove: 'Lower pressure, ask one useful question, and offer a simple next step that helps them decide.',
  },
  {
    key: 'trust_escalation',
    label: 'Trust or escalation risk',
    pattern: /\b(manager|upset|angry|frustrated|bait|switch|review|complaint|lawsuit|honest|trust|waste of time)\b/i,
    evidence: 'Trust, complaint, manager, or wasted-time language is present.',
    hardCustomerReply: 'I do not want a runaround.',
    winningMove: 'De-escalate, be transparent about what must be verified, and route to a manager when needed.',
  },
];

function resistanceForAction(action: QuickAction | undefined): SalesResistance | undefined {
  if (action === 'finance_push') {
    return {
      key: 'payment_finance',
      label: 'Payment or finance concern',
      evidence: 'Finance push was selected.',
      hardCustomerReply: 'I only care about approval and payment.',
      winningMove: 'Offer a credit app or finance review, avoid approval promises, and explain that exact options depend on lender review.',
    };
  }
  if (action === 'trade_in_push') {
    return {
      key: 'trade_value',
      label: 'Trade value risk',
      evidence: 'Trade push was selected.',
      hardCustomerReply: 'Give me a trade number before I come in.',
      winningMove: 'Ask for VIN, miles, payoff, and condition; position the in-person appraisal as the path to a real number.',
    };
  }
  if (action === 'appointment_push' || action === 'confirm_appointment') {
    return {
      key: 'availability_condition',
      label: 'Appointment friction',
      evidence: 'Appointment action was selected.',
      hardCustomerReply: 'Why should I come in today?',
      winningMove: 'Give one concrete reason the visit is worth it, reduce friction, and offer two clear time options.',
    };
  }
  return undefined;
}

function uniqueResistances(items: SalesResistance[]) {
  const seen = new Set<SalesResistanceKey>();
  const output: SalesResistance[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    output.push(item);
  }
  return output.slice(0, 5);
}

function buyerState(context: LeadContext, detected: SalesResistance[]) {
  if (context.sentiment === 'negative' || detected.some((item) => item.key === 'trust_escalation')) {
    return 'Skeptical buyer: slow down, prove usefulness, and avoid pressure until the main concern is answered.';
  }
  if (context.leadScore === 'hot' || detected.some((item) => item.key === 'availability_condition')) {
    return 'High-intent buyer: answer the exact question, verify what matters, and close for the next concrete step.';
  }
  if (detected.some((item) => item.key === 'comparison_shopping' || item.key === 'low_commitment')) {
    return 'Comparison buyer: respect their process, create clarity, and earn a small commitment.';
  }
  return 'Open buyer: personalize the reply, reduce friction, and ask for the easiest useful next step.';
}

function resistanceLevel(context: LeadContext, detected: SalesResistance[]): SalesPressureTest['resistanceLevel'] {
  if (context.sentiment === 'negative' || detected.length >= 4 || detected.some((item) => item.key === 'trust_escalation')) return 'high';
  if (detected.length >= 2 || context.leadScore === 'cold') return 'moderate';
  return 'low';
}

export function buildSalesPressureTest(context: LeadContext, action?: QuickAction): SalesPressureTest {
  const compliance = detectCommunicationCompliance(context);
  if (compliance.status !== 'clear') {
    return {
      resistanceLevel: 'high',
      decisionStyle: 'auditory',
      buyerState:
        compliance.status === 'do_not_contact'
          ? 'Contact blocked. Treat this as a compliance issue before any sales move.'
          : 'SMS opt-out detected. Treat the buyer as contact-sensitive and use phone-only guidance if allowed.',
      detectedObjections: [
        {
          key: 'trust_escalation',
          label: 'Contact compliance',
          evidence: compliance.evidence[0] ?? compliance.reason ?? compliance.status,
          hardCustomerReply: 'I told you to stop contacting me.',
          winningMove:
            compliance.status === 'do_not_contact'
              ? 'Do not contact. Escalate to manager/compliance review.'
              : 'Do not text. If calling is allowed, ask permission to continue by phone and be ready to close the file.',
        },
      ],
      sourcePrinciples,
      selfChallenge: [
        'Do not treat this as a hot lead.',
        'Do not turn an opt-out into an appointment push.',
        'Only use a phone or voicemail script if policy permits.',
      ],
      closePath:
        compliance.status === 'do_not_contact'
          ? ['Stop outreach.', 'Escalate to manager/compliance review.', 'Update the CRM status.']
          : ['Do not text.', 'Use a respectful call/voicemail script only if allowed.', 'Ask whether a phone conversation is acceptable.', 'Close the file cleanly if they decline.'],
      financePath: ['No finance pitch until contact compliance is clear or the customer agrees to a phone conversation.'],
      trustBuilders: ['Respect the opt-out immediately.', 'Do not mention pressure, urgency, or visit times.', 'Use only verified page details if a permitted call occurs.'],
      responseChecklist: [
        'No SMS copy.',
        'No email pretending to be a reply to the text thread.',
        'Phone/voicemail labels only.',
        'Lead score should be cold.',
      ],
    };
  }
  const latest = recentCustomerMessages(context);
  const signalText = [
    latest,
    context.paymentBudgetHints,
    context.tradeInfo,
    context.customerLocation,
    context.vehicleOfInterest,
    context.stockNumber,
    context.leadSource,
    ...(context.personalizationSignals ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  const text = signalText.trim() || contextText(context);
  const actionResistance = resistanceForAction(action);
  const detected = uniqueResistances([
    ...resistanceDefinitions
      .filter((definition) => matches(text, definition.pattern))
      .map((definition) => ({
        key: definition.key,
        label: definition.label,
        evidence: definition.evidence,
        hardCustomerReply: definition.hardCustomerReply,
        winningMove: definition.winningMove,
      })),
    ...(actionResistance ? [actionResistance] : []),
  ]);
  const primary = detected[0];
  const remote = detected.some((item) => item.key === 'distance_logistics');
  const finance = detected.some((item) => item.key === 'payment_finance' || item.key === 'credit_risk');

  return {
    resistanceLevel: resistanceLevel(context, detected),
    decisionStyle: detectDecisionStyle(text),
    buyerState: buyerState(context, detected),
    detectedObjections: detected,
    sourcePrinciples,
    selfChallenge: [
      primary
        ? `Assume the customer pushes back with: "${primary.hardCustomerReply}" Build the reply so it still earns a next step.`
        : 'Assume the customer ignores generic follow-up. Build a reply that gives a concrete reason to answer.',
      latest
        ? 'Use the latest customer-authored message as the anchor, not automation or salesperson history.'
        : 'If the latest customer message is unclear, ask one useful qualifying question instead of guessing.',
      'Rewrite any line that sounds like a template, pressure tactic, or unverifiable promise.',
    ],
    closePath: [
      'Answer the stated question or objection first.',
      primary ? primary.winningMove : 'Create one useful reason to continue the conversation.',
      remote
        ? 'Offer remote verification, video, numbers review, or pickup/shipping clarity before asking them to travel.'
        : 'When the buyer is local and appointment-ready, offer two specific appointment choices after answering their concern.',
      'End with one easy yes/no or either/or question.',
    ],
    financePath: finance
      ? [
          'Frame finance as getting real options, not guaranteed approval.',
          'Ask only for the missing finance input that changes the next step.',
          'Offer a credit app or finance-manager review only when financing/payment is the customer concern; otherwise use verified numbers.',
          'Use lender-approval language and avoid guaranteed payments, rates, or approvals.',
        ]
      : [
          'If money comes up, move toward verified numbers instead of quoting unsupported figures.',
          'Use finance as a clarity path when budget is the obstacle.',
        ],
    trustBuilders: [
      'Use specific vehicle details already in context: year, model, trim, stock, condition, lead source, location, or family/trade clue.',
      'For used vehicles, mention only proof that exists in context: inspection, service, Carfax/history, warranty options, photos, video, or appraisal.',
      'Show that the rep is protecting the customer from wasted time by verifying availability, condition, and numbers.',
    ],
    responseChecklist: [
      'Personal to this customer and vehicle.',
      'Names the useful next step.',
      'Avoids redundant repeats from prior outbound messages unless the repeat is intentional and reframed with a new reason.',
      'Handles the hardest likely objection before it appears.',
      'No fake urgency, approval promise, guaranteed discount, or made-up availability.',
      'Customer-facing options sound different from each other.',
    ],
  };
}

function hasResistance(test: SalesPressureTest, key: SalesResistanceKey) {
  return test.detectedObjections.some((item) => item.key === key);
}

function uniqueStyles(styles: SalesInfluenceStyle[]) {
  const seen = new Set<SalesInfluenceStyle>();
  const output: SalesInfluenceStyle[] = [];
  for (const style of styles) {
    if (seen.has(style)) continue;
    seen.add(style);
    output.push(style);
  }
  return output.slice(0, 5);
}

export function buildSalesInfluencePlan(context: LeadContext, action?: QuickAction): SalesInfluencePlan {
  const compliance = detectCommunicationCompliance(context);
  const test = buildSalesPressureTest(context, action);
  const needs = buildNeedsAnalysis(context);
  const text = contextText(context);
  const remote =
    context.locationIntel?.classification === 'out_of_state' ||
    context.locationIntel?.classification === 'local_far' ||
    context.locationIntel?.route === 'remote' ||
    hasResistance(test, 'distance_logistics') ||
    matches(text, /\b(out[-\s]?of[-\s]?state|ship|shipping|delivery|remote|flight|drive from)\b/i);
  const highIntent =
    context.leadScore === 'hot' ||
    hasResistance(test, 'availability_condition') ||
    matches(text, /\b(today|tomorrow|ready|available|still have|appointment|coming|test drive)\b/i);
  const trustRisk = context.sentiment === 'negative' || hasResistance(test, 'trust_escalation') || needs.priority === 'trust';
  const finance = needs.priority === 'finance' || hasResistance(test, 'payment_finance') || hasResistance(test, 'credit_risk');
  const trade = needs.priority === 'trade' || hasResistance(test, 'trade_value');
  const lowCommitment = hasResistance(test, 'low_commitment') || hasResistance(test, 'comparison_shopping');

  if (compliance.status !== 'clear') {
    return {
      primaryStyle: 'manager_restore',
      supportingStyles: ['tactical_empathy', 'service_trust'],
      reasoning: 'Contact compliance is the only deal path until a manager verifies what outreach is allowed.',
      openingMove: 'Acknowledge the contact issue internally and stop customer-facing text/email outreach.',
      discoveryMove: 'Verify whether a phone call, voicemail, manager note, or closed-file update is allowed by store policy.',
      proofMove: 'Use the exact opt-out evidence and CRM timeline, not assumptions.',
      closeMove: 'Route to manager/compliance review and only use phone guidance if allowed.',
      upsellPath: 'None until contact status is clear.',
      avoid: ['Do not text.', 'Do not email as if it is a normal reply.', 'Do not treat the lead as hot.', 'Do not push appointment times.'],
      coachChecklist: ['Respect opt-out immediately.', 'Use phone-only wording if allowed.', 'Keep lead score cold.', 'Document the evidence.'],
    };
  }

  let primaryStyle: SalesInfluenceStyle = 'clarity_teacher';
  if (trustRisk) primaryStyle = 'manager_restore';
  else if (finance) primaryStyle = 'finance_path';
  else if (trade) primaryStyle = 'trade_value';
  else if (remote) primaryStyle = 'remote_confidence';
  else if (highIntent) primaryStyle = 'harder_close';
  else if (lowCommitment) primaryStyle = 'low_pressure_nurture';

  const supportingStyles = uniqueStyles([
    'tactical_empathy',
    trustRisk ? 'service_trust' : 'clarity_teacher',
    finance ? 'finance_path' : undefined,
    trade ? 'trade_value' : undefined,
    remote ? 'remote_confidence' : undefined,
    highIntent ? 'harder_close' : undefined,
    lowCommitment ? 'low_pressure_nurture' : undefined,
    'ethical_upsell',
  ].filter(Boolean) as SalesInfluenceStyle[]);

  const openingByStyle: Record<SalesInfluenceStyle, string> = {
    tactical_empathy: 'Label the likely concern in one human sentence, then answer the latest customer message.',
    service_trust: 'Start by helping, not selling: make the buyer feel protected from wasted time or bad information.',
    clarity_teacher: 'Simplify the decision: explain what is known, what must be verified, and the easiest next step.',
    harder_close: 'Answer fast, assume momentum, and offer two specific next-step choices without sounding desperate.',
    finance_path: 'Turn money talk into a clean finance review or credit-app path without implying approval.',
    trade_value: 'Make the trade the lever: gather VIN, miles, payoff, and condition or set the appraisal path.',
    remote_confidence: 'Sell the remote process first: video, verified numbers, pickup/shipping clarity, and finance only when it is relevant; travel only if it makes sense.',
    low_pressure_nurture: 'Lower pressure and ask one useful question that helps them compare or decide.',
    manager_restore: 'Slow down, de-escalate, and restore trust with transparent verification.',
    ethical_upsell: 'Offer a better-fit option only if it solves their stated need or risk.',
  };

  return {
    primaryStyle,
    supportingStyles,
    reasoning: [
      `Buyer state: ${test.buyerState}`,
      needs.customerGoalHypothesis,
      test.detectedObjections[0] ? `Main resistance: ${test.detectedObjections[0].label}.` : 'No hard resistance yet.',
    ].join(' '),
    openingMove: openingByStyle[primaryStyle],
    discoveryMove: needs.nextBestQuestion,
    proofMove:
      primaryStyle === 'remote_confidence'
        ? 'Use verified availability, video/walkaround, exact numbers, return-policy proof when applicable, pickup/shipping clarity, and finance only if the customer is discussing payment or approval.'
        : primaryStyle === 'finance_path'
          ? 'Use verified finance inputs: target payment, cash/down, trade, credit-app status, taxes/fees, and lender-review language.'
          : primaryStyle === 'trade_value'
            ? 'Use trade proof: VIN, miles, payoff, condition, photos, and appraisal process.'
            : needs.proofNeeded.slice(0, 3).join(', '),
    closeMove:
      primaryStyle === 'harder_close'
        ? 'Close with two exact times or a direct call-now option.'
        : primaryStyle === 'remote_confidence'
          ? 'Close for video, verified numbers, pickup/shipping clarity, or a quick call before travel.'
          : primaryStyle === 'finance_path'
            ? 'Close for credit app or finance-manager review so the numbers are real.'
            : primaryStyle === 'low_pressure_nurture'
              ? 'Close with one easy either/or question that reveals the next buying reason.'
              : needs.closeAngle,
    upsellPath:
      'If upselling, make it fit-based: better trim, certified/used alternative, protection, accessories, delivery, or finance path only when it protects the customer or improves ownership.',
    avoid: [
      'Do not sound scripted.',
      'Do not skip the latest customer message.',
      'Do not promise approval, discounts, availability, or trade value before verifying.',
      'Do not ask multiple discovery questions at once.',
      remote ? 'Do not lead with come in for remote buyers.' : 'Do not overcomplicate a local high-intent close.',
    ],
    coachChecklist: [
      'Name the buyer state before writing.',
      'Answer the latest question first.',
      'Ask one needs-analysis question.',
      'Use one proof point that fits this exact lead.',
      'Close for the next smallest deal-moving yes.',
      'Pressure-test the answer against the hardest reasonable customer pushback.',
    ],
  };
}
