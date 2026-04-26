import type { FastifyInstance } from 'fastify';
import { getPolicies, loadPolicies } from '../utils/bankStore.js';
import { getBankFactors, loadBankFactors } from '../utils/bankFactorsStore.js';

const banksRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/banks', async () => {
    return { policies: getPolicies() };
  });

  fastify.post('/banks/reload', async () => {
    loadPolicies();
    return { ok: true, count: getPolicies().length };
  });

  fastify.get('/banks/factors', async () => getBankFactors());

  fastify.post('/banks/factors/reload', async () => {
    const payload = loadBankFactors();
    return { ok: true, totalBanks: payload.totalBanks };
  });
};

export default banksRoutes;
