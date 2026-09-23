import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { issueToken, type Principal } from '../../src/auth/tokens.js';
import { parseEnv } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrations.js';
import { grantRuntimeAccess } from '../../src/db/permissions.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required');
const suffix = randomUUID().replaceAll('-', '');
const schema = `solar_readings_${suffix}`;
const runtimeRole = `solar_reader_${suffix}`;
const owner = new Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c timezone=UTC` });
// All HTTP SQL runs with the same SELECT/INSERT-only permissions as deployment.
const runtime = new Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c timezone=UTC -c role=${runtimeRole}` });
const config = parseEnv({ DATABASE_URL: url, NODE_ENV: 'test', JWT_SECRET: 'readings-test-secret-with-at-least-thirty-two-characters' });
const app = createApp({ database: { pool: runtime, checkConnection: async () => { await runtime.query('SELECT 1'); } }, config, logger: pino({ level: 'silent' }) });
const p1 = randomUUID(), p2 = randomUUID(), d1 = randomUUID(), d2 = randomUUID(), d3 = randomUUID();
const s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID();
let national: string, provincial: string, district: string, foreign: string;
let roleCreated = false;

async function analyst(role: 'national' | 'provincial' | 'district', jurisdiction: string | null = null) {
  const id = randomUUID();
  const provinceId = role === 'provincial' ? jurisdiction : null;
  const districtId = role === 'district' ? jurisdiction : null;
  await owner.query('INSERT INTO users (id,email,password_hash,role,province_id,district_id) VALUES ($1,$2,$3,$4,$5,$6)', [id, `${id}@example.test`, 'unused-test-hash', role, provinceId, districtId]);
  const principal: Principal = { kind: 'analyst', subject: id, credentialVersion: 1, role, provinceId, districtId, scopes: ['geography:read', 'installation:read'] };
  return { id, principal, token: (await issueToken(principal, config)).accessToken };
}
async function installation(substation = s1, commissionedDate: string | null = null) {
  const id = randomUUID();
  await owner.query('INSERT INTO solar_installations (id,grid_substation_id,meter_id,site_label,capacity_kw,commissioned_date) VALUES ($1,$2,$3,$4,10,$5)', [id, substation, `meter-${id}`, 'Test solar site', commissionedDate]);
  const principal: Principal = { kind: 'installation', subject: id, installationId: id, credentialVersion: 1, scopes: ['readings:write'] };
  return { id, token: (await issueToken(principal, config)).accessToken };
}
const payload = (timestamp: string, cumulativeEnergyKwh: number) => ({ timestamp, cumulativeEnergyKwh, powerKw: 3.42, voltage: 230.1 });
const append = (site: { id: string; token: string }, time: string, energy: number) => request(app).post(`/installations/${site.id}/readings`).auth(site.token, { type: 'bearer' }).send(payload(time, energy));
const get = (path: string, token = national) => request(app).get(path).auth(token, { type: 'bearer' });

