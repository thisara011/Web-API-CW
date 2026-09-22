import type { PoolClient } from 'pg';
import type { SeedDataset } from './dataset.js';
import { GENERATOR_VERSION, RANDOM_SEED, SEED_REFERENCE } from './dataset.js';

const batchSize = 500;

function placeholders(rows: unknown[][], start = 1): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const text = rows.map((row, rowIndex) => `(${row.map((value, columnIndex) => {
    values.push(value);
    return `$${start + rowIndex * row.length + columnIndex}`;
  }).join(', ')})`).join(', ');
  return { text, values };
}

async function insertBatches(client: PoolClient, table: string, columns: string[], rows: unknown[][], conflict: string): Promise<void> {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const query = placeholders(batch);
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${query.text} ON CONFLICT ${conflict}`, query.values);
  }
}

async function assertExistingSeed(client: PoolClient, dataset: SeedDataset): Promise<boolean> {
  const metadata = await client.query<{ dataset_checksum: string }>('SELECT dataset_checksum FROM seed_runs WHERE generator_version = $1', [GENERATOR_VERSION]);
  if (metadata.rowCount === 0) {
    const data = await client.query<{ count: string }>('SELECT (SELECT count(*) FROM provinces) + (SELECT count(*) FROM districts) + (SELECT count(*) FROM grid_substations) + (SELECT count(*) FROM solar_installations) + (SELECT count(*) FROM generation_readings) AS count');
    if (Number(data.rows[0]?.count ?? 0) !== 0) throw new Error('Database contains domain data without a seed manifest; seed refuses to mix datasets');
    return false;
  }
  if (metadata.rowCount !== 1 || metadata.rows[0]?.dataset_checksum !== dataset.checksum) {
    throw new Error('Existing seed manifest does not match this generator; do not overwrite a deployed dataset');
  }
  const counts = await client.query<{ province_count: string; district_count: string; substation_count: string; installation_count: string; reading_count: string }>(`
    SELECT (SELECT count(*) FROM provinces) AS province_count,
           (SELECT count(*) FROM districts) AS district_count,
           (SELECT count(*) FROM grid_substations) AS substation_count,
           (SELECT count(*) FROM solar_installations) AS installation_count,
           (SELECT count(*) FROM generation_readings) AS reading_count`);
  const row = counts.rows[0];
  if (!row || Number(row.province_count) !== dataset.provinces.length || Number(row.district_count) !== dataset.districts.length
    || Number(row.substation_count) !== dataset.substations.length || Number(row.installation_count) !== dataset.installations.length
    || Number(row.reading_count) !== dataset.readings.length) {
    throw new Error('Existing seed manifest has incomplete domain data; investigate before retrying');
  }
  return true;
}

export async function seedDatabase(client: PoolClient, dataset: SeedDataset): Promise<'seeded' | 'already-seeded'> {
  const existing = await assertExistingSeed(client, dataset);
  if (existing) return 'already-seeded';
  await insertBatches(client, 'provinces', ['id', 'code', 'name'], dataset.provinces.map((item) => [item.id, item.code, item.name]), 'DO NOTHING');
  await insertBatches(client, 'districts', ['id', 'province_id', 'code', 'name'], dataset.districts.map((item) => [item.id, item.provinceId, item.code, item.name]), 'DO NOTHING');
  await insertBatches(client, 'grid_substations', ['id', 'district_id', 'code', 'name'], dataset.substations.map((item) => [item.id, item.districtId, item.code, item.name]), 'DO NOTHING');
  await insertBatches(client, 'solar_installations', ['id', 'grid_substation_id', 'meter_id', 'site_label', 'capacity_kw', 'commissioned_date', 'credential_hash'], dataset.installations.map((item) => [item.id, item.gridSubstationId, item.meterId, item.siteLabel, item.capacityKw, item.commissionedDate, item.credentialHash]), 'DO NOTHING');
  await insertBatches(client, 'users', ['id', 'email', 'password_hash', 'role', 'province_id', 'district_id'], dataset.users.map((item) => [item.id, item.email, item.passwordHash, item.role, item.provinceId, item.districtId]), 'DO NOTHING');
  await insertBatches(client, 'generation_readings', ['id', 'installation_id', 'timestamp', 'power_kw', 'cumulative_energy_kwh', 'voltage'], dataset.readings.map((item) => [item.id, item.installationId, item.timestamp, item.powerKw, item.cumulativeEnergyKwh, item.voltage]), 'DO NOTHING');
  await client.query(`INSERT INTO seed_runs (generator_version, dataset_checksum, seed_reference, random_seed, province_count, district_count, substation_count, installation_count, reading_count)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [GENERATOR_VERSION, dataset.checksum, SEED_REFERENCE, RANDOM_SEED, dataset.provinces.length, dataset.districts.length, dataset.substations.length, dataset.installations.length, dataset.readings.length]);
  return 'seeded';
}
