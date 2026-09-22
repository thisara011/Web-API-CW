import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { createSeedDataset } from '../../src/seed/dataset.js';
import { seedDatabase } from '../../src/seed/seed.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for seed integration tests. Use a dedicated PostgreSQL test database.');
}

const schema = `solar_seed_test_${randomUUID().replaceAll('-', '')}`;
const database = createDatabase(parseEnv({
  NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl,
  DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false', LOG_LEVEL: 'silent',
  DB_CONNECTION_TIMEOUT_MS: '5000',
}), pino({ level: 'silent' }));
const dataset = createSeedDataset();

beforeAll(async () => {
  await runMigrations(database.pool, { schema });
}, 20_000);

afterAll(async () => {
  try {
    await database.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await database.close();
  }
});

describe('reproducible full seed', () => {
  it('inserts the complete required dataset and leaves it unchanged on a repeat run', async () => {
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      expect(await seedDatabase(client, dataset)).toBe('seeded');
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      expect(await seedDatabase(client, dataset)).toBe('already-seeded');
      const counts = await client.query<{ provinces: string; districts: string; substations: string; installations: string; readings: string; users: string; manifests: string }>(`
        SELECT (SELECT count(*) FROM provinces) AS provinces,
               (SELECT count(*) FROM districts) AS districts,
               (SELECT count(*) FROM grid_substations) AS substations,
               (SELECT count(*) FROM solar_installations) AS installations,
               (SELECT count(*) FROM generation_readings) AS readings,
               (SELECT count(*) FROM users) AS users,
               (SELECT count(*) FROM seed_runs) AS manifests`);
      await client.query('COMMIT');
      expect(counts.rows).toEqual([{ provinces: '9', districts: '25', substations: '25', installations: '200', readings: '134600', users: '35', manifests: '1' }]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }, 30_000);
});
