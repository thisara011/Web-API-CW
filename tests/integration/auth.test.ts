import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrations.js';
import { createSeedDataset } from '../../src/seed/dataset.js';
import { seedDatabase } from '../../src/seed/seed.js';

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
});
