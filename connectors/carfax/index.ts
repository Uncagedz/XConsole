import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/summary.json' with { type: 'json' };

export const carfaxConnector = createSkeletonConnector({
  metadata: {
    id: 'carfax',
    displayName: 'CARFAX',
    description: 'Authorized vehicle-history summary connector skeleton.',
    capabilities: ['read', 'download'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['authorized summary page recording', 'report landing-page recording'],
});
