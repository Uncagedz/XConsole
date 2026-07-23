import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runConnector, type XConsoleConnector } from './index.js';

const logger = { info: () => undefined, error: () => undefined };

describe('runConnector', () => {
  it('validates structured connector results', async () => {
    const connector: XConsoleConnector<{ source: string }, { vin: string }> = {
      metadata: {
        id: 'fixture',
        displayName: 'Fixture',
        description: 'Synthetic connector',
        capabilities: ['read'],
        executionLocation: 'railway',
        mode: 'fixture',
        approvalRequiredForWrites: true,
      },
      configSchema: z.object({ source: z.string() }),
      healthCheck: async () => ({
        connectorId: 'fixture',
        ok: true,
        checkedAt: new Date().toISOString(),
        authenticationStatus: 'authenticated',
        reauthenticationRequired: false,
        details: {},
      }),
      sync: async () => ({
        connectorId: 'fixture',
        startedAt: '2026-07-23T12:00:00.000Z',
        finishedAt: '2026-07-23T12:00:01.000Z',
        success: true,
        recordsFound: 1,
        recordsCreated: 1,
        recordsUpdated: 0,
        recordsSkipped: 0,
        artifacts: [],
        reauthenticationRequired: false,
        retryCount: 0,
        records: [{ vin: '1HGCM82633A004352' }],
        metadata: {},
      }),
    };
    const result = await runConnector(connector, {
      config: { source: 'fixture' },
      runId: 'run-1',
      attempt: 1,
      approved: false,
      signal: new AbortController().signal,
      logger,
    });
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
  });
});
