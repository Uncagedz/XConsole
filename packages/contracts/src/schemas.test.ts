import { describe, expect, it } from 'vitest';
import { aiFeedbackRequestSchema, aiGenerateRequestSchema } from './schemas.ts';

describe('aiGenerateRequestSchema', () => {
  it('accepts a minimal valid SMS generation request', () => {
    const parsed = aiGenerateRequestSchema.parse({
      action: 'generate_reply',
      channel: 'sms',
      tone: 'standard_closer',
      conversationId: 'lead-123',
      leadContext: {
        customerName: 'Jordan',
        vehicleOfInterest: '2024 Honda Accord EX',
      },
    });

    expect(parsed.leadContext.leadScore).toBe('warm');
    expect(parsed.leadContext.sentiment).toBe('unknown');
  });
});

describe('aiFeedbackRequestSchema', () => {
  it('accepts a compact learning signal for a generated reply', () => {
    const parsed = aiFeedbackRequestSchema.parse({
      conversationId: 'lead-123',
      channel: 'sms',
      action: 'finance_push',
      selectedText: 'Avery, I can have finance compare real options before you stop in.',
      outcome: 'finance_path',
    });

    expect(parsed.outcome).toBe('finance_path');
  });
});
