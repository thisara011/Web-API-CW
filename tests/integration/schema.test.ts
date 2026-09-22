import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pino from 'pino';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { loadMigrations, runMigrations } from '../../src/db/migrations.js';
import { grantRuntimeAccess } from '../../src/db/permissions.js';
import { createDatabase } from '../../src/db/pool.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for schema integration tests. Use a dedicated PostgreSQL test database with permission to create isolated schemas and test roles.',
  );
}

const database = createDatabase(
  parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl,
    DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false',
    LOG_LEVEL: 'silent',
    DB_CONNECTION_TIMEOUT_MS: '2000',
  }),
  pino({ level: 'silent' }),
);
const pool: Pool = database.pool;
const ownedSchemas = new Set<string>();
const ownedDirectories = new Set<string>();
const schema = newSchema('model');
const runtimeRole = `solar_test_role_${randomUUID().replaceAll('-', '')}`;
let runtimeRoleCreated = false;
let initialRun: Awaited<ReturnType<typeof runMigrations>>;
let provinceId: string;
let districtId: string;
let substationId: string;
let installationId: string;
let otherProvinceId: string;
let otherDistrictId: string;
let otherSubstationId: string;
let otherInstallationId: string;
let readingId: string;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function newSchema(purpose: string) {
  const name = `solar_test_${purpose}_${randomUUID().replaceAll('-', '')}`;
  ownedSchemas.add(name);
  return name;
}

function table(name: string, targetSchema = schema) {
  return `${quoteIdentifier(targetSchema)}.${quoteIdentifier(name)}`;
}

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'solar-schema-migrations-'));
  ownedDirectories.add(directory);
  return directory;
}

async function insertId(sql: string, values: unknown[] = []) {
  const result = await pool.query<{ id: string }>(sql, values);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('The fixture insert did not return an ID');
  return id;
}

async function asRuntime<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${quoteIdentifier(runtimeRole)}`);
    return await client.query<T>(sql, values);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

async function expectPgError(operation: Promise<unknown>, code: string | string[]) {
  await expect(operation).rejects.toMatchObject({
    code: Array.isArray(code) ? expect.stringMatching(new RegExp(`^(${code.join('|')})$`)) : code,
  });
}

beforeAll(async () => {
  await database.checkConnection();
  initialRun = await runMigrations(pool, { schema });
  provinceId = await insertId(
    `INSERT INTO ${table('provinces')} (code, name) VALUES ($1, $2) RETURNING id`,
    ['WP', 'Western Province'],
  );
  districtId = await insertId(
    `INSERT INTO ${table('districts')} (province_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
    [provinceId, 'COL', 'Colombo'],
  );
  substationId = await insertId(
    `INSERT INTO ${table('grid_substations')} (district_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
    [districtId, 'COL01', 'Colombo Test Substation'],
  );
  installationId = await insertId(
    `INSERT INTO ${table('solar_installations')} (grid_substation_id, meter_id, site_label, capacity_kw)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [substationId, 'METER-001', 'Test Rooftop', 5],
  );
  otherProvinceId = await insertId(
    `INSERT INTO ${table('provinces')} (code, name) VALUES ($1, $2) RETURNING id`,
    ['CP', 'Central Province'],
  );
  otherDistrictId = await insertId(
    `INSERT INTO ${table('districts')} (province_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
    [otherProvinceId, 'KAN', 'Kandy'],
  );
  otherSubstationId = await insertId(
    `INSERT INTO ${table('grid_substations')} (district_id, code, name) VALUES ($1, $2, $3) RETURNING id`,
    [otherDistrictId, 'KAN01', 'Kandy Test Substation'],
  );
  otherInstallationId = await insertId(
    `INSERT INTO ${table('solar_installations')} (grid_substation_id, meter_id, site_label, capacity_kw)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [otherSubstationId, 'METER-002', 'Other Test Rooftop', 6],
  );
  readingId = await insertId(
    `INSERT INTO ${table('generation_readings')}
     (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [installationId, '2026-08-01T06:00:00.000Z', 0, 100, 230],
  );
  await pool.query(
    `INSERT INTO ${table('users')} (email, password_hash, role, province_id, district_id)
     VALUES ($1, $2, 'national', NULL, NULL),
            ($3, $2, 'provincial', $4, NULL),
            ($5, $2, 'district', NULL, $6)`,
    ['national@example.test', 'fixture-password-hash', 'province@example.test', provinceId,
      'district@example.test', districtId],
  );
  await pool.query(
    `CREATE ROLE ${quoteIdentifier(runtimeRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
  );
  runtimeRoleCreated = true;
  await grantRuntimeAccess(pool, { schema, role: runtimeRole });
});

