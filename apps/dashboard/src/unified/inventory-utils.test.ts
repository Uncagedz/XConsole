import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@drivecentric-ai/shared/xconsole';
import { filterAndSortInventory, inventoryBreakdown, vehicleTitle } from './inventory-utils';

const vehicles: Vehicle[] = [
  {
    id: 'one',
    vin: '1HGCM82633A004352',
    title: '2025 Jeep Wrangler Sport',
    stockNumber: 'NEW-1',
    year: 2025,
    make: 'Jeep',
    model: 'Wrangler',
    trim: 'Sport',
    condition: 'new',
    status: 'live',
    mileage: 8,
    retailPrice: 49995,
    daysInStock: 2,
    websiteUrl: 'https://dealer.example/new/NEW-1',
    photos: ['https://dealer.example/photo.jpg'],
    sourceStatuses: [],
    salesTalkingPoints: [],
    lastSynchronizedAt: '2026-07-23T12:00:00.000Z',
  },
  {
    id: 'two',
    vin: '2C4RC1BG3TR186903',
    stockNumber: 'USED-9',
    year: 2022,
    make: 'Chrysler',
    model: 'Pacifica',
    trim: null,
    condition: 'used',
    status: 'live',
    mileage: 32000,
    retailPrice: 26995,
    daysInStock: 20,
    websiteUrl: 'https://dealer.example/used/USED-9',
    photos: [],
    sourceStatuses: [],
    salesTalkingPoints: [],
    lastSynchronizedAt: '2026-07-22T12:00:00.000Z',
  },
];

describe('unified inventory presentation', () => {
  it('searches VIN and stock while applying condition and photo filters', () => {
    expect(filterAndSortInventory(vehicles, {
      query: 'NEW-1',
      condition: 'new',
      photos: 'with-photos',
      sort: 'recent',
    }).map((vehicle) => vehicle.vin)).toEqual(['1HGCM82633A004352']);
    expect(filterAndSortInventory(vehicles, {
      query: '2C4RC1',
      condition: 'used',
      photos: 'needs-photos',
      sort: 'recent',
    }).map((vehicle) => vehicle.stockNumber)).toEqual(['USED-9']);
  });

  it('sorts prices and reports inventory quality', () => {
    expect(filterAndSortInventory(vehicles, {
      query: '',
      condition: 'all',
      photos: 'all',
      sort: 'price-low',
    })[0]?.retailPrice).toBe(26995);
    expect(inventoryBreakdown(vehicles)).toEqual({ new: 1, used: 1, withPhotos: 1 });
    expect(vehicleTitle(vehicles[1]!)).toBe('2022 Chrysler Pacifica');
  });
});
