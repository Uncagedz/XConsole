import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  agentHeartbeatSchema,
  deviceRegistrationSchema,
  leadContextIngestSchema,
  vinSchema,
} from '@drivecentric-ai/shared';
import { z } from 'zod';
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardAuth,
  dashboardTokenMatches,
  deviceAuth,
  issueDashboardSession,
  registrationCodeMatches,
} from './auth.js';
import type { GatewayEnv } from './env.js';
import { InventoryService, InventorySyncError } from './legacy-inventory.js';
import { GatewayStore, type GatewayStoreContract } from './store.js';

type AsyncRoute = (
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
) => Promise<void>;

function asyncRoute(handler: AsyncRoute) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

export function createApp(env: GatewayEnv, store: GatewayStoreContract = new GatewayStore()) {
  const app = express();
  const inventory = new InventoryService(env, store);
  const origins = new Set(
    `${env.CORS_ORIGINS},${env.CHROME_EXTENSION_ORIGINS}`
      .split(',')
      .map((value) => value.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const requestId = request.header('x-request-id') ?? randomUUID();
    response.setHeader('x-request-id', requestId);
    response.locals.requestId = requestId;
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origins.has(origin.replace(/\/+$/, ''))) callback(null, true);
        else callback(new Error('CORS origin blocked'));
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'xconsole-gateway-api', databaseConfigured: Boolean(env.DATABASE_URL) });
  });

  app.post('/api/session', asyncRoute(async (request, response) => {
    const payload = z.object({ token: z.string().min(24) }).strict().parse(request.body);
    if (!dashboardTokenMatches(payload.token, env)) {
      response.status(401).json({ error: { type: 'authentication', message: 'Invalid dashboard token' } });
      return;
    }
    const session = issueDashboardSession(env);
    response.cookie(DASHBOARD_SESSION_COOKIE, session.value, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.NODE_ENV === 'production',
      expires: session.expires,
      path: '/',
    });
    response.json({ ok: true, expiresAt: session.expires.toISOString() });
  }));

  app.post('/api/devices/register', asyncRoute(async (request, response) => {
    const payload = deviceRegistrationSchema.parse(request.body);
    if (!registrationCodeMatches(payload.registrationCode, env.XCONSOLE_DEVICE_REGISTRATION_CODE)) {
      response.status(401).json({ error: { type: 'authentication', message: 'Invalid registration code' } });
      return;
    }
    response.status(201).json(await store.registerDevice(payload.name));
  }));

  const requireDashboard = dashboardAuth(env);
  const requireDevice = deviceAuth(store);

  app.get('/api/session', requireDashboard, (_request, response) => {
    response.json({ ok: true });
  });
  app.delete('/api/session', requireDashboard, (_request, response) => {
    response.clearCookie(DASHBOARD_SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.NODE_ENV === 'production',
      path: '/',
    });
    response.json({ ok: true });
  });

  app.get('/api/devices', requireDashboard, asyncRoute(async (_request, response) => {
    response.json({ items: await store.listDevices() });
  }));

  app.get('/api/connectors', requireDashboard, asyncRoute(async (_request, response) => {
    response.json({ items: await store.listConnectors() });
  }));
  app.get('/api/connectors/:connectorId', requireDashboard, asyncRoute(async (request, response) => {
    const connector = await store.getConnector(request.params.connectorId);
    if (!connector) {
      response.status(404).json({ error: { type: 'not_found', message: 'Connector not found' } });
      return;
    }
    response.json({ connector, runs: [] });
  }));
  app.patch('/api/connectors/:connectorId', requireDashboard, asyncRoute(async (request, response) => {
    const patch = z.object({ enabled: z.boolean() }).strict().parse(request.body);
    const connector = await store.updateConnector(request.params.connectorId, patch);
    if (!connector) {
      response.status(404).json({ error: { type: 'not_found', message: 'Connector not found' } });
      return;
    }
    response.json({ connector });
  }));
  app.get('/api/connectors/:connectorId/runs', requireDashboard, (_request, response) => {
    response.json({ items: [] });
  });
  app.post('/api/connectors/:connectorId/retry', requireDashboard, asyncRoute(async (request, response) => {
    const connector = await store.getConnector(request.params.connectorId);
    if (!connector) {
      response.status(404).json({ error: { type: 'not_found', message: 'Connector not found' } });
      return;
    }
    if (connector.id === 'dealership-website') {
      response.json({ inventory: await inventory.sync() });
      return;
    }
    const approvalRequired = connector.capabilities.includes('write');
    response.status(202).json({ job: await store.createJob(connector.id, 'sync', approvalRequired) });
  }));

  app.get('/api/inventory/active', requireDashboard, asyncRoute(async (_request, response) => {
    response.json(await inventory.list());
  }));
  app.post('/api/inventory/sync-live', requireDashboard, asyncRoute(async (request, response) => {
    response.json(await inventory.sync({
      sourceUrl: request.body?.sourceUrl,
      timeoutSeconds: request.body?.timeoutSeconds,
      persist: request.body?.persist,
    }));
  }));
  app.get('/api/bank-brain/valuations/status', requireDashboard, asyncRoute(async (_request, response) => {
    response.json(await inventory.valuationStatus());
  }));
  app.post(
    '/api/bank-brain/valuations/upload',
    requireDashboard,
    express.raw({ type: () => true, limit: '5mb' }),
    asyncRoute(async (request, response) => {
      const encodedFilename = z.string().min(1).max(512).parse(request.header('x-file-name'));
      const filename = decodeURIComponent(encodedFilename).replace(/^.*[\\/]/, '');
      const raw = Buffer.isBuffer(request.body)
        ? new Uint8Array(request.body)
        : new Uint8Array();
      if (!raw.byteLength) {
        response.status(400).json({
          error: {
            type: 'validation',
            message: 'The JD Power valuation file is empty.',
          },
        });
        return;
      }
      response.json(await inventory.uploadValuations(
        raw,
        filename,
        request.header('content-type') ?? 'application/vnd.ms-excel',
      ));
    }),
  );
  app.get('/api/vehicles', requireDashboard, asyncRoute(async (_request, response) => {
    response.json(await inventory.list());
  }));
  app.get('/api/vehicles/:vin', requireDashboard, asyncRoute(async (request, response) => {
    const vin = vinSchema.parse(request.params.vin);
    const vehicle = await inventory.get(vin);
    if (!vehicle) {
      response.status(404).json({ error: { type: 'not_found', message: 'Vehicle not found' } });
      return;
    }
    response.json({ vehicle });
  }));
  app.post('/api/vehicles/:vin/source-lookups', requireDashboard, asyncRoute(async (request, response) => {
    const vin = vinSchema.parse(request.params.vin);
    const payload = z.object({
      connectorIds: z.array(z.enum(['reconvision', 'onemicro'])).min(1).max(2),
    }).strict().parse(request.body);
    const connectorIds = [...new Set(payload.connectorIds)];
    const jobs = [];
    for (const connectorId of connectorIds) {
      const connector = await store.getConnector(connectorId);
      if (!connector || connector.executionLocation !== 'local-agent') {
        response.status(409).json({
          error: {
            type: 'configuration',
            message: `${connectorId} is not configured as a Local Agent connector.`,
          },
        });
        return;
      }
      jobs.push(await store.createJob(connectorId, 'lookup-vin', false, { vin }));
    }
    response.status(202).json({ jobs });
  }));
  app.get('/api/automation/jobs/:jobId', requireDashboard, asyncRoute(async (request, response) => {
    const job = await store.getJob(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: { type: 'not_found', message: 'Automation job not found' } });
      return;
    }
    response.json({ job });
  }));

  app.post('/api/extension/drivecentric/context', requireDashboard, asyncRoute(async (request, response) => {
    const context = leadContextIngestSchema.parse(request.body);
    const stored = await store.ingestDriveCentric(context);
    const suggestions = (await store
      .listVehicles())
      .filter((vehicle) => !context.vehicleInterest?.vin || vehicle.vin === context.vehicleInterest.vin)
      .slice(0, 5);
    response.status(202).json({ ok: true, ...stored, suggestions });
  }));

  app.post('/api/agent/heartbeat', requireDevice, asyncRoute(async (request, response) => {
    const heartbeat = agentHeartbeatSchema.parse(request.body);
    if (heartbeat.deviceId !== response.locals.deviceId || !(await store.heartbeat(heartbeat.deviceId, heartbeat))) {
      response.status(403).json({ error: { type: 'authorization', message: 'Device ID does not match token' } });
      return;
    }
    response.json({ ok: true, receivedAt: new Date().toISOString() });
  }));
  app.post('/api/agent/jobs/lease', requireDevice, asyncRoute(async (_request, response) => {
    response.json({ job: await store.leaseJob() });
  }));
  app.post('/api/agent/jobs/:jobId/complete', requireDevice, asyncRoute(async (request, response) => {
    await store.completeJob(request.params.jobId, request.body.success === true, request.body.result);
    response.json({ ok: true });
  }));

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const validation = error && typeof error === 'object' && 'issues' in error;
    const inventorySync = error instanceof InventorySyncError;
    process.stderr.write(`${JSON.stringify({
      level: validation ? 'warn' : 'error',
      event: 'gateway.request_failed',
      requestId: response.locals.requestId,
      method: request.method,
      path: request.path,
      errorType: validation ? 'validation' : inventorySync ? 'connector_sync' : 'internal',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })}\n`);
    response.status(validation ? 400 : inventorySync ? error.statusCode : 500).json({
      error: {
        type: validation ? 'validation' : inventorySync ? 'connector_sync' : 'internal',
        message: validation
          ? 'Request validation failed'
          : inventorySync
            ? error.message
            : 'Internal server error',
        requestId: response.locals.requestId,
      },
    });
  });
  return app;
}