afterAll(async () => {
  try {
    for (const ownedSchema of ownedSchemas) {
      await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(ownedSchema)} CASCADE`);
    }
    if (runtimeRoleCreated) {
      await pool.query(`DROP ROLE ${quoteIdentifier(runtimeRole)}`);
    }
  } finally {
    await database.close();
    for (const directory of ownedDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe('migration execution against PostgreSQL', () => {
  it('records each applied migration and its checksum', async () => {
    const migrations = await loadMigrations();
    expect(initialRun).toEqual({
      applied: migrations.map(({ version }) => version),
      alreadyApplied: [],
    });
    const ledger = await pool.query<{ version: string; checksum: string; applied_at: Date }>(
      `SELECT version, checksum, applied_at FROM ${table('schema_migrations')} ORDER BY version`,
    );
    expect(ledger.rows.map(({ version, checksum }) => ({ version, checksum }))).toEqual(
      migrations.map(({ version, checksum }) => ({ version, checksum })),
    );
    expect(ledger.rows.every(({ applied_at }) => applied_at instanceof Date)).toBe(true);
  });

  it('is idempotent without changing existing business data', async () => {
    const secondRun = await runMigrations(pool, { schema });
    expect(secondRun).toEqual({ applied: [], alreadyApplied: initialRun.applied });
    expect((await pool.query(`SELECT id FROM ${table('generation_readings')}`)).rows).toEqual([
      { id: readingId },
    ]);
  });

  it.each(['public.bad', 'Uppercase', 'bad-name', 'a'.repeat(64), '']) (
    'rejects unsafe schema identifier %j',
    async (invalidSchema) => {
      await expect(runMigrations(pool, { schema: invalidSchema })).rejects.toThrow();
    },
  );

  it('serializes concurrent application of the same migrations', async () => {
    const concurrentSchema = newSchema('concurrent');
    const results = await Promise.all([
      runMigrations(pool, { schema: concurrentSchema }),
      runMigrations(pool, { schema: concurrentSchema }),
    ]);
    expect(results.map(({ applied }) => applied.length).sort((a, b) => a - b)).toEqual([
      0,
      initialRun.applied.length,
    ]);
    const ledger = await pool.query(`SELECT version FROM ${table('schema_migrations', concurrentSchema)}`);
    expect(ledger.rowCount).toBe(initialRun.applied.length);
  });

  it('rejects a modified applied file before executing pending migrations', async () => {
    const targetSchema = newSchema('tamper');
    const directory = await temporaryDirectory();
    const firstFile = path.join(directory, '001_initial.sql');
    const originalSql = `CREATE TABLE ${table('original', targetSchema)} (id integer PRIMARY KEY);`;
    await writeFile(firstFile, originalSql);
    await runMigrations(pool, { schema: targetSchema, directory });
    await writeFile(firstFile, `${originalSql}\n-- Changed after application\n`);
    await writeFile(path.join(directory, '002_pending.sql'),
      `CREATE TABLE ${table('pending', targetSchema)} (id integer);`);

    await expect(runMigrations(pool, { schema: targetSchema, directory })).rejects.toThrow();
    const result = await pool.query<{ name: string | null }>('SELECT to_regclass($1)::text AS name',
      [`${targetSchema}.pending`]);
    expect(result.rows[0]?.name).toBeNull();
    expect((await pool.query(`SELECT version FROM ${table('schema_migrations', targetSchema)}`)).rows)
      .toEqual([{ version: '001_initial.sql' }]);
  });

  it('rejects missing applied files before executing pending migrations', async () => {
    const targetSchema = newSchema('missing');
    const directory = await temporaryDirectory();
    const firstFile = path.join(directory, '001_initial.sql');
    await writeFile(firstFile, `CREATE TABLE ${table('original', targetSchema)} (id integer);`);
    await runMigrations(pool, { schema: targetSchema, directory });
    await unlink(firstFile);
    await writeFile(path.join(directory, '002_pending.sql'),
      `CREATE TABLE ${table('pending', targetSchema)} (id integer);`);

    await expect(runMigrations(pool, { schema: targetSchema, directory })).rejects.toThrow();
    const result = await pool.query<{ name: string | null }>('SELECT to_regclass($1)::text AS name',
      [`${targetSchema}.pending`]);
    expect(result.rows[0]?.name).toBeNull();
  });

  it('rolls back the entire pending batch on SQL failure and permits a repaired retry', async () => {
    const targetSchema = newSchema('rollback');
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, '001_initial.sql'),
      `CREATE TABLE ${table('original', targetSchema)} (id integer);`);
    await runMigrations(pool, { schema: targetSchema, directory });
    await writeFile(path.join(directory, '002_pending.sql'),
      `CREATE TABLE ${table('pending', targetSchema)} (id integer);`);
    await writeFile(path.join(directory, '003_fails.sql'),
      `INSERT INTO ${table('missing_table', targetSchema)} VALUES (1);`);

    await expect(runMigrations(pool, { schema: targetSchema, directory })).rejects.toThrow();
    const result = await pool.query<{ name: string | null }>('SELECT to_regclass($1)::text AS name',
      [`${targetSchema}.pending`]);
    expect(result.rows[0]?.name).toBeNull();
    expect((await pool.query(`SELECT version FROM ${table('schema_migrations', targetSchema)}`)).rows)
      .toEqual([{ version: '001_initial.sql' }]);

    await writeFile(path.join(directory, '003_fails.sql'),
      `INSERT INTO ${table('pending', targetSchema)} VALUES (42);`);
    expect(await runMigrations(pool, { schema: targetSchema, directory })).toEqual({
      applied: ['002_pending.sql', '003_fails.sql'],
      alreadyApplied: ['001_initial.sql'],
    });
    expect((await pool.query(`SELECT id FROM ${table('pending', targetSchema)}`)).rows)
      .toEqual([{ id: 42 }]);
  });
});

describe('geographic and asset model', () => {
  it('joins the complete installation hierarchy and generates UUID identifiers', async () => {
    const result = await pool.query(
      `SELECT i.id, i.meter_id, i.commissioned_date, p.name AS province, d.name AS district,
              s.name AS substation
       FROM ${table('solar_installations')} i
       JOIN ${table('grid_substations')} s ON s.id = i.grid_substation_id
       JOIN ${table('districts')} d ON d.id = s.district_id
       JOIN ${table('provinces')} p ON p.id = d.province_id WHERE i.id = $1`,
      [installationId],
    );
    expect(result.rows).toEqual([{
      id: installationId,
      meter_id: 'METER-001',
      commissioned_date: null,
      province: 'Western Province',
      district: 'Colombo',
      substation: 'Colombo Test Substation',
    }]);
    expect(installationId).toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
  });

  it('rejects an installation with no existing parent substation', async () => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('solar_installations')} (grid_substation_id, meter_id, site_label, capacity_kw)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), 'MISSING-PARENT', 'Orphan', 5],
    ), '23503');
  });

  it('enforces unique installation meter identifiers', async () => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('solar_installations')} (grid_substation_id, meter_id, site_label, capacity_kw)
       VALUES ($1, $2, $3, $4)`,
      [substationId, 'METER-001', 'Duplicate Meter', 5],
    ), '23505');
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '-Infinity'])(
    'rejects invalid installed capacity %s', async (capacity) => {
      await expectPgError(pool.query(
        `INSERT INTO ${table('solar_installations')} (grid_substation_id, meter_id, site_label, capacity_kw)
         VALUES ($1, $2, $3, $4)`,
        [substationId, `INVALID-${randomUUID()}`, 'Invalid Capacity', capacity],
      ), ['23514', '22003']);
    },
  );

  it('restricts deletion of hierarchy rows that have descendants', async () => {
    for (const [name, id] of [
      ['provinces', provinceId], ['districts', districtId],
      ['grid_substations', substationId], ['solar_installations', installationId],
    ]) {
      await expectPgError(
        pool.query(`DELETE FROM ${table(name!)} WHERE id = $1`, [id]),
        ['23503', '23001'],
      );
      expect((await pool.query(`SELECT id FROM ${table(name!)} WHERE id = $1`, [id])).rows)
        .toEqual([{ id }]);
    }
  });

  it('prevents ancestry changes that would move historical readings between jurisdictions', async () => {
    await expectPgError(pool.query(
      `UPDATE ${table('districts')} SET province_id = $1 WHERE id = $2`,
      [otherProvinceId, districtId],
    ), '55000');
    await expectPgError(pool.query(
      `UPDATE ${table('grid_substations')} SET district_id = $1 WHERE id = $2`,
      [otherDistrictId, substationId],
    ), '55000');
    await expectPgError(pool.query(
      `UPDATE ${table('solar_installations')} SET grid_substation_id = $1 WHERE id = $2`,
      [otherSubstationId, installationId],
    ), '55000');
  });

  it('prevents silently replacing a meter on an existing installation', async () => {
    await expectPgError(pool.query(
      `UPDATE ${table('solar_installations')} SET meter_id = $1 WHERE id = $2`,
      ['REPLACEMENT-METER', installationId],
    ), '55000');
  });
});

