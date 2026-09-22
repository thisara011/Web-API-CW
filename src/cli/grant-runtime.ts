import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { createDatabase } from '../db/pool.js';
import { grantRuntimeAccess } from '../db/permissions.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function grant(): Promise<void> {
  const runtimeConfig = parseEnv(process.env);
  const runtime = createDatabase(runtimeConfig, createLogger(runtimeConfig.LOG_LEVEL));
  const migration = migrationDatabase();
  try {
    const actual = await runtime.pool.query<{ role: string; database: string }>('SELECT current_user AS role, current_database() AS database');
    const owner = await migration.pool.query<{ role: string; database: string }>('SELECT current_user AS role, current_database() AS database');
    const runtimeIdentity = actual.rows[0];
    const migrationIdentity = owner.rows[0];
    const runtimeUrl = new URL(runtimeConfig.DATABASE_URL);
    const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
    if (!runtimeIdentity || !migrationIdentity
      || runtimeUrl.hostname !== migrationUrl.hostname
      || (runtimeUrl.port || '5432') !== (migrationUrl.port || '5432')
      || runtimeIdentity.database !== migrationIdentity.database
      || runtimeIdentity.role === migrationIdentity.role) {
      throw new Error('Runtime and migration connections must use the same database server and different roles');
    }
    await grantRuntimeAccess(migration.pool, { role: runtimeIdentity.role });
    console.log('Runtime database permissions configured: domain reads and append-only reading inserts');
  } finally {
    await Promise.all([runtime.close(), migration.close()]);
  }
}

grant().catch(reportDatabaseFailure);
