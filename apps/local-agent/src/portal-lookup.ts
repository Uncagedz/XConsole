import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
  const password = await page.locator('input[type="password"]:visible').count();
  const verification = await page.locator(
    'input[autocomplete="one-time-code"]:visible, iframe[src*="captcha" i]:visible, [data-sitekey]:visible',
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

type PortalCredentials = {
  username: string;
  password: string;
};

function browserExecutable(config: AgentConfig) {
  if (config.chromeExecutablePath) return config.chromeExecutablePath;
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  return existsSync(edge) ? edge : undefined;
}

function browserLaunchOptions(config: AgentConfig) {
  const executablePath = browserExecutable(config);
  return {
    channel: executablePath ? undefined : 'chrome' as const,
    executablePath,
  };
}

async function submitReviewedLogin(
  page: Page,
  connectorId: PortalConnectorId,
  credentials: PortalCredentials,
  timeoutMs: number,
) {
  if (connectorId === 'reconvision') {
    await page.getByRole('textbox', { name: 'Username' }).fill(credentials.username);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.locator('#search_target').first().waitFor({ state: 'visible', timeout: timeoutMs });
    return;
  }

  await page.locator('#username').fill(credentials.username);
  await page.locator('input[type="password"]').first().fill(credentials.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForTimeout(Math.min(8_000, timeoutMs));
}

export async function loginToPortal(
  config: AgentConfig,
  connectorId: PortalConnectorId,
  credentials?: PortalCredentials,
) {
  const portal = portalConfig(config, connectorId);
  const profile = portalProfileDirectory(connectorId);
  await mkdir(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    ...browserLaunchOptions(config),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(portal.loginUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
    if (credentials) {
      if (await hasAuthenticationChallenge(page)) {
        await submitReviewedLogin(page, connectorId, credentials, portal.timeoutMs);
      }
    } else {
      const prompt = createInterface({ input: stdin, output: stdout });
      await prompt.question(
        `Complete ${connectorId} login/MFA in Chrome, navigate to the VIN lookup page, then press Enter here. `,
      );
      prompt.close();
    }
    await page.goto(portal.lookupUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
    if (await hasAuthenticationChallenge(page)) {
      const artifacts = await saveFailureArtifacts(page, connectorId);
      throw new PortalLookupError(
        'reauthentication_required',
        `${connectorId} still appears to be on an authentication page.`,
        true,
        artifacts,
      );
    }
    return { connectorId, authenticated: true, currentUrl: page.url() };
  } finally {
    await context.close();
  }
}

function lines(raw: string) {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function parseReconStage(summary: string) {
  const tableRow = summary.match(/\t([^\t\r\n]+)\t\d{2}\/\d{2}\/\d{4}\s/);
  if (tableRow?.[1]) return tableRow[1].trim();
  const values = lines(summary);
  const updatedIndex = values.findIndex((value) => /^\d{2}\/\d{2}\/\d{4}\s/.test(value));
  return updatedIndex > 0 ? values[updatedIndex - 1] : null;
}

function labeledValue(summary: string, label: string) {
  const values = lines(summary);
  const index = values.findIndex((value) => value.replace(/\s+/g, ' ').toLowerCase() === `${label.toLowerCase()} :`);
  return index >= 0 ? values[index + 1] ?? null : null;
}

async function lookupReconVision(page: Page, portal: PortalLookupConfig, vin: string) {
  const vinInput = page.locator(portal.vinInputSelector).first();
  await vinInput.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await vinInput.fill(vin);
  await vinInput.press('Enter');
  const result = page.locator(portal.resultSelector).first();
  await result.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await result.locator('a[href^="/work_orders/"]').first().waitFor({
    state: 'visible',
    timeout: portal.timeoutMs,
  });
  const summary = (await result.innerText()).trim().slice(0, 20_000);
  const stage = parseReconStage(summary);
  return {
    summary,
    fields: {
      stage,
      openWork: [],
      frontlineReady: stage ? /archived|close ro|frontline/i.test(stage) : null,
    },
  };
}

async function lookupOneMicro(page: Page, portal: PortalLookupConfig, vin: string) {
  const vinInput = page.locator(portal.vinInputSelector).first();
  await vinInput.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await vinInput.fill(vin);
  if (portal.submitSelector) await page.locator(portal.submitSelector).first().click();
  else await vinInput.press('Enter');
  const vinLink = page.getByRole('link', { name: vin, exact: true });
  await vinLink.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await vinLink.click();
  await page.getByText('Tag Location :', { exact: true }).waitFor({
    state: 'visible',
    timeout: portal.timeoutMs,
  });
  const summary = (await page.locator('body').innerText()).trim().slice(0, 20_000);
  return {
    summary,
    fields: {
      location: labeledValue(summary, 'Tag Location') ?? labeledValue(summary, 'Lot Location'),
      holder: null,
      lotLocation: labeledValue(summary, 'Lot Location'),
    },
  };
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
    ...browserLaunchOptions(config),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
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

    const reviewed = connectorId === 'reconvision'
      ? await lookupReconVision(page, portal, vin)
      : await lookupOneMicro(page, portal, vin);
    const entries = await Promise.all(Object.entries(portal.fieldSelectors).map(
      async ([name, selector]) => [name, await optionalText(page, selector, portal.timeoutMs)] as const,
    ));
    const configuredFields = normalizePortalFields(connectorId, Object.fromEntries(entries));
    return {
      ok: true,
      connectorId,
      vin,
      observedAt: new Date().toISOString(),
      fields: { ...configuredFields, ...reviewed.fields },
      summary: reviewed.summary,
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
