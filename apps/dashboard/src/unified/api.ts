import {
  connectorSummarySchema,
  vehicleSchema,
  type ConnectorSummary,
  type Vehicle,
} from '@drivecentric-ai/shared';
import { z } from 'zod';

const baseUrl = (import.meta.env.VITE_GATEWAY_API_URL as string | undefined)?.replace(/\/+$/, '') ?? 'http://127.0.0.1:3001';
const token = import.meta.env.VITE_XCONSOLE_API_TOKEN as string | undefined;

async function request<T>(path: string, schema: z.ZodTypeAny): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(`XConsole gateway returned HTTP ${response.status}`);
  return schema.parse(await response.json()) as T;
}

export const gateway = {
  async connectors(): Promise<ConnectorSummary[]> {
    return (await request<{ items: ConnectorSummary[] }>('/api/connectors', z.object({ items: z.array(connectorSummarySchema) }))).items;
  },
  async connector(id: string): Promise<ConnectorSummary> {
    return (await request<{ connector: ConnectorSummary }>(`/api/connectors/${encodeURIComponent(id)}`, z.object({ connector: connectorSummarySchema }))).connector;
  },
  async vehicles(): Promise<Vehicle[]> {
    return (await request<{ items: Vehicle[] }>('/api/vehicles', z.object({ items: z.array(vehicleSchema) }))).items;
  },
  async vehicle(vin: string): Promise<Vehicle> {
    return (await request<{ vehicle: Vehicle }>(`/api/vehicles/${encodeURIComponent(vin)}`, z.object({ vehicle: vehicleSchema }))).vehicle;
  },
};
