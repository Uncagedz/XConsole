import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { GatewayEnv } from './env.js';
import type { GatewayStoreContract } from './store.js';

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const DASHBOARD_SESSION_COOKIE = 'xconsole_dashboard_session';

function cookieValue(request: Request, name: string) {
  const cookies = request.header('cookie')?.split(';') ?? [];
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

function sessionSecret(env: GatewayEnv) {
  return env.XCONSOLE_DASHBOARD_SESSION_SECRET ?? env.XCONSOLE_API_TOKEN;
}

function sessionSignature(expiresAt: string, env: GatewayEnv) {
  return createHmac('sha256', sessionSecret(env)).update(expiresAt).digest('base64url');
}

export function dashboardTokenMatches(token: string, env: GatewayEnv) {
  return constantTimeEqual(token, env.XCONSOLE_API_TOKEN);
}

export function issueDashboardSession(env: GatewayEnv) {
  const expiresAt = String(Date.now() + env.XCONSOLE_DASHBOARD_SESSION_TTL_HOURS * 60 * 60 * 1_000);
  return {
    value: `${expiresAt}.${sessionSignature(expiresAt, env)}`,
    expires: new Date(Number(expiresAt)),
  };
}

export function dashboardSessionMatches(request: Request, env: GatewayEnv) {
  const [expiresAt, suppliedSignature] = cookieValue(request, DASHBOARD_SESSION_COOKIE).split('.', 2);
  if (!expiresAt || !suppliedSignature || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) {
    return false;
  }
  return constantTimeEqual(suppliedSignature, sessionSignature(expiresAt, env));
}

export function dashboardAuth(env: GatewayEnv) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (env.NODE_ENV !== 'production' && env.XCONSOLE_ALLOW_INSECURE_DEV) {
      next();
      return;
    }
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!dashboardTokenMatches(token, env) && !dashboardSessionMatches(request, env)) {
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
