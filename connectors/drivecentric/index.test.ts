import { describe, expect, it } from 'vitest';
import { driveCentricConnector } from './index.js';

describe('DriveCentric connector', () => {
  it('accepts the synthetic normalized extension context', async () => {
    const result = await driveCentricConnector.sync({
      config: { mode: 'fixture', gatewayUrl: 'http://127.0.0.1:3001' },
      runId: 'fixture',
      attempt: 1,
      approved: false,
      signal: new AbortController().signal,
      logger: { info: () => undefined, error: () => undefined },
    });
    expect(result.recordsFound).toBe(1);
    expect(result.metadata.explicitSendOnly).toBe(true);
  });
});