describe('append-only readings', () => {
  it('stores an independent timestamped reading with zero night-time power', async () => {
    const result = await pool.query<{ installation_id: string; timestamp: Date; power: number }>(
      `SELECT installation_id, timestamp, power_kw::float8 AS power
       FROM ${table('generation_readings')} WHERE id = $1`,
      [readingId],
    );
    expect(result.rows[0]?.installation_id).toBe(installationId);
    expect(result.rows[0]?.timestamp.toISOString()).toBe('2026-08-01T06:00:00.000Z');
    expect(result.rows[0]?.power).toBe(0);
  });

  it('rejects repeated installation/timestamp pairs while permitting the same timestamp elsewhere', async () => {
    const sql = `INSERT INTO ${table('generation_readings')}
      (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
      VALUES ($1, $2, 1, 101, 230)`;
    await expectPgError(pool.query(sql, [installationId, '2026-08-01T06:00:00.000Z']), '23505');
    await expect(pool.query(sql, [otherInstallationId, '2026-08-01T06:00:00.000Z'])).resolves.toMatchObject({ rowCount: 1 });
  });

  it('rejects readings for unknown installations', async () => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('generation_readings')}
       (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
       VALUES ($1, $2, 1, 101, 230)`,
      [randomUUID(), '2026-08-02T06:00:00.000Z'],
    ), '23503');
  });

  it.each([
    ['power_kw', '-1'], ['power_kw', 'NaN'], ['power_kw', 'Infinity'], ['power_kw', '-Infinity'],
    ['cumulative_energy_kwh', '-1'], ['cumulative_energy_kwh', 'NaN'],
    ['cumulative_energy_kwh', 'Infinity'], ['cumulative_energy_kwh', '-Infinity'],
    ['voltage', '-1'], ['voltage', 'NaN'], ['voltage', 'Infinity'], ['voltage', '-Infinity'],
  ])('rejects invalid %s value %s', async (field, invalidValue) => {
    const values: Record<string, string> = { power_kw: '1', cumulative_energy_kwh: '101', voltage: '230' };
    values[field] = invalidValue;
    await expectPgError(pool.query(
      `INSERT INTO ${table('generation_readings')}
       (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
       VALUES ($1, $2, $3, $4, $5)`,
      [installationId, '2026-08-03T06:00:00.000Z', values.power_kw, values.cumulative_energy_kwh, values.voltage],
    ), ['23514', '22003']);
  });

  it.each(['infinity', '-infinity'])('rejects nonfinite reading timestamp %s', async (timestamp) => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('generation_readings')}
       (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
       VALUES ($1, $2, 1, 101, 230)`,
      [installationId, timestamp],
    ), '23514');
  });

  it.each(['UPDATE', 'DELETE', 'TRUNCATE'])(
    'prevents %s even when executed by the migration owner', async (operation) => {
      const statements: Record<string, string> = {
        UPDATE: `UPDATE ${table('generation_readings')} SET power_kw = 2 WHERE id = $1`,
        DELETE: `DELETE FROM ${table('generation_readings')} WHERE id = $1`,
        TRUNCATE: `TRUNCATE ${table('generation_readings')}`,
      };
      await expectPgError(pool.query(statements[operation]!, operation === 'TRUNCATE' ? [] : [readingId]), '55000');
      expect((await pool.query(`SELECT id FROM ${table('generation_readings')} WHERE id = $1`, [readingId])).rowCount).toBe(1);
    },
  );

  it('rejects zero-row mutation statements as well as existing-row changes', async () => {
    await expectPgError(pool.query(`UPDATE ${table('generation_readings')} SET power_kw = 2 WHERE FALSE`), '55000');
    await expectPgError(pool.query(`DELETE FROM ${table('generation_readings')} WHERE FALSE`), '55000');
  });
});

