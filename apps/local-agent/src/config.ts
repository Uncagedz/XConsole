import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { agentConfigPath, agentDataDirectory } from './paths.js';
import { protectForCurrentWindowsUser, unprotectForCurrentWindowsUser } from './dpapi.js';

const configSchema = z.object({
  gatewayUrl: z.string().url(),
  deviceId: z.string().min(1),
  deviceToken: z.string().min(24),
  agentVersion: z.string().default('0.1.0'),
  heartbeatIntervalMs: z.number().int().min(10_000).default(30_000),
  pollIntervalMs: z.number().int().min(1_000).default(5_000),
  chromeExecutablePath: z.string().optional(),
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
