const sensitiveKey = /authorization|cookie|password|secret|token|storage.?state/i;

export function redactLogFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : value]));
}

export function structuredLog(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  return JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redactLogFields(fields) });
}
