import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/sticker.json' with { type: 'json' };

export const windowStickerConnector = createSkeletonConnector({
  metadata: {
    id: 'window-sticker',
    displayName: 'Window Sticker',
    description: 'Window-sticker URL/file import connector skeleton.',
    capabilities: ['read', 'download', 'upload'],
    executionLocation: 'railway',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), sourceUrl: z.string().url().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['authorized sticker URL pattern or sanitized source file'],
});