describe('user jurisdiction constraints', () => {
  it('stores all three valid read roles with their exclusive jurisdiction fields', async () => {
    const result = await pool.query(`SELECT role, province_id, district_id FROM ${table('users')} ORDER BY role`);
    expect(result.rows).toEqual([
      { role: 'district', province_id: null, district_id: districtId },
      { role: 'national', province_id: null, district_id: null },
      { role: 'provincial', province_id: provinceId, district_id: null },
    ]);
  });

  it.each([
    ['national', true, false], ['national', false, true],
    ['provincial', false, false], ['provincial', true, true],
    ['district', false, false], ['district', true, true],
    ['district', true, false], ['administrator', false, false],
  ] as const)('rejects incompatible role/scope %s province=%s district=%s', async (role, hasProvince, hasDistrict) => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('users')} (email, password_hash, role, province_id, district_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`invalid-${randomUUID()}@example.test`, 'fixture-password-hash', role,
        hasProvince ? provinceId : null, hasDistrict ? districtId : null],
    ), '23514');
  });

  it('rejects a district read scope referencing a nonexistent district', async () => {
    await expectPgError(pool.query(
      `INSERT INTO ${table('users')} (email, password_hash, role, district_id)
       VALUES ($1, $2, 'district', $3)`,
      [`missing-${randomUUID()}@example.test`, 'fixture-password-hash', randomUUID()],
    ), '23503');
  });
});

