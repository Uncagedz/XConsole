import Fastify from 'fastify';
import banksRoutes from './api/banks.js';
import './env.js';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(banksRoutes, { prefix: '/api' });
  return app;
}

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT || 4300);
  await app.listen({ host: '0.0.0.0', port });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
