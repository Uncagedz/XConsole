import { createHash } from 'node:crypto';
import {
  inventoryResponseSchema,
  vinSchema,
  type InventoryResponse,
  type InventorySourceSummary,
  type Vehicle,
} from '@drivecentric-ai/shared';
import { z } from 'zod';
import type { GatewayEnv } from './env.js';
import type { GatewayStoreContract } from './store.js';

const legacyPayloadSchema = z.object({
  items: z.array(z.record(z.unknown())).default([]),
  count: z.coerce.number().int().nonnegative().optional(),
  active_count: z.coerce.number().int().nonnegative().optional(),
  in_transit_count: z.coerce.number().int().nonnegative().optional(),
  source_status: z.record(z.unknown()).optional(),
}).passthrough();

const syncRequestSchema = z.object({
  sourceUrl: z.string().url().optional(),
  timeoutSeconds: z.number().int().min(10).max(300).default(180),
  persist: z.boolean().default(true),
});

const legacySyncResponseSchema = z.object({
  ok: z.boolean(),
  persisted: z.boolean(),
  items_count: z.coerce.number().int().nonnegative(),
  errors: z.array(z.unknown()).default([]),
  diagnostics: z.array(z.string()).default([]),
  source_status: z.record(z.unknown()).optional(),
}).passthrough();

const valuationStatusSchema = z.object({
  ok: z.boolean(),
  count: z.coerce.number().int().nonnegative(),
  source_file: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  diagnostics: z.record(z.unknown()).optional(),
}).passthrough();

const vehicleAssetsSchema = z.object({
  vin: vinSchema,
  loaded_at: z.string().nullable().optional(),
  sticker_url: z.string().url().nullable().optional(),
  sticker_view_url: z.string().nullable().optional(),
  sticker_highlights: z.array(z.string()).default([]),
  carfax_url: z.string().url().nullable().optional(),
  carfax_view_url: z.string().nullable().optional(),
  carfax_summary: z.record(z.unknown()).nullable().optional(),
  buyer_profile: z.record(z.unknown()).nullable().optional(),
  marketing_summary: z.array(z.string()).default([]),
}).passthrough();

export type InventorySyncRequest = z.input<typeof syncRequestSchema>;
export type ValuationStatus = z.infer<typeof valuationStatusSchema>;
export type VehicleAssets = z.infer<typeof vehicleAssetsSchema>;

export class InventorySyncError extends Error {
  readonly statusCode = 502;

