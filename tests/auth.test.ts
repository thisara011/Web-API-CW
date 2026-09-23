import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { parseEnv } from '../src/config/env.js';
import { passwordHash, verifyPassword } from '../src/auth/passwords.js';
import { issueToken, verifyToken } from '../src/auth/tokens.js';

const config = parseEnv({ DATABASE_URL: 'postgresql://solar:password@localhost:5432/solar', JWT_SECRET: 'test-secret-with-more-than-thirty-two-characters' });

describe('credentials and bearer tokens', () => {
  it.each(['expired', 'missing-exp', 'wrong-issuer', 'wrong-audience', 'wrong-type', 'wrong-algorithm', 'wrong-owner'])(
    'rejects correctly signed tokens with %s', async (defect) => {
      const id = '11111111-1111-4111-8111-111111111111';
      const claims = { kind: 'installation', cv: 1, scope: 'readings:write', installation_id: defect === 'wrong-owner' ? '22222222-2222-4222-8222-222222222222' : id };
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: defect === 'wrong-algorithm' ? 'HS384' : 'HS256', typ: defect === 'wrong-type' ? 'other' : 'JWT' })
        .setSubject(id).setIssuedAt()
        .setIssuer(defect === 'wrong-issuer' ? 'other' : config.JWT_ISSUER)
        .setAudience(defect === 'wrong-audience' ? 'other' : config.JWT_AUDIENCE);
      if (defect !== 'missing-exp') jwt.setExpirationTime(defect === 'expired' ? Math.floor(Date.now() / 1000) - 1 : '15m');
      const token = await jwt.sign(new TextEncoder().encode(config.JWT_SECRET));
      await expect(verifyToken(token, config)).rejects.toMatchObject({ status: 401 });
    },
  );
  it('uses a salted scrypt verifier without storing the clear-text password', () => {
    const stored = passwordHash('a sufficiently long secret', 'unique-test-salt');
    expect(stored).not.toContain('a sufficiently long secret');
    expect(verifyPassword('a sufficiently long secret', stored)).toBe(true);
    expect(verifyPassword('wrong password', stored)).toBe(false);
    expect(verifyPassword('a sufficiently long secret', 'not-a-supported-hash')).toBe(false);
  });

  it('issues a signed, short-lived analyst token that retains jurisdiction claims', async () => {
    const issued = await issueToken({ kind: 'analyst', subject: '11111111-1111-4111-8111-111111111111', credentialVersion: 1, role: 'district', provinceId: null, districtId: '22222222-2222-4222-8222-222222222222', scopes: ['geography:read', 'installation:read'] }, config);
    expect(issued.expiresIn).toBe(900);
    await expect(verifyToken(issued.accessToken, config)).resolves.toMatchObject({ kind: 'analyst', role: 'district', districtId: '22222222-2222-4222-8222-222222222222', scopes: ['geography:read', 'installation:read'] });
  });

  it('rejects a token signed with a different secret, issuer or audience', async () => {
    const token = await issueToken({ kind: 'installation', subject: '11111111-1111-4111-8111-111111111111', credentialVersion: 1, installationId: '11111111-1111-4111-8111-111111111111', scopes: ['readings:write'] }, config);
    const incompatible = parseEnv({ DATABASE_URL: 'postgresql://solar:password@localhost:5432/solar', JWT_SECRET: 'different-secret-with-more-than-thirty-two-chars', JWT_ISSUER: 'another-issuer', JWT_AUDIENCE: 'another-audience' });
    await expect(verifyToken(token.accessToken, incompatible)).rejects.toMatchObject({ status: 401, code: 40102 });
  });
});
