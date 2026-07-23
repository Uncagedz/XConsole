import { runRouteOne } from '../sites/routeone.ts';

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function getNumberArg(name: string) {
  const raw = getArgValue(name);
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const result = await runRouteOne({
    vin: 'BANKSYNC',
    browser: flags.has('--browser-edge') ? 'edge' : flags.has('--browser-chrome') ? 'chrome' : undefined,
    dryRun: flags.has('--dry-run'),
    edgeProfileDirectory: getArgValue('--edge-profile-directory'),
    edgeUserDataDir: getArgValue('--edge-user-data-dir'),
    force: flags.has('--force') || flags.has('--login'),
    headless: flags.has('--headless'),
    loginWaitSeconds: getNumberArg('--login-wait-seconds'),
    manualHandoffSeconds: getNumberArg('--manual-handoff-seconds'),
    maxPages: getNumberArg('--max-pages'),
    startUrl: getArgValue('--start-url') || process.env.ROUTEONE_START_URL,
    trace: flags.has('--trace'),
  });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        saved: result.data?.pdfsSaved ?? 0,
        needs_login: result.data?.needsLogin ?? false,
        authenticated: result.data?.authenticated ?? false,
        manifest: result.data?.manifestPath ?? null,
        warnings: Array.isArray(result.data?.warnings) ? result.data.warnings : [],
        errors: result.errors ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[routeone-sync] failed', error);
  process.exit(1);
});
