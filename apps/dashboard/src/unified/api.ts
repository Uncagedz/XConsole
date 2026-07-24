import {
  automationJobSchema,
  automationJobStatusSchema,
  agentHeartbeatSchema,
  connectorSummarySchema,
  inventoryResponseSchema,
  vehicleSchema,
  type AutomationJob,
  type AutomationJobStatus,
  type ConnectorSummary,
  type InventoryResponse,
  type Vehicle,
} from '@drivecentric-ai/shared/xconsole';
import { z } from 'zod';

const baseUrl = (import.meta.env.VITE_GATEWAY_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const token = import.meta.env.VITE_XCONSOLE_API_TOKEN as string | undefined;
const valuationStatusSchema = z.object({
  ok: z.boolean(),
  count: z.coerce.number().int().nonnegative(),
  source_file: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  diagnostics: z.record(z.unknown()).optional(),
});
export type ValuationStatus = z.infer<typeof valuationStatusSchema>;
const inventoryStatusSchema = z.object({
  ok: z.literal(true),
  observedAt: z.string().datetime(),
  refreshIntervalMs: z.number().int().positive(),
  viewRefreshIntervalMs: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  inTransitCount: z.number().int().nonnegative(),
  source: inventoryResponseSchema.shape.source,
});
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;
const vehicleAssetsSchema = z.object({
  vin: z.string(),
  loaded_at: z.string().nullable().optional(),
  sticker_url: z.string().url().nullable().optional(),
  sticker_highlights: z.array(z.string()).default([]),
  carfax_url: z.string().url().nullable().optional(),
  carfax_summary: z.record(z.unknown()).nullable().optional(),
  buyer_profile: z.record(z.unknown()).nullable().optional(),
  marketing_summary: z.array(z.string()).default([]),
}).passthrough();
export type VehicleAssets = z.infer<typeof vehicleAssetsSchema>;
const deviceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  lastHeartbeat: agentHeartbeatSchema.optional(),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

async function request<T>(path: string, schema: z.ZodTypeAny, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string } } | null;
    const detail = payload?.error?.message ?? `XConsole gateway returned HTTP ${response.status}`;
    throw new GatewayError(detail, response.status, payload?.error?.requestId);
  }
  return schema.parse(await response.json()) as T;
}

export const gateway = {
  async session(): Promise<void> {
    await request('/api/session', z.object({ ok: z.literal(true) }));
  },
  async login(dashboardToken: string): Promise<void> {
    await request('/api/session', z.object({
      ok: z.literal(true),
      expiresAt: z.string().datetime(),
    }), {
      method: 'POST',
      body: JSON.stringify({ token: dashboardToken }),
    });
  },
  async logout(): Promise<void> {
    await request('/api/session', z.object({ ok: z.literal(true) }), { method: 'DELETE' });
  },
  async connectors(): Promise<ConnectorSummary[]> {
    return (await request<{ items: ConnectorSummary[] }>('/api/connectors', z.object({ items: z.array(connectorSummarySchema) }))).items;
  },
  async connector(id: string): Promise<ConnectorSummary> {
    return (await request<{ connector: ConnectorSummary }>(`/api/connectors/${encodeURIComponent(id)}`, z.object({ connector: connectorSummarySchema }))).connector;
  },
  async setConnectorEnabled(id: string, enabled: boolean): Promise<ConnectorSummary> {
    return (await request<{ connector: ConnectorSummary }>(
      `/api/connectors/${encodeURIComponent(id)}`,
      z.object({ connector: connectorSummarySchema }),
      { method: 'PATCH', body: JSON.stringify({ enabled }) },
    )).connector;
  },
  async retryConnector(id: string): Promise<void> {
    await request(
      `/api/connectors/${encodeURIComponent(id)}/retry`,
      z.object({}).passthrough(),
      { method: 'POST', body: JSON.stringify({}) },
    );
  },
  async vehicles(): Promise<Vehicle[]> {
    return (await this.inventory()).items;
  },
  async inventory(): Promise<InventoryResponse> {
    return request<InventoryResponse>('/api/inventory/active', inventoryResponseSchema);
  },
  async inventoryStatus(): Promise<InventoryStatus> {
    return request<InventoryStatus>('/api/inventory/status', inventoryStatusSchema);
  },
  async syncInventory(): Promise<InventoryResponse> {
    return request<InventoryResponse>('/api/inventory/sync-live', inventoryResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ persist: true, timeoutSeconds: 180 }),
    });
  },
  async valuationStatus(): Promise<ValuationStatus> {
    return request<ValuationStatus>('/api/bank-brain/valuations/status', valuationStatusSchema);
  },
  async uploadValuations(file: File): Promise<ValuationStatus> {
    return request<ValuationStatus>('/api/bank-brain/valuations/upload', valuationStatusSchema, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/vnd.ms-excel',
        'x-file-name': encodeURIComponent(file.name),
      },
      body: file,
    });
  },
  async vehicle(vin: string): Promise<Vehicle> {
    return (await request<{ vehicle: Vehicle }>(`/api/vehicles/${encodeURIComponent(vin)}`, z.object({ vehicle: vehicleSchema }))).vehicle;
  },
  async vehicleAssets(vin: string, refresh = false): Promise<VehicleAssets> {
    return request<VehicleAssets>(
      `/api/vehicles/${encodeURIComponent(vin)}/assets?refresh=${refresh ? 'true' : 'false'}`,
      vehicleAssetsSchema,
    );
  },
  async lookupVehicleSources(
    vin: string,
    connectorIds: Array<'reconvision' | 'onemicro' | 'carfax'>,
  ): Promise<AutomationJob[]> {
    return (await request<{ jobs: AutomationJob[] }>(
      `/api/vehicles/${encodeURIComponent(vin)}/source-lookups`,
      z.object({ jobs: z.array(automationJobSchema) }),
      {
        method: 'POST',
        body: JSON.stringify({ connectorIds }),
      },
    )).jobs;
  },
  async automationJob(jobId: string): Promise<AutomationJobStatus> {
    return (await request<{ job: AutomationJobStatus }>(
      `/api/automation/jobs/${encodeURIComponent(jobId)}`,
      z.object({ job: automationJobStatusSchema }),
    )).job;
  },
  async devices(): Promise<DeviceSummary[]> {
    return (await request<{ items: DeviceSummary[] }>(
      '/api/devices',
      z.object({ items: z.array(deviceSummarySchema) }),
    )).items;
  },
};
