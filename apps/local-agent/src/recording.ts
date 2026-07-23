import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chromium } from 'playwright-core';
import type { AgentConfig } from './config.js';
import { browserProfileDirectory, recordingsDirectory } from './paths.js';
import { sanitizeCapturedHtml } from './sanitize.js';

function safeName(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'capture';
}

export async function capturePageForConnectorDevelopment(config: AgentConfig, initialUrl?: string) {
  await mkdir(recordingsDirectory, { recursive: true });
  await mkdir(browserProfileDirectory, { recursive: true });
  const context = await chromium.launchPersistentContext(browserProfileDirectory, {
    headless: false,
    channel: config.chromeExecutablePath ? undefined : 'chrome',
    executablePath: config.chromeExecutablePath,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    if (initialUrl) await page.goto(initialUrl);
    const prompt = createInterface({ input: stdin, output: stdout });
    await prompt.question('Complete login/MFA, navigate to the target page, then press Enter to capture. ');
    prompt.close();

    await page.evaluate(() => {
      for (const input of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
        const descriptor = `${input.type} ${input.name} ${input.id} ${input.autocomplete}`.toLowerCase();
        if (/password|token|secret|cookie|authorization|ssn|social|credit/.test(descriptor)) {
          input.value = '[REDACTED]';
          input.setAttribute('value', '[REDACTED]');
        } else if (input.value) {
          input.value = '';
          input.removeAttribute('value');
        }
      }
      for (const script of document.querySelectorAll('script')) script.remove();
    });

    const capturedAt = new Date();
    const folder = join(recordingsDirectory, `${capturedAt.toISOString().replace(/[:.]/g, '-')}-${safeName(await page.title())}`);
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: join(folder, 'page.png'), fullPage: true });
    await writeFile(join(folder, 'page.html'), sanitizeCapturedHtml(await page.content()), 'utf8');
    await writeFile(
      join(folder, 'metadata.json'),
      JSON.stringify({ url: page.url(), title: await page.title(), capturedAt: capturedAt.toISOString(), reviewed: false }, null, 2),
      'utf8',
    );
    return folder;
  } finally {
    await context.close();
  }
}
