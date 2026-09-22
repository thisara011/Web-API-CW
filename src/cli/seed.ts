import { createSeedDataset, GENERATOR_VERSION, SEED_REFERENCE } from '../seed/dataset.js';
import { seedDatabase } from '../seed/seed.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function seed(): Promise<void> {
  const database = migrationDatabase();
  const dataset = createSeedDataset();
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO solar, pg_catalog');
    const status = await seedDatabase(client, dataset);
    await client.query('COMMIT');
    console.log(JSON.stringify({ status, generatorVersion: GENERATOR_VERSION, reference: SEED_REFERENCE, checksum: dataset.checksum, counts: {
      provinces: dataset.provinces.length, districts: dataset.districts.length, substations: dataset.substations.length,
      installations: dataset.installations.length, readings: dataset.readings.length, users: dataset.users.length,
    } }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await database.close();
  }
}

seed().catch(reportDatabaseFailure);
