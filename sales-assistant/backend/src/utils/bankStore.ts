import fs from 'node:fs';
import path from 'node:path';

interface BankPoliciesPayload {
  version?: string;
  generatedAt?: string | null;
  policies?: Array<Record<string, unknown>>;
}

let policies: Array<Record<string, unknown>> = [];

function getBankPath() {
  const candidates = [
    path.resolve(process.cwd(), '..', 'data', 'banks.json'),
    path.resolve(process.cwd(), 'data', 'banks.json'),
    path.resolve(process.cwd(), '..', '..', 'data', 'banks.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

export function loadPolicies() {
  const filePath = getBankPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BankPoliciesPayload;
    policies = Array.isArray(parsed.policies) ? parsed.policies : [];
  } catch {
    policies = [];
  }
  return policies;
}

export function getPolicies() {
  if (!policies.length) {
    loadPolicies();
  }
  return policies;
}
