import { describe, expect, it } from 'vitest';
import { extractCarfaxSignals } from '@/lib/meta';

describe('extractCarfaxSignals', () => {
  it('detects owners, accidents, warranty miles, and salt states', () => {
    const sample = `1 Owner vehicle with 0 accidents reported. Service Records: 5 documented visits.
      Certified coverage with Warranty remaining 25,000 miles. Vehicle history across NJ & VT.`;

    const result = extractCarfaxSignals(sample);

    expect(result.owners).toBe(1);
    expect(result.accidents).toBe(0);
    expect(result.serviceRecords).toBe(5);
    expect(result.warrantyRemainingMi).toBe(25000);
    expect(result.states).toEqual(['NJ', 'VT']);
  });
});
