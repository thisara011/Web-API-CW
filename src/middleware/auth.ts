import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { verifyToken, type Principal } from '../auth/tokens.js';

declare global { namespace Express { interface Request { principal?: Principal } } }

export function requireBearer(config: Environment, scope: string, pool: Pool): RequestHandler {
  return async (request, _response, next) => {
    const value = request.headers.authorization;
    const match = value?.match(/^Bearer ([^\s]+)$/i);
    if (!match) return next(new ApiError(401, 40101, 'Bearer token is required'));
    try {
      const principal = await verifyToken(match[1]!, config);
      const current = principal.kind === 'installation'
        ? await pool.query('SELECT id FROM solar_installations WHERE id = $1 AND is_active AND credential_version = $2', [principal.subject, principal.credentialVersion])
        : await pool.query(`SELECT id FROM users WHERE id = $1 AND is_active AND credential_version = $2
            AND role = $3 AND province_id IS NOT DISTINCT FROM $4::uuid AND district_id IS NOT DISTINCT FROM $5::uuid`,
          [principal.subject, principal.credentialVersion, principal.role, principal.provinceId, principal.districtId]);
      if (!current.rows[0]) throw new ApiError(401, 40102, 'Invalid or revoked bearer token');
      if (!principal.scopes.includes(scope)) throw new ApiError(403, 40301, 'Principal is not permitted to access this resource');
      request.principal = principal;
      next();
    } catch (error) { next(error); }
  };
}
