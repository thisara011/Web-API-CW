import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrations.js';
import { createSeedDataset, SEED_REFERENCE } from '../../src/seed/dataset.js';
import { seedDatabase } from '../../src/seed/seed.js';
import { disableFixtureCredentials, rotateCredential } from '../../src/auth/administration.js';
import { checkProductionReadiness } from '../../src/db/readiness.js';
import { AuthenticationService } from '../../src/auth/service.js';
import { catchUpSyntheticReadings } from '../../src/seed/catch-up.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required for authentication integration tests.');
const schema = `solar_auth_test_${randomUUID().replaceAll('-', '')}`;
const migrationPool = new Pool({ connectionString: url });
const applicationPool = new Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c timezone=UTC` });
const config = parseEnv({ NODE_ENV: 'test', DATABASE_URL: url, JWT_SECRET: 'integration-test-secret-with-more-than-thirty-two-characters', LOG_LEVEL: 'silent' });
const app = createApp({ database: { pool: applicationPool, checkConnection: async () => { await applicationPool.query('SELECT 1'); } }, logger: pino({ level: 'silent' }), config });
const dataset = createSeedDataset();

beforeAll(async () => {
  await runMigrations(migrationPool, { schema });
  const client = await applicationPool.connect();
  try { await client.query('BEGIN'); await seedDatabase(client, dataset); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}, 35_000);
afterAll(async () => { await applicationPool.end(); await migrationPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await migrationPool.end(); });

describe('JWT authentication and jurisdiction-scoped reads', () => {
  it('summarizes the full seed at its final local-midnight cutoff across eight seeded installations', async () => {
    const login = await request(app).post('/auth/token').send({ principalType: 'analyst', identifier: 'analyst-col@slsea.example', password: 'Coursework-Demo-Password-2026!' });
    const district = dataset.districts.find((item) => item.code === 'COL')!;
    const response = await request(app).get(`/districts/${district.id}/generation-summary?as-of=${encodeURIComponent(SEED_REFERENCE)}`).auth(login.body.accessToken, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalInstallations: 8, freshInstallations: 8, measuredPowerKw: 0, energyTodayKwh: 0, energyContributingInstallations: 8, powerCoverageComplete: true, energyCoverageComplete: true, localDate: '2026-08-25' });
  });

  it('issues a national analyst token and permits its geography collection', async () => {
    const login = await request(app).post('/auth/token').send({ principalType: 'analyst', identifier: 'analyst-national@slsea.example', password: 'Coursework-Demo-Password-2026!' });
    expect(login.status).toBe(200); expect(login.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, accessToken: expect.any(String) });
    const provinces = await request(app).get('/provinces').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(provinces.status).toBe(200); expect(provinces.body.items).toHaveLength(9);
  });

  it('prevents a district analyst from reading another province and prevents devices from hierarchy reads', async () => {
    const districtLogin = await request(app).post('/auth/token').send({ principalType: 'analyst', identifier: 'analyst-col@slsea.example', password: 'Coursework-Demo-Password-2026!' });
    const provinces = await request(app).get('/provinces').set('Authorization', `Bearer ${districtLogin.body.accessToken}`);
    expect(provinces.status).toBe(200); expect(provinces.body.items).toHaveLength(1); expect(provinces.body.items[0].code).toBe('WP');
    const other = dataset.provinces.find((province) => province.code === 'CP')!;
    expect((await request(app).get(`/provinces/${other.id}`).set('Authorization', `Bearer ${districtLogin.body.accessToken}`)).status).toBe(404);
    const device = await request(app).post('/auth/token').send({ principalType: 'installation', identifier: 'SLSEA-COL-001', password: 'device-SLSEA-COL-001' });
    expect(device.status).toBe(200);
    expect((await request(app).get('/provinces').set('Authorization', `Bearer ${device.body.accessToken}`)).status).toBe(403);
  });

  it('rejects absent, forged and invalid credentials without exposing authentication details', async () => {
    expect((await request(app).get('/provinces')).status).toBe(401);
    expect((await request(app).get('/provinces').set('Authorization', 'Bearer forged.token.value')).status).toBe(401);
    const invalid = await request(app).post('/auth/token').send({ principalType: 'analyst', identifier: 'analyst-national@slsea.example', password: 'wrong-password-value' });
    expect(invalid.status).toBe(401); expect(invalid.body.error.message).toBe('Invalid credentials');
  });

  it('accepts an append-only reading only from its own device and exposes it to authorized analysts', async () => {
    const device = await request(app).post('/auth/token').send({ principalType: 'installation', identifier: 'SLSEA-COL-001', password: 'device-SLSEA-COL-001' });
    const installation = dataset.installations.find((item) => item.meterId === 'SLSEA-COL-001')!;
    const other = dataset.installations.find((item) => item.meterId === 'SLSEA-COL-002')!;
    const payload = { timestamp: '2026-09-01T00:00:00.000Z', powerKw: 0, cumulativeEnergyKwh: 9999.5, voltage: 230.1 };
    const created = await request(app).post(`/installations/${installation.id}/readings`).set('Authorization', `Bearer ${device.body.accessToken}`).send(payload);
    expect(created.status).toBe(201); expect(created.headers.location).toBe(`/readings/${created.body.id}`);
    expect((await request(app).post(`/installations/${other.id}/readings`).set('Authorization', `Bearer ${device.body.accessToken}`).send(payload)).status).toBe(403);
    expect((await request(app).post(`/installations/${installation.id}/readings`).set('Authorization', `Bearer ${device.body.accessToken}`).send(payload)).status).toBe(409);
    const analyst = await request(app).post('/auth/token').send({ principalType: 'analyst', identifier: 'analyst-national@slsea.example', password: 'Coursework-Demo-Password-2026!' });
    expect((await request(app).get(`/readings/${created.body.id}`).set('Authorization', `Bearer ${analyst.body.accessToken}`)).status).toBe(200);
    const latest = await request(app).get(`/installations/${installation.id}/latest-reading`).set('Authorization', `Bearer ${analyst.body.accessToken}`);
    expect(latest.status).toBe(200); expect(latest.body.id).toBe(created.body.id);
    const overview = await request(app).get(`/installations/${installation.id}/overview`).set('Authorization', `Bearer ${analyst.body.accessToken}`);
    expect(overview.status).toBe(200); expect(overview.body.lastKnownReading.id).toBe(created.body.id);
  });

  it('advances synthetic history through midnight without duplicates, gaps or changes to old rows', async () => {
    const id = dataset.installations.find((item) => item.meterId === 'SLSEA-COL-002')!.id;
    const cutoff = Date.parse(SEED_REFERENCE) + 86_400_000;
    const old = (await applicationPool.query('SELECT * FROM generation_readings WHERE installation_id=$1 ORDER BY timestamp LIMIT 1', [id])).rows;
    const results = await Promise.all([catchUpSyntheticReadings(applicationPool, [id], cutoff), catchUpSyntheticReadings(applicationPool, [id], cutoff)]);
    expect(results.map((result) => result.inserted).sort((a, b) => a - b)).toEqual([0, 96]);
    expect((await applicationPool.query('SELECT * FROM generation_readings WHERE installation_id=$1 ORDER BY timestamp LIMIT 1', [id])).rows).toEqual(old);
    const audit = await applicationPool.query(`WITH r AS (SELECT timestamp, cumulative_energy_kwh,
      lag(timestamp) OVER (ORDER BY timestamp) AS previous_time,
      lag(cumulative_energy_kwh) OVER (ORDER BY timestamp) AS previous_counter
      FROM generation_readings WHERE installation_id=$1)
      SELECT count(*)::int AS count, bool_and(previous_time IS NULL OR timestamp-previous_time=interval '15 minutes') AS regular,
        bool_and(previous_counter IS NULL OR cumulative_energy_kwh>=previous_counter) AS monotonic FROM r`, [id]);
    expect(audit.rows[0]).toEqual({ count: 769, regular: true, monotonic: true });
    await expect(catchUpSyntheticReadings(applicationPool, [id], Date.now() + 60_000)).rejects.toThrow('cutoff');
  });

  it('blocks public production credentials and rotates, revokes and disables fixtures without touching history', async () => {
    await expect(checkProductionReadiness(applicationPool)).rejects.toThrow('fixture');
    const production = new AuthenticationService(applicationPool, { ...config, NODE_ENV: 'production' });
    const input = { principalType: 'analyst' as const, identifier: 'analyst-national@slsea.example', password: 'Coursework-Demo-Password-2026!' };
    await expect(production.authenticate(input)).rejects.toMatchObject({ status: 401 });
    const oldLogin = await request(app).post('/auth/token').send(input);
    const before = await applicationPool.query('SELECT count(*) FROM generation_readings');
    await expect(rotateCredential(applicationPool, input)).rejects.toThrow('Published');
    await rotateCredential(applicationPool, { ...input, password: 'private-integration-test-only-password' });
    expect((await request(app).get('/provinces').auth(oldLogin.body.accessToken, { type: 'bearer' })).status).toBe(401);
    await expect(production.authenticate({ ...input, password: 'private-integration-test-only-password' })).resolves.toHaveProperty('accessToken');
    const disabled = await disableFixtureCredentials(applicationPool);
    expect(disabled).toEqual({ analystsDisabled: 34, installationsDisabled: 200 });
    await expect(checkProductionReadiness(applicationPool)).resolves.toBeUndefined();
    expect(await disableFixtureCredentials(applicationPool)).toEqual({ analystsDisabled: 0, installationsDisabled: 0 });
    const device = { principalType: 'installation' as const, identifier: 'SLSEA-COL-001', password: 'private-device-integration-test-password' };
    await rotateCredential(applicationPool, device);
    await expect(production.authenticate(device)).resolves.toHaveProperty('accessToken');
    expect((await applicationPool.query('SELECT count(*) FROM generation_readings')).rows).toEqual(before.rows);
  });
});
