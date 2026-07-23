import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/key.json' with { type: 'json' };

export const onemicroConnector = createSkeletonConnector({
  metadata: {
    id: 'onemicro',
    displayName: '1Micro',
    description: 'Vehicle key-location and key-holder connector skeleton.',
    capabilities: ['read'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['key search result recording', 'key-holder detail recording'],
});
