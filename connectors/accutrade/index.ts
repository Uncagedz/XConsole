import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/appraisal.json' with { type: 'json' };

export const accutradeConnector = createSkeletonConnector({
  metadata: {
    id: 'accutrade',
    displayName: 'AccuTrade',
    description: 'Trade appraisal connector skeleton.',
    capabilities: ['read', 'download'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['appraisal list recording', 'appraisal detail recording'],
});
