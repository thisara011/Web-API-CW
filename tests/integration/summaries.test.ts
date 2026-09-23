import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
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
const schema = `solar_summary_${suffix}`, role = `solar_summary_${suffix}`;
const owner = new Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c timezone=UTC` });
const runtime = new Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c timezone=UTC -c role=${role}` });
const config = parseEnv({ NODE_ENV: 'test', DATABASE_URL: url, JWT_SECRET: 'summary-integration-secret-at-least-thirty-two-characters' });
const fixedNow = Date.parse('2026-08-01T06:44:59.999Z');
let now = fixedNow;
const app = createApp({ config, database: { pool: runtime, checkConnection: async () => { await runtime.query('SELECT 1'); } }, logger: pino({ level: 'silent' }), now: () => now });
const p1 = randomUUID(), p2 = randomUUID();
let national: string, provincial: string, foreignProvince: string, roleCreated = false;
const cutoff = '2026-08-01T06:30:00.000Z';
const midnight = '2026-07-31T18:30:00.000Z';

async function analyst(kind: 'national' | 'provincial' | 'district', jurisdiction: string | null = null) {
  const id = randomUUID(), provinceId = kind === 'provincial' ? jurisdiction : null, districtId = kind === 'district' ? jurisdiction : null;
  await owner.query('INSERT INTO users (id,email,password_hash,role,province_id,district_id) VALUES ($1,$2,$3,$4,$5,$6)', [id, `${id}@test.example`, 'test-unused-hash', kind, provinceId, districtId]);
  const principal: Principal = { kind: 'analyst', subject: id, credentialVersion: 1, role: kind, provinceId, districtId, scopes: ['geography:read', 'installation:read'] };
  return { id, token: (await issueToken(principal, config)).accessToken };
}
async function district(provinceId = p1) {
  const id = randomUUID(), substationId = randomUUID();
  await owner.query('INSERT INTO districts (id,province_id,code,name) VALUES ($1,$2,$3,$4)', [id, provinceId, `D-${id}`, 'Test district']);
  await owner.query('INSERT INTO grid_substations (id,district_id,code,name) VALUES ($1,$2,$3,$4)', [substationId, id, `S-${id}`, 'Test substation']);
  return { id, substationId };
}
async function site(substationId: string, active = true) {
  const id = randomUUID();
  await owner.query('INSERT INTO solar_installations (id,grid_substation_id,meter_id,site_label,capacity_kw,is_active) VALUES ($1,$2,$3,$4,10,$5)', [id, substationId, `M-${id}`, 'Test site', active]);
  return id;
}
async function reading(id: string, timestamp: string, power: number, energy: number) {
  await owner.query('INSERT INTO generation_readings (installation_id,timestamp,power_kw,cumulative_energy_kwh,voltage) VALUES ($1,$2,$3,$4,230)', [id, timestamp, power, energy]);
}
const path = (districtId: string, asOf: string = cutoff) => `/districts/${districtId}/generation-summary?as-of=${encodeURIComponent(asOf)}`;
const get = (uri: string, token = national) => request(app).get(uri).auth(token, { type: 'bearer' });

beforeAll(async () => {
  await runMigrations(owner, { schema });
  await owner.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  roleCreated = true;
  await grantRuntimeAccess(owner, { schema, role });
  await owner.query("INSERT INTO provinces (id,code,name) VALUES ($1,'WP','Western'),($2,'CP','Central')", [p1, p2]);
  national = (await analyst('national')).token;
  provincial = (await analyst('provincial', p1)).token;
  foreignProvince = (await analyst('provincial', p2)).token;
});
afterAll(async () => {
  await runtime.end();
  try { await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); if (roleCreated) await owner.query(`DROP ROLE "${role}"`); }
  finally { await owner.end(); }
});

