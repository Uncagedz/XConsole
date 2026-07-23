import { describe, expect, it } from 'vitest';
import { ResponseEvaluatorService } from '../src/services/response-evaluator.service.js';

describe('ResponseEvaluatorService', () => {
  it('flags fabricated approval language', () => {
    const evaluator = new ResponseEvaluatorService();
    const result = evaluator.evaluate('You are approved and I guarantee this price. Can you come in today?');

    expect(result.flags).toContain('possible_compliance_violation');
    expect(result.score).toBeLessThan(60);
  });

  it('rewards concise appointment pushes', () => {
    const evaluator = new ResponseEvaluatorService();
    const result = evaluator.evaluate(
      'Great pick. I can verify it and have it ready. Would 4:15 or 6:00 today work better?',
    );

    expect(result.flags).not.toContain('weak_next_step');
    expect(result.score).toBeGreaterThan(80);
  });

  it('scores STOP leads cold even when the page has hot buying words', () => {
    const evaluator = new ResponseEvaluatorService();
    const score = evaluator.scoreLead(
      '2025 Jeep Gladiator available today trade payment appointment',
      ['Customer replied STOP'],
      {
        customerName: 'Glen',
        vehicleOfInterest: '2025 Jeep Gladiator',
        phoneNumbers: [],
        emails: [],
        personalizationSignals: [],
        timestamps: [],
        priorMessages: ['Customer replied STOP'],
        conversationTimeline: [],
        crmAutomationHints: [],
        visibleText: '2025 Jeep Gladiator available today trade payment appointment. Customer replied STOP.',
        sentiment: 'neutral',
        leadScore: 'hot',
      },
    );

    expect(score).toBe('cold');
  });
});
