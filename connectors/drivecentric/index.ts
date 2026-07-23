import {
  connectorHealthSchema,
  connectorSyncResultSchema,
  leadContextIngestSchema,
} from '@drivecentric-ai/shared';
import type { XConsoleConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixtureContext from './fixtures/context.json' with { type: 'json' };

const configSchema = z.object({
  mode: z.enum(['fixture', 'extension']).default('fixture'),
  gatewayUrl: z.string().url().default('http://127.0.0.1:3001'),
  extensionToken: z.string().optional(),
  contexts: z.array(leadContextIngestSchema).optional(),
});

export const driveCentricConnector: XConsoleConnector<z.infer<typeof configSchema>> = {
  metadata: {
    id: 'drivecentric',
    displayName: 'DriveCentric',
    description: 'Normalizes context extracted by the preserved Manifest V3 DriveCentric extension.',
    capabilities: ['read', 'upload'],
    executionLocation: 'extension',
    mode: 'live',
    approvalRequiredForWrites: false,
  },
  configSchema,
  async healthCheck(context) {
    if (context.config.mode === 'fixture') {
      return connectorHealthSchema.parse({
        connectorId: 'drivecentric',
        ok: true,
        checkedAt: new Date().toISOString(),
        authenticationStatus: 'authenticated',
        message: 'Synthetic DriveCentric parser fixture is ready',
        reauthenticationRequired: false,
      });
    }
    const response = await fetch(`${context.config.gatewayUrl.replace(/\/+$/, '')}/health`, {
      headers: context.config.extensionToken
        ? { authorization: `Bearer ${context.config.extensionToken}` }
        : undefined,
      signal: context.signal,
    });
    return connectorHealthSchema.parse({
      connectorId: 'drivecentric',
      ok: response.ok,
      checkedAt: new Date().toISOString(),
      authenticationStatus: response.status === 401 ? 'reauthentication-required' : response.ok ? 'authenticated' : 'error',
      reauthenticationRequired: response.status === 401,
    });
  },
  async sync(context) {
    const startedAt = new Date();
    const rawContexts = context.config.mode === 'fixture' ? [fixtureContext] : context.config.contexts ?? [];
    const records = rawContexts.map((value) => leadContextIngestSchema.parse(value));
    const finishedAt = new Date();
    return connectorSyncResultSchema.parse({
      connectorId: 'drivecentric',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      success: true,
      recordsFound: rawContexts.length,
      recordsCreated: records.length,
      recordsUpdated: 0,
      recordsSkipped: rawContexts.length - records.length,
      reauthenticationRequired: false,
      retryCount: Math.max(0, context.attempt - 1),
      lastSuccessfulSyncAt: finishedAt.toISOString(),
      records,
      metadata: { mode: context.config.mode, explicitSendOnly: true },
    });
  },
};
