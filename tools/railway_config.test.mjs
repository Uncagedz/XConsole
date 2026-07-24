import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('AI API starts immediately so Railway can reach its health endpoint', async () => {
  const config = JSON.parse(await readFile(
    new URL('../infrastructure/railway/ai-api.railway.json', import.meta.url),
    'utf8',
  ));

  assert.equal(config.deploy.healthcheckPath, '/health');
  assert.equal(config.deploy.startCommand, 'pnpm --filter @xconsole/ai-api start');
  assert.doesNotMatch(config.deploy.startCommand, /migrate|db:deploy/i);
});
