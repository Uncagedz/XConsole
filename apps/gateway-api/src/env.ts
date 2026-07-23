import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().optional(),
  XCONSOLE_API_TOKEN: z.string().min(24).default('development-only-token-change-me'),
  XCONSOLE_DASHBOARD_SESSION_SECRET: z.string().min(32).optional(),
  XCONSOLE_DASHBOARD_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  XCONSOLE_DEVICE_REGISTRATION_CODE: z.string().min(16).default('development-device-code'),
  LEGACY_AUTOMATION_API_URL: z.string().url().optional(),
  XCONSOLE_LEGACY_API_TOKEN: z.string().min(32).optional(),
  LEGACY_INVENTORY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  LEGACY_INVENTORY_CACHE_TTL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  XCONSOLE_ALLOW_INSECURE_DEV: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  CHROME_EXTENSION_ORIGINS: z.string().default(''),
});

export type GatewayEnv = z.infer<typeof schema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  const parsed = schema.parse(source);
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.DATABASE_URL) {
      throw new Error('DATABASE_URL must be configured in production');
    }
    if (parsed.XCONSOLE_API_TOKEN.startsWith('development-')) {
      throw new Error('XCONSOLE_API_TOKEN must be configured in production');
    }
    if (!parsed.XCONSOLE_DASHBOARD_SESSION_SECRET) {
      throw new Error('XCONSOLE_DASHBOARD_SESSION_SECRET must be configured in production');
    }
    if (parsed.XCONSOLE_DEVICE_REGISTRATION_CODE.startsWith('development-')) {
      throw new Error('XCONSOLE_DEVICE_REGISTRATION_CODE must be configured in production');
    }
  }
  return parsed;
}
