import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { applicationSchema } from './identifiers.js';

const defaultDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

export interface Migration {
  version: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(directory = defaultDirectory): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('No SQL migration files were found');
  const versions = new Set<string>();
  const migrations: Migration[] = [];
  for (const version of files) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(version);
    if (!match?.[1]) throw new Error(`Invalid migration filename: ${version}`);
    if (versions.has(match[1])) throw new Error(`Duplicate migration version: ${match[1]}`);
    versions.add(match[1]);
    const sql = await readFile(join(directory, version), 'utf8');
    if (!sql.trim()) throw new Error(`Empty migration file: ${version}`);
    migrations.push({ version, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return migrations;
}

export async function runMigrations(
  pool: Pool,
  { schema = 'solar', directory = defaultDirectory }: { schema?: string; directory?: string } = {},
): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  const namespace = applicationSchema(schema);
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize runners before the ledger/schema exists, on the same connection.
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_database() || ':' || $1, 0))", [schema]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${namespace}`);
    const owner = await client.query<{ owned: boolean }>(
      'SELECT nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) AS owned FROM pg_catalog.pg_namespace WHERE nspname = $1',
      [schema],
    );
    if (!owner.rows[0]?.owned) throw new Error('The migration account must own the application schema');
    await client.query(`SET LOCAL search_path TO ${namespace}, pg_catalog`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${namespace}.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const history = await client.query<{ version: string; checksum: string }>(
      `SELECT version, checksum FROM ${namespace}.schema_migrations ORDER BY version`,
    );
    for (const [index, recorded] of history.rows.entries()) {
      const file = migrations[index];
      if (!file || file.version !== recorded.version) {
        throw new Error('Migration history does not match the files: an applied migration is missing or out of order');
      }
      if (file.checksum !== recorded.checksum) {
        throw new Error(`Applied migration checksum changed: ${recorded.version}. Add a new migration instead of editing history`);
      }
    }
    const applied: string[] = [];
    for (const migration of migrations.slice(history.rowCount ?? 0)) {
      await client.query(migration.sql);
      await client.query(`INSERT INTO ${namespace}.schema_migrations (version, checksum) VALUES ($1, $2)`, [migration.version, migration.checksum]);
      applied.push(migration.version);
    }
    await client.query('COMMIT');
    return { applied, alreadyApplied: history.rows.map((row) => row.version) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
