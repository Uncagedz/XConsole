import { connectorHealthSchema, connectorSyncResultSchema, vinSchema } from '@drivecentric-ai/shared';
import type { XConsoleConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import draftFixture from './fixtures/draft-result.json' with { type: 'json' };
import { legacyJson } from '../shared/legacy-client.js';

const configSchema = z.object({
  mode: z.enum(['fixture', 'draft', 'live']).default('fixture'),
  legacyApiBaseUrl: z.string().url().default('http://127.0.0.1:8100'),
  legacyAuthorization: z.string().optional(),
  vin: vinSchema.default('1HGCM82633A004352'),
  accountId: z.string().optional(),
  captionOverride: z.string().optional(),
  photoLimit: z.number().int().min(1).max(60).default(24),
});

export const facebookMarketplaceConnector: XConsoleConnector<z.infer<typeof configSchema>> = {
  metadata: {
    id: 'facebook-marketplace',
    displayName: 'Facebook Marketplace',
    description: 'Adapter around the preserved Selenium draft/live posting implementation.',
    capabilities: ['read', 'write', 'upload'],
    executionLocation: 'local-agent',
    mode: 'live',
    approvalRequiredForWrites: true,
  },
  configSchema,
  async healthCheck(context) {
    if (context.config.mode === 'fixture') {
      return connectorHealthSchema.parse({
        connectorId: 'facebook-marketplace',
        ok: true,
        checkedAt: new Date().toISOString(),
        authenticationStatus: 'authenticated',
        message: 'Synthetic draft fixture is ready; live Selenium was not executed',
        reauthenticationRequired: false,
      });
    }
    const status = await legacyJson<Record<string, unknown>>(context.config, '/api/facebook/live-status', {
      signal: context.signal,
    });
    const reauthenticationRequired = status.saved_session_available === false;
    return connectorHealthSchema.parse({
      connectorId: 'facebook-marketplace',
      ok: !reauthenticationRequired,
      checkedAt: new Date().toISOString(),
      authenticationStatus: reauthenticationRequired ? 'reauthentication-required' : 'authenticated',
      message: reauthenticationRequired ? 'Open the Local Agent browser and sign in to Facebook' : 'Saved session is available',
      reauthenticationRequired,
      details: { mode: context.config.mode },
    });
  },
  async sync(context) {
    const startedAt = new Date();
    if (context.config.mode === 'live' && !context.approved) {
      throw new Error('Facebook live posting requires an approved Local Agent job');
    }
    const payload: Record<string, unknown> =
      context.config.mode === 'fixture'
        ? draftFixture
        : await legacyJson<Record<string, unknown>>(context.config, '/api/facebook/post/from-inventory', {
            method: 'POST',
            body: JSON.stringify({
              vin: context.config.vin,
              account_id: context.config.accountId,
              caption_override: context.config.captionOverride,
              mode: context.config.mode,
              auto_import_photos: true,
              photo_limit: context.config.photoLimit,
            }),
            signal: context.signal,
          });
    const finishedAt = new Date();
    const ok = payload.ok !== false;
    return connectorSyncResultSchema.parse({
      connectorId: 'facebook-marketplace',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      success: ok,
      recordsFound: 1,
      recordsCreated: ok ? 1 : 0,
      recordsUpdated: 0,
      recordsSkipped: ok ? 0 : 1,
      errorType: ok ? undefined : 'internal',
      errorMessage: ok ? undefined : String(payload.error ?? 'Facebook adapter failed'),
      screenshotPath: typeof payload.screenshot_path === 'string' ? payload.screenshot_path : undefined,
      htmlSnapshotPath: typeof payload.html_snapshot_path === 'string' ? payload.html_snapshot_path : undefined,
      reauthenticationRequired: payload.reauthentication_required === true,
      retryCount: Math.max(0, context.attempt - 1),
      lastSuccessfulSyncAt: ok ? finishedAt.toISOString() : undefined,
      records: [payload],
      metadata: {
        mode: context.config.mode,
        seleniumPreserved: true,
        liveTested: false,
      },
    });
  },
};
