import { describe, expect, it } from 'vitest';
import { accutradeConnector } from '../accutrade/index.js';
import { carfaxConnector } from '../carfax/index.js';
import { craigslistConnector } from '../craigslist/index.js';
import { offerupConnector } from '../offerup/index.js';
import { onemicroConnector } from '../onemicro/index.js';
import { reconvisionConnector } from '../reconvision/index.js';
import { reynoldsConnector } from '../reynolds/index.js';
import { vautoConnector } from '../vauto/index.js';
import { windowStickerConnector } from '../window-sticker/index.js';

const skeletons = [
  vautoConnector,
  reconvisionConnector,
  onemicroConnector,
  carfaxConnector,
  windowStickerConnector,
  accutradeConnector,
  reynoldsConnector,
  craigslistConnector,
  offerupConnector,
];

describe.each(skeletons)('$metadata.id skeleton', (connector) => {
  it('has synthetic fixtures and fails closed until configured', async () => {
    expect(connector.requiredPortalInformation.length).toBeGreaterThan(0);
    const fixture = await connector.sync({
      config: connector.configSchema.parse({ mode: 'fixture' }),
      runId: 'fixture',
      attempt: 1,
      approved: false,
      signal: new AbortController().signal,
      logger: { info: () => undefined, error: () => undefined },
    });
    expect(fixture.success).toBe(true);
    expect(fixture.metadata.mode).toBe('fixture');

    const unconfigured = await connector.sync({
      config: connector.configSchema.parse({ mode: 'recording' }),
      runId: 'recording',
      attempt: 1,
      approved: false,
      signal: new AbortController().signal,
      logger: { info: () => undefined, error: () => undefined },
    });
    expect(unconfigured.success).toBe(false);
    expect(unconfigured.errorType).toBe('configuration');
  });
});
