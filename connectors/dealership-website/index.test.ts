import { describe, expect, it } from 'vitest';
import { normalizeWebsiteVehicle } from './index.js';

describe('dealership website connector', () => {
  it('normalizes a legacy vehicle by VIN', () => {
    const record = normalizeWebsiteVehicle({
      vin: '1hgcm82633a004352',
      stock_number: 'SYN-1',
      price: '$28,995',
    });
    expect(record.vin).toBe('1HGCM82633A004352');
    expect(record.retailPrice).toBe(28995);
  });
});
