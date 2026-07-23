import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import { env } from './env.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { xconsoleRoutes } from './routes/xconsole.routes.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const adminWebDistPath = resolve(currentDir, '../../admin-web/dist');
const adminWebIndexPath = resolve(adminWebDistPath, 'index.html');
const apiRoutePrefixes = ['/admin', '/ai', '/auth', '/health', '/inventory', '/users', '/xconsole'];

function normalizeConfiguredOrigin(origin: string | undefined) {
  const trimmed = origin?.trim().replace(/\/+$/, '') ?? '';
  if (!trimmed) return '';
  if (/^(?:https?|chrome-extension):\/\//i.test(trimmed)) return trimmed;
  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

function configuredOrigins() {
  return [
    env.ADMIN_WEB_ORIGIN,
    env.EXTENSION_ORIGIN,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_STATIC_URL,
    ...(env.CORS_ORIGINS?.split(',') ?? []),
  ]
    .map((origin) => normalizeConfiguredOrigin(origin))
    .filter(Boolean);
}

function isApiRoute(pathname: string) {
  return apiRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function wantsHtml(req: express.Request) {
  return req.accepts(['html', 'json']) === 'html';
}

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(configuredOrigins());
  const hasAdminWeb = existsSync(adminWebIndexPath);

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  if (hasAdminWeb) {
    app.use(
      '/assets',
      express.static(resolve(adminWebDistPath, 'assets'), {
        fallthrough: false,
        immutable: true,
        index: false,
        maxAge: '1y',
      }),
    );
    app.use(express.static(adminWebDistPath, { index: false }));
  }
  app.use(compression());
  app.use(hpp());
  app.use(
    cors({
      origin(origin, callback) {
        const normalizedOrigin = origin?.replace(/\/+$/, '');
        const isLocalDevOrigin =
          env.NODE_ENV !== 'production' &&
          Boolean(normalizedOrigin?.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/));
        const isRailwayPublicOrigin = Boolean(normalizedOrigin?.match(/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i));
        if (
          !origin ||
          (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) ||
          isRailwayPublicOrigin ||
          origin.startsWith('chrome-extension://') ||
          isLocalDevOrigin
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin blocked: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.setHeader('x-railway-commit', process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local');
    res.json({ ok: true, service: 'drivecentric-ai-api' });
  });

  app.use('/auth', authRoutes);
  app.use('/users', usersRoutes);
  app.use('/ai', aiRoutes);
  app.use('/inventory', inventoryRoutes);
  app.use('/admin', adminRoutes);
  app.use('/xconsole', xconsoleRoutes);

  if (hasAdminWeb) {
    app.get('*', (req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || isApiRoute(req.path) || !wantsHtml(req)) {
        next();
        return;
      }
      res.sendFile(adminWebIndexPath);
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ ok: true, service: 'drivecentric-ai-api', health: '/health' });
    });
  }

  app.use(errorHandler);

  return app;
}
