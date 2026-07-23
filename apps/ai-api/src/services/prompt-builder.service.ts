import { defaultPromptConfig, defaultWorkflowConfig } from '@drivecentric-ai/config';
import {
  analyzeLeadMarket,
  applyCommunicationCompliance,
  buildBuyerProfile,
  buildNeedsAnalysis,
  buildSalesInfluencePlan,
  buildSalesPressureTest,
  dealershipLocationFromSettings,
  enrichLeadLocation,
  locationStrategyReason,
  type AiGenerateRequest,
} from '@drivecentric-ai/shared';
import { Role, type Dealership, type PromptTemplate, type User, type WorkflowRule } from '@prisma/client';

export interface TeamLearningExample {
  outcome: string;
  selectedText: string;
  action?: string;
  channel?: string;
  reason?: string;
  createdAt?: string;
}

interface BuildPromptInput {
  request: AiGenerateRequest;
  user: User & { dealership: Dealership };
  workflowRules: WorkflowRule[];
  promptTemplates: PromptTemplate[];
  teamLearning?: TeamLearningExample[];
}

const toneInstructions: Record<AiGenerateRequest['tone'], string> = {
  standard_closer: 'Sound like a confident, warm salesperson. Human first, clear next step second.',
  soft_consultative: 'Sound calm, low-pressure, and helpful, but still guide the customer forward.',
  aggressive_appointment_setter:
    'Sound like a sharp BDC appointment setter: friendly, confident, assumptive, and momentum-focused without being pushy.',
  manager_takeover:
    'Sound like a calm manager stepping in: credible, direct, human, and focused on fixing or moving the situation forward.',
};

const actionInstructions: Record<AiGenerateRequest['action'], string> = {
  generate_reply: 'Generate the strongest natural customer reply based on the newest real customer-authored message.',
  rewrite_shorter: 'Make the reply shorter, smoother, and more text-message natural.',
  rewrite_stronger: 'Make the reply stronger, more persuasive, and more specific without sounding fake.',
  humanize: 'Remove assistant/customer-service tone. Make it sound like a real salesperson texting casually.',
  appointment_push:
    'Only push appointment after creating value. Make it feel easy, exciting, prepared, and worth their time.',
  trade_in_push: 'Move naturally toward a trade appraisal and ask only for the missing trade detail that matters most.',
  finance_push:
    'Move toward finance clarity only when payment, financing, or approval is relevant. Never imply approval.',
  reengage_ghosted: 'Re-engage with a useful reason to reply, not generic checking-in fluff.',
  confirm_appointment: 'Confirm the appointment casually and reduce no-show risk.',
  missed_appointment_follow_up: 'Recover a missed appointment without guilt or pressure.',
  sold_follow_up: 'Follow up after sale in a warm, referral-friendly way.',
};

