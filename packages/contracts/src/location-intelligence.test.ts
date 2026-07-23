import { describe, expect, it } from 'vitest';
import { enrichLeadLocation, extractZipCodeFromText, primaryCtaForLocation } from './location-intelligence';
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
    callRecordingLinks: [],
    sentiment: 'neutral',
    leadScore: 'warm',
    ...overrides,
  };
}

describe('location intelligence', () => {
  it('prefers a customer ZIP over dealership address text', () => {
    const zip = extractZipCodeFromText(
      ['Taverna CDJRF 777 N State Road 7 Plantation FL 33317', 'Customer address: Miami FL 33172'].join('\n'),
      { excludeZips: ['33317'] },
    );

    expect(zip).toBe('33172');
  });

  it('classifies confirmed local ZIPs as showroom leads', () => {
    const enriched = enrichLeadLocation(
      context({
        customerLocation: 'Miami FL 33172',
        vehicleOfInterest: '2026 Jeep Wrangler',
      }),
    );

    expect(enriched.customerZipCode).toBe('33172');
    expect(enriched.locationIntel?.confidence).toBe('zip_confirmed');
    expect(enriched.locationIntel?.classification).toBe('local');
    expect(primaryCtaForLocation(enriched.locationIntel, 'bdc')).toBe('Bring Them In');
  });

  it('classifies far Florida ZIPs as confirm-before-trip leads', () => {
    const enriched = enrichLeadLocation(
      context({
        customerLocation: 'Jacksonville FL 32202',
        vehicleOfInterest: '2026 Ram 1500',
      }),
    );

    expect(enriched.locationIntel?.classification).toBe('local_far');
    expect(enriched.locationIntel?.route).toBe('showroom');
    expect(primaryCtaForLocation(enriched.locationIntel, 'salesperson')).toBe('Confirm Before Trip');
  });

  it('uses phone area only as an estimated lower-confidence clue', () => {
    const enriched = enrichLeadLocation(
      context({
        phoneNumbers: ['(404) 555-1212'],
        visibleText: 'Taverna Chrysler Dodge Jeep Ram FIAT 777 N State Road 7 Plantation FL 33317',
      }),
    );

    expect(enriched.locationIntel?.confidence).toBe('estimated_from_phone');
    expect(enriched.locationIntel?.classification).toBe('out_of_state');
    expect(enriched.locationIntel?.askForZip).toBe(true);
  });
});
