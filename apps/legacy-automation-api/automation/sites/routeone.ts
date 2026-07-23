import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ProviderOptions, ProviderResult } from './types.ts';

interface RouteOneOptions extends ProviderOptions {
  dryRun?: boolean;
  browser?: 'chrome' | 'edge';
  edgeProfileDirectory?: string;
  edgeUserDataDir?: string;
  headless?: boolean;
  loginWaitSeconds?: number;
  manualHandoffSeconds?: number;
  maxPages?: number;
  startUrl?: string;
}

interface RouteOneSyncPayload {
  ok?: boolean;
  saved_count?: number;
  saved?: Array<Record<string, unknown>>;
  needs_login?: boolean;
  authenticated?: boolean;
  manifest_path?: string;
  errors?: string[];
  warnings?: string[];
  [key: string]: unknown;
}

interface RouteOneResultData extends Record<string, unknown> {
  pdfsSaved: number;
  needsLogin: boolean;
  authenticated: boolean;
  manifestPath?: string;
  saved: Array<Record<string, unknown>>;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = path.join(rootDir, 'tools', 'routeone_bank_docs_sync.py');

function pythonCandidates() {
  return [
    process.env.PYTHON,
    path.join(rootDir, '.venv', 'Scripts', 'python.exe'),
    'python',
  ].filter(Boolean) as string[];
}

function resolvePython() {
  for (const candidate of pythonCandidates()) {
    if (candidate === 'python' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python';
}

function parseJsonFromStdout(stdout: string): RouteOneSyncPayload {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as RouteOneSyncPayload;
  } catch {
    const start = trimmed.lastIndexOf('\n{');
    if (start >= 0) {
      return JSON.parse(trimmed.slice(start + 1)) as RouteOneSyncPayload;
    }
    throw new Error(`RouteOne sync did not return JSON: ${trimmed.slice(0, 500)}`);
  }
}

function runPython(args: string[]) {
  const python = resolvePython();
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(python, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function runRouteOne(options: RouteOneOptions): Promise<ProviderResult<RouteOneResultData>> {
  const args = [scriptPath, '--json'];
  if (options.dryRun) {
    args.push('--dry-run');
  }
  if (options.browser) {
    args.push('--browser', options.browser);
  }
  if (options.edgeUserDataDir) {
    args.push('--edge-user-data-dir', options.edgeUserDataDir);
  }
  if (options.edgeProfileDirectory) {
    args.push('--edge-profile-directory', options.edgeProfileDirectory);
  }
  if (options.headless) {
    args.push('--headless');
  }
  if (options.startUrl) {
    args.push('--start-url', options.startUrl);
  }
  if (options.maxPages) {
    args.push('--max-pages', String(options.maxPages));
  }
  if (options.trace) {
    args.push('--max-pages', '50');
  }
  if (options.loginWaitSeconds) {
    args.push('--login-wait-seconds', String(options.loginWaitSeconds));
  }
  if (options.manualHandoffSeconds) {
    args.push('--manual-handoff-seconds', String(options.manualHandoffSeconds));
  }
  if (options.force) {
    args.push('--login-wait-seconds', process.env.ROUTEONE_LOGIN_WAIT_SECONDS || '300');
  }

  const processResult = await runPython(args);
  const payload = parseJsonFromStdout(processResult.stdout);
  const stderrText = processResult.stderr.trim();
  const stderrIsOnlyRouteOneLog = stderrText
    ? stderrText.split(/\r?\n/).every((line) => line.startsWith('[routeone-sync]'))
    : true;
  const errors = [
    ...(Array.isArray(payload.errors) ? payload.errors.map(String) : []),
    ...(Array.isArray(payload.warnings) ? payload.warnings.map(String) : []),
    ...(stderrText && !stderrIsOnlyRouteOneLog ? [stderrText] : []),
  ];
  const saved = Array.isArray(payload.saved) ? payload.saved : [];
  const data: RouteOneResultData = {
    ...payload,
    pdfsSaved: Number(payload.saved_count ?? saved.length ?? 0),
    needsLogin: Boolean(payload.needs_login),
    authenticated: Boolean(payload.authenticated),
    manifestPath: typeof payload.manifest_path === 'string' ? payload.manifest_path : undefined,
    stderrLog: stderrText || undefined,
    saved,
  };

  return {
    site: 'routeone',
    ok: Boolean(payload.ok) && processResult.code === 0,
    data,
    errors,
    artifacts: data.manifestPath ? { manifest: data.manifestPath } : {},
  };
}
