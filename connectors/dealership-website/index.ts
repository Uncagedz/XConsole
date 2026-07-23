import { connectorHealthSchema, connectorSyncResultSchema, vinSchema } from '@drivecentric-ai/shared';
import type { XConsoleConnector } from '@xconsole/connector-sdk';
import { z } from 'zod';
import fixtureInventory from './fixtures/inventory.json' with { type: 'json' };
import { legacyJson } from '../shared/legacy-client.js';

const configSchema = z.object({
  mode: z.enum(['live', 'fixture']).default('fixture'),
  legacyApiBaseUrl: z.string().url().default('http://127.0.0.1:8100'),
  legacyAuthorization: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  persist: z.boolean().default(true),
});

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWebsiteVehicle(item: Record<string, unknown>) {
  return {
    vin: vinSchema.parse(item.vin),
    stockNumber: String(item.stockNumber ?? item.stock_number ?? item.stock ?? '') || null,
    year: numberOrNull(item.year),
    make: String(item.make ?? '') || null,
    model: String(item.model ?? '') || null,
    trim: String(item.trim ?? '') || null,
    mileage: numberOrNull(item.mileage),
    retailPrice: numberOrNull(item.retailPrice ?? item.price),
    websiteUrl: String(item.websiteUrl ?? item.detail_url ?? '') || null,
    photos: Array.isArray(item.photos) ? item.photos.filter((value): value is string => typeof value === 'string') : [],
    source: 'dealership-website',
    raw: item,
  };
}

export const dealershipWebsiteConnector: XConsoleConnector<z.infer<typeof configSchema>> = {
  metadata: {
    id: 'dealership-website',
    displayName: 'Dealership Website',
    description: 'Wraps the existing XConsole live inventory synchronizer and normalizes vehicles by VIN.',
    capabilities: ['read'],
    executionLocation: 'railway',
    mode: 'live',
    approvalRequiredForWrites: false,
  },
  configSchema,
  async healthCheck(context) {
    if (context.config.mode === 'fixture') {
      return connectorHealthSchema.parse({
        connectorId: 'dealership-website',
        ok: true,
        checkedAt: new Date().toISOString(),
        authenticationStatus: 'authenticated',
        message: 'Synthetic inventory fixture is ready',
        reauthenticationRequired: false,
      });
    }
    const response = await legacyJson<{ ok?: boolean }>(context.config, '/api/health', { signal: context.signal });
    return connectorHealthSchema.parse({
      connectorId: 'dealership-website',
      ok: response.ok !== false,
      checkedAt: new Date().toISOString(),
      authenticationStatus: 'authenticated',
      reauthenticationRequired: false,
    });
  },
  async sync(context) {
    const startedAt = new Date();
    let rawItems: Array<Record<string, unknown>>;
    if (context.config.mode === 'fixture') {
      rawItems = fixtureInventory;
    } else {
      await legacyJson(context.config, '/api/inventory/sync-live', {
        method: 'POST',
        body: JSON.stringify({
          source_url: context.config.sourceUrl,
          timeout_seconds: 180,
          persist: context.config.persist,
        }),
        signal: context.signal,
      });
      const active = await legacyJson<{ items: Array<Record<string, unknown>> }>(
        context.config,
        '/api/inventory/active',
        { signal: context.signal },
      );
      rawItems = active.items;
    }
    const records = rawItems.flatMap((item) => {
      try {
        return [normalizeWebsiteVehicle(item)];
      } catch {
        return [];
      }
    });
    const finishedAt = new Date();
    return connectorSyncResultSchema.parse({
      connectorId: 'dealership-website',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      success: true,
      recordsFound: rawItems.length,
      recordsCreated: records.length,
      recordsUpdated: 0,
      recordsSkipped: rawItems.length - records.length,
      reauthenticationRequired: false,
      retryCount: Math.max(0, context.attempt - 1),
      lastSuccessfulSyncAt: finishedAt.toISOString(),
      records,
      metadata: { mode: context.config.mode, matchedBy: 'vin' },
    });
  },
};
