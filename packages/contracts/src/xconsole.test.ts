import { describe, expect, it } from 'vitest';
import { connectorSyncResultSchema, vinSchema } from './xconsole.js';

describe('XConsole contracts', () => {
  it('normalizes and validates a VIN', () => {
    expect(vinSchema.parse('1hgcm82633a004352')).toBe('1HGCM82633A004352');
    expect(() => vinSchema.parse('INVALID')).toThrow();
  });

  it('accepts a complete successful connector result', () => {
    const result = connectorSyncResultSchema.parse({
      connectorId: 'dealership-website',
      startedAt: '2026-07-23T12:00:00.000Z',
      finishedAt: '2026-07-23T12:00:01.000Z',
      success: true,
      recordsFound: 2,
      recordsCreated: 1,
      recordsUpdated: 1,
      recordsSkipped: 0,
      reauthenticationRequired: false,
      retryCount: 0,
    });
    expect(result.records).toEqual([]);
    expect(result.artifacts).toEqual([]);
  });

  it('rejects an unclassified failure', () => {
    expect(() =>
      connectorSyncResultSchema.parse({
        connectorId: 'vauto',
        startedAt: '2026-07-23T12:00:00.000Z',
        finishedAt: '2026-07-23T12:00:01.000Z',
        success: false,
        recordsFound: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        reauthenticationRequired: false,
        retryCount: 0,
      }),
    ).toThrow();
  });
});
