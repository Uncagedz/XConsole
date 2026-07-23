import { describe, expect, it } from 'vitest';
import { buildNeedsAnalysis, buildSalesInfluencePlan, buildSalesPressureTest } from './sales-playbook';

describe('buildSalesPressureTest', () => {
  it('stress-tests finance and credit objections without approval promises', () => {
    const test = buildSalesPressureTest(
      {
        customerName: 'Aaron Witty',
        vehicleOfInterest: '2021 Jeep Wrangler',
        paymentBudgetHints: 'Customer asked about payment and approval before coming in.',
        priorMessages: ['Can you get me approved and around $500 a month?'],
        phoneNumbers: [],
        emails: [],
        personalizationSignals: [],
        timestamps: [],
        conversationTimeline: [],
        crmAutomationHints: [],
        sentiment: 'neutral',
        leadScore: 'hot',
      },
      'finance_push',
    );

    expect(test.detectedObjections.map((item) => item.key)).toContain('payment_finance');
    expect(test.detectedObjections.map((item) => item.key)).toContain('credit_risk');
    expect(test.financePath.join(' ')).toMatch(/not guaranteed approval/i);
    expect(test.responseChecklist.join(' ')).toMatch(/No fake urgency/i);
  });

  it('spots remote third-party logistics and changes the close path', () => {
    const test = buildSalesPressureTest({
      customerName: 'Aaron Witty',
      customerLocation: 'Boston MA',
      vehicleOfInterest: '2021 Jeep Wrangler',
      priorMessages: ['Can someone on my behalf see the car near Plantation tomorrow?'],
      phoneNumbers: ['(978) 888-1501'],
      emails: [],
      personalizationSignals: ['Customer has family near the store.'],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'positive',
      leadScore: 'hot',
    });

    expect(test.detectedObjections.map((item) => item.key)).toContain('distance_logistics');
    expect(test.detectedObjections.map((item) => item.key)).toContain('third_party_decision');
    expect(test.closePath.join(' ')).toMatch(/remote verification|video|numbers review|pickup|shipping/i);
  });

  it('does not call every lead a price shopper because generic page text mentions price or finance', () => {
    const test = buildSalesPressureTest({
      customerName: 'Glen',
      vehicleOfInterest: '2025 Jeep Gladiator',
      visibleText: 'Vehicle price Payment Finance Taverna Chrysler Dodge Jeep Ram website footer',
      priorMessages: ['Do you still have this Gladiator?'],
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'neutral',
      leadScore: 'warm',
    });

    expect(test.detectedObjections.map((item) => item.key)).not.toContain('price_shopping');
    expect(test.detectedObjections.map((item) => item.key)).toContain('availability_condition');
  });
});

describe('buildNeedsAnalysis', () => {
  it('prioritizes finance when payment or credit is the active need', () => {
    const analysis = buildNeedsAnalysis({
      customerName: 'Aaron',
      vehicleOfInterest: '2021 Jeep Wrangler',
      paymentBudgetHints: 'Customer asked for $500 payment and approval before coming in.',
      priorMessages: ['Can you get me financed with my trade?'],
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'neutral',
      leadScore: 'hot',
    });

    expect(analysis.priority).toBe('finance');
    expect(analysis.financeGoal).toMatch(/finance review/i);
    expect(analysis.responseChecklist.join(' ')).toMatch(/distance alone is not a credit-app reason/i);
  });
});

describe('buildSalesInfluencePlan', () => {
  it('uses finance path when payment is the hinge', () => {
    const plan = buildSalesInfluencePlan(
      {
        customerName: 'Aaron',
        vehicleOfInterest: '2021 Jeep Wrangler',
        paymentBudgetHints: 'Customer wants approval and a $500 payment.',
        priorMessages: ['Can you get me approved around $500 a month?'],
        phoneNumbers: [],
        emails: [],
        personalizationSignals: [],
        timestamps: [],
        conversationTimeline: [],
        crmAutomationHints: [],
        sentiment: 'neutral',
        leadScore: 'hot',
      },
      'finance_push',
    );

    expect(plan.primaryStyle).toBe('finance_path');
    expect(plan.closeMove).toMatch(/credit app|finance/i);
    expect(plan.avoid.join(' ')).toMatch(/promise approval/i);
  });

  it('uses remote confidence before asking out-of-state buyers to travel', () => {
    const plan = buildSalesInfluencePlan({
      customerName: 'Glen',
      customerLocation: 'Atlanta GA',
      vehicleOfInterest: '2025 Jeep Gladiator',
      priorMessages: ['I am in Georgia. Can you ship it?'],
      phoneNumbers: ['(404) 555-1212'],
      emails: [],
      personalizationSignals: [],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'neutral',
      leadScore: 'warm',
    });

    expect(plan.primaryStyle).toBe('remote_confidence');
    expect(plan.openingMove).toMatch(/remote process/i);
    expect(plan.closeMove).toMatch(/video|numbers|pickup|shipping/i);
  });

  it('does not turn an out-of-state buyer into an appointment need', () => {
    const analysis = buildNeedsAnalysis({
      customerName: 'Doug',
      customerLocation: 'Greensburg PA 15601',
      vehicleOfInterest: '2026 Jeep Grand Cherokee L',
      priorMessages: ['If the numbers and condition check out I would want to see it.'],
      locationIntel: {
        source: 'zip',
        confidence: 'zip_confirmed',
        classification: 'out_of_state',
        route: 'remote',
        zipCode: '15601',
        city: 'Greensburg',
        state: 'PA',
        label: 'Greensburg, PA 15601',
        summary: 'Customer is out of state.',
        nextStep: 'Build remote confidence first.',
        evidence: ['zip:15601'],
        askForZip: false,
      },
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'neutral',
      leadScore: 'hot',
    });

    expect(analysis.priority).not.toBe('appointment');
    expect(analysis.nextBestQuestion).not.toMatch(/time window|see it/i);
    expect(analysis.missingSignals.join(' ')).toMatch(/remote next step/i);
  });

  it('uses manager restore when trust is at risk', () => {
    const plan = buildSalesInfluencePlan({
      customerName: 'Mia',
      vehicleOfInterest: '2024 Ram 1500',
      priorMessages: ['I do not want a runaround. Is this price real?'],
      phoneNumbers: [],
      emails: [],
      personalizationSignals: [],
      timestamps: [],
      conversationTimeline: [],
      crmAutomationHints: [],
      sentiment: 'negative',
      leadScore: 'warm',
    });

    expect(plan.primaryStyle).toBe('manager_restore');
    expect(plan.openingMove).toMatch(/de-escalate|trust|transparent/i);
    expect(plan.coachChecklist.join(' ')).toMatch(/proof point/i);
  });
});
