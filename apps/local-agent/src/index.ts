import { hostname } from 'node:os';
import { capturePageForConnectorDevelopment } from './recording.js';
import {
  configurePortal,
  loadConfig,
  portalConnectorIdSchema,
  portalLookupConfigSchema,
  saveConfig,
} from './config.js';
import { registerDevice } from './api.js';
import { runAgent } from './runner.js';
import { logger } from './logger.js';
import { loginToPortal, lookupPortalVin } from './portal-lookup.js';

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
      portals: {},
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
  if (command === 'configure-portal') {
    const connectorId = portalConnectorIdSchema.parse(process.argv[3]);
    const fieldSelectors = process.env.XCONSOLE_PORTAL_FIELD_SELECTORS
      ? JSON.parse(process.env.XCONSOLE_PORTAL_FIELD_SELECTORS)
      : {};
    await configurePortal(config, connectorId, portalLookupConfigSchema.parse({
      loginUrl: process.env.XCONSOLE_PORTAL_LOGIN_URL,
      lookupUrl: process.env.XCONSOLE_PORTAL_LOOKUP_URL,
      vinInputSelector: process.env.XCONSOLE_PORTAL_VIN_INPUT_SELECTOR,
      submitSelector: process.env.XCONSOLE_PORTAL_SUBMIT_SELECTOR || undefined,
      resultSelector: process.env.XCONSOLE_PORTAL_RESULT_SELECTOR,
      fieldSelectors,
      headless: process.env.XCONSOLE_PORTAL_HEADLESS !== 'false',
      timeoutMs: process.env.XCONSOLE_PORTAL_TIMEOUT_MS
        ? Number(process.env.XCONSOLE_PORTAL_TIMEOUT_MS)
        : undefined,
    }));
    logger.info('portal.configured', { connectorId });
    return;
  }
  if (command === 'portal-login') {
    const connectorId = portalConnectorIdSchema.parse(process.argv[3]);
    const username = process.env.XCONSOLE_PORTAL_USERNAME;
    const password = process.env.XCONSOLE_PORTAL_PASSWORD;
    await loginToPortal(
      config,
      connectorId,
      username && password ? { username, password } : undefined,
    );
    logger.info('portal.authenticated', { connectorId });
    return;
  }
  if (command === 'lookup-vin') {
    const connectorId = portalConnectorIdSchema.parse(process.argv[3]);
    const result = await lookupPortalVin(config, connectorId, process.argv[4] ?? '');
    logger.info('portal.lookup.completed', {
      connectorId,
      vin: result.vin,
      observedAt: result.observedAt,
    });
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
