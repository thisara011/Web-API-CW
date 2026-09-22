import { scryptSync, timingSafeEqual } from 'node:crypto';

const keyLength = 32;

export function passwordHash(password: string, salt: string): string {
  return `scrypt$${salt}$${scryptSync(password, salt, keyLength).toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, encoded] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
