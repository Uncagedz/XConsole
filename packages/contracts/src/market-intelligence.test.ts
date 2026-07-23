import { describe, expect, it } from 'vitest';
import { analyzeLeadMarket, buildBuyerProfile, recommendInventoryForLead } from './market-intelligence';
import type { LeadContext, InventoryVehicle } from './types';

function leadContext(overrides: Partial<LeadContext>): LeadContext {
  return {
    phoneNumbers: [],
    emails: [],
    personalizationSignals: [],
    timestamps: [],
    priorMessages: [],
    crmAutomationHints: [],
    sentiment: 'neutral',
    leadScore: 'warm',
    ...overrides,
  };
}

describe('market intelligence', () => {
  it('classifies Plantation-area Florida leads as showroom opportunities', () => {
    const context = leadContext({
      customerLocation: 'Miami FL 33172',
      phoneNumbers: ['(786) 290-4572'],
      vehicleOfInterest: '2026 Ram 1500',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.marketType).toBe('local');
    expect(insight.route).toBe('showroom');
    expect(insight.landmark).toContain('Dolphin');
  });

  it('maps Broward and Miami-Dade ZIP codes to authentic local anchors', () => {
    const context = leadContext({
      customerLocation: 'Sunrise FL 33323',
      vehicleOfInterest: '2026 Jeep Grand Cherokee',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.marketType).toBe('local');
    expect(insight.route).toBe('showroom');
    expect(insight.landmark).toMatch(/Sawgrass|Amerant/i);
  });

  it('classifies explicit non-Florida leads as remote-first', () => {
    const context = leadContext({
      customerLocation: 'Tulsa OK 74103',
      phoneNumbers: ['(918) 555-1234'],
      vehicleOfInterest: '2026 Jeep Wrangler',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.marketType).toBe('out_of_state');
    expect(insight.route).toBe('remote');
    expect(insight.nextStep).toMatch(/availability|condition|numbers|pickup|shipping/i);
  });

  it('uses a Georgia phone area code as a remote buyer clue when no address is present', () => {
    const context = leadContext({
      phoneNumbers: ['(404) 555-1212'],
      visibleText: 'Taverna Chrysler Dodge Jeep Ram FIAT 777 N State Road 7 Plantation FL 33317',
      vehicleOfInterest: '2025 Jeep Gladiator',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.marketType).toBe('out_of_state');
    expect(insight.route).toBe('remote');
    expect(insight.state).toBe('GA');
    expect(insight.summary).toMatch(/out-of-state|Atlanta/i);
    expect(insight.talkingPoints.join(' ')).toMatch(/lemon pepper|shipping|payment|approval/i);
  });

  it('handles non-local ZIP clues beyond Georgia without forcing a store visit', () => {
    const context = leadContext({
      customerLocation: '40427',
      vehicleOfInterest: '2025 Jeep Gladiator',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.route).toBe('remote');
    expect(insight.zip).toBe('40427');
    expect(insight.summary).toMatch(/non-local|Plantation visit/i);
    expect(insight.talkingPoints.join(' ')).toMatch(/rapport|shipping|payment|approval/i);
  });

  it('keeps longer in-state Florida ZIPs as drive-in leads instead of instant stop-ins', () => {
    const context = leadContext({
      customerLocation: 'Jacksonville FL 32202',
      vehicleOfInterest: '2026 Ram 1500',
    });

    const insight = analyzeLeadMarket(context);

    expect(insight.marketType).toBe('regional');
    expect(insight.route).toBe('showroom');
    expect(insight.nextStep).toMatch(/drive|visit|call/i);
  });

  it('recommends used inventory when payment sensitivity is present', () => {
    const context = leadContext({
      vehicleOfInterest: '2026 Ram 1500',
      paymentBudgetHints: 'Trying to stay around the same monthly payment',
      visibleText: 'Need to keep the monthly payment reasonable',
    });
    const insight = analyzeLeadMarket(context);
    const vehicles: InventoryVehicle[] = [
      {
        id: 'used-1',
        source: 'used',
        title: '2024 Ram 1500 Big Horn',
        make: 'Ram',
        model: '1500',
        strategy: 'Used truck angle',
      },
      {
        id: 'new-1',
        source: 'new',
        title: '2026 Jeep Wrangler Sport',
        make: 'Jeep',
        model: 'Wrangler',
        strategy: 'Wrangler angle',
      },
    ];

    const recommendations = recommendInventoryForLead(context, vehicles, insight);
    const buyer = buildBuyerProfile(context, insight);

    expect(recommendations[0]?.title).toContain('Ram 1500');
    expect(recommendations[0]?.recommendationReason).toMatch(/payment|match|fit/i);
    expect(buyer.affordabilityRead).toMatch(/money matters/i);
  });
});
