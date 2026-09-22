import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations } from '../src/db/migrations.js';

describe('migration file validation', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'solar-migration-files-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('loads ordered SQL files and hashes their exact contents', async () => {
    const firstSql = '-- Unicode is preserved: සූර්ය\nSELECT 1;\n';
    const secondSql = 'SELECT 2;\n';
    await writeFile(path.join(directory, '010_second.sql'), secondSql);
    await writeFile(path.join(directory, '002_first.sql'), firstSql);

    const migrations = await loadMigrations(directory);

    expect(migrations).toEqual([
      {
        version: '002_first.sql',
        sql: firstSql,
        checksum: createHash('sha256').update(firstSql).digest('hex'),
      },
      {
        version: '010_second.sql',
        sql: secondSql,
        checksum: createHash('sha256').update(secondSql).digest('hex'),
      },
    ]);
  });

  it('ignores files that are not SQL migrations', async () => {
    await writeFile(path.join(directory, '001_initial.sql'), 'SELECT 1;');
    await writeFile(path.join(directory, 'README.md'), 'Migration guidance');
    await writeFile(path.join(directory, '002_draft.sql.bak'), 'Not a migration');

    expect((await loadMigrations(directory)).map(({ version }) => version)).toEqual([
      '001_initial.sql',
    ]);
  });

  it.each([
    'migration.sql',
    '01_short.sql',
    '0001_long.sql',
    '001_has-hyphens.sql',
    '001_Uppercase.sql',
    '001_.sql',
  ])('rejects the malformed SQL filename %s', async (filename) => {
    await writeFile(path.join(directory, filename), 'SELECT 1;');
    await expect(loadMigrations(directory)).rejects.toThrow();
  });

  it('rejects duplicate numeric migration versions even when names differ', async () => {
    await writeFile(path.join(directory, '001_first.sql'), 'SELECT 1;');
    await writeFile(path.join(directory, '001_second.sql'), 'SELECT 2;');

    await expect(loadMigrations(directory)).rejects.toThrow();
  });

  it.each(['', ' \n\t\r\n'])('rejects empty migration contents %j', async (sql) => {
    await writeFile(path.join(directory, '001_empty.sql'), sql);
    await expect(loadMigrations(directory)).rejects.toThrow();
  });

  it('loads the checked-in migration directory by default', async () => {
    const migrations = await loadMigrations();

    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      expect(migration.version).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
      expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(migration.sql.trim().length).toBeGreaterThan(0);
    }
  });
});
