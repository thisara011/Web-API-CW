import { scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

const keyLength = 32;

export function passwordHash(password: string, salt: string): string {
  return `scrypt$${salt}$${scryptSync(password, salt, keyLength).toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || salt.length > 128 || !encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded) || stored.split('$').length !== 3) return false;
  const expected = Buffer.from(encoded, 'base64url');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, key) => error ? reject(error) : resolve(key));
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