  constructor(message: string) {
    super(message);
    this.name = 'InventorySyncError';
  }
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function firstText(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(item[key]);
    if (value) return value;
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.round(parsed);
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function titleParts(rawTitle: string | null) {
  const match = rawTitle?.match(/^((?:19|20)\d{2})\s+(\S+)\s+(\S+)(?:\s+(.+))?$/);
  return match
    ? {
        year: Number(match[1]),
        make: match[2] ?? null,
        model: match[3] ?? null,
        trim: match[4] ?? null,
      }
    : { year: null, make: null, model: null, trim: null };
}

function urlValue(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function photos(item: Record<string, unknown>) {
  const raw = item.photos ?? item.images;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(urlValue).filter((value): value is string => Boolean(value)))];
}

function conditionFor(item: Record<string, unknown>, websiteUrl: string | null) {
  const explicit = firstText(item, ['inventory_category', 'inventoryCategory', 'condition', 'type']);
  if (explicit) return explicit.toLowerCase();
  const searchable = `${websiteUrl ?? ''} ${firstText(item, ['title']) ?? ''}`.toLowerCase();
  if (/(?:\/|\b)new(?:\/|-inventory|\b)/.test(searchable)) return 'new';
  if (/(?:\/|\b)(?:used|pre-owned|certified)(?:\/|-inventory|\b)/.test(searchable)) return 'used';
  return null;
}

function sourceTimestamp(sourceStatus: Record<string, unknown> | undefined) {
  if (!sourceStatus) return null;
  return isoDate(
    sourceStatus.fetched_at
      ?? sourceStatus.updated_at
      ?? sourceStatus.last_synced_at
      ?? sourceStatus.last_successful_sync,
  );
}

export function normalizeLegacyVehicle(
  item: Record<string, unknown>,
  sourceStatus: Record<string, unknown> | undefined,
): Vehicle | null {
  const parsedVin = vinSchema.safeParse(item.vin);
  if (!parsedVin.success) return null;
  const vin = parsedVin.data;
  const title = firstText(item, ['title', 'display_name', 'name']);
  const parsedTitle = titleParts(title);
  const websiteUrl = urlValue(item.websiteUrl ?? item.website_url ?? item.detail_url ?? item.url);
  const synchronizedAt = sourceTimestamp(sourceStatus);
  const status = firstText(item, ['status_label', 'inventory_status', 'status']) ?? 'active';
  const photoUrls = photos(item);
  const rawRetailPrice = numberValue(item.retailPrice ?? item.retail_price ?? item.sale_price ?? item.price);
  const jdPowerTradeIn = numberValue(item.jdPowerTradeIn ?? item.jd_power_trade_in);
  // Dealer listing cards sometimes expose a monthly payment in the generic
  // "price" field. Never turn that into an implausible sale price or LTV.
  const paymentMisread = rawRetailPrice !== null
    && jdPowerTradeIn !== null
    && jdPowerTradeIn >= 5_000
    && rawRetailPrice < jdPowerTradeIn * 0.25;
  const retailPrice = paymentMisread ? null : rawRetailPrice;

  return {
    id: `legacy-${createHash('sha256').update(vin).digest('hex').slice(0, 16)}`,
    vin,
    title,
    stockNumber: firstText(item, ['stockNumber', 'stock_number', 'stock', 'stock_no']),
    year: integerValue(item.year) ?? parsedTitle.year,
    make: firstText(item, ['make']) ?? parsedTitle.make,
    model: firstText(item, ['model']) ?? parsedTitle.model,
    trim: firstText(item, ['trim']) ?? parsedTitle.trim,
    condition: conditionFor(item, websiteUrl),
    status: status.toLowerCase(),
    mileage: integerValue(item.mileage ?? item.miles ?? item.odometer),
    retailPrice,
    msrp: numberValue(item.msrp),
    cost: numberValue(item.cost),
    jdPowerTradeIn,
    loanToValue: paymentMisread ? null : numberValue(item.loanToValue ?? item.jd_power_ltv ?? item.ltv),
    ltvBasis: paymentMisread ? null : numberValue(item.ltvBasis ?? item.bank_ltv_basis),
    daysInStock: integerValue(item.daysInStock ?? item.days_in_stock),
    websiteUrl,
    photos: photoUrls,
    exteriorColor: firstText(item, ['exteriorColor', 'exterior_color', 'exterior']),
    interiorColor: firstText(item, ['interiorColor', 'interior_color', 'interior']),
    drivetrain: firstText(item, ['drivetrain']),
    engine: firstText(item, ['engine']),
    transmission: firstText(item, ['transmission']),
    sourceStatuses: [{
      connectorId: 'dealership-website',
      displayName: 'Dealership Website',
      status,
      synchronizedAt,
      error: null,
      reauthenticationRequired: false,
      details: {
        source: 'legacy-automation-api',
        photoCount: photoUrls.length,
        condition: conditionFor(item, websiteUrl),
        ...(paymentMisread ? { priceWarning: 'Rejected a likely monthly-payment value from the listing card.' } : {}),
      },
    }],
    salesTalkingPoints: [],
    lastSynchronizedAt: synchronizedAt,
  };
}

function mergeVehicle(live: Vehicle, stored: Vehicle | undefined): Vehicle {
  if (!stored) return live;
  const liveConnectorIds = new Set(live.sourceStatuses.map((status) => status.connectorId));
  return {
    ...stored,
    ...live,
    cost: live.cost ?? stored.cost,
    daysInStock: live.daysInStock ?? stored.daysInStock,
    salesTalkingPoints: stored.salesTalkingPoints,
    sourceStatuses: [
      ...live.sourceStatuses,
      ...stored.sourceStatuses.filter((status) => !liveConnectorIds.has(status.connectorId)),
    ],
  };
}

function storedCounts(items: Vehicle[]) {
  const inTransitCount = items.filter((item) => item.status?.toLowerCase().includes('transit')).length;
  return {
    activeCount: Math.max(0, items.length - inTransitCount),
    inTransitCount,
  };
}

function storedSource(items: Vehicle[], warning: string | null, configured: boolean): InventorySourceSummary {
  const fixture = items.length > 0 && items.every((item) => item.id.startsWith('synthetic-'));
  const synchronizedAt = items
    .map((item) => item.lastSynchronizedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return {
    mode: fixture ? 'fixture' : 'gateway-database',
    label: fixture ? 'Synthetic development fixture' : 'XConsole database',
    live: false,
    stale: synchronizedAt ? Date.now() - Date.parse(synchronizedAt) > 24 * 60 * 60 * 1_000 : true,
    configured,
    itemCount: items.length,
    ...storedCounts(items),
    synchronizedAt,
    warning,
    details: {},
  };
}

export class InventoryService {
  private cached: InventoryResponse | null = null;
  private cacheExpiresAt = 0;
  private syncInFlight: Promise<InventoryResponse> | null = null;
  private autoSyncTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly env: GatewayEnv,
    private readonly store: GatewayStoreContract,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get configured() {
    return Boolean(this.env.LEGACY_AUTOMATION_API_URL && this.env.XCONSOLE_LEGACY_API_TOKEN);
  }

  private async legacyJson(
    path: string,
    init: RequestInit = {},
    timeoutMs = this.env.LEGACY_INVENTORY_TIMEOUT_MS,
  ) {
    if (!this.configured) {
      throw new Error('Legacy inventory adapter is not configured');
    }
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${this.env.XCONSOLE_LEGACY_API_TOKEN}`);
    if (typeof init.body === 'string') headers.set('content-type', 'application/json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.env.LEGACY_AUTOMATION_API_URL!.replace(/\/+$/, '')}${path}`,
        { ...init, headers, signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Legacy inventory adapter returned HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async list(persist = false, force = false): Promise<InventoryResponse> {
    if (!force && !persist && this.cached && Date.now() < this.cacheExpiresAt) {
      return this.cached;
    }
    const stored = await this.store.listVehicles();
    const counts = storedCounts(stored);
    if (!this.configured) {
      return this.remember(inventoryResponseSchema.parse({
        items: stored,
        count: stored.length,
        ...counts,
        source: storedSource(
          stored,
          'Live inventory is not connected. Configure LEGACY_AUTOMATION_API_URL and XCONSOLE_LEGACY_API_TOKEN.',
          false,
        ),
      }));
    }

    try {
      const payload = legacyPayloadSchema.parse(await this.legacyJson('/api/inventory/active'));
      const storedByVin = new Map(stored.map((vehicle) => [vehicle.vin, vehicle]));
      const items = payload.items
        .map((item) => normalizeLegacyVehicle(item, payload.source_status))
        .filter((vehicle): vehicle is Vehicle => Boolean(vehicle))
        .map((vehicle) => mergeVehicle(vehicle, storedByVin.get(vehicle.vin)));
      const synchronizedAt = sourceTimestamp(payload.source_status);
      const ageMs = synchronizedAt ? Date.now() - Date.parse(synchronizedAt) : Number.POSITIVE_INFINITY;
      const activeCount = Math.min(payload.active_count ?? items.length, items.length);
      const inTransitCount = Math.min(payload.in_transit_count ?? 0, items.length);
      const upstreamWarning = text(payload.source_status?.current_error);
      const persistence = persist && this.store.upsertVehicles
        ? await this.store.upsertVehicles(items)
        : null;
      return this.remember(inventoryResponseSchema.parse({
        items,
        count: items.length,
        activeCount,
        inTransitCount,
        source: {
          mode: 'legacy-live',
          label: 'Dealership website live inventory',
          live: true,
          stale: ageMs > 24 * 60 * 60 * 1000,
          configured: true,
          itemCount: items.length,
          activeCount,
          inTransitCount,
          synchronizedAt,
          warning: upstreamWarning ?? (items.length ? null : 'The live adapter returned no valid VIN records.'),
          details: {
            ...(payload.source_status ?? {}),
            ...(persistence ? { persistence } : {}),
          },
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown inventory adapter failure';
      return this.remember(inventoryResponseSchema.parse({
        items: stored,
        count: stored.length,
        ...counts,
        source: storedSource(
          stored,
          `Live inventory unavailable; showing the last gateway data. ${message}`,
          true,
        ),
      }), 5_000);
    }
  }

  async get(vin: string) {
    return (await this.list()).items.find((vehicle) => vehicle.vin === vin.toUpperCase());
  }

  async status() {
    const inventory = this.cached ?? await this.list();
    return {
      ok: true as const,
      observedAt: new Date().toISOString(),
      refreshIntervalMs: this.env.LEGACY_INVENTORY_AUTO_SYNC_MS,
      viewRefreshIntervalMs: this.env.LEGACY_INVENTORY_CACHE_TTL_MS,
      count: inventory.count,
      activeCount: inventory.activeCount,
      inTransitCount: inventory.inTransitCount,
      source: inventory.source,
    };
  }

  async vehicleAssets(vin: string, refresh = false): Promise<VehicleAssets> {
    const cleanVin = vinSchema.parse(vin);
    return vehicleAssetsSchema.parse(await this.legacyJson(
      `/api/vehicles/${encodeURIComponent(cleanVin)}/assets?refresh=${refresh ? 'true' : 'false'}`,
      {},
      refresh ? 120_000 : this.env.LEGACY_INVENTORY_TIMEOUT_MS,
    ));
  }

  async valuationStatus(): Promise<ValuationStatus> {
    return valuationStatusSchema.parse(
      await this.legacyJson('/api/bank-brain/valuations/status'),
    );
  }

  async uploadValuations(
    raw: Uint8Array,
    filename: string,
    contentType = 'application/vnd.ms-excel',
  ): Promise<ValuationStatus> {
    const bytes = new Uint8Array(raw.byteLength);
    bytes.set(raw);
    const form = new FormData();
    form.append('file', new Blob([bytes.buffer], { type: contentType }), filename);
    this.cached = null;
    return valuationStatusSchema.parse(
      await this.legacyJson('/api/bank-brain/valuations/upload', {
        method: 'POST',
        body: form,
      }, 120_000),
    );
  }

  async sync(input: InventorySyncRequest = {}) {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.performSync(input);
    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  startAutoSync() {
    if (!this.configured || this.autoSyncTimer) return;
    const run = () => {
      void this.sync({ persist: true, timeoutSeconds: 180 }).catch((error: unknown) => {
        process.stderr.write(`${JSON.stringify({
          level: 'warn',
          event: 'inventory.auto_sync_failed',
          message: error instanceof Error ? error.message : 'Unknown inventory synchronization error',
        })}\n`);
      });
    };
    this.autoSyncTimer = setInterval(run, this.env.LEGACY_INVENTORY_AUTO_SYNC_MS);
    this.autoSyncTimer.unref();
    const initial = setTimeout(run, 5_000);
    initial.unref();
  }

  private async performSync(input: InventorySyncRequest = {}) {
    const request = syncRequestSchema.parse(input);
    if (!this.configured) {
      throw new Error('Live inventory sync is not configured');
    }
    const result = legacySyncResponseSchema.parse(await this.legacyJson('/api/inventory/sync-live', {
      method: 'POST',
      body: JSON.stringify({
        source_url: request.sourceUrl,
        timeout_seconds: request.timeoutSeconds,
        persist: request.persist,
      }),
    }, (request.timeoutSeconds + 10) * 1_000));
    if (!result.ok || !result.persisted || result.items_count === 0) {
      throw new InventorySyncError(
        'The dealership website refresh returned no vehicles. The last good inventory cache was preserved.',
      );
    }
    this.cached = null;
    return this.list(true, true);
  }

  private remember(response: InventoryResponse, ttl = this.env.LEGACY_INVENTORY_CACHE_TTL_MS) {
    this.cached = response;
    this.cacheExpiresAt = Date.now() + ttl;
    return response;
  }
}
