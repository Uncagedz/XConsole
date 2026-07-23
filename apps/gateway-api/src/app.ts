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
import { dashboardAuth, deviceAuth, registrationCodeMatches } from './auth.js';
import type { GatewayEnv } from './env.js';
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
  const origins = new Set(env.CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean));
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
      origin(origin, callback) {
        if (!origin || origins.has(origin) || origin.startsWith('chrome-extension://')) callback(null, true);
        else callback(new Error('CORS origin blocked'));
      },
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'xconsole-gateway-api', databaseConfigured: Boolean(env.DATABASE_URL) });
  });

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
    const connector = await store.updateConnector(request.params.connectorId, { enabled: Boolean(request.body.enabled) });
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
    const approvalRequired = connector.capabilities.includes('write');
    response.status(202).json({ job: await store.createJob(connector.id, 'sync', approvalRequired) });
  }));

  app.get('/api/vehicles', requireDashboard, asyncRoute(async (_request, response) => {
    response.json({ items: await store.listVehicles() });
  }));
  app.get('/api/vehicles/:vin', requireDashboard, asyncRoute(async (request, response) => {
    const vin = vinSchema.parse(request.params.vin);
    const vehicle = await store.getVehicle(vin);
    if (!vehicle) {
      response.status(404).json({ error: { type: 'not_found', message: 'Vehicle not found' } });
      return;
    }
    response.json({ vehicle });
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

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const validation = error && typeof error === 'object' && 'issues' in error;
    response.status(validation ? 400 : 500).json({
      error: {
        type: validation ? 'validation' : 'internal',
        message: validation ? 'Request validation failed' : 'Internal server error',
        requestId: response.locals.requestId,
      },
    });
  });
  return app;
}
