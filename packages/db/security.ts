import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const CREDENTIAL_FORMAT = 'v1';

function credentialKey(): Buffer {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-character hexadecimal value');
  }
  return Buffer.from(value, 'hex');
}

export function encryptCredentials(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [CREDENTIAL_FORMAT, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptCredentials<T = Record<string, string>>(payload: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(':');
  if (version !== CREDENTIAL_FORMAT || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Unsupported or malformed encrypted credential payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as T;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('base64')}:${derivedKey.toString('base64')}`;
}

export async function verifyPassword(password: string, storedValue: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = storedValue.split(':');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64');
  const actual = (await scrypt(password, Buffer.from(saltValue, 'base64'), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
