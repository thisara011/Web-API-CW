import type { Pool } from 'pg';
import { GENERATOR_VERSION, powerAt } from './dataset.js';

const interval = 15 * 60_000;

// Explicit synthetic-demo administration, never called by GET or server startup.
// The caller supplies only installation IDs from the deterministic fixture.
export async function catchUpSyntheticReadings(pool: Pool, installationIds: string[], cutoff: number) {
  if (!Number.isFinite(cutoff) || cutoff > Date.now() || cutoff < 0) throw new Error('Synthetic cutoff must be a valid past or current instant');
  const until = Math.floor(cutoff / interval) * interval;
  const manifest = await pool.query('SELECT 1 FROM seed_runs WHERE generator_version=$1', [GENERATOR_VERSION]);
  if (manifest.rowCount !== 1) throw new Error('Synthetic catch-up requires the current seed manifest');
  let inserted = 0;
  for (const id of installationIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reading:' || $1, 0))", [id]);
      const result = await client.query<{ timestamp: Date; cumulative_energy_kwh: string; power_kw: string; capacity_kw: string }>(
        `SELECT r.timestamp, r.cumulative_energy_kwh, r.power_kw, i.capacity_kw FROM solar_installations i
          JOIN LATERAL (SELECT timestamp, cumulative_energy_kwh, power_kw FROM generation_readings WHERE installation_id=i.id ORDER BY timestamp DESC, id DESC LIMIT 1) r ON true WHERE i.id=$1`, [id]);
      const latest = result.rows[0];
      if (!latest) throw new Error('Synthetic installation or initial history is missing');
      const start = latest.timestamp.getTime();
      if (start % interval !== 0) throw new Error('Synthetic catch-up requires observations aligned to 15-minute slots');
      if (until - start > 60 * 86_400_000) throw new Error('Catch up at most 60 days per invocation; supply an earlier CATCHUP_UNTIL first');
      let energy = BigInt(latest.cumulative_energy_kwh.replace('.', ''));
      let previousPower = Number(latest.power_kw);
      let rows: Array<[string, string, string, string, number]> = [];
      const flush = async () => {
        if (!rows.length) return;
        const values = rows.flat();
        const placeholders = rows.map((_, row) => `(${Array.from({ length: 5 }, (__, column) => `$${row * 5 + column + 1}`).join(',')})`).join(',');
        await client.query(`INSERT INTO generation_readings(installation_id,timestamp,power_kw,cumulative_energy_kwh,voltage) VALUES ${placeholders}`, values);
        inserted += rows.length; rows = [];
      };
      for (let instant = start + interval; instant <= until; instant += interval) {
        const power = Number(powerAt(instant, Number(latest.capacity_kw), id).toFixed(3));
        energy += BigInt(Math.round((previousPower + power) / 2 * 0.25 * 1000));
        const counter = `${energy / 1000n}.${String(energy % 1000n).padStart(3, '0')}`;
        rows.push([id, new Date(instant).toISOString(), power.toFixed(3), counter, 230]);
        previousPower = power;
        if (rows.length === 500) await flush();
      }
      await flush();
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return { synthetic: true, inserted, installations: installationIds.length, cutoff: new Date(until).toISOString() };
}
