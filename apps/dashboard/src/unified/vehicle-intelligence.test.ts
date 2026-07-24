import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@drivecentric-ai/shared/xconsole';
import {
  carfaxDossier,
  keyDossier,
  reconDossier,
  sellingDescriptions,
  uniqueFactoryFeatures,
  vehicleCapabilities,
  vehiclePowertrain,
} from './vehicle-intelligence';

const vehicle = {
  vin: '4JGFF5KE9PA946662',
  title: '2023 Mercedes-Benz GLS 450',
  mileage: 74629,
  drivetrain: 'AWD',
  engine: '3.0L Turbo',
  transmission: '9-Speed Automatic',
  bodyStyle: 'SUV',
  fuelType: 'Gasoline',
  powertrainType: 'Gasoline',
  mpgCity: 18,
  mpgHighway: 23,
  estimatedRangeMiles: 506,
  fuelTankGallons: 23.8,
  exteriorColor: 'Polar White',
  reconStage: 'Archived',
  reconOpenWork: [],
  frontlineReady: true,
  keyLocation: 'Drawer 3',
  keyHolder: null,
  photos: [],
} as unknown as Vehicle;

const assets = {
  vin: vehicle.vin,
  sticker_highlights: ['Engine: 3.0L', 'Driver Assistance Package', 'Panoramic moonroof'],
  quick_specs: {
    third_row_seats: 'split-bench',
    curb_weight: '2,480kg (5,467lbs)',
    max_towing_capacity: '7,700lbs',
    horsepower: '362hp @ 5,500RPM',
    torque: '369 lb.-ft. @ 1,600RPM',
  },
  marketing_summary: ['Burmester premium audio'],
  source_intelligence: {
    carfax: {
      observedAt: '2026-07-23T12:00:00.000Z',
      fields: {
        owners: 1,
        accidents: 1,
        serviceRecords: 16,
        titleStatus: 'No branded title reported',
        highlights: ['1 owner vehicle'],
      },
    },
    reconvision: {
      fields: {
        stage: 'Archived',
        workSummary: 'Brake pads replaced',
        repairOrders: [{
          repairOrder: 'RO-1',
          technician: 'Jordan',
          workPerformed: ['Brake pads replaced'],
          lastRepairAt: '07/20/2026 4:30PM',
          lastRepairTechnician: 'Jordan',
          lastRepairWork: 'Brake pads replaced',
          lastServiceAt: '07/20/2026 4:30PM',
          lastServiceBy: 'Jordan',
          lastServiceWork: 'Brake pads replaced',
        }],
        lastRepairAt: '07/20/2026 4:30PM',
        lastRepairTechnician: 'Jordan',
        lastRepairWork: 'Brake pads replaced',
      },
    },
    onemicro: {
      fields: {
        location: 'Drawer 3',
        lastCheckedOutBy: 'Taylor',
        lastCheckedOutAt: '07/23/2026 2:15 PM',
        keyImageUrl: 'https://example.com/key.jpg',
      },
    },
  },
} as never;

describe('VIN evidence model', () => {
  it('prefers detailed dealer CARFAX and preserves recon/key evidence', () => {
    expect(carfaxDossier(assets)).toMatchObject({ owners: 1, accidents: 1, serviceRecords: 16, dealerVerified: true });
    expect(reconDossier(assets, vehicle).orders[0]).toMatchObject({ technician: 'Jordan' });
    expect(keyDossier(assets, vehicle)).toMatchObject({ lastCheckedOutBy: 'Taylor', keyImageUrl: 'https://example.com/key.jpg' });
  });

  it('prioritizes differentiating equipment and writes evidence-bound copy', () => {
    expect(uniqueFactoryFeatures(assets)).toEqual([
      'Driver Assistance Package',
      'Panoramic moonroof',
    ]);
    const copy = sellingDescriptions(vehicle, assets);
    expect(copy.summary).toContain('Driver Assistance Package');
    expect(copy.detailed).toContain('16 documented service records');
    expect(copy.detailed).toContain('1 accident event');
  });

  it('summarizes capability facts separately from special equipment', () => {
    expect(vehicleCapabilities(assets)).toEqual([
      { key: 'third_row_seats', label: 'Third row', value: 'split-bench' },
      { key: 'max_towing_capacity', label: 'Max towing', value: '7,700lbs' },
      { key: 'curb_weight', label: 'Curb weight', value: '2,480kg (5,467lbs)' },
      { key: 'horsepower', label: 'Horsepower', value: '362hp @ 5,500RPM' },
      { key: 'torque', label: 'Torque', value: '369 lb.-ft. @ 1,600RPM' },
    ]);
    expect(sellingDescriptions(vehicle, assets).summary).toContain('Capability:');
  });

  it('summarizes powertrain, range, fuel tank, and last repair ownership', () => {
    expect(vehiclePowertrain(vehicle, assets)).toEqual(expect.arrayContaining([
      { key: 'powertrain', label: 'Powertrain', value: 'Gasoline' },
      { key: 'range', label: 'Estimated range', value: '506 mi' },
      { key: 'fuel-tank', label: 'Fuel tank', value: '23.8 gal' },
    ]));
    expect(reconDossier(assets, vehicle)).toMatchObject({
      repairOrderCount: 1,
      lastRepairTechnician: 'Jordan',
      lastRepairWork: 'Brake pads replaced',
    });
    expect(sellingDescriptions(vehicle, assets).summary).toContain('Latest repair: Brake pads replaced by Jordan');
  });
});
