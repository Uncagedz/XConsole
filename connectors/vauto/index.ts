import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/vehicle.json' with { type: 'json' };

export const vautoConnector = createSkeletonConnector({
  metadata: {
    id: 'vauto',
    displayName: 'vAuto',
    description: 'Inventory, pricing, and merchandising portal connector skeleton.',
    capabilities: ['read', 'download'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['active inventory table recording', 'vehicle detail and price history recording'],
});
