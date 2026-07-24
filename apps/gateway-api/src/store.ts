import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  AgentHeartbeat,
  AutomationJob,
  AutomationJobStatus,
  ConnectorSummary,
  LeadContextIngest,
  Vehicle,
} from '@drivecentric-ai/shared';
import { connectorSeeds, vehicleSeeds } from './seed-data.js';

export type MaybePromise<T> = T | Promise<T>;

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  lastHeartbeat?: AgentHeartbeat;
}

export interface StoredCarfaxSummary {
  owners: number | null;
  accidents: number | null;
  service: string | null;
  highlights: string[];
  reportUrl: string | null;
  observedAt: string;
}

export interface GatewayStoreContract {
  initialize?(): Promise<void>;
  listConnectors(): MaybePromise<ConnectorSummary[]>;
  getConnector(id: string): MaybePromise<ConnectorSummary | undefined>;
  updateConnector(id: string, patch: Partial<Pick<ConnectorSummary, 'enabled'>>): MaybePromise<ConnectorSummary | undefined>;
  listVehicles(): MaybePromise<Vehicle[]>;
  getVehicle(vin: string): MaybePromise<Vehicle | undefined>;
  getCarfaxSummary?(vin: string): MaybePromise<StoredCarfaxSummary | undefined>;
  upsertVehicles?(vehicles: Vehicle[]): MaybePromise<{ created: number; updated: number }>;
  registerDevice(name: string): MaybePromise<{ deviceId: string; deviceToken: string }>;
  authenticateDevice(token: string): MaybePromise<{ id: string } | undefined>;
  listDevices(): MaybePromise<Array<{ id: string; name: string; lastHeartbeat?: AgentHeartbeat }>>;
  heartbeat(deviceId: string, heartbeat: AgentHeartbeat): MaybePromise<boolean>;
  createJob(
    connectorId: string,
    operation: string,
    approvalRequired: boolean,
    payload?: Record<string, unknown>,
  ): MaybePromise<AutomationJob>;
  getJob(jobId: string): MaybePromise<AutomationJobStatus | undefined>;
  leaseJob(): MaybePromise<AutomationJob | null>;
  completeJob(jobId: string, success: boolean, result: unknown): MaybePromise<boolean>;
  ingestDriveCentric(context: LeadContextIngest): MaybePromise<{ stored: boolean; totalContexts: number }>;
  close?(): Promise<void>;
}

export class GatewayStore implements GatewayStoreContract {
  private connectors = structuredClone(connectorSeeds);
  private vehicles = structuredClone(vehicleSeeds);
  private devices = new Map<string, DeviceRecord>();
  private jobs = new Map<string, { lease: AutomationJob; status: AutomationJobStatus }>();
  private driveCentricContexts: LeadContextIngest[] = [];

  listConnectors() {
    return this.connectors;
  }

  getConnector(id: string) {
    return this.connectors.find((item) => item.id === id);
  }

  updateConnector(id: string, patch: Partial<Pick<ConnectorSummary, 'enabled'>>) {
    const connector = this.getConnector(id);
    if (!connector) return undefined;
    Object.assign(connector, patch);
    return connector;
  }

  listVehicles() {
    return this.vehicles;
  }

  getVehicle(vin: string) {
    return this.vehicles.find((vehicle) => vehicle.vin === vin.toUpperCase());
  }

  upsertVehicles(vehicles: Vehicle[]) {
    let created = 0;
    let updated = 0;
    const byVin = new Map(this.vehicles.map((vehicle) => [vehicle.vin, vehicle]));
    for (const vehicle of vehicles) {
      if (byVin.has(vehicle.vin)) updated += 1;
      else created += 1;
      byVin.set(vehicle.vin, structuredClone(vehicle));
    }
    this.vehicles = [...byVin.values()];
    return { created, updated };
  }

  registerDevice(name: string) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    this.devices.set(id, { id, name, tokenHash: hashToken(token) });
    return { deviceId: id, deviceToken: token };
  }

  authenticateDevice(token: string) {
    const tokenHash = hashToken(token);
    return [...this.devices.values()].find((device) => device.tokenHash === tokenHash);
  }

  listDevices() {
    return [...this.devices.values()].map(({ id, name, lastHeartbeat }) => ({
      id,
      name,
      lastHeartbeat,
    }));
  }

  heartbeat(deviceId: string, heartbeat: AgentHeartbeat) {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.lastHeartbeat = heartbeat;
    return true;
  }

  createJob(
    connectorId: string,
    operation: string,
    approvalRequired: boolean,
    payload: Record<string, unknown> = {},
  ) {
    const now = new Date();
    const job: AutomationJob = {
      id: randomUUID(),
      connectorId,
      operation,
      payload,
      approvalStatus: approvalRequired ? 'required' : 'not-required',
      leaseExpiresAt: now.toISOString(),
      idempotencyKey: randomUUID(),
    };
    this.jobs.set(job.id, {
      lease: job,
      status: {
        id: job.id,
        connectorId,
        operation,
        status: approvalRequired ? 'approval-required' : 'pending',
        payload,
        result: null,
        error: null,
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: now.toISOString(),
        startedAt: null,
        finishedAt: null,
      },
    });
    return job;
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId)?.status;
  }

  leaseJob() {
    const stored = [...this.jobs.values()].find((candidate) => candidate.status.status === 'pending');
    if (!stored) return null;
    const now = new Date();
    stored.lease.leaseExpiresAt = new Date(now.getTime() + 60_000).toISOString();
    stored.status.status = 'leased';
    stored.status.startedAt = now.toISOString();
    stored.status.attemptCount += 1;
    return stored.lease;
  }

  completeJob(jobId: string, success: boolean, result: unknown) {
    const stored = this.jobs.get(jobId);
    if (!stored) return false;
    stored.status.status = success ? 'succeeded' : 'failed';
    stored.status.finishedAt = new Date().toISOString();
    const record = typeof result === 'object' && result !== null && !Array.isArray(result)
      ? result as Record<string, unknown>
      : { value: result };
    if (success) stored.status.result = record;
    else stored.status.error = record;
    return true;
  }

  ingestDriveCentric(context: LeadContextIngest) {
    this.driveCentricContexts.push(context);
    return { stored: true, totalContexts: this.driveCentricContexts.length };
  }
}
