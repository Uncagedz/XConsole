import { agentHeartbeatSchema, automationJobSchema, type AgentHeartbeat, type AutomationJob } from '@drivecentric-ai/shared';
import type { AgentConfig } from './config.js';

async function request<T>(config: AgentConfig, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('authorization', `Device ${config.deviceToken}`);
  const response = await fetch(`${config.gatewayUrl.replace(/\/+$/, '')}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Gateway request ${path} failed with HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function registerDevice(gatewayUrl: string, registrationCode: string, name: string) {
  const response = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/api/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, platform: 'windows', registrationCode, capabilities: ['playwright', 'selenium-adapter'] }),
  });
  if (!response.ok) throw new Error(`Device registration failed with HTTP ${response.status}`);
  return (await response.json()) as { deviceId: string; deviceToken: string };
}

export async function sendHeartbeat(config: AgentConfig, heartbeat: AgentHeartbeat) {
  return request(config, '/api/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify(agentHeartbeatSchema.parse(heartbeat)),
  });
}

export async function leaseJob(config: AgentConfig): Promise<AutomationJob | null> {
  const result = await request<{ job: unknown | null }>(config, '/api/agent/jobs/lease', {
    method: 'POST',
    body: JSON.stringify({ deviceId: config.deviceId }),
  });
  return result.job ? automationJobSchema.parse(result.job) : null;
}

export async function completeJob(config: AgentConfig, jobId: string, result: unknown, success: boolean) {
  return request(config, `/api/agent/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ success, result }),
  });
}
