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
import {
  normalizePortalFields,
  parseCarfaxReport,
  parseOneMicroHistory,
  parseOneMicroKey,
  parseReconRepairOrder,
  parseReconStage,
  parseReconTimeline,
} from './portal-result.js';
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
    'input[autocomplete="one-time-code"]:visible, iframe[src*="captcha" i]:visible, iframe[src*="challenge" i]:visible, [data-sitekey]:visible, [class*="captcha" i]:visible, [class*="verification" i]:visible',
  ).count();
  const signIn = await page.locator('a[href="/login"]:visible').count();
  const verificationText = await page.getByText(
    /verification required|complete verification|slide(?:r)? to verify|security check/i,
  ).count();
  return password > 0
    || verification > 0
    || verificationText > 0
    || signIn > 0
    || /(?:login|log-in|sign-in|authenticate|mfa|landingPage)/i.test(new URL(page.url()).pathname);
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

  if (connectorId === 'carfax') {
    await page.getByRole('textbox', { name: 'Email address' }).fill(credentials.username);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/https:\/\/www\.carfaxonline\.com\//i, { timeout: timeoutMs });
    return;
  }

  await page.locator('#username').fill(credentials.username);
  await page.locator('input[type="password"]').first().fill(credentials.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForTimeout(Math.min(8_000, timeoutMs));
}

