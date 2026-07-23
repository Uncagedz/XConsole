export interface LogFields {
  [key: string]: unknown;
}

function redact(fields: LogFields): LogFields {
  const blocked = /authorization|cookie|password|secret|token|storage.?state/i;
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, blocked.test(key) ? '[REDACTED]' : value]),
  );
}

export const logger = {
  info(event: string, fields: LogFields = {}) {
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, ...redact(fields) })}\n`);
  },
  error(event: string, fields: LogFields = {}) {
    process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event, ...redact(fields) })}\n`);
  },
};
