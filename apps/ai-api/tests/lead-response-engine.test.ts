import { Role, UserStatus, type Dealership, type User } from '@prisma/client';
import type { AiGenerateRequest, LeadContext } from '@drivecentric-ai/shared';
import { describe, expect, it } from 'vitest';
import {
  buildOpenAILeadResponsePrompt,
  chooseLeadResponseStrategy,
  classifyLeadIntent,
  classifyLocation,
  generateLeadResponseWithOpenAI,
  getLatestCustomerMessage,
  type DealershipResponseSettings,
} from '../src/services/lead-response-engine.service.js';
import type { LlmProvider } from '../src/services/llm/provider.js';

const settings: DealershipResponseSettings = {
  dealershipName: 'Demo CDJR',
  salespersonTone: 'warm and direct',
  preferredCallToAction: 'One useful next step',
  localCustomerStrategy: 'Move appointment-ready local shoppers toward a useful visit.',
  outOfStateCustomerStrategy: 'Use remote purchase steps, documents, video, shipping, or pickup.',
  pushAppointment: false,
  pushFinanceApp: true,
  pushPhoneCall: true,
  pushRemotePurchase: true,
  maximumResponseLength: 420,
};

function leadContext(overrides: Partial<LeadContext> = {}): LeadContext {
  return {
    customerName: 'Taylor Buyer',
    vehicleOfInterest: '2024 Jeep Wrangler Rubicon',
    stockNumber: 'JW123',
    timestamps: [],
    priorMessages: [],
    conversationTimeline: [],
    sentiment: 'unknown',
    leadScore: 'warm',
    personalizationSignals: [],
    phoneNumbers: [],
    emails: [],
    crmAutomationHints: [],
    ...overrides,
  };
}

function request(context: LeadContext): AiGenerateRequest {
  return {
    action: 'generate_reply',
    channel: 'sms',
    tone: 'standard_closer',
    roleMode: 'salesperson',
    conversationId: 'lead-123',
    leadContext: context,
  };
}

