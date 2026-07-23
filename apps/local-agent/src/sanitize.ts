const sensitiveAssignment =
  /(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password)\s*[:=]\s*["']?[^"'\s<;]+/gi;
const ssn = /\b\d{3}-\d{2}-\d{4}\b/g;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi;

export function sanitizeCapturedHtml(html: string) {
  return html
    .replace(/<input\b[^>]*type=["']password["'][^>]*>/gi, '<input type="password" data-xconsole-redacted="true">')
    .replace(/(<input\b[^>]*(?:name|id|autocomplete)=["'][^"']*(?:ssn|social|credit|password|token)[^"']*["'][^>]*)(?:value=["'][^"']*["'])/gi, '$1 value="[REDACTED]"')
    .replace(/<meta\b[^>]*(?:http-equiv=["'](?:set-cookie|authorization)["'])[^>]*>/gi, '')
    .replace(sensitiveAssignment, '$1=[REDACTED]')
    .replace(bearer, 'Bearer [REDACTED]')
    .replace(ssn, '[REDACTED-SSN]');
}
