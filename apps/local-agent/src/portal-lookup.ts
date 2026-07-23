import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chromium, type Page } from 'playwright-core';
import { vinSchema } from '@drivecentric-ai/shared';
import type {
  AgentConfig,
  PortalConnectorId,
  PortalLookupConfig,
} from './config.js';
import { failureArtifactsDirectory, portalProfileDirectory } from './paths.js';
import { normalizePortalFields } from './portal-result.js';
import { sanitizeCapturedHtml } from './sanitize.js';

type FailureArtifacts = {
  screenshotPath?: string;
  htmlSnapshotPath?: string;
};

export class PortalLookupError extends Error {
  constructor(
    readonly errorType: 'configuration' | 'reauthentication_required' | 'selector_changed' | 'portal_unavailable',
    message: string,
    readonly reauthenticationRequired = false,
    readonly artifacts: FailureArtifacts = {},
  ) {
    super(message);
    this.name = 'PortalLookupError';
  }
}

function portalConfig(config: AgentConfig, connectorId: PortalConnectorId) {
  const portal = config.portals[connectorId];
  if (!portal) {
    throw new PortalLookupError(
      'configuration',
      `${connectorId} needs reviewed portal URLs and selectors in the encrypted Local Agent configuration.`,
    );
  }
  return portal;
}

function safeSourceUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function hasAuthenticationChallenge(page: Page) {
  const password = await page.locator('input[type="password"]').count();
  const verification = await page.locator(
    'input[autocomplete="one-time-code"], iframe[src*="captcha" i], [data-sitekey]',
  ).count();
  return password > 0 || verification > 0 || /(?:login|log-in|sign-in|authenticate|mfa)/i.test(new URL(page.url()).pathname);
}

async function saveFailureArtifacts(page: Page, connectorId: PortalConnectorId) {
  const folder = join(
    failureArtifactsDirectory,
    connectorId,
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  await mkdir(folder, { recursive: true });
  const screenshotPath = join(folder, 'page.png');
  const htmlSnapshotPath = join(folder, 'page.html');
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  await writeFile(
    htmlSnapshotPath,
    sanitizeCapturedHtml(await page.content()),
    'utf8',
  ).catch(() => undefined);
  return { screenshotPath, htmlSnapshotPath };
}

async function optionalText(page: Page, selector: string | undefined, timeoutMs: number) {
  if (!selector) return undefined;
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  return (await locator.innerText()).trim();
}

export async function loginToPortal(config: AgentConfig, connectorId: PortalConnectorId) {
  const portal = portalConfig(config, connectorId);
  const profile = portalProfileDirectory(connectorId);
  await mkdir(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: config.chromeExecutablePath ? undefined : 'chrome',
    executablePath: config.chromeExecutablePath,
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(portal.loginUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
    const prompt = createInterface({ input: stdin, output: stdout });
    await prompt.question(
      `Complete ${connectorId} login/MFA in Chrome, navigate to the VIN lookup page, then press Enter here. `,
    );
    prompt.close();
    if (await hasAuthenticationChallenge(page)) {
      throw new PortalLookupError(
        'reauthentication_required',
        `${connectorId} still appears to be on an authentication page.`,
        true,
      );
    }
    return { connectorId, authenticated: true, currentUrl: page.url() };
  } finally {
    await context.close();
  }
}

export async function lookupPortalVin(
  config: AgentConfig,
  connectorId: PortalConnectorId,
  rawVin: string,
) {
  const vin = vinSchema.parse(rawVin);
  const portal = portalConfig(config, connectorId);
  const profile = portalProfileDirectory(connectorId);
  await mkdir(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    headless: portal.headless,
    channel: config.chromeExecutablePath ? undefined : 'chrome',
    executablePath: config.chromeExecutablePath,
  });
  const page = context.pages()[0] ?? await context.newPage();
  try {
    await page.goto(portal.lookupUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
    if (await hasAuthenticationChallenge(page)) {
      throw new PortalLookupError(
        'reauthentication_required',
        `${connectorId} needs manual login or MFA. Run the portal-login command on the Windows Local Agent.`,
        true,
      );
    }

    const vinInput = page.locator(portal.vinInputSelector).first();
    await vinInput.waitFor({ state: 'visible', timeout: portal.timeoutMs });
    await vinInput.fill(vin);
    if (portal.submitSelector) await page.locator(portal.submitSelector).first().click();
    else await vinInput.press('Enter');

    const result = page.locator(portal.resultSelector).first();
    await result.waitFor({ state: 'visible', timeout: portal.timeoutMs });
    const summary = (await result.innerText()).trim().slice(0, 20_000);
    const entries = await Promise.all(
      Object.entries(portal.fieldSelectors).map(async ([name, selector]) => [
        name,
        await optionalText(page, selector, portal.timeoutMs),
      ] as const),
    );
    return {
      ok: true,
      connectorId,
      vin,
      observedAt: new Date().toISOString(),
      fields: normalizePortalFields(connectorId, Object.fromEntries(entries)),
      summary,
      sourceUrl: safeSourceUrl(page.url()),
    };
  } catch (error) {
    if (error instanceof PortalLookupError) throw error;
    const artifacts = await saveFailureArtifacts(page, connectorId);
    const selectorChanged = /locator|waiting for|timeout/i.test(error instanceof Error ? error.message : '');
    throw new PortalLookupError(
      selectorChanged ? 'selector_changed' : 'portal_unavailable',
      selectorChanged
        ? `${connectorId} VIN lookup selectors no longer match the reviewed portal page.`
        : `${connectorId} VIN lookup failed.`,
      false,
      artifacts,
    );
  } finally {
    await context.close();
  }
}
