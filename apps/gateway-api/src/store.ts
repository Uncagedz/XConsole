import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AgentHeartbeat, AutomationJob, ConnectorSummary, LeadContextIngest, Vehicle } from '@drivecentric-ai/shared';
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

export interface GatewayStoreContract {
  listConnectors(): MaybePromise<ConnectorSummary[]>;
  getConnector(id: string): MaybePromise<ConnectorSummary | undefined>;
  updateConnector(id: string, patch: Partial<Pick<ConnectorSummary, 'enabled'>>): MaybePromise<ConnectorSummary | undefined>;
  listVehicles(): MaybePromise<Vehicle[]>;
  getVehicle(vin: string): MaybePromise<Vehicle | undefined>;
  registerDevice(name: string): MaybePromise<{ deviceId: string; deviceToken: string }>;
  authenticateDevice(token: string): MaybePromise<{ id: string } | undefined>;
  listDevices(): MaybePromise<Array<{ id: string; name: string; lastHeartbeat?: AgentHeartbeat }>>;
  heartbeat(deviceId: string, heartbeat: AgentHeartbeat): MaybePromise<boolean>;
  createJob(connectorId: string, operation: string, approvalRequired: boolean): MaybePromise<AutomationJob>;
  leaseJob(): MaybePromise<AutomationJob | null>;
  completeJob(jobId: string, success: boolean, result: unknown): MaybePromise<boolean>;
  ingestDriveCentric(context: LeadContextIngest): MaybePromise<{ stored: boolean; totalContexts: number }>;
  close?(): Promise<void>;
}

export class GatewayStore implements GatewayStoreContract {
  private connectors = structuredClone(connectorSeeds);
  private vehicles = structuredClone(vehicleSeeds);
  private devices = new Map<string, DeviceRecord>();
  private jobs: AutomationJob[] = [];
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

  createJob(connectorId: string, operation: string, approvalRequired: boolean) {
    const now = new Date();
    const job: AutomationJob = {
      id: randomUUID(),
      connectorId,
      operation,
      payload: {},
      approvalStatus: approvalRequired ? 'required' : 'not-required',
      leaseExpiresAt: now.toISOString(),
      idempotencyKey: randomUUID(),
    };
    this.jobs.push(job);
    return job;
  }

  leaseJob() {
    const job = this.jobs.find((candidate) => candidate.approvalStatus !== 'required');
    if (!job) return null;
    this.jobs = this.jobs.filter((candidate) => candidate.id !== job.id);
    job.leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
    return job;
  }

  completeJob(_jobId: string, _success: boolean, _result: unknown) {
    return true;
  }

  ingestDriveCentric(context: LeadContextIngest) {
    this.driveCentricContexts.push(context);
    return { stored: true, totalContexts: this.driveCentricContexts.length };
  }
}
