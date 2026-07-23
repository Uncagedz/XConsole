import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { agentConfigPath, agentDataDirectory } from './paths.js';
import { protectForCurrentWindowsUser, unprotectForCurrentWindowsUser } from './dpapi.js';

export const portalConnectorIdSchema = z.enum(['reconvision', 'onemicro']);
export type PortalConnectorId = z.infer<typeof portalConnectorIdSchema>;

export const portalLookupConfigSchema = z.object({
  loginUrl: z.string().url(),
  lookupUrl: z.string().url(),
  vinInputSelector: z.string().min(1),
  submitSelector: z.string().min(1).optional(),
  resultSelector: z.string().min(1),
  fieldSelectors: z.object({
    stage: z.string().min(1).optional(),
    openWork: z.string().min(1).optional(),
    frontlineReady: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    holder: z.string().min(1).optional(),
  }).default({}),
  headless: z.boolean().default(true),
  timeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),
});
export type PortalLookupConfig = z.infer<typeof portalLookupConfigSchema>;

const configSchema = z.object({
  gatewayUrl: z.string().url(),
  deviceId: z.string().min(1),
  deviceToken: z.string().min(24),
  agentVersion: z.string().default('0.1.0'),
  heartbeatIntervalMs: z.number().int().min(10_000).default(30_000),
  pollIntervalMs: z.number().int().min(1_000).default(5_000),
  chromeExecutablePath: z.string().optional(),
  portals: z.object({
    reconvision: portalLookupConfigSchema.optional(),
    onemicro: portalLookupConfigSchema.optional(),
  }).default({}),
});

export type AgentConfig = z.infer<typeof configSchema>;

export async function saveConfig(config: AgentConfig) {
  await mkdir(agentDataDirectory, { recursive: true });
  const plaintext = Buffer.from(JSON.stringify(configSchema.parse(config)), 'utf8');
  const encrypted = await protectForCurrentWindowsUser(plaintext);
  await writeFile(agentConfigPath, encrypted, { mode: 0o600 });
}

export async function loadConfig() {
  const encrypted = await readFile(agentConfigPath);
  const plaintext = await unprotectForCurrentWindowsUser(encrypted);
  return configSchema.parse(JSON.parse(plaintext.toString('utf8')));
}

export async function configurePortal(
  config: AgentConfig,
  connectorId: PortalConnectorId,
  portal: PortalLookupConfig,
) {
  const next = configSchema.parse({
    ...config,
    portals: {
      ...config.portals,
      [connectorId]: portalLookupConfigSchema.parse(portal),
    },
  });
  await saveConfig(next);
  return next;
}
