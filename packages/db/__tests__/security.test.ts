import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptCredentials,
  encryptCredentials,
  hashPassword,
  verifyPassword,
} from '../security';

describe('security helpers', () => {
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = '1'.repeat(64);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  it('encrypts and authenticates platform credentials', () => {
    const encrypted = encryptCredentials({ token: 'example-token' });
    expect(encrypted).not.toContain('example-token');
    expect(decryptCredentials(encrypted)).toEqual({ token: 'example-token' });
    const parts = encrypted.split(':');
    const ciphertext = Buffer.from(parts[3], 'base64');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64');
    expect(() => decryptCredentials(parts.join(':'))).toThrow();
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });
});
