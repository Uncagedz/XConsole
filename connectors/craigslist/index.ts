import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/draft.json' with { type: 'json' };

export const craigslistConnector = createSkeletonConnector({
  metadata: {
    id: 'craigslist',
    displayName: 'Craigslist',
    description: 'Approval-gated vehicle listing connector skeleton.',
    capabilities: ['read', 'write', 'upload'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['vehicle listing form recording', 'confirmation page recording'],
});
