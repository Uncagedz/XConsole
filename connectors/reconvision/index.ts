import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/recon.json' with { type: 'json' };

export const reconvisionConnector = createSkeletonConnector({
  metadata: {
    id: 'reconvision',
    displayName: 'ReconVision',
    description: 'Recon stage and open-work connector skeleton.',
    capabilities: ['read'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), recordingPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['vehicle queue recording', 'recon work-order detail recording'],
});