describe('district generation arithmetic and coverage under restricted SQL permissions', () => {
  it('calculates 5 kW and 7.5 kWh from two counter differences, not cumulative counter sums', async () => {
    const d = await district(), a = await site(d.substationId), b = await site(d.substationId);
    await reading(a, midnight, 0, 100); await reading(b, midnight, 0, 250);
    await reading(a, cutoff, 2, 104.5); await reading(b, cutoff, 3, 253);
    // A later observation must not enter a historical cutoff calculation.
    await reading(a, '2026-08-01T06:40:00Z', 9, 106);
    const response = await get(path(d.id));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      district: { id: d.id, provinceId: p1 }, asOf: cutoff, dayStart: midnight, localDate: '2026-08-01', timeZone: 'Asia/Colombo', freshnessMinutes: 30,
      totalInstallations: 2, freshInstallations: 2, staleInstallations: 0, noReadingInstallations: 0,
      measuredPowerKw: 5, energyTodayKwh: 7.5, energyContributingInstallations: 2,
      missingMidnightBaselineInstallations: 0, invalidCounterInstallations: 0, staleEnergyInstallations: 0,
      powerCoverageComplete: true, energyCoverageComplete: true,
      powerOldestObservedAt: cutoff, powerNewestObservedAt: cutoff, energyOldestObservedAt: cutoff, energyNewestObservedAt: cutoff,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/credential|password|meterId/);
  });

  it('distinguishes fresh, stale, missing observations and missing baselines with measured subtotals', async () => {
    const d = await district();
    const fresh = await site(d.substationId), stale = await site(d.substationId), noBaseline = await site(d.substationId), none = await site(d.substationId);
    await reading(fresh, midnight, 0, 100); await reading(fresh, cutoff, 2, 104.5);
    await reading(stale, midnight, 0, 250); await reading(stale, '2026-08-01T05:59:59.999Z', 8, 253);
    await reading(noBaseline, cutoff, 3, 900);
    await reading(none, '2026-08-01T06:40:00Z', 10, 1000);
    const response = await get(path(d.id));
    expect(response.body).toMatchObject({ totalInstallations: 4, freshInstallations: 2, staleInstallations: 1, noReadingInstallations: 1,
      measuredPowerKw: 5, energyTodayKwh: 7.5, energyContributingInstallations: 2,
      missingMidnightBaselineInstallations: 2, staleEnergyInstallations: 1, powerCoverageComplete: false, energyCoverageComplete: false,
      energyOldestObservedAt: '2026-08-01T05:59:59.999Z', energyNewestObservedAt: cutoff });
  });

  it('includes exactly the 30-minute freshness boundary and distinguishes night-time zero from no measurement', async () => {
    const d = await district(), a = await site(d.substationId);
    await reading(a, midnight, 0, 100); await reading(a, '2026-08-01T06:00:00Z', 0, 104);
    const fresh = await get(path(d.id));
    expect(fresh.body).toMatchObject({ measuredPowerKw: 0, freshInstallations: 1, powerCoverageComplete: true, energyTodayKwh: 4 });
    const stale = await get(path(d.id, '2026-08-01T06:30:00.001Z'));
    expect(stale.body).toMatchObject({ measuredPowerKw: null, staleInstallations: 1, powerCoverageComplete: false, energyTodayKwh: 4, energyCoverageComplete: true, staleEnergyInstallations: 1 });
    expect(stale.body.powerOldestObservedAt).toBeNull();
  });

  it('uses Sri Lankan midnight at an exact boundary, not UTC midnight or an approximate baseline', async () => {
    const d = await district(), a = await site(d.substationId);
    await reading(a, '2026-07-31T18:29:59.999Z', 1, 99);
    await reading(a, midnight, 0, 100);
    await reading(a, '2026-08-01T00:00:00Z', 2, 102);
    const boundary = await get(path(d.id, midnight));
    expect(boundary.body).toMatchObject({ asOf: midnight, dayStart: midnight, localDate: '2026-08-01', measuredPowerKw: 0, energyTodayKwh: 0, energyCoverageComplete: true });
    const utcMidnight = await get(path(d.id, '2026-08-01T00:00:00Z'));
    expect(utcMidnight.body.energyTodayKwh).toBe(2);
    const before = await get(path(d.id, '2026-07-31T18:29:59.999Z'));
    expect(before.body).toMatchObject({ localDate: '2026-07-31', dayStart: '2026-07-30T18:30:00.000Z', energyTodayKwh: null, energyCoverageComplete: false });
  });

  it('returns honest nulls for empty districts, sites without readings and sites with only previous-day readings', async () => {
    const d = await district();
    expect((await get(path(d.id))).body).toMatchObject({ totalInstallations: 0, measuredPowerKw: null, energyTodayKwh: null, powerCoverageComplete: false, energyCoverageComplete: false });
    const a = await site(d.substationId);
    expect((await get(path(d.id))).body).toMatchObject({ totalInstallations: 1, noReadingInstallations: 1, measuredPowerKw: null, energyTodayKwh: null });
    await reading(a, '2026-07-31T18:29:00Z', 2, 100);
    expect((await get(path(d.id))).body).toMatchObject({ staleInstallations: 1, noReadingInstallations: 0, missingMidnightBaselineInstallations: 1, energyTodayKwh: null });
  });

  it('excludes inconsistent imported counters from energy rather than returning negative generation', async () => {
    const d = await district(), a = await site(d.substationId);
    // Deliberately inconsistent owner-import fixture; HTTP ingestion rejects this.
    await reading(a, midnight, 0, 100); await reading(a, cutoff, 2, 99);
    expect((await get(path(d.id))).body).toMatchObject({ measuredPowerKw: 2, invalidCounterInstallations: 1, energyContributingInstallations: 0, energyTodayKwh: null, energyCoverageComplete: false });
  });

  it('retains inactive installations in the current inventory rather than rewriting historical coverage', async () => {
    const d = await district(), a = await site(d.substationId, false);
    await reading(a, midnight, 0, 100); await reading(a, cutoff, 2, 104);
    expect((await get(path(d.id))).body).toMatchObject({ totalInstallations: 1, measuredPowerKw: 2, energyTodayKwh: 4, energyCoverageComplete: true });
  });
});

