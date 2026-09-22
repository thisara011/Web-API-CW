import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { verifyPassword } from './passwords.js';
import { issueToken, type Principal } from './tokens.js';

export type TokenRequest = { principalType: 'analyst' | 'installation'; identifier: string; password: string };

export class AuthenticationService {
  constructor(private readonly pool: Pool, private readonly config: Environment) {}

  async authenticate(input: TokenRequest): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresIn: number }> {
    let principal: Principal | undefined;
    if (input.principalType === 'analyst') {
      const result = await this.pool.query<{ id: string; password_hash: string; credential_version: number; role: 'national' | 'provincial' | 'district'; province_id: string | null; district_id: string | null }>(
        'SELECT id, password_hash, credential_version, role, province_id, district_id FROM users WHERE email = $1 AND is_active = true', [input.identifier.toLowerCase()],
      );
      const row = result.rows[0];
      if (row && verifyPassword(input.password, row.password_hash)) principal = { kind: 'analyst', subject: row.id, credentialVersion: row.credential_version, role: row.role, provinceId: row.province_id, districtId: row.district_id, scopes: ['geography:read', 'installation:read'] };
    } else {
      const result = await this.pool.query<{ id: string; credential_hash: string | null; credential_version: number }>(
        'SELECT id, credential_hash, credential_version FROM solar_installations WHERE meter_id = $1 AND is_active = true', [input.identifier],
      );
      const row = result.rows[0];
      if (row?.credential_hash && verifyPassword(input.password, row.credential_hash)) principal = { kind: 'installation', subject: row.id, installationId: row.id, credentialVersion: row.credential_version, scopes: ['readings:write'] };
    }
    if (!principal) throw new ApiError(401, 40103, 'Invalid credentials');
    const token = await issueToken(principal, this.config);
    return { ...token, tokenType: 'Bearer' };
  }
}
