import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = process.env.GIT_EXECUTABLE || 'git';
const files = execFileSync(git, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && existsSync(file));
const forbiddenNames = /(?:cookie|storage[-_]?state|browser[-_]?profile|credit[-_]?report|credit[-_]?application)/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*\b/,
];
const violations = [];
for (const file of files) {
  if (forbiddenNames.test(file) && !/README|example|test|fixture|sanitize/i.test(file)) {
    violations.push(`${file}: forbidden sensitive filename`);
  }
  if (/\.(png|jpe?g|gif|ico|pdf|zip|lock)$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) violations.push(`${file}: secret-like content`);
  }
}
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Secret hygiene check passed for ${files.length} tracked files.\n`);
