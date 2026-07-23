import {
  connectorSummarySchema,
  inventoryResponseSchema,
  vehicleSchema,
  type ConnectorSummary,
  type InventoryResponse,
  type Vehicle,
} from '@drivecentric-ai/shared/xconsole';
import { z } from 'zod';

const baseUrl = (import.meta.env.VITE_GATEWAY_API_URL as string | undefined)?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3001';
const token = import.meta.env.VITE_XCONSOLE_API_TOKEN as string | undefined;

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
  async syncInventory(): Promise<InventoryResponse> {
    return request<InventoryResponse>('/api/inventory/sync-live', inventoryResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ persist: true, timeoutSeconds: 180 }),
    });
  },
  async vehicle(vin: string): Promise<Vehicle> {
    return (await request<{ vehicle: Vehicle }>(`/api/vehicles/${encodeURIComponent(vin)}`, z.object({ vehicle: vehicleSchema }))).vehicle;
  },
};
