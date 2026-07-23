import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  ADMIN_WEB_ORIGIN: z.string().default(''),
  EXTENSION_ORIGIN: z.string().default('chrome-extension://replace-after-install'),
  CORS_ORIGINS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_PEPPER: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LLM_PROVIDER: z.enum(['openai', 'mock']).default('openai'),
  USE_MOCK_AI: z.string().optional().transform((value) => value === 'true'),
  VITE_USE_MOCK_AI: z.string().optional().transform((value) => value === 'true'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(900),
  XCONSOLE_GATEWAY_URL: z.string().url().optional(),
  XCONSOLE_GATEWAY_TOKEN: z.string().min(24).optional(),
});

export const env = envSchema.parse(process.env);

export const apiPort = env.PORT ?? env.API_PORT;