async function navigateToPortalLookup(
  page: Page,
  connectorId: PortalConnectorId,
  portal: PortalLookupConfig,
) {
  if (connectorId !== 'onemicro') {
    await page.goto(portal.lookupUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
    return;
  }
  if (!/^https?:/i.test(page.url())) {
    await page.goto(portal.loginUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
  }
  if (new URL(page.url()).pathname === new URL(portal.lookupUrl).pathname) return;
  const inventory = page.getByRole('link', { name: 'Inventory', exact: true });
  await inventory.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await inventory.click();
  const search = page.getByRole('menuitem', { name: 'Search', exact: true });
  await search.waitFor({ state: 'visible', timeout: portal.timeoutMs });
  await search.click();
  await page.waitForURL(new URL(portal.lookupUrl).toString(), { timeout: portal.timeoutMs });
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
    if (connectorId === 'carfax' && !(await hasAuthenticationChallenge(page))) {
      const signIn = page.locator('a[href="/login"]');
      if (await signIn.count()) {
        await page.goto(new URL('/login', page.url()).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: portal.timeoutMs,
        });
      }
    }
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
    await navigateToPortalLookup(page, connectorId, portal);
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
  const resultRow = result.locator('tr[data-test^="vehicle-"]').filter({ hasText: vin }).first();
  const resultLinks = result.locator('a[href*="/work_orders/"]');
  if (await resultLinks.count() === 0) {
    await resultRow.waitFor({ state: 'visible', timeout: portal.timeoutMs });
    await resultRow.click();
    await page.waitForTimeout(1_000);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }
  const summary = (
    await (await resultLinks.count() > 0 ? result : page.locator('body')).innerText()
  ).trim().slice(0, 50_000);
  const stage = parseReconStage(summary);
  const workOrderLinks = await page.locator('a[href*="/work_orders/"]').evaluateAll((anchors) => (
    anchors.map((anchor) => ({
      href: (anchor as HTMLAnchorElement).href,
      label: (anchor.textContent ?? '').trim(),
    })).filter((item) => /\/work_orders\/\d+(?:[/?#]|$)/.test(item.href))
  ));
  const uniqueLinks = [...new Map(workOrderLinks.map((item) => [item.href, item])).values()].slice(0, 12);
  const repairOrders = [];
  for (const link of uniqueLinks) {
    const detailPage = await page.context().newPage();
    try {
      await detailPage.goto(link.href, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
      const detail = (await detailPage.locator('body').innerText()).trim().slice(0, 50_000);
      repairOrders.push(parseReconRepairOrder(detail, safeSourceUrl(link.href), link.label));
    } catch {
      repairOrders.push(parseReconRepairOrder('', safeSourceUrl(link.href), link.label));
    } finally {
      await detailPage.close();
    }
  }
  const tableTimeline = parseReconTimeline(summary, safeSourceUrl(page.url()));
  const timeline = repairOrders.length
    ? repairOrders.map((order, index) => {
        const tableOrder = tableTimeline.find((candidate) => (
          candidate.repairOrder && candidate.repairOrder === order.repairOrder
        )) ?? tableTimeline[index];
        return {
          ...order,
          department: order.department ?? tableOrder?.department ?? null,
          status: order.status ?? tableOrder?.status ?? null,
          openedAt: order.openedAt ?? tableOrder?.openedAt ?? null,
          completedAt: order.completedAt ?? tableOrder?.completedAt ?? null,
        };
      })
    : tableTimeline;
  const completedItems = timeline.flatMap((order) => order.workPerformed);
  return {
    summary,
    fields: {
      stage,
      openWork: completedItems,
      frontlineReady: stage ? /archived|close ro|frontline/i.test(stage) : null,
      repairOrders: timeline,
      timeline,
      workSummary: completedItems.length
        ? completedItems.slice(0, 8).join(' · ')
        : `${timeline.length} repair order${timeline.length === 1 ? '' : 's'} found`,
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
  const imageUrls = await page.locator('img').evaluateAll((images) => images
    .map((image) => (image as HTMLImageElement).src)
    .filter((url) => Boolean(url) && /(?:key|tag|checkout|history|event)/i.test(url)));
  let historyFields = parseOneMicroHistory([]);
  const historyLink = page.locator('a[href$="/tag-history"]').first();
  if (await historyLink.count()) {
    const historyPage = await page.context().newPage();
    try {
      const historyHref = await historyLink.getAttribute('href');
      await historyPage.goto(new URL(historyHref ?? '', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: portal.timeoutMs,
      });
      const historyRows = historyPage.locator('table tbody tr');
      await historyRows.first().waitFor({ state: 'visible', timeout: portal.timeoutMs });
      const rows = await historyRows.evaluateAll((elements) => elements.map((element) => {
        const cells = Array.from(element.querySelectorAll('td')).map((cell) => (
          (cell.textContent ?? '').replace(/\s+/g, ' ').trim() || null
        ));
        return {
          createdOn: cells[0] ?? null,
          createdBy: cells[1] ?? null,
          closedOn: cells[2] ?? null,
          closedBy: cells[3] ?? null,
          event: cells[4] ?? null,
          kiosk: cells[5] ?? null,
          tagId: cells[6] ?? null,
          reason: cells[7] ?? null,
        };
      }));
      const latestCheckoutIndex = rows.findIndex((row) => (
        /\b(?:remove|checkout|assign)\b/i.test(row.event ?? '')
      ));
      const historyImageUrls: string[] = [];
      if (latestCheckoutIndex >= 0) {
        const imageButton = historyRows.nth(latestCheckoutIndex).getByRole('button', { name: 'Images' });
        if (await imageButton.count()) {
          await imageButton.click();
          const dialog = historyPage.locator('[role="dialog"]').first();
          await dialog.waitFor({ state: 'visible', timeout: Math.min(5_000, portal.timeoutMs) }).catch(() => undefined);
          historyImageUrls.push(...await dialog.locator('img').evaluateAll((images) => images
            .map((image) => (image as HTMLImageElement).src)
            .filter(Boolean)));
        }
      }
      historyFields = parseOneMicroHistory(rows, historyImageUrls);
    } finally {
      await historyPage.close();
    }
  }
  const detailFields = parseOneMicroKey(summary, imageUrls);
  return {
    summary,
    fields: {
      ...detailFields,
      ...historyFields,
      activity: historyFields.activity.length ? historyFields.activity : detailFields.activity,
      keyImageUrl: historyFields.keyImageUrl ?? detailFields.keyImageUrl,
      location: labeledValue(summary, 'Tag Location')
        ?? detailFields.location,
      lotLocation: labeledValue(summary, 'Lot Location')
        ?? detailFields.lotLocation,
    },
  };
}

async function lookupCarfax(page: Page, portal: PortalLookupConfig, vin: string) {
  const reportUrl = new URL(`/vhr/${encodeURIComponent(vin)}`, portal.lookupUrl).toString();
  await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
  if (await hasAuthenticationChallenge(page)) {
    throw new PortalLookupError(
      'reauthentication_required',
      'carfax needs manual login or MFA. Run the portal-login command on the Windows Local Agent.',
      true,
    );
  }
  await page.getByRole('heading', { name: 'CARFAX Report' }).waitFor({
    state: 'visible',
    timeout: portal.timeoutMs,
  });
  await page.getByText(`VIN: ${vin}`, { exact: false }).first().waitFor({
    state: 'visible',
    timeout: portal.timeoutMs,
  });
  const summary = (await page.locator('main').innerText()).trim().slice(0, 100_000);
  return {
    summary,
    fields: parseCarfaxReport(summary, safeSourceUrl(page.url())),
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
    await navigateToPortalLookup(page, connectorId, portal);
    if (await hasAuthenticationChallenge(page)) {
      if (portal.loginUsername && portal.loginPassword) {
        await page.goto(portal.loginUrl, { waitUntil: 'domcontentloaded', timeout: portal.timeoutMs });
        await submitReviewedLogin(page, connectorId, {
          username: portal.loginUsername,
          password: portal.loginPassword,
        }, portal.timeoutMs);
        await navigateToPortalLookup(page, connectorId, portal);
      }
      if (await hasAuthenticationChallenge(page)) {
        throw new PortalLookupError(
          'reauthentication_required',
          `${connectorId} needs manual login or MFA. Run the portal-login command on the Windows Local Agent.`,
          true,
        );
      }
    }

    const reviewed = connectorId === 'reconvision'
      ? await lookupReconVision(page, portal, vin)
      : connectorId === 'onemicro'
        ? await lookupOneMicro(page, portal, vin)
        : await lookupCarfax(page, portal, vin);
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
    const details = error instanceof Error ? error.message : String(error);
    const selectorChanged = /locator|waiting for|timeout/i.test(details);
    throw new PortalLookupError(
      selectorChanged ? 'selector_changed' : 'portal_unavailable',
      selectorChanged
        ? `${connectorId} VIN lookup selectors no longer match the reviewed portal page: ${details}`
        : `${connectorId} VIN lookup failed: ${details}`,
      false,
      artifacts,
    );
  } finally {
    await context.close();
  }
}
