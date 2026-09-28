import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { createDatabase } from '../db/pool.js';
import { grantRuntimeAccess } from '../db/permissions.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function grant(): Promise<void> {
  const runtimeConfig = parseEnv(process.env);
  const migration = migrationDatabase();
  let runtime: ReturnType<typeof createDatabase> | undefined;
  try {
    const owner = await migration.pool.query<{ role: string; database: string }>('SELECT current_user AS role, current_database() AS database');
    const migrationIdentity = owner.rows[0];
    const runtimeUrl = new URL(runtimeConfig.DATABASE_URL);
    const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
    let runtimeIdentity: { role: string; database: string } | undefined;
    if (process.env.RUNTIME_DATABASE_ROLE) {
      // Owner grants to an already-created managed-identity role. A developer's
      // laptop cannot impersonate the App Service identity to connect as it.
      if (process.env.RUNTIME_DATABASE_ROLE !== decodeURIComponent(runtimeUrl.username)) throw new Error('RUNTIME_DATABASE_ROLE must match the role in DATABASE_URL');
      runtimeIdentity = { role: process.env.RUNTIME_DATABASE_ROLE, database: decodeURIComponent(runtimeUrl.pathname.slice(1)) };
    } else {
      runtime = createDatabase(runtimeConfig, createLogger(runtimeConfig.LOG_LEVEL));
      const actual = await runtime.pool.query<{ role: string; database: string }>('SELECT current_user AS role, current_database() AS database');
      runtimeIdentity = actual.rows[0];
    }
    if (!runtimeIdentity || !migrationIdentity
      || runtimeUrl.hostname !== migrationUrl.hostname
      || (runtimeUrl.port || '5432') !== (migrationUrl.port || '5432')
      || runtimeIdentity.database !== migrationIdentity.database
      || runtimeIdentity.role === migrationIdentity.role) {
      throw new Error('Runtime and migration connections must use the same database server and different roles');
    }
    await grantRuntimeAccess(migration.pool, { role: runtimeIdentity.role, installationMaintenance: process.env.ALLOW_INSTALLATION_MAINTENANCE === 'true' });
    console.log(process.env.ALLOW_INSTALLATION_MAINTENANCE === 'true' ? 'Runtime permissions configured: domain reads, append-only readings and restricted installation metadata lifecycle' : 'Runtime database permissions configured: domain reads and append-only reading inserts');
  } finally {
    await Promise.all([runtime?.close(), migration.close()]);
  }
}

grant().catch(reportDatabaseFailure);
