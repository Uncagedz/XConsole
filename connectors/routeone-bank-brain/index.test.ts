import { describe, expect, it } from 'vitest';
import { routeOneBankBrainConnector } from './index.js';

describe('RouteOne / Bank Brain wrapper', () => {
  it('marks extracted lender information for human review', async () => {
    const result = await routeOneBankBrainConnector.sync({
      config: {
        mode: 'fixture',
        legacyApiBaseUrl: 'http://127.0.0.1:8100',
        reloadSalesData: true,
        maxLinkDepth: 1,
        maxLinksPerResource: 12,
      },
      runId: 'fixture',
      attempt: 1,
      approved: false,
      signal: new AbortController().signal,
      logger: { info: () => undefined, error: () => undefined },
    });
    expect(result.metadata.humanReviewRequired).toBe(true);
  });
});