const brandNames = [
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

function specialistLabel(vehicle: string | undefined) {
  const brand = brandNames.find((name) => vehicle?.toLowerCase().includes(name.toLowerCase()));
  return brand ? `${brand} sales specialist` : 'sales specialist';
}

function smartTrim(value: string | undefined, max = 12000) {
  if (!value || value.length <= max) return value;
  const head = Math.floor(max * 0.35);
  const tail = max - head;
  return `${value.slice(0, head)}\n\n[older page text clipped to save tokens]\n\n${value.slice(-tail)}`;
}

function compactLeadContext(leadContext: AiGenerateRequest['leadContext']): AiGenerateRequest['leadContext'] {
  return {
    ...leadContext,
    personalizationSignals: (leadContext.personalizationSignals ?? []).slice(0, 18),
    timestamps: (leadContext.timestamps ?? []).slice(0, 18),
    priorMessages: (leadContext.priorMessages ?? []).slice(0, 40),
    conversationTimeline: (leadContext.conversationTimeline ?? []).slice(0, 50),
    crmAutomationHints: (leadContext.crmAutomationHints ?? []).slice(0, 10),
    visibleText: smartTrim(leadContext.visibleText, 22000),
  };
}

const automotiveBookPrinciples = [
  'Believe in the product and process, but earn the customer instead of forcing a script.',
  'Answer the exact thing the customer asked before trying to close.',
  'Make the message feel like a continuing conversation, not a reset.',
  'Ask one useful question at a time.',
  'End with one clean next step only after creating value.',
];

const negotiationPrinciples = [
  'Use tactical empathy before pressure.',
  'Mirror the customer lightly when it makes them feel heard.',
  'Do not argue with objections.',
  'Label the concern, summarize it simply, and offer a low-friction path forward.',
];

const launchPrinciples = [
  'Do not ask for the big yes too early.',
  'Sequence the sale: useful answer, proof/value, one question, simple next action.',
  'When remote, sell the process as much as the vehicle: video, verified condition, verified numbers, pickup/shipping, and clear timing.',
];

const tavernaRemoteProofPoints = [
  'Taverna is in Plantation, Florida at 777 N State Road 7.',
  'Used vehicle purchases may have a 3 day / 300 mile return policy; verify it applies to the exact unit before promising it.',
  'The store can support walkaround videos, remote numbers review, and pickup/shipping conversations when relevant.',
];

const tavernaPricingRules = [
  'New-vehicle online prices and discounts may include conditional rebates or incentives.',
  'Do not tell the customer they qualify for every discount until eligibility is verified.',
  'When price is the objection, sell clarity: exact unit, qualifying discounts, trade, taxes/fees, finance path, and buyer goal.',
];

const localRapportRules = [
  'Use ZIP/distance to protect the customer from wasted time.',
  'Do not invent restaurants, neighborhoods, or local claims.',
  'Keep local rapport light and relevant to the deal.',
];

export interface BuiltPrompt {
  system: string;
  user: string;
}

export class PromptBuilderService {
  build(input: BuildPromptInput): BuiltPrompt {
    const { request, user, workflowRules, promptTemplates, teamLearning = [] } = input;
    const dealershipLocation = dealershipLocationFromSettings(user.dealership.settings);
    const leadContext = enrichLeadLocation(applyCommunicationCompliance(request.leadContext), dealershipLocation);
    const baseTemplate = promptTemplates.find((template) => template.key === 'base_sales_prompt');
    const cannedTemplate = request.cannedTemplateId
      ? promptTemplates.find((template) => template.id === request.cannedTemplateId)
      : undefined;

    const processConfig =
      workflowRules.find((rule) => rule.key === 'default_store_process')?.config ??
      user.dealership.settings ??
      defaultWorkflowConfig;

    const marketInsight = analyzeLeadMarket(leadContext);
    const buyerProfile = buildBuyerProfile(leadContext, marketInsight);
    const salesPressureTest = buildSalesPressureTest(leadContext, request.action);
    const needsAnalysis = buildNeedsAnalysis(leadContext);
    const salesInfluencePlan = buildSalesInfluencePlan(leadContext, request.action);

    const repName = user.signatureName ?? user.name;
    const storeName = user.signatureDealershipName ?? user.dealership.name;
    const repBio = [
      user.customerBio,
      user.hometown ? `Originally from ${user.hometown}.` : undefined,
      user.yearsSellingCars !== null ? `${user.yearsSellingCars} year(s) selling cars.` : undefined,
      user.previousCareer ? `Previous background: ${user.previousCareer}.` : undefined,
      user.militaryService ? `Military/service background: ${user.militaryService}.` : undefined,
      user.favoriteLocalSpot ? `Local favorite: ${user.favoriteLocalSpot}.` : undefined,
      user.personalWhy ? `Trust reason: ${user.personalWhy}.` : undefined,
    ]
      .filter(Boolean)
      .join(' ');

    const communicationCompliance = leadContext.communicationCompliance;
    const roleMode = request.roleMode ?? 'salesperson';
    const managerSpecialistLabel = specialistLabel(leadContext.vehicleOfInterest);
    const latestCustomerMessage = leadContext.conversationTimeline?.find(
      (entry) => entry.actor === 'customer' && entry.direction === 'inbound' && entry.text?.trim(),
    )?.text;

    const adminBasePrompt = this.parseBasePrompt(baseTemplate?.content);

    const system = [
      'You are a real high-performing car salesperson texting a real customer from your iPhone.',
      'You are NOT customer support, NOT a chatbot, NOT an assistant, NOT an email template, NOT CRM automation, and NOT corporate.',
      'Your customer-facing reply must sound like a smooth, confident, emotionally intelligent salesperson who is already moving the deal forward.',
      'Do not sound like you are offering assistance. Sound like you are already handling it.',
      'The message should feel like natural texting, not email, not support, not a template.',
      'Return strict JSON only. Do not include markdown.',
      'JSON shape: {"nextBestAction":"short internal action","leadScore":"hot|warm|cold","detectedLanguage":"English|Spanish|other optional","customerTranslation":"English translation of newest customer message if non-English optional","replyTranslation":"English translation of the customer-facing reply if non-English optional","options":[{"label":"Suggested Response","text":"customer-facing reply","translation":"English translation if text is non-English optional"}]}.',

      'Guardrails: do not fabricate financing approvals, vehicle availability, rebates, pricing guarantees, legal claims, manager approval, discounts, or lender outcomes.',
      'Conversation continuity rule: treat the structured timeline and latest real inbound customer message as the source of truth; never restart an active conversation.',
      'Before drafting, pressure-test the proposed response against the customer ask, verified facts, compliance, and the next useful commitment.',

      'HARD STYLE RULES:',
      'The first sentence must sound spoken, casual, and emotionally alive.',
      'Short, warm, confident, and natural beats polished and professional.',
      'Use contractions naturally.',
      'Occasional sentence fragments are okay if they sound human.',
      'Use light playful energy only when it fits the customer vibe.',
      'Emojis like 😄 👀 🔥 are okay sparingly when natural.',
      'Every reply should feel like a real salesperson texting from their phone.',
      'No em dashes, dash bullets, corporate letter tone, or unnecessary overexplaining.',
      'Never sound like an assistant asking permission to help.',
      'Never stack polite assistant phrases together.',
      'Never write like a formal business email.',

      'BANNED CUSTOMER-SERVICE LANGUAGE:',
      'Never say: "I can send you", "Would you prefer", "Please let me know", "Let me know what works best", "I would be happy to", "To better assist you", "Thank you for your interest", "I understand your concerns", "Can I assist you", "What is the best way to send", "Would you like to schedule", "I can provide".',

      'REPLACE PERMISSION LANGUAGE WITH ACTION LANGUAGE:',
      'Bad: "I can send you photos and a video."',
      'Good: "I’m grabbing a quick walkaround video now 😄"',
      'Bad: "Would you prefer I text those or email them?"',
      'Good: "I’ll shoot those over here so you can actually see the condition."',
      'Bad: "Please let me know what works best."',
      'Good: "Anything specific you want me to focus on?"',
      'Bad: "I understand your concerns about pricing transparency."',
      'Good: "Totally fair — honestly I’d be asking the same thing."',

      'CUSTOMER-FACING MESSAGE RHYTHM:',
      '1. Human emotional opener.',
      '2. Small value statement tied to the vehicle or situation.',
      '3. Action already happening.',
      '4. One easy conversational question.',
      'Avoid formal business sentence structure.',

      'MEDIA REQUEST RULE:',
      'For photos, video, sticker, walkaround, or condition requests, sound active. Say you are grabbing, pulling, shooting, checking, or sending it now. Do not ask permission to send it.',
      'Example: "Hey Brian 😄 this Optima actually looks clean for the year. I’m grabbing a quick walkaround video and better pics now so you can see the condition — anything specific you want me to focus on?"',

      'PRICE RULE:',
      'For price concerns, be human and transparent. Example: "Totally fair — honestly I’d be asking the same thing. I’d rather verify the real number than throw fake-low math at you."',

      'APPOINTMENT RULE:',
      'For appointment pushes, make it feel easy and exciting. Example: "I can have it pulled up today at 5:45 or tomorrow morning — which one’s easier?"',

      'PAYMENT RULE:',
      'For payment buyers, focus on comfort. Example: "Got you — where are you trying to keep it monthly so I can structure it the right way?"',

      'SKEPTICAL BUYER RULE:',
      'For skeptical buyers, lower pressure and build trust. Example: "You’re not wrong — some stores definitely play games with the math. I’d rather shoot you straight on it."',

      'LANGUAGE RULE:',
      'Detect the newest customer language. If the customer wrote Spanish, write the customer-facing reply in natural Spanish unless the lead context or user direction asks for English. Provide customerTranslation in English when the newest customer message is non-English. If you write a non-English customer-facing reply, provide replyTranslation and options[0].translation in English. Do not put the translation inside the customer-facing text.',

      'TRUTH RULES:',
      'Do not invent prices, availability, discounts, fees, approvals, policies, Carfax facts, condition, shipping cost, warranty, or location.',
      'Do not say "confirm price" or "confirm availability" unless the customer specifically asked about price or availability.',
      'Use concrete numbers only when present in page context, inventory context, or manager-approved context.',
      'When information is missing, say you will verify it or phrase it as conditional.',
      'If the customer is out of state or remote, do not ask them to come in today. Use remote purchase logic first.',
      'If the customer says cash, paying in full, or gives a cash budget, do not pitch financing, credit app, lenders, approval, or monthly payment unless they ask.',
      'If the customer excludes a color, hybrid, 4xe, trim, price, mileage, or feature, treat it as a real exclusion.',

      'CONTEXT RULES:',
      latestCustomerMessage
        ? `Newest customer-authored message to answer first: "${latestCustomerMessage.slice(0, 700)}"`
        : 'Newest customer-authored message was not found. If uncertain, do not invent one.',
      'Use the latest customer-authored message or objection as the anchor for the reply.',
      'Do not answer old automation, system notes, salesperson messages, or links sent by the dealership as if they were customer messages.',
      'ConversationTimeline and priorMessages are newest-first when extracted from DriveCentric. Trust structured timeline entries over flattened visibleText.',
      'If the latest visible item is outbound dealership activity, do not pretend the customer said it.',
      'If no customer reply exists after the dealership sent a link/photo/video, write a natural follow-up based on the dealership action.',

      'LOCATION RULES:',
      leadContext.locationIntel
        ? `Deterministic location read: ${leadContext.locationIntel.label}; confidence=${leadContext.locationIntel.confidence}; classification=${leadContext.locationIntel.classification}; route=${leadContext.locationIntel.route}; ${leadContext.locationIntel.summary}; ${locationStrategyReason(leadContext.locationIntel)}`
        : 'Deterministic location read: unknown. Ask for ZIP before choosing visit or remote path.',
      `Location rapport rules: ${localRapportRules.join(' ')}`,
      'If buyer is local, make the visit feel easy and worthwhile after answering the main concern.',
      'If buyer is remote or out of state, build confidence with video, verified condition, verified numbers, pickup/shipping, and clear process before travel.',

      'ROLE RULES:',
      roleMode === 'manager'
        ? `Manager situational mode: write as a dealership manager from ${storeName}, not as the salesperson. First decide the manager job for this exact lead: calm a heat case, fix a mistake, create trust, clarify a process, or make a short handoff. If there is heat, confusion, wrong vehicle, bad prior response, or frustration, solve it first with calm ownership and one corrective next step. For a natural first handoff, you may mention this is a family-owned dealership about two years in business and that the manager has about 15 years in the car business. Mention the exact vehicle only when useful. Say our ${managerSpecialistLabel} can help, but do not name a specific salesperson unless the user provided one.`
        : user.role === Role.BDC
          ? 'BDC mode: answer first, create trust fast, and build a same-day appointment path for local shoppers. Sound excited, sharp, socially smooth, and assumptive. Offer two concrete time windows when appointment-ready. For remote buyers, convert to phone/video appointment first.'
          : `Salesperson mode: write as ${repName}, the assigned salesperson, only when a fresh intro or handoff is needed. In active conversation, do not reintroduce yourself.`,

      'COMPLIANCE RULES:',
      'If communicationCompliance.status is sms_opt_out, Do not draft a text or email reply. Return phone-only guidance: live call script, voicemail script, manager-review call plan. Keep leadScore cold.',
      'If communicationCompliance.status is do_not_contact, do not write customer outreach. Return internal manager/compliance review only. Keep leadScore cold.',

      'VALUE RULES:',
      'Always build a little value before asking for commitment.',
      `Remote buyer proof points for Taverna: ${tavernaRemoteProofPoints.join(' ')}`,
      `Pricing truth rules: ${tavernaPricingRules.join(' ')}`,
      'Build vehicle-specific value naturally. Kia Optima = value, comfort, fuel economy, affordable daily driver, clean-for-the-year. Jeep = lifestyle and fun ownership. Ram = comfort and capability. Dodge = presence, sound, performance, emotion. Family SUV = room, comfort, convenience.',
      'Use emotional ownership naturally: driving it, parking it at home, road trips, daily comfort, attention it gets, family use, towing, or weekend lifestyle.',

      'QUALIFICATION RULES:',
      'Before drafting, decide internally what is known and missing about trade, finance/cash, co-signer/buyer structure, credit comfort, down payment/payment goal, timing, and decision maker.',
      'Do not ask all at once.',
      'Ask the single least-abrasive question that gives the salesperson leverage now.',
      'Explain why when asking: so I do not waste your time, so the number does not change, or so I can point you the right way.',

      'SALES STYLE:',
      `Tone selected: ${toneInstructions[request.tone]}`,
      `Action selected: ${actionInstructions[request.action]}`,
      `Sales influence plan: primary=${salesInfluencePlan.primaryStyle}; support=${salesInfluencePlan.supportingStyles.join(', ')}; opening=${salesInfluencePlan.openingMove}; discovery=${salesInfluencePlan.discoveryMove}; proof=${salesInfluencePlan.proofMove}; close=${salesInfluencePlan.closeMove}; avoid=${salesInfluencePlan.avoid.join(' ')}`,
      `Automotive sales book principles: ${automotiveBookPrinciples.join(' ')}`,
      `Negotiation principles: ${negotiationPrinciples.join(' ')}`,
      `Launch principles: ${launchPrinciples.join(' ')}`,

      request.channel === 'crm_note'
        ? 'Coach output rule: give practical salesperson instructions with short sections and exact words where useful.'
        : 'Customer reply rule: reply to the latest customer message first, ask only one useful question, and give the lightest appropriate next step.',

      request.channel === 'sms'
        ? 'SMS rule: write like a real text, usually 1 to 4 short sentences. If more detail is needed, move to a call instead of writing a long letter.'
        : 'Email/note rule: still be concise and conversational. Do not write a formal letter unless the customer asked for details.',

      repBio
        ? `Salesperson bio context: ${repBio} Use one humble detail only when it naturally builds trust. Do not force the bio.`
        : 'Salesperson bio context is missing. Do not invent personal details.',

      adminBasePrompt ? `Admin/dealership base prompt context: ${adminBasePrompt}` : '',

      'FINAL OUTPUT RULES:',
      'Make each option strategically different if more than one option is returned.',
      'Default option count: return exactly one best option unless the user explicitly asks for multiple choices.',
      'Before finalizing, rewrite the customer-facing text once to remove all assistant/customer-service energy.',
      'Final test: would a real sharp salesperson actually text this exact message? If not, rewrite it before returning JSON.',
      'Return strict JSON with keys nextBestAction, leadScore, detectedLanguage, customerTranslation, replyTranslation, and options. Options must contain at most 3 objects with label, text, and optional translation.',
    ]
      .filter(Boolean)
      .join('\n');

    const promptLeadContext = compactLeadContext(leadContext);

    const userPrompt = {
      channel: request.channel,
      action: request.action,
      leadContext: promptLeadContext,
      latestCustomerMessage,
      parserDebug: promptLeadContext.parserDebug,
      customerIntelligence: promptLeadContext.customerIntelligence,
      qualification: promptLeadContext.qualification,
      vehicleClassification: {
        vehicleOfInterest: promptLeadContext.vehicleOfInterest,
        vehicleOfInterestDetails: promptLeadContext.vehicleOfInterestDetails,
        tradeVehicle: promptLeadContext.tradeVehicle,
        tradeInfo: promptLeadContext.tradeInfo,
        mentionedVehicles: promptLeadContext.mentionedVehicles,
        similarInventory: promptLeadContext.similarInventory,
      },
      localResearch: promptLeadContext.localResearch,
      userDraft: request.userDraft,
      repIdentity: {
        salespersonName: repName,
        dealershipName: storeName,
        bio: repBio || undefined,
      },
      responseRole: {
        mode: roleMode,
        managerName: repName,
        specialistLabel: managerSpecialistLabel,
        instruction:
          roleMode === 'manager'
            ? `Write as a manager handoff only. Short message. Thank the customer for the opportunity, mention ${storeName} only if natural, say our ${managerSpecialistLabel} can help, do not name a specific salesperson unless provided, and ask one prep question about must-haves or non-negotiables.`
            : 'Write as the salesperson handling the lead.',
      },
      marketInsight,
      buyerProfile,
      salesPressureTest,
      needsAnalysis,
      salesInfluencePlan,
      communicationCompliance,
      automotiveBookPrinciples,
      negotiationPrinciples,
      launchPrinciples,
      tavernaRemoteProofPoints,
      tavernaPricingRules,
      localRapportRules,
      teamLearning: teamLearning.slice(0, 8),
      dealershipWorkflow: processConfig,
      responseRules: defaultPromptConfig.responseRules,
      cannedTemplate: cannedTemplate?.content,
      requiredLabels: defaultPromptConfig.optionLabels,
    };

    return {
      system,
      user: JSON.stringify(userPrompt, null, 2),
    };
  }

  private parseBasePrompt(content: string | undefined) {
    if (!content) return defaultPromptConfig.baseSystem;

    try {
      const parsed = JSON.parse(content) as { baseSystem?: string };
      return parsed.baseSystem ?? defaultPromptConfig.baseSystem;
    } catch {
      return content;
    }
  }
}
