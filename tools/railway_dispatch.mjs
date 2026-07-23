import { spawn, spawnSync } from 'node:child_process';

const serviceName = String(
  process.env.XCONSOLE_SERVICE_ROLE
    ?? process.env.RAILWAY_SERVICE_NAME
    ?? 'legacy',
).toLowerCase();

function runRequired(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let command = 'python';
let args = ['tools/railway_start.py'];

if (serviceName.includes('ai-api')) {
  runRequired('pnpm', ['db:deploy']);
  command = 'pnpm';
  args = ['--filter', '@xconsole/ai-api', 'start'];
} else if (serviceName.includes('gateway')) {
  command = 'pnpm';
  args = ['--filter', '@xconsole/gateway-api', 'start'];
} else if (serviceName.includes('dashboard')) {
  command = 'pnpm';
  args = [
    '--filter',
    '@xconsole/dashboard',
    'preview',
    '--',
    '--host',
    '0.0.0.0',
    '--port',
    String(process.env.PORT ?? '4173'),
  ];
}

console.log(`Starting XConsole service role: ${serviceName}`);
const child = spawn(command, args, {
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(`Unable to start ${serviceName}: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
