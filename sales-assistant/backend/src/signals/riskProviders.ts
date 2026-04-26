import crypto from 'node:crypto';

export interface RiskSignals {
  riskScore: number;
  watchlistHits: number;
}

export async function fetchRiskSignals(vin: string, customerId?: string): Promise<RiskSignals> {
  // Placeholder: deterministically derive risk score from VIN/customer hash
  const seed = crypto.createHash('sha256').update(vin + (customerId || '')).digest('hex');
  const riskScore = 40 + (parseInt(seed.slice(0, 4), 16) % 45); // 40-84
  const watchlistHits = parseInt(seed.slice(4, 6), 16) % 2; // 0 or 1
  return {
    riskScore,
    watchlistHits,
  };
}
