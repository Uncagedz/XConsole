import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('dashboard serves the SPA and proxies API requests to the runtime gateway', async () => {
  const dashboardRoot = await mkdtemp(join(tmpdir(), 'xconsole-dashboard-'));
  await writeFile(join(dashboardRoot, 'index.html'), '<!doctype html><title>XConsole</title>', 'utf8');

  let loginOrigin;
  const gateway = createServer((request, response) => {
    if (request.url === '/api/session') {
      if (request.method === 'POST') loginOrigin = request.headers.origin;
      response.writeHead(401, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'xconsole_session=test; HttpOnly; Path=/',
      });
      response.end(JSON.stringify({ error: { type: 'authentication' } }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const gatewayAddress = gateway.address();
  assert.equal(typeof gatewayAddress, 'object');

  const child = spawn(process.execPath, [resolve('tools/serve_dashboard.mjs')], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      PORT: '0',
      XCONSOLE_DASHBOARD_ROOT: dashboardRoot,
      XCONSOLE_GATEWAY_URL: `http://127.0.0.1:${gatewayAddress.port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const dashboardPort = await new Promise((resolvePort, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Dashboard did not start: ${output}`)), 10_000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          clearTimeout(timer);
          resolvePort(Number(match[1]));
        }
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Dashboard exited with ${code}: ${output}`));
      });
    });

    const health = await fetch(`http://127.0.0.1:${dashboardPort}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');

    const session = await fetch(`http://127.0.0.1:${dashboardPort}/api/session`, {
      redirect: 'manual',
    });
    assert.equal(session.status, 401);
    assert.match(session.headers.get('set-cookie') ?? '', /xconsole_session=test/);
    assert.deepEqual(await session.json(), { error: { type: 'authentication' } });

    const login = await fetch(`http://127.0.0.1:${dashboardPort}/api/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://aniextension.up.railway.app',
      },
      body: JSON.stringify({ token: 'test-dashboard-token-value' }),
    });
    assert.equal(login.status, 401);
    assert.equal(loginOrigin, undefined);

    const spa = await fetch(`http://127.0.0.1:${dashboardPort}/inventory`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /XConsole/);
  } finally {
    child.kill('SIGTERM');
    gateway.close();
    await rm(dashboardRoot, { recursive: true, force: true });
  }
});
