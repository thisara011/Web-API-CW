import type { Pool } from 'pg';
import type { Principal } from '../../auth/tokens.js';
import { ApiError } from '../../http/errors.js';
import type { ReadingInput } from './validation.js';

export interface Reading {
  id: string; installationId: string; timestamp: Date; powerKw: number;
  cumulativeEnergyKwh: number; voltage: number; receivedAt: Date;
}
export const readingColumns = `r.id, r.installation_id AS "installationId", r.timestamp,
  r.power_kw::float8 AS "powerKw", r.cumulative_energy_kwh::float8 AS "cumulativeEnergyKwh",
  r.voltage::float8 AS voltage, r.received_at AS "receivedAt"`;
export const hierarchy = `FROM solar_installations i
  JOIN grid_substations s ON s.id = i.grid_substation_id
  JOIN districts d ON d.id = s.district_id
  JOIN provinces p ON p.id = d.province_id`;

export function analystFilter(principal: Principal) {
  if (principal.kind !== 'analyst') throw new ApiError(403, 40301, 'Analyst access is required');
  if (principal.role === 'national') return { sql: 'TRUE', values: [] as string[] };
  return principal.role === 'provincial'
    ? { sql: 'd.province_id = $1', values: [principal.provinceId!] }
    : { sql: 'd.id = $1', values: [principal.districtId!] };
}
const missing = () => new ApiError(404, 40401, 'Resource not found');
const duplicate = () => new ApiError(409, 40901, 'A reading already exists for this installation and timestamp');

export class ReadingService {
  constructor(private readonly pool: Pool) {}

  async append(principal: Principal, installationId: string, input: ReadingInput): Promise<Reading> {
    if (principal.kind !== 'installation' || principal.installationId !== installationId) {
      throw new ApiError(403, 40301, 'Principal is not permitted to write readings for this installation');
    }
    const client = await this.pool.connect();
    try {
      // Each subsequent statement sees the previous lock holder's committed data.
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      // Advisory locks work with the SELECT/INSERT-only runtime account. All API
      // writers take this transaction lock; no UPDATE permission is required.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reading:' || $1, 0))", [installationId]);
      const identity = await client.query<{ valid: boolean; before_commission: boolean }>(`
        SELECT is_active AND credential_version = $2 AS valid,
          ($3::timestamptz AT TIME ZONE 'Asia/Colombo')::date < commissioned_date AS before_commission
        FROM solar_installations WHERE id = $1`, [installationId, principal.credentialVersion, input.timestamp]);
      if (!identity.rows[0]?.valid) throw new ApiError(401, 40102, 'Invalid or revoked bearer token');
      if (identity.rows[0].before_commission) throw new ApiError(400, 40002, 'Observation predates commissioning', [{ field: 'timestamp', message: 'Must be on or after the commissioning date in Asia/Colombo' }]);
      const existing = await client.query('SELECT id FROM generation_readings WHERE installation_id = $1 AND timestamp = $2', [installationId, input.timestamp]);
      if (existing.rowCount) throw duplicate();
      // Compare NUMERIC values in PostgreSQL, preserving all three decimal places.
      const neighbours = await client.query<{ inconsistent: boolean }>(`
        SELECT COALESCE((SELECT cumulative_energy_kwh > $3::numeric FROM generation_readings
          WHERE installation_id = $1 AND timestamp < $2 ORDER BY timestamp DESC LIMIT 1), false)
          OR COALESCE((SELECT cumulative_energy_kwh < $3::numeric FROM generation_readings
          WHERE installation_id = $1 AND timestamp > $2 ORDER BY timestamp ASC LIMIT 1), false) AS inconsistent`,
      [installationId, input.timestamp, input.cumulativeEnergyKwh]);
      if (neighbours.rows[0]?.inconsistent) throw new ApiError(409, 40902, 'Cumulative energy conflicts with surrounding observations', [{ field: 'cumulativeEnergyKwh', message: 'Counter must not decrease in observation-time order; meter resets are unsupported' }]);
      const result = await client.query<Reading>(`
        INSERT INTO generation_readings AS r (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
        VALUES ($1, $2, $3, $4, $5) RETURNING ${readingColumns}`,
      [installationId, input.timestamp, input.powerKw, input.cumulativeEnergyKwh, input.voltage]);
      await client.query('COMMIT');
      return result.rows[0]!;
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') throw duplicate();
      throw error;
    } finally { client.release(); }
  }

  async reading(principal: Principal, readingId: string): Promise<Reading> {
    const filter = analystFilter(principal);
    const result = await this.pool.query<Reading>(`SELECT ${readingColumns} ${hierarchy}
      JOIN generation_readings r ON r.installation_id = i.id
      WHERE ${filter.sql} AND r.id = $${filter.values.length + 1}`, [...filter.values, readingId]);
    if (!result.rows[0]) throw missing();
    return result.rows[0];
  }

  async latest(principal: Principal, installationId: string): Promise<Reading> {
    const filter = analystFilter(principal);
    const result = await this.pool.query<Reading>(`SELECT ${readingColumns} ${hierarchy}
      JOIN LATERAL (SELECT * FROM generation_readings WHERE installation_id = i.id
        ORDER BY timestamp DESC, id DESC LIMIT 1) r ON true
      WHERE ${filter.sql} AND i.id = $${filter.values.length + 1}`, [...filter.values, installationId]);
    if (!result.rows[0]) throw missing();
    return result.rows[0];
  }

  async overview(principal: Principal, installationId: string) {
    const filter = analystFilter(principal);
    // A single statement supplies a consistent snapshot of metadata and latest.
    const result = await this.pool.query(`SELECT
      GREATEST(i.updated_at, p.updated_at, d.updated_at, s.updated_at, r.received_at) AS "__modified",
      jsonb_build_object('id', i.id, 'meterId', i.meter_id, 'siteLabel', i.site_label,
        'capacityKw', i.capacity_kw, 'commissionedDate', i.commissioned_date,
        'isActive', i.is_active, 'gridSubstationId', i.grid_substation_id) AS installation,
      jsonb_build_object('province', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
        'district', jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name),
        'substation', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)) AS hierarchy,
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id', r.id,
        'installationId', r.installation_id, 'timestamp', to_char(r.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'powerKw', r.power_kw, 'cumulativeEnergyKwh', r.cumulative_energy_kwh, 'voltage', r.voltage,
        'receivedAt', to_char(r.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END AS "lastKnownReading"
      ${hierarchy} LEFT JOIN LATERAL (SELECT * FROM generation_readings WHERE installation_id = i.id
        ORDER BY timestamp DESC, id DESC LIMIT 1) r ON true
      WHERE ${filter.sql} AND i.id = $${filter.values.length + 1}`, [...filter.values, installationId]);
    if (!result.rows[0]) throw missing();
    const { __modified: modified, ...body } = result.rows[0];
    return { body, modified: modified as Date };
  }
}