describe('district summary authorization, clock and conditional contract', () => {
  it('restricts province and district principals and never includes another district installation', async () => {
    const d = await district(), other = await district(), outside = await district(p2);
    const a = await site(d.substationId), b = await site(other.substationId), c = await site(outside.substationId);
    await reading(a, cutoff, 2, 100); await reading(b, cutoff, 500, 200); await reading(c, cutoff, 999, 300);
    const local = await analyst('district', d.id);
    for (const token of [national, provincial, local.token]) {
      const response = await get(path(d.id), token);
      expect(response.status).toBe(200); expect(response.body.measuredPowerKw).toBe(2); expect(response.body.totalInstallations).toBe(1);
    }
    for (const [id, token] of [[d.id, foreignProvince], [other.id, local.token], [outside.id, provincial], [randomUUID(), national]]) {
      expect((await get(path(id!), token!).set('If-None-Match', '*')).status).toBe(404);
    }
    expect((await request(app).get(path(d.id)).set('If-None-Match', '*')).status).toBe(401);
    const device = await issueToken({ kind: 'installation', subject: a, installationId: a, credentialVersion: 1, scopes: ['readings:write'] }, config);
    expect((await get(path(d.id), device.accessToken)).status).toBe(403);
    await owner.query('UPDATE users SET is_active=false WHERE id=$1', [local.id]);
    expect((await get(path(d.id), local.token).set('If-None-Match', '*')).status).toBe(401);
  });

  it('returns stable tags within a time slot and invalidates them when freshness changes at the next slot', async () => {
    const d = await district(), a = await site(d.substationId);
    await reading(a, '2026-08-01T06:00:00Z', 2, 100);
    const uri = `/districts/${d.id}/generation-summary`;
    now = fixedNow;
    try {
      const first = await get(uri);
      expect(first.body.asOf).toBe(cutoff); expect(first.body.measuredPowerKw).toBe(2);
      expect(first.headers['last-modified']).toBeUndefined();
      expect((await get(uri).set('If-None-Match', first.headers.etag!)).status).toBe(304);
      now += 1;
      const next = await get(uri).set('If-None-Match', first.headers.etag!);
      expect(next.status).toBe(200); expect(next.body.asOf).toBe('2026-08-01T06:45:00.000Z'); expect(next.body.measuredPowerKw).toBeNull();
      const historical = await get(path(d.id));
      expect(historical.body.measuredPowerKw).toBe(2);
    } finally { now = fixedNow; }
  });

  it('invalidates historical summaries when late data or a midnight baseline arrive', async () => {
    const d = await district(), a = await site(d.substationId);
    await reading(a, cutoff, 2, 104);
    const first = await get(path(d.id));
    expect(first.body.energyTodayKwh).toBeNull();
    await reading(a, midnight, 0, 100);
    const baseline = await get(path(d.id)).set('If-None-Match', first.headers.etag!);
    expect(baseline.status).toBe(200); expect(baseline.body.energyTodayKwh).toBe(4);
    const b = await site(d.substationId); await reading(b, cutoff, 3, 250);
    const added = await get(path(d.id)).set('If-None-Match', baseline.headers.etag!);
    expect(added.status).toBe(200); expect(added.body.measuredPowerKw).toBe(5); expect(added.body.totalInstallations).toBe(2);
    // A post-cutoff observation is deliberately irrelevant to this replay.
    await reading(a, '2026-08-01T06:40:00Z', 9, 106);
    expect((await get(path(d.id)).set('If-None-Match', added.headers.etag!)).status).toBe(304);
  });

  it('handles conditional, method and content negotiation contracts', async () => {
    const d = await district();
    const first = await get(path(d.id));
    const cached = await get(path(d.id)).set('If-None-Match', `W/${first.headers.etag}`);
    expect(cached.status).toBe(304); expect(cached.text).toBe(''); expect(cached.headers['cache-control']).toBe('private, no-cache');
    expect(cached.headers.vary).toContain('Authorization');
    expect((await get(path(d.id)).set('If-Match', '"stale"')).status).toBe(412);
    expect((await get(path(d.id)).set('Accept', 'application/xml').set('If-None-Match', '*')).status).toBe(406);
    const head = await request(app).head(path(d.id)).auth(national, { type: 'bearer' });
    expect(head.status).toBe(200); expect(head.text).toBeUndefined(); expect(head.headers.etag).toBe(first.headers.etag);
    expect((await request(app).options(path(d.id))).headers.allow).toBe('GET, HEAD, OPTIONS');
    for (const method of ['post','put','patch','delete'] as const) expect((await request(app)[method](path(d.id))).status).toBe(405);
  });

  it('rejects invalid IDs, repeated/unknown queries and future cutoff without a grace window', async () => {
    const d = await district();
    for (const suffix of ['as-of=2026-08-01T06:45:00Z', 'as-of=invalid', 'as-of=2026-08-01T06:00:00Z&as-of=2026-08-01T06:01:00Z', 'unknown=1']) {
      const response = await get(`/districts/${d.id}/generation-summary?${suffix}`);
      expect(response.status).toBe(400); expect(response.body.error.code).toBe(40002);
    }
    expect((await get('/districts/invalid/generation-summary')).status).toBe(400);
  });
});
