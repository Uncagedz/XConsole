import { createApp } from './app.js';
import { readEnv } from './env.js';
import { PrismaGatewayStore } from './prisma-store.js';
import { GatewayStore, type GatewayStoreContract } from './store.js';

const env = readEnv();
const store: GatewayStoreContract = env.DATABASE_URL ? new PrismaGatewayStore() : new GatewayStore();
const app = createApp(env, store);
const server = app.listen(env.PORT, () => {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'gateway.started', port: env.PORT })}\n`);
});

function shutdown() {
  server.close(() => {
    void store.close?.().finally(() => process.exit(0));
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
