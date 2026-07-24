import { describe, expect, it } from 'vitest';
import { normalizePortalFields, parseReconStage } from './portal-result.js';

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
});
