import { createSkeletonConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixture from './fixtures/cit-record.json' with { type: 'json' };

export const reynoldsConnector = createSkeletonConnector({
  metadata: {
    id: 'reynolds',
    displayName: 'Reynolds & Reynolds',
    description: 'Authorized report import and CIT-monitor connector skeleton.',
    capabilities: ['read', 'download', 'upload'],
    executionLocation: 'local-agent',
    mode: 'skeleton',
    approvalRequiredForWrites: true,
  },
  configSchema: z.object({ mode: z.enum(['fixture', 'recording']).default('recording'), reportPath: z.string().optional() }),
  fixtureRecords: [fixture],
  requiredPortalInformation: ['report export screen recording', 'sanitized CIT report with synthetic data'],
});
