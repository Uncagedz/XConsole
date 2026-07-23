import { hostname } from 'node:os';
import { capturePageForConnectorDevelopment } from './recording.js';
import { loadConfig, saveConfig } from './config.js';
import { registerDevice } from './api.js';
import { runAgent } from './runner.js';
import { logger } from './logger.js';

async function main() {
  const command = process.argv[2] ?? 'run';
  if (command === 'register') {
    const gatewayUrl = process.env.XCONSOLE_GATEWAY_URL;
    const registrationCode = process.env.XCONSOLE_DEVICE_REGISTRATION_CODE;
    if (!gatewayUrl || !registrationCode) {
      throw new Error('Set XCONSOLE_GATEWAY_URL and XCONSOLE_DEVICE_REGISTRATION_CODE for one-time registration');
    }
    const registered = await registerDevice(gatewayUrl, registrationCode, hostname());
    await saveConfig({
      gatewayUrl,
      deviceId: registered.deviceId,
      deviceToken: registered.deviceToken,
      agentVersion: '0.1.0',
      heartbeatIntervalMs: 30_000,
      pollIntervalMs: 5_000,
    });
    logger.info('agent.registered', { deviceId: registered.deviceId });
    return;
  }

  const config = await loadConfig();
  if (command === 'record') {
    const folder = await capturePageForConnectorDevelopment(config, process.argv[3]);
    logger.info('recording.saved', { folder, reviewed: false });
    return;
  }

  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  await runAgent(config, controller.signal);
}

main().catch((error) => {
  logger.error('agent.fatal', { message: error instanceof Error ? error.message : 'Unknown fatal error' });
  process.exitCode = 1;
});
