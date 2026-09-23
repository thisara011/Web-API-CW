import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { passwordHash } from './passwords.js';

const credentialInput = z.object({
  principalType: z.enum(['analyst', 'installation']),
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(20).max(256),
}).strict();

// Offline owner-only administration. This is not a mutable HTTP API or CRUD evidence.
export async function rotateCredential(pool: Pool, input: unknown) {
  const parsed = credentialInput.safeParse(input);
  if (!parsed.success) throw new Error('Supply CREDENTIAL_TYPE, CREDENTIAL_IDENTIFIER and CREDENTIAL_PASSWORD (20–256 characters)');
  const { principalType, identifier, password } = parsed.data;
  if (password === 'Coursework-Demo-Password-2026!' || password.startsWith('device-SLSEA-')) throw new Error('Published fixture passwords cannot be used for rotation');
  const hash = passwordHash(password, randomBytes(24).toString('base64url'));
  const analyst = principalType === 'analyst';
  const result = await pool.query(
    `UPDATE ${analyst ? 'users' : 'solar_installations'} SET ${analyst ? 'password_hash' : 'credential_hash'}=$1,
       credential_version=credential_version+1, is_active=true WHERE ${analyst ? 'email' : 'meter_id'}=$2 RETURNING id, credential_version`,
    [hash, analyst ? identifier.toLowerCase() : identifier],
  );
  if (!result.rows[0]) throw new Error('Credential target was not found');
  return { id: result.rows[0].id as string, credentialVersion: result.rows[0].credential_version as number };
}

export async function disableFixtureCredentials(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = await client.query("UPDATE users SET is_active=false, credential_version=credential_version+1 WHERE is_active AND password_hash LIKE 'scrypt$user:%'");
    const installations = await client.query("UPDATE solar_installations SET is_active=false, credential_version=credential_version+1 WHERE is_active AND credential_hash LIKE 'scrypt$device:%'");
    await client.query('COMMIT');
    return { analystsDisabled: users.rowCount, installationsDisabled: installations.rowCount };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
