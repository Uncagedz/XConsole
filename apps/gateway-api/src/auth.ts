import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { GatewayEnv } from './env.js';
import type { GatewayStoreContract } from './store.js';

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function dashboardAuth(env: GatewayEnv) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (env.NODE_ENV !== 'production' && env.XCONSOLE_ALLOW_INSECURE_DEV) {
      next();
      return;
    }
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!constantTimeEqual(token, env.XCONSOLE_API_TOKEN)) {
      response.status(401).json({ error: { type: 'authentication', message: 'Authentication required' } });
      return;
    }
    next();
  };
}

export function deviceAuth(store: GatewayStoreContract) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
    const token = request.header('authorization')?.replace(/^Device\s+/i, '') ?? '';
    const device = token ? await store.authenticateDevice(token) : undefined;
    if (!device) {
      response.status(401).json({ error: { type: 'authentication', message: 'Valid device token required' } });
      return;
    }
    response.locals.deviceId = device.id;
    next();
    } catch (error) {
      next(error);
    }
  };
}

export function registrationCodeMatches(actual: string, expected: string) {
  return constantTimeEqual(actual, expected);
}
