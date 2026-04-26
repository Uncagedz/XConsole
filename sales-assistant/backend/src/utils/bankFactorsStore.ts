import { getPolicies } from './bankStore.js';

interface BankFactorsPayload {
  generatedAt: string;
  totalBanks: number;
  factors: Array<{
    bank: string;
    weight: number;
  }>;
}

let payload: BankFactorsPayload = {
  generatedAt: new Date().toISOString(),
  totalBanks: 0,
  factors: [],
};

export function loadBankFactors() {
  const policies = getPolicies();
  const factors = policies.map((policy, index) => ({
    bank: String(policy.bank || policy.name || `Bank ${index + 1}`),
    weight: Number(policy.weight || 1),
  }));

  payload = {
    generatedAt: new Date().toISOString(),
    totalBanks: factors.length,
    factors,
  };
  return payload;
}

export function getBankFactors() {
  if (!payload.factors.length) {
    loadBankFactors();
  }
  return payload;
}
