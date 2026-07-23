import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3002);
const gatewayUrl = process.env.XCONSOLE_GATEWAY_URL?.replace(/\/+$/, '');
const gatewayToken = process.env.XCONSOLE_GATEWAY_TOKEN;
const intervalMs = Number(process.env.XCONSOLE_SCHEDULER_INTERVAL_MS ?? 900_000);

async function enqueueInventorySync() {
  if (!gatewayUrl || !gatewayToken) return;
  const response = await fetch(`${gatewayUrl}/api/connectors/dealership-website/retry`, {
    method: 'POST',
    headers: { authorization: `Bearer ${gatewayToken}` },
  });
  if (!response.ok) throw new Error(`Inventory schedule returned HTTP ${response.status}`);
}

const timer = setInterval(() => {
  void enqueueInventorySync().catch((error) => {
    process.stderr.write(`${JSON.stringify({ level: 'error', event: 'scheduler.enqueue.failed', message: error.message })}\n`);
  });
}, intervalMs);
timer.unref();

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'xconsole-scheduler', gatewayConfigured: Boolean(gatewayUrl && gatewayToken) }));
    return;
  }
  response.writeHead(404).end();
});
server.listen(port);

function shutdown() {
  clearInterval(timer);
  server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
