import { apiPort } from './env.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = app.listen(apiPort, () => {
  console.log(`API listening on port ${apiPort}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down API`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
