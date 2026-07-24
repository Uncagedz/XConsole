import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@drivecentric-ai/shared/xconsole';
import {
  carfaxDossier,
  keyDossier,
  reconDossier,
  sellingDescriptions,
  uniqueFactoryFeatures,
} from './vehicle-intelligence';

const vehicle = {
  vin: '4JGFF5KE9PA946662',
  title: '2023 Mercedes-Benz GLS 450',
  mileage: 74629,
  drivetrain: 'AWD',
  engine: '3.0L Turbo',
  transmission: '9-Speed Automatic',
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
        repairOrders: [{ repairOrder: 'RO-1', technician: 'Jordan', workPerformed: ['Brake pads replaced'] }],
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
});
