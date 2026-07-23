import { describe, expect, it } from 'vitest';
import { runConnector } from '@xconsole/connector-sdk';
import { facebookMarketplaceConnector } from './index.js';

describe('facebook marketplace wrapper', () => {
  it('preserves fixture draft mode without live posting', async () => {
    const result = await runConnector(facebookMarketplaceConnector, {
      config: { mode: 'fixture', vin: '1HGCM82633A004352' },
      runId: 'fixture',
      attempt: 1,
      approved: true,
      signal: new AbortController().signal,
      logger: { info: () => undefined, error: () => undefined },
    });
    expect(result.success).toBe(true);
    expect(result.metadata.liveTested).toBe(false);
  });
});
