import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';

export type Principal =
  | { kind: 'analyst'; subject: string; credentialVersion: number; role: 'national' | 'provincial' | 'district'; provinceId: string | null; districtId: string | null; scopes: string[] }
  | { kind: 'installation'; subject: string; credentialVersion: number; installationId: string; scopes: string[] };

const encoder = new TextEncoder();

function secret(config: Environment): Uint8Array { return encoder.encode(config.JWT_SECRET); }

export async function issueToken(principal: Principal, config: Environment): Promise<{ accessToken: string; expiresIn: number }> {
  const claims: Record<string, unknown> = {
    kind: principal.kind, cv: principal.credentialVersion, scope: principal.scopes.join(' '),
  };
  if (principal.kind === 'analyst') {
    Object.assign(claims, { role: principal.role, province_id: principal.provinceId, district_id: principal.districtId });
  } else Object.assign(claims, { installation_id: principal.installationId });
  const accessToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(principal.subject).setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE)
    .setIssuedAt().setExpirationTime(`${config.JWT_EXPIRES_IN_SECONDS}s`).sign(secret(config));
  return { accessToken, expiresIn: config.JWT_EXPIRES_IN_SECONDS };
}

export async function verifyToken(token: string, config: Environment): Promise<Principal> {
  try {
    const { payload } = await jwtVerify(token, secret(config), {
      issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, algorithms: ['HS256'], typ: 'JWT',
      requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: `${config.JWT_EXPIRES_IN_SECONDS}s`,
    });
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    if (!z.uuid().safeParse(payload.sub).success || typeof payload.sub !== 'string' || !Number.isInteger(payload.cv) || Number(payload.cv) < 1 || !['analyst', 'installation'].includes(String(payload.kind))) throw new Error('invalid claims');
    if (payload.kind === 'installation') {
      if (payload.installation_id !== payload.sub) throw new Error('invalid installation claims');
      return { kind: 'installation', subject: payload.sub, credentialVersion: payload.cv as number, installationId: payload.installation_id, scopes };
    }
    if (!['national', 'provincial', 'district'].includes(String(payload.role))) throw new Error('invalid analyst claims');
    const provinceId = typeof payload.province_id === 'string' ? payload.province_id : null;
    const districtId = typeof payload.district_id === 'string' ? payload.district_id : null;
    if ((provinceId && !z.uuid().safeParse(provinceId).success) || (districtId && !z.uuid().safeParse(districtId).success)) throw new Error('invalid jurisdiction identifier');
    if ((payload.role === 'national' && (provinceId || districtId)) || (payload.role === 'provincial' && (!provinceId || districtId)) || (payload.role === 'district' && (provinceId || !districtId))) throw new Error('invalid scope claims');
    return { kind: 'analyst', subject: payload.sub, credentialVersion: payload.cv as number, role: payload.role as 'national' | 'provincial' | 'district', provinceId, districtId, scopes };
  } catch {
    throw new ApiError(401, 40102, 'Invalid or expired bearer token');
  }
}
