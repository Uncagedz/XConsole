import { describe, expect, it } from 'vitest';
import { sanitizeCapturedHtml } from './sanitize.js';

describe('recording sanitizer', () => {
  it('removes passwords, auth tokens, cookies, and SSNs', () => {
    const sanitized = sanitizeCapturedHtml(`
      <input type="password" value="NeverSaveMe">
      <meta http-equiv="set-cookie" content="session=abc">
      authorization: Bearer abc.def.ghi
      refresh_token=secret-token
      SSN 123-45-6789
    `);
    expect(sanitized).not.toContain('NeverSaveMe');
    expect(sanitized).not.toContain('secret-token');
    expect(sanitized).not.toContain('123-45-6789');
    expect(sanitized).not.toContain('session=abc');
  });
});
