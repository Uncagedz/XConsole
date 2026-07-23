import { describe, expect, it } from 'vitest';
import { applyCommunicationCompliance, detectCommunicationCompliance } from './communication-compliance';
import type { LeadContext } from './types';

function context(overrides: Partial<LeadContext>): LeadContext {
  return {
    phoneNumbers: [],
    emails: [],
    personalizationSignals: [],
    timestamps: [],
    priorMessages: [],
    conversationTimeline: [],
    crmAutomationHints: [],
    sentiment: 'neutral',
    leadScore: 'warm',
    ...overrides,
  };
}

describe('detectCommunicationCompliance', () => {
  it('treats customer STOP with no later START as an SMS opt-out', () => {
    const compliance = detectCommunicationCompliance(
      context({
        customerName: 'Glen',
        vehicleOfInterest: '2025 Jeep Gladiator',
        conversationTimeline: [
          {
            actor: 'customer',
            direction: 'inbound',
            channel: 'text',
            timestampIso: '2026-04-25T12:00:00.000Z',
            text: 'STOP',
          },
        ],
      }),
    );

    expect(compliance.status).toBe('sms_opt_out');
    expect(compliance.reason).toMatch(/opted out/i);
  });

  it('clears the opt-out only when a later START appears', () => {
    const compliance = detectCommunicationCompliance(
      context({
        conversationTimeline: [
          {
            actor: 'customer',
            direction: 'inbound',
            channel: 'text',
            timestampIso: '2026-04-25T12:00:00.000Z',
            text: 'STOP',
          },
          {
            actor: 'customer',
            direction: 'inbound',
            channel: 'text',
            timestampIso: '2026-04-25T12:05:00.000Z',
            text: 'START',
          },
        ],
      }),
    );

    expect(compliance.status).toBe('clear');
  });

  it('ignores automated footer language', () => {
    const compliance = detectCommunicationCompliance(
      context({
        priorMessages: ['Claire Parker: Thanks for reaching out. Reply STOP at any time.'],
      }),
    );

    expect(compliance.status).toBe('clear');
  });

  it('does not treat stop-by appointment language as an opt-out', () => {
    const compliance = detectCommunicationCompliance(
      context({
        priorMessages: [
          'Glen asked if he can stop by Saturday to see the Gladiator.',
          'Owner Admin: I can make the stop quick and verify the numbers first.',
        ],
        visibleText: 'Can I stop by after work or is tomorrow better?',
      }),
    );

    expect(compliance.status).toBe('clear');
  });

  it('does not treat sales-book style stop wording as an opt-out', () => {
    const compliance = detectCommunicationCompliance(
      context({
        visibleText: [
          'Coach notes',
          'Stop wasting the customer time by guessing.',
          'Start with a useful question and keep the conversation moving.',
          'Customer wants a video and numbers before driving.',
        ].join('\n'),
      }),
    );

    expect(compliance.status).toBe('clear');
  });

  it('still catches customer STOP when the full page also contains a STOP footer', () => {
    const compliance = detectCommunicationCompliance(
      context({
        customerName: 'Glen',
        visibleText: [
          'Conversation',
          'Owner Admin: I can get you numbers today. Reply STOP at any time.',
          'Glen Today at 2:12 PM',
          'STOP',
          'Vehicle 2025 Jeep Gladiator Nighthawk available trade finance appointment',
        ].join('\n'),
      }),
    );

    expect(compliance.status).toBe('sms_opt_out');
    expect(compliance.evidence.join(' ')).toMatch(/\bSTOP\b/i);
  });

  it('does not clear a STOP because the page has a generic Start control', () => {
    const compliance = detectCommunicationCompliance(
      context({
        customerName: 'Glen',
        visibleText: [
          'Glen Today at 2:12 PM',
          'STOP',
          'Actions',
          'Start',
          'New Deal',
        ].join('\n'),
      }),
    );

    expect(compliance.status).toBe('sms_opt_out');
  });

  it('forces blocked leads to cold and negative', () => {
    const blocked = applyCommunicationCompliance(
      context({
        leadScore: 'hot',
        visibleText: 'Customer said please stop texting me but the lead also has appointment and trade language.',
      }),
    );

    expect(blocked.communicationCompliance?.status).toBe('sms_opt_out');
    expect(blocked.leadScore).toBe('cold');
    expect(blocked.sentiment).toBe('negative');
  });
});
