import { describe, expect, it } from 'vitest';
import type { ReadPageResponse } from '../shared/messages';
import { deriveConversationState } from './fumble-queue';

function pageWithTimeline(timeline: NonNullable<ReadPageResponse['context']['conversationTimeline']>): ReadPageResponse {
  return {
    conversationId: 'lead-1',
    isLeadPage: true,
    pageTitle: 'Lead',
    url: 'https://app.drivecentric.com/#/pipeline/sales',
    context: {
      customerName: 'Pedro Crespo',
      salespersonName: 'Ani Sharma',
      timestamps: [],
      priorMessages: [],
      conversationTimeline: timeline,
      crmAutomationHints: [],
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      sentiment: 'neutral',
      leadScore: 'warm',
    },
  };
}

describe('deriveConversationState', () => {
  it('marks the lead as waiting on sales when the customer spoke last', () => {
    const state = deriveConversationState(
      pageWithTimeline([
        {
          actor: 'customer',
          direction: 'inbound',
          channel: 'text',
          speakerName: 'Pedro Crespo',
          timestampLabel: 'Today at 3:34 PM',
          timestampIso: '2026-04-24T15:34:00.000Z',
          text: 'Is the truck still available?',
        },
        {
          actor: 'salesperson',
          direction: 'outbound',
          channel: 'text',
          speakerName: 'Ani Sharma',
          timestampLabel: 'Today at 3:12 PM',
          timestampIso: '2026-04-24T15:12:00.000Z',
          text: 'I can help with that.',
        },
      ]),
    );

    expect(state.needsReply).toBe(true);
    expect(state.waitingOn).toBe('salesperson');
    expect(state.lastCustomerLabel).toBe('Today at 3:34 PM');
  });

  it('stays quiet when a human salesperson replied after the customer', () => {
    const state = deriveConversationState(
      pageWithTimeline([
        {
          actor: 'salesperson',
          direction: 'outbound',
          channel: 'text',
          speakerName: 'Ani Sharma',
          timestampLabel: 'Today at 3:40 PM',
          timestampIso: '2026-04-24T15:40:00.000Z',
          text: 'Would 4:15 or 6:00 work better?',
        },
        {
          actor: 'customer',
          direction: 'inbound',
          channel: 'text',
          speakerName: 'Pedro Crespo',
          timestampLabel: 'Today at 3:34 PM',
          timestampIso: '2026-04-24T15:34:00.000Z',
          text: 'Is the truck still available?',
        },
      ]),
    );

    expect(state.needsReply).toBe(false);
    expect(state.waitingOn).toBe('customer');
    expect(state.lastSalespersonLabel).toBe('Today at 3:40 PM');
  });
});
