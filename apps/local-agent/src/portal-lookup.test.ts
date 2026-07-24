import { describe, expect, it } from 'vitest';
import { normalizePortalFields, parseCarfaxReport, parseReconStage } from './portal-result.js';

describe('portal VIN result normalization', () => {
  it('normalizes ReconVision fields without inventing missing values', () => {
    expect(normalizePortalFields('reconvision', {
      stage: ' Mechanical ',
      openWork: 'Inspection\n• Tires; Detail',
      frontlineReady: 'Not ready',
    })).toEqual({
      stage: 'Mechanical',
      openWork: ['Inspection', 'Tires', 'Detail'],
      frontlineReady: false,
    });
  });

  it('normalizes 1Micro key location and holder', () => {
    expect(normalizePortalFields('onemicro', {
      location: ' Key cabinet 4 ',
      holder: ' Service lane ',
    })).toEqual({
      location: 'Key cabinet 4',
      holder: 'Service lane',
    });
  });

  it('reads the ReconVision department from its live result table layout', () => {
    expect(parseReconStage(
      'invoice\tdepartment\tupdated\nTVC3701099\tArchived\t02/19/2026 10:40AM',
    )).toBe('Archived');
  });

  it('parses dealer CARFAX highlights without treating the report fee as vehicle value', () => {
    const summary = [
      'CARFAX Report',
      'US $49.99',
      '74,635 mi',
      'Accident Reported',
      '16 Service History Records',
      'CARFAX 1-Owner Vehicle',
      'Event 1',
      'Accident reported: 05/15/2024.',
      'CARFAX History-Based Value',
      '$41,912',
      'No total loss reported to CARFAX.',
      'No airbag deployment reported to CARFAX.',
      'No indication of an odometer rollback.',
      'No open recalls reported to CARFAX.',
    ].join('\n');

    expect(parseCarfaxReport(summary, 'https://www.carfaxonline.com/vhr/4JGFF5KE9PA946662')).toEqual({
      owners: 1,
      accidents: 1,
      service: '16 service history records',
      serviceRecords: 16,
      carfaxValue: 41912,
      mileage: 74635,
      highlights: [
        '1 owner vehicle',
        '1 accident event reported',
        '16 service history records',
        'No total loss reported',
        'No airbag deployment reported',
        'No odometer rollback indicated',
        'No open recalls reported',
      ],
      reportUrl: 'https://www.carfaxonline.com/vhr/4JGFF5KE9PA946662',
    });
  });
});