beforeAll(async () => {
  await runMigrations(owner, { schema });
  await owner.query(`CREATE ROLE "${runtimeRole}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  roleCreated = true;
  await grantRuntimeAccess(owner, { schema, role: runtimeRole });
  await owner.query("INSERT INTO provinces (id,code,name) VALUES ($1,'WP','Western'),($2,'CP','Central')", [p1, p2]);
  await owner.query("INSERT INTO districts (id,province_id,code,name) VALUES ($1,$4,'COL','Colombo'),($2,$4,'GAM','Gampaha'),($3,$5,'KAN','Kandy')", [d1, d2, d3, p1, p2]);
  await owner.query("INSERT INTO grid_substations (id,district_id,code,name) VALUES ($1,$4,'S1','Grid 1'),($2,$5,'S2','Grid 2'),($3,$6,'S3','Grid 3')", [s1, s2, s3, d1, d2, d3]);
  national = (await analyst('national')).token;
  provincial = (await analyst('provincial', p1)).token;
  district = (await analyst('district', d1)).token;
  foreign = (await analyst('district', d3)).token;
});
afterAll(async () => {
  await runtime.end();
  await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  if (roleCreated) await owner.query(`DROP ROLE "${runtimeRole}"`);
  await owner.end();
});

describe('immutable reading HTTP workflow with restricted database permissions', () => {
  it('returns numeric measurements, UTC dates, a canonical Location and matching scoped representations', async () => {
    const site = await installation();
    const created = await append(site, '2026-08-01T11:30:00.123+05:30', 100);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ installationId: site.id, timestamp: '2026-08-01T06:00:00.123Z', cumulativeEnergyKwh: 100, powerKw: 3.42, voltage: 230.1 });
    expect(created.headers.location!).toBe(`/readings/${created.body.id}`);
    expect(created.headers['content-location']).toBe(created.headers.location!);
    for (const token of [national, provincial, district]) {
      expect((await get(created.headers.location!, token)).body).toEqual(created.body);
      expect((await get(`/installations/${site.id}/latest-reading`, token)).body).toEqual(created.body);
      const overview = await get(`/installations/${site.id}/overview`, token);
      expect(overview.body).toMatchObject({ installation: { id: site.id, capacityKw: 10 }, hierarchy: { district: { id: d1 } }, lastKnownReading: created.body });
      expect(JSON.stringify(overview.body)).not.toMatch(/credential|password/);
    }
  });

  it('enforces principal, jurisdiction and ownership boundaries including sibling districts', async () => {
    const site = await installation(s2);
    const created = await append(site, '2026-08-01T06:00:00Z', 100);
    const other = await installation();
    expect((await append({ ...site, token: other.token }, '2026-08-02T06:00:00Z', 110)).status).toBe(403);
    expect((await append({ ...site, token: national }, '2026-08-02T06:00:00Z', 110)).status).toBe(403);
    for (const path of [created.headers.location!, `/installations/${site.id}/latest-reading`, `/installations/${site.id}/overview`]) {
      expect((await get(path, district)).status).toBe(404);
      expect((await get(path, foreign)).status).toBe(404);
      expect((await get(path, provincial)).status).toBe(200);
      expect((await get(path, site.token)).status).toBe(403);
      expect((await get(path, district).set('If-None-Match', '*')).status).toBe(404);
    }
  });

  it('returns null overview history and 404 latest for an empty authorized installation', async () => {
    const site = await installation();
    const overview = await get(`/installations/${site.id}/overview`);
    expect(overview.status).toBe(200); expect(overview.body.lastKnownReading).toBeNull();
    expect((await get(`/installations/${site.id}/latest-reading`)).status).toBe(404);
    for (const path of [`/installations/${randomUUID()}/overview`, `/installations/${randomUUID()}/latest-reading`, `/readings/${randomUUID()}`]) {
      expect((await get(path)).status).toBe(404);
    }
  });

  it('normalizes duplicate instants and rejects identical and conflicting retries without rewriting', async () => {
    const site = await installation();
    const first = await append(site, '2026-08-01T06:00:00Z', 100);
    for (const counter of [100, 101]) {
      const retry = await append(site, '2026-08-01T11:30:00.000+05:30', counter);
      expect(retry.status).toBe(409); expect(retry.body.error.code).toBe(40901);
    }
    expect((await get(first.headers.location!)).body).toEqual(first.body);
  });

  it('accepts valid late arrivals, rejects both counter neighbours, and keeps latest by observation time', async () => {
    const site = await installation();
    expect((await append(site, '2026-08-01T06:00:00Z', 100)).status).toBe(201);
    const newest = await append(site, '2026-08-01T08:00:00Z', 120);
    for (const energy of [99, 121]) {
      const conflict = await append(site, '2026-08-01T07:00:00Z', energy);
      expect(conflict.status).toBe(409); expect(conflict.body.error.code).toBe(40902);
    }
    expect((await append(site, '2026-08-01T07:00:00Z', 110)).status).toBe(201);
    expect((await append(site, '2026-08-01T09:00:00Z', 119)).status).toBe(409);
    expect((await append(site, '2026-08-01T05:00:00Z', 101)).status).toBe(409);
    expect((await append(site, '2026-08-01T05:00:00Z', 100)).status).toBe(201);
    expect((await get(`/installations/${site.id}/latest-reading`)).body.id).toBe(newest.body.id);
  });

  it('serializes conflicting counters and duplicate inserts across concurrent HTTP requests', async () => {
    const site = await installation();
    const pair = await Promise.all([
      append(site, '2026-08-01T06:00:00Z', 120), append(site, '2026-08-01T07:00:00Z', 110),
    ]);
    expect(pair.map((result) => result.status).sort()).toEqual([201, 409]);
    const other = await installation();
    const retries = await Promise.all(Array.from({ length: 4 }, () => append(other, '2026-08-01T06:00:00Z', 100)));
    expect(retries.map((result) => result.status).sort()).toEqual([201, 409, 409, 409]);
    expect((await owner.query('SELECT count(*)::int AS count FROM generation_readings WHERE installation_id = $1', [other.id])).rows[0].count).toBe(1);
  });

  it('enforces commissioning date using Sri Lankan local midnight', async () => {
    const site = await installation(s1, '2026-08-01');
    expect((await append(site, '2026-07-31T18:29:59.999Z', 100)).status).toBe(400);
    expect((await append(site, '2026-07-31T18:30:00Z', 100)).status).toBe(201);
  });

  it('rejects malformed IDs, future observations, excess precision and spoofed fields with 400', async () => {
    const site = await installation();
    for (const path of ['/readings/not-a-uuid', '/installations/not-a-uuid/latest-reading', '/installations/not-a-uuid/overview']) {
      expect((await get(path)).status).toBe(400);
    }
    expect((await request(app).post('/installations/invalid/readings').auth(site.token, { type: 'bearer' }).send(payload('2026-08-01T06:00:00Z', 100))).status).toBe(400);
    for (const modification of [{ powerKw: -1 }, { voltage: 1.2345 }, { timestamp: '2100-01-01T00:00:00Z' }, { installationId: site.id }]) {
      const response = await request(app).post(`/installations/${site.id}/readings`).auth(site.token, { type: 'bearer' }).send({ ...payload('2026-08-01T06:00:00Z', 100), ...modification });
      expect(response.status).toBe(400); expect(response.body.error.code).toBe(40002);
    }
    expect((await owner.query('SELECT id FROM generation_readings WHERE installation_id=$1', [site.id])).rowCount).toBe(0);
  });

  it('checks missing/expired tokens and revokes disabled, rotated and reassigned identities', async () => {
    const site = await installation();
    const absent = await request(app).get(`/installations/${site.id}/overview`);
    expect(absent.status).toBe(401); expect(absent.headers['www-authenticate']).toBe('Bearer');
    const expired = await new SignJWT({ kind: 'installation', installation_id: site.id, cv: 1, scope: 'readings:write' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(site.id)
      .setIssuer(config.JWT_ISSUER).setAudience(config.JWT_AUDIENCE).setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(new TextEncoder().encode(config.JWT_SECRET));
    expect((await append({ ...site, token: expired }, '2026-08-01T06:00:00Z', 100)).status).toBe(401);
    await owner.query('UPDATE solar_installations SET credential_version=2 WHERE id=$1', [site.id]);
    expect((await append(site, '2026-08-01T06:00:00Z', 100)).status).toBe(401);
    await owner.query('UPDATE solar_installations SET credential_version=1,is_active=false WHERE id=$1', [site.id]);
    expect((await append(site, '2026-08-01T06:00:00Z', 100)).status).toBe(401);
    const user = await analyst('district', d1);
    await owner.query('UPDATE users SET district_id=$2 WHERE id=$1', [user.id, d2]);
    expect((await get(`/installations/${site.id}/overview`, user.token)).status).toBe(401);
    await owner.query('UPDATE users SET district_id=$2,is_active=false WHERE id=$1', [user.id, d1]);
    expect((await get(`/installations/${site.id}/overview`, user.token)).status).toBe(401);
  });

  it('advertises immutable resources with 405/Allow and supports HEAD/OPTIONS', async () => {
    const site = await installation();
    const created = await append(site, '2026-08-01T06:00:00Z', 100);
    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await request(app)[method](created.headers.location!).auth(national, { type: 'bearer' });
      expect(response.status).toBe(405); expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
    }
    const head = await request(app).head(created.headers.location!).auth(national, { type: 'bearer' });
    expect(head.status).toBe(200); expect(head.text).toBeUndefined();
    expect((await request(app).options(created.headers.location!)).status).toBe(204);
    expect((await get(created.headers.location!)).body).toEqual(created.body);
  });

  it('regresses district hierarchy SQL and sibling disclosure defects discovered during Stage 5', async () => {
    const site = await installation();
    expect((await get(`/installations/${site.id}`, district)).status).toBe(200);
    expect((await get(`/substations/${s1}`, district)).status).toBe(200);
    expect((await get(`/substations/${s1}/installations`, district)).status).toBe(200);
    for (const path of [`/provinces/${p1}`, `/districts/${d1}`, `/districts/${d1}/substations`]) {
      expect((await get(path)).status).toBe(200);
    }
    const districts = await get(`/provinces/${p1}/districts`, district);
    expect(districts.status).toBe(200);
    expect(districts.body.items.map((row: { id: string }) => row.id)).toEqual([d1]);
    expect((await get(`/districts/${d2}`, district)).status).toBe(404);
  });
});
