import type { Pool } from 'pg';

export async function checkProductionReadiness(pool: Pool): Promise<void> {
  // Validate required relations/columns and SELECT permission without scanning readings.
  await pool.query(`SELECT p.updated_at, d.updated_at, s.updated_at, i.credential_version, r.received_at, u.credential_version
    FROM provinces p, districts d, grid_substations s, solar_installations i, generation_readings r, users u LIMIT 0`);
  const result = await pool.query<{ unsafe: boolean }>(`SELECT
    EXISTS(SELECT 1 FROM users WHERE is_active AND password_hash LIKE 'scrypt$user:%') OR
    EXISTS(SELECT 1 FROM solar_installations WHERE is_active AND credential_hash LIKE 'scrypt$device:%') AS unsafe`);
  if (result.rows[0]?.unsafe) throw new Error('Active published fixture credentials are forbidden in production');
}
