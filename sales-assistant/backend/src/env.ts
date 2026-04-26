import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const loaded = new Set<string>();

function applyEnv(filePath: string) {
  if (loaded.has(filePath)) return;
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath, override: true });
  loaded.add(filePath);
}

const localEnv = path.resolve(process.cwd(), '.env');
applyEnv(localEnv);

const repoEnv = path.resolve(process.cwd(), '..', '..', '.env');
if (repoEnv !== localEnv) {
  applyEnv(repoEnv);
}
