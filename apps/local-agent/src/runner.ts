import type { AutomationJob } from '@drivecentric-ai/shared';
import { portalConnectorIdSchema, type AgentConfig } from './config.js';
import { completeJob, leaseJob, sendHeartbeat } from './api.js';
import { logger } from './logger.js';
import { lookupPortalVin, PortalLookupError } from './portal-lookup.js';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function executeJob(config: AgentConfig, job: AutomationJob) {
  if (job.approvalStatus === 'required') {
    throw new Error('Gateway leased an unapproved high-risk job');
  }
  const portalConnector = portalConnectorIdSchema.safeParse(job.connectorId);
  if (portalConnector.success && job.operation === 'lookup-vin') {
    const vin = typeof job.payload.vin === 'string' ? job.payload.vin : '';
    return lookupPortalVin(config, portalConnector.data, vin);
  }
  return {
    ok: true,
    connectorId: job.connectorId,
    operation: job.operation,
    mode: 'local-agent-skeleton',
    message: 'Job boundary validated; connector-specific live portal execution requires a reviewed recording.',
  };
}

export async function runAgent(config: AgentConfig, signal: AbortSignal) {
  let retry = 0;
  let activeJobId: string | undefined;
  let lastHeartbeat = 0;
  logger.info('agent.started', { deviceId: config.deviceId, version: config.agentVersion });
  while (!signal.aborted) {
    try {
      if (Date.now() - lastHeartbeat >= config.heartbeatIntervalMs) {
        await sendHeartbeat(config, {
          deviceId: config.deviceId,
          agentVersion: config.agentVersion,
          sentAt: new Date().toISOString(),
          status: activeJobId ? 'busy' : 'online',
          capabilities: ['playwright', 'selenium-adapter', 'recording'],
          activeJobId,
        });
        lastHeartbeat = Date.now();
      }
      const job = await leaseJob(config);
      if (job) {
        activeJobId = job.id;
        try {
          const result = await executeJob(config, job);
          await completeJob(config, job.id, result, true);
        } catch (error) {
          await completeJob(
            config,
            job.id,
            error instanceof PortalLookupError
              ? {
                  errorType: error.errorType,
                  message: error.message,
                  reauthenticationRequired: error.reauthenticationRequired,
                  ...error.artifacts,
                }
              : { errorType: 'internal', message: error instanceof Error ? error.message : 'Unknown job failure' },
            false,
          );
        } finally {
          activeJobId = undefined;
        }
      }
      retry = 0;
      await delay(config.pollIntervalMs);
    } catch (error) {
      retry += 1;
      const backoff = Math.min(60_000, 1_000 * 2 ** Math.min(retry, 6)) + Math.floor(Math.random() * 500);
      logger.error('agent.loop.failed', {
        message: error instanceof Error ? error.message : 'Unknown Local Agent failure',
        retry,
        backoffMs: backoff,
      });
      await delay(backoff);
    }
  }
  logger.info('agent.stopped', { deviceId: config.deviceId });
}
