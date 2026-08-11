import { describe, it, expect } from 'vitest';
import { saveCredential, getCredential, deleteCredential, checkCredentialStatus, maskKey } from '../src/credentials/keychain.js';

describe('Credential Manager', () => {
  const service = 'ai4se-harness-test';
  const account = 'test-key';

  it('should save and retrieve a credential', async () => {
    await saveCredential(service, account, 'sk-ant-test123456');
    const value = await getCredential(service, account);
    expect(value).toBe('sk-ant-test123456');
    await deleteCredential(service, account);
  });

  it('should return null for non-existent credential', async () => {
    const value = await getCredential(service, 'nonexistent');
    expect(value).toBeNull();
  });

  it('should report status correctly', async () => {
    await saveCredential(service, account, 'test-key');
    const status = await checkCredentialStatus(service, account);
    expect(status).toBe('stored');
    await deleteCredential(service, account);
    expect(await checkCredentialStatus(service, account)).toBe('not_found');
  });

  it('should mask key for display', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant...mnop');
    expect(maskKey('short')).toBe('sh**');
  });
});
