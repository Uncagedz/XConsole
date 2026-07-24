import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] || 'apps/drivecentric-extension/dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
const required = [
  manifest.side_panel?.default_path,
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter(Boolean);

for (const relativePath of required) {
  await access(resolve(dist, relativePath));
}

if (manifest.action?.default_popup) {
  await access(resolve(dist, manifest.action.default_popup));
}

if (manifest.version !== '0.1.59') {
  throw new Error(`Expected extension version 0.1.59, received ${manifest.version ?? 'missing'}.`);
}

console.log(`Verified DriveCentric extension ${manifest.version}: ${required.length} runtime files present.`);
