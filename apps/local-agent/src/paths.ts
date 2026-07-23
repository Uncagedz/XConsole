import { join } from 'node:path';

const localAppData = process.env.LOCALAPPDATA;
const configuredDataDirectory = process.env.XCONSOLE_AGENT_DATA_DIR?.trim();
if (!localAppData && !configuredDataDirectory) {
  throw new Error('LOCALAPPDATA is required on Windows');
}

export const agentDataDirectory = configuredDataDirectory || join(localAppData!, 'XConsole');
export const agentConfigPath = join(agentDataDirectory, 'agent-config.dpapi');
export const browserProfileDirectory = join(agentDataDirectory, 'browser-profile');
export const recordingsDirectory = join(agentDataDirectory, 'recordings');
export const failureArtifactsDirectory = join(agentDataDirectory, 'failures');
