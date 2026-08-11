import { execSync } from 'child_process';

function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export async function saveCredential(service: string, account: string, value: string): Promise<void> {
  if (isMacOS()) {
    execSync(`security delete-generic-password -s "${service}" -a "${account}" 2>/dev/null || true`);
    execSync(`security add-generic-password -s "${service}" -a "${account}" -w "${value}" -U`);
  } else {
    const { writeFileSync, mkdirSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const dir = join(homedir(), '.harness');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${service}_${account}.enc`), Buffer.from(value).toString('base64'));
  }
}

export async function getCredential(service: string, account: string): Promise<string | null> {
  try {
    if (isMacOS()) {
      const stdout = execSync(`security find-generic-password -s "${service}" -a "${account}" -w 2>/dev/null`, { encoding: 'utf-8' });
      return stdout.trim();
    } else {
      const { readFileSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');
      const raw = readFileSync(join(homedir(), '.harness', `${service}_${account}.enc`), 'utf-8');
      return Buffer.from(raw, 'base64').toString('utf-8');
    }
  } catch {
    return null;
  }
}

export async function deleteCredential(service: string, account: string): Promise<void> {
  if (isMacOS()) {
    execSync(`security delete-generic-password -s "${service}" -a "${account}" 2>/dev/null || true`);
  } else {
    try {
      const { unlinkSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');
      unlinkSync(join(homedir(), '.harness', `${service}_${account}.enc`));
    } catch {}
  }
}

export async function checkCredentialStatus(service: string, account: string): Promise<'stored' | 'not_found'> {
  const value = await getCredential(service, account);
  return value ? 'stored' : 'not_found';
}

export function maskKey(key: string): string {
  if (key.length <= 8) return key.slice(0, 2) + '**';
  return key.slice(0, 6) + '...' + key.slice(-4);
}
