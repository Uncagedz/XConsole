import { spawn } from 'node:child_process';

const protectScript =
  "Add-Type -AssemblyName System.Security;$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd());$out=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($out))";
const unprotectScript =
  "Add-Type -AssemblyName System.Security;$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd());$out=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($out))";

async function invokeDpapi(script: string, bytes: Buffer) {
  if (process.platform !== 'win32') {
    throw new Error('The XConsole Local Agent secret store requires Windows DPAPI');
  }
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Windows DPAPI operation failed (${code}): ${Buffer.concat(errors).toString('utf8').trim()}`));
        return;
      }
      resolve(Buffer.from(Buffer.concat(output).toString('utf8').trim(), 'base64'));
    });
    child.stdin.end(bytes.toString('base64'));
  });
}

export const protectForCurrentWindowsUser = (value: Buffer) => invokeDpapi(protectScript, value);
export const unprotectForCurrentWindowsUser = (value: Buffer) => invokeDpapi(unprotectScript, value);
