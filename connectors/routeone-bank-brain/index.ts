import { connectorHealthSchema, connectorSyncResultSchema } from '@drivecentric-ai/shared';
import type { XConsoleConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import statusFixture from './fixtures/status.json' with { type: 'json' };
import { legacyJson } from '../shared/legacy-client.js';

const configSchema = z.object({
  mode: z.enum(['fixture', 'status', 'rebuild']).default('fixture'),
  legacyApiBaseUrl: z.string().url().default('http://127.0.0.1:8100'),
  legacyAuthorization: z.string().optional(),
  reloadSalesData: z.boolean().default(true),
  maxLinkDepth: z.number().int().min(0).max(3).default(1),
  maxLinksPerResource: z.number().int().min(1).max(50).default(12),
});

export const routeOneBankBrainConnector: XConsoleConnector<z.infer<typeof configSchema>> = {
  metadata: {
    id: 'routeone-bank-brain',
    displayName: 'RouteOne / Bank Brain',
    description: 'Wraps manual RouteOne imports, document status, and Bank Brain rebuilding.',
    capabilities: ['read', 'download', 'upload'],
    executionLocation: 'railway',
    mode: 'live',
    approvalRequiredForWrites: false,
  },
  configSchema,
  async healthCheck(context) {
    const payload: Record<string, unknown> =
      context.config.mode === 'fixture'
        ? statusFixture
        : await legacyJson<Record<string, unknown>>(context.config, '/api/bank-brain/docs/status', {
            signal: context.signal,
          });
    return connectorHealthSchema.parse({
      connectorId: 'routeone-bank-brain',
      ok: payload.ok !== false,
      checkedAt: new Date().toISOString(),
      authenticationStatus: 'authenticated',
      message: 'Browser download remains a Windows Local Agent operation',
      reauthenticationRequired: false,
      details: { reviewRequired: true },
    });
  },
  async sync(context) {
    const startedAt = new Date();
    const payload: Record<string, unknown> =
      context.config.mode === 'fixture'
        ? statusFixture
        : context.config.mode === 'rebuild'
          ? await legacyJson<Record<string, unknown>>(context.config, '/api/bank-brain/docs/rebuild', {
              method: 'POST',
              body: JSON.stringify({
                reload_sales_data: context.config.reloadSalesData,
                max_link_depth: context.config.maxLinkDepth,
                max_links_per_resource: context.config.maxLinksPerResource,
              }),
              signal: context.signal,
            })
          : await legacyJson<Record<string, unknown>>(context.config, '/api/bank-brain/docs/status', {
              signal: context.signal,
            });
    const finishedAt = new Date();
    const ok = payload.ok !== false;
    return connectorSyncResultSchema.parse({
      connectorId: 'routeone-bank-brain',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      success: ok,
      recordsFound: Number(payload.doc_count ?? payload.count ?? 0),
      recordsCreated: 0,
      recordsUpdated: Number(payload.profiles_generated ?? 0),
      recordsSkipped: 0,
      errorType: ok ? undefined : 'parse',
      errorMessage: ok ? undefined : String(payload.error ?? 'Bank Brain rebuild failed'),
      reauthenticationRequired: false,
      retryCount: Math.max(0, context.attempt - 1),
      lastSuccessfulSyncAt: ok ? finishedAt.toISOString() : undefined,
      records: [payload],
      metadata: {
        mode: context.config.mode,
        humanReviewRequired: true,
        recommendationUsesApprovedRulesOnly: true,
      },
    });
  },
};