function user(): User & { dealership: Dealership } {
  const now = new Date();
  return {
    id: 'user-1',
    userId: 'sales-1',
    email: 'sales@example.com',
    name: 'Sam Sales',
    signatureName: 'Sam',
    signatureDealershipName: 'Demo CDJR',
    firstName: 'Sam',
    lastName: 'Sales',
    displayName: 'Sam Sales',
    dateOfBirth: null,
    hometown: null,
    movedHereReason: null,
    yearsSellingCars: 3,
    previousCareer: null,
    militaryService: null,
    favoriteLocalSpot: null,
    personalWhy: null,
    customerBio: 'I keep the process simple and make sure customers get straight answers.',
    bioCompletedAt: null,
    passwordHash: 'hash',
    role: Role.SALESPERSON,
    status: UserStatus.ACTIVE,
    aiEnabled: true,
    permissions: [],
    dailyRequestLimit: null,
    bonusDailyRequestLimit: 0,
    monthlyRequestLimit: null,
    dailyTokenLimit: null,
    creditBalanceMicros: 1000000,
    freeCreditGrantedMicros: 1000000,
    lifetimeCreditMicros: 1000000,
    lastLoginAt: null,
    dealershipId: 'dealer-1',
    createdAt: now,
    updatedAt: now,
    dealership: {
      id: 'dealer-1',
      name: 'Demo CDJR',
      slug: 'demo-cdjr',
      isActive: true,
      aiEnabled: true,
      dailyTokenLimit: 250000,
      monthlyTokenLimit: 5000000,
      settings: {
        responseEngine: {
          preferredCallToAction: 'One useful next step',
          outOfStateCustomerStrategy: 'Use remote purchase steps, documents, video, shipping, or pickup.',
          pushFinanceApp: true,
        },
      },
      extensionMinVersion: '0.1.0',
      extensionLatestVersion: '0.1.0',
      supportEmail: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe('lead-response-engine', () => {
  it('uses the newest external customer message and ignores internal notes', () => {
    const context = leadContext({
      conversationTimeline: [
        {
          actor: 'manager',
          direction: 'internal',
          channel: 'note',
          text: 'Internal note: ask for ZIP',
          timestampIso: '2026-04-29T12:00:00.000Z',
        },
        {
          actor: 'customer',
          direction: 'inbound',
          channel: 'text',
          text: 'Can you send the Carfax?',
          timestampIso: '2026-04-29T11:59:00.000Z',
        },
      ],
    });

    expect(getLatestCustomerMessage(context)).toBe('Can you send the Carfax?');
  });

  it('classifies different customer asks instead of defaulting to price or availability', () => {
    const context = leadContext();

    expect(classifyLeadIntent('Can you send the Carfax?', context)).toBe('condition_history');
    expect(classifyLeadIntent('Can you send more pictures and the window sticker?', context)).toBe('media_request');
    expect(classifyLeadIntent('Can I get approved with 2k down?', context)).toBe('financing');
    expect(classifyLeadIntent('I have a trade with 82k miles', context)).toBe('trade_in');
    expect(classifyLeadIntent('I am in Georgia, can you ship it?', context)).toBe('delivery_shipping');
  });

  it('changes strategy by intent', () => {
    const carfaxStrategy = chooseLeadResponseStrategy('condition_history', 'unknown', settings);
    const financeStrategy = chooseLeadResponseStrategy('financing', 'unknown', settings);
    const pictureStrategy = chooseLeadResponseStrategy('media_request', 'unknown', settings);

    expect(carfaxStrategy).toContain('Carfax');
    expect(financeStrategy).toContain('financing');
    expect(pictureStrategy).toContain('pictures');
    expect(carfaxStrategy).not.toBe(financeStrategy);
    expect(financeStrategy).not.toBe(pictureStrategy);
  });

  it('uses remote strategy for out-of-state leads instead of in-store pressure', () => {
    const context = leadContext({
      locationIntel: {
        source: 'zip',
        confidence: 'zip_confirmed',
        classification: 'out_of_state',
        route: 'remote',
        zipCode: '15601',
        city: 'Greensburg',
        state: 'PA',
        label: 'Greensburg PA',
        summary: 'Customer is out of state.',
        nextStep: 'Use remote deal steps.',
        evidence: ['Address: Greensburg PA 15601'],
        askForZip: false,
      },
    });

    expect(classifyLocation(context)).toBe('out_of_state');
    expect(chooseLeadResponseStrategy('appointment_test_drive', 'out_of_state', settings)).toContain('Never ask them to come in today');
  });

  it('builds an OpenAI prompt around the actual customer message and strict JSON output', () => {
    const context = leadContext({
      conversationTimeline: [
        {
          actor: 'customer',
          direction: 'inbound',
          channel: 'text',
          text: 'Can you send the window sticker?',
        },
      ],
    });
    const prompt = buildOpenAILeadResponsePrompt({
      request: request(context),
      user: user(),
      detectedIntent: 'media_request',
      locationCategory: 'unknown',
      chosenStrategy: chooseLeadResponseStrategy('media_request', 'unknown', settings),
      latestCustomerMessage: 'Can you send the window sticker?',
      settings,
    });

    expect(prompt.system).toContain('Return strict JSON only');
    expect(prompt.user).toContain('Can you send the window sticker?');
    expect(prompt.user).toContain('"detectedIntent": "media_request"');
    expect(prompt.user).toContain('"stock": "JW123"');
  });

  it('adds short manager handoff rules when manager mode is selected', () => {
    const context = leadContext({
      conversationTimeline: [
        {
          actor: 'customer',
          direction: 'inbound',
          channel: 'text',
          text: 'I am interested in this Wrangler.',
        },
      ],
    });
    const managerRequest = {
      ...request(context),
      roleMode: 'manager' as const,
      tone: 'manager_takeover' as const,
    };
    const prompt = buildOpenAILeadResponsePrompt({
      request: managerRequest,
      user: user(),
      detectedIntent: 'general_interest',
      locationCategory: 'unknown',
      chosenStrategy: chooseLeadResponseStrategy('general_interest', 'unknown', settings),
      latestCustomerMessage: 'I am interested in this Wrangler.',
      settings,
    });

    expect(prompt.system).toContain('Manager situational mode');
    expect(prompt.system).toContain('First decide the manager job');
    expect(prompt.system).toContain('family-owned');
    expect(prompt.system).toContain('two years');
    expect(prompt.system).toContain('15 years');
    expect(prompt.system).toContain('do not name a specific salesperson');
    expect(prompt.user).toContain('manager can send');
  });

  it('passes different prompts to the LLM for different lead messages', async () => {
    const prompts: string[] = [];
    const fakeLlm: LlmProvider = {
      async generate(input) {
        prompts.push(input.user);
        const text = input.user.includes('Carfax')
          ? 'I can get that Carfax sent over. What email should I send it to?'
          : 'I can help with finance options. Are you planning to apply by yourself or with anyone else?';
        return {
          text: JSON.stringify({
            nextBestAction: 'Use the intent-specific reply.',
            leadScore: 'warm',
            options: [{ label: 'Suggested Response', text }],
          }),
          provider: 'fake',
          model: 'fake',
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    };

    const carfax = await generateLeadResponseWithOpenAI({
      request: request(
        leadContext({
          conversationTimeline: [{ actor: 'customer', direction: 'inbound', channel: 'text', text: 'Can you send the Carfax?' }],
        }),
      ),
      user: user(),
      workflowRules: [],
      llm: fakeLlm,
    });
    const finance = await generateLeadResponseWithOpenAI({
      request: request(
        leadContext({
          conversationTimeline: [{ actor: 'customer', direction: 'inbound', channel: 'text', text: 'Can I get approved with 2k down?' }],
        }),
      ),
      user: user(),
      workflowRules: [],
      llm: fakeLlm,
    });

    expect(carfax.detectedIntent).toBe('condition_history');
    expect(finance.detectedIntent).toBe('financing');
    expect(prompts[0]).toContain('"detectedIntent": "condition_history"');
    expect(prompts[1]).toContain('"detectedIntent": "financing"');
    expect(carfax.result.text).not.toBe(finance.result.text);
  });
});