describe('restricted runtime database role', () => {
  it('uses a preexisting role without superuser or role-management privileges', async () => {
    const result = await pool.query(
      'SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = $1',
      [runtimeRole],
    );
    expect(result.rows).toEqual([{ rolsuper: false, rolcreaterole: false, rolcreatedb: false }]);
  });

  it('can read all six business tables', async () => {
    for (const name of ['provinces', 'districts', 'grid_substations', 'solar_installations', 'generation_readings', 'users']) {
      expect((await asRuntime(`SELECT id FROM ${table(name)}`)).rowCount).toBeGreaterThan(0);
    }
  });

  it('can append a new reading', async () => {
    const result = await asRuntime(
      `INSERT INTO ${table('generation_readings')}
       (installation_id, timestamp, power_kw, cumulative_energy_kwh, voltage)
       VALUES ($1, $2, 1, 101, 230) RETURNING id`,
      [installationId, '2026-08-04T06:00:00.000Z'],
    );
    expect(result.rowCount).toBe(1);
  });

  it('cannot read the migration ledger', async () => {
    await expectPgError(asRuntime(`SELECT * FROM ${table('schema_migrations')}`), '42501');
  });

  it('cannot create catalog entries or alter installations', async () => {
    await expectPgError(asRuntime(`INSERT INTO ${table('provinces')} (code, name) VALUES ('NO', 'Forbidden')`), '42501');
    await expectPgError(asRuntime(`UPDATE ${table('solar_installations')} SET site_label = 'Forbidden' WHERE id = $1`, [installationId]), '42501');
  });

  it('cannot update, delete, or truncate readings', async () => {
    await expectPgError(asRuntime(`UPDATE ${table('generation_readings')} SET power_kw = 2 WHERE id = $1`, [readingId]), '42501');
    await expectPgError(asRuntime(`DELETE FROM ${table('generation_readings')} WHERE id = $1`, [readingId]), '42501');
    await expectPgError(asRuntime(`TRUNCATE ${table('generation_readings')}`), '42501');
  });

  it('cannot run DDL in the application schema', async () => {
    await expectPgError(asRuntime(`CREATE TABLE ${table('unauthorized_table')} (id integer)`), '42501');
  });

  it('refuses to silently create a runtime role that does not exist', async () => {
    const missingRole = `solar_absent_${randomUUID().replaceAll('-', '')}`;
    await expect(grantRuntimeAccess(pool, { schema, role: missingRole })).rejects.toThrow();
    expect((await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [missingRole])).rowCount).toBe(0);
  });

  it('refuses an unsafe column-only UPDATE grant', async () => {
    await pool.query(
      `GRANT UPDATE (site_label) ON ${table('solar_installations')} TO ${quoteIdentifier(runtimeRole)}`,
    );
    try {
      await expect(grantRuntimeAccess(pool, { schema, role: runtimeRole }))
        .rejects.toThrow(/unexpected privileges/i);
    } finally {
      await pool.query(
        `REVOKE UPDATE (site_label) ON ${table('solar_installations')} FROM ${quoteIdentifier(runtimeRole)}`,
      );
    }
    await expectPgError(asRuntime(
      `UPDATE ${table('solar_installations')} SET site_label = 'Forbidden' WHERE id = $1`,
      [installationId],
    ), '42501');
  });
});
