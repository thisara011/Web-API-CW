import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { createDatabase } from '../db/pool.js';

export function migrationConfiguration(input: NodeJS.ProcessEnv) {
  if (!input.MIGRATION_DATABASE_URL) {
    throw new Error('MIGRATION_DATABASE_URL is required; use the schema owner, not the application login');
  }
  return parseEnv({
    ...input,
    DATABASE_URL: input.MIGRATION_DATABASE_URL,
    DATABASE_SSL: input.MIGRATION_DATABASE_SSL ?? input.DATABASE_SSL ?? 'false',
    DATABASE_AUTH_MODE: input.MIGRATION_DATABASE_AUTH_MODE ?? 'password',
    AZURE_CLIENT_ID: input.MIGRATION_AZURE_CLIENT_ID,
    DB_CONNECTION_TIMEOUT_MS: '30000',
  });
}

export function migrationDatabase() {
  const config = migrationConfiguration(process.env);
  return createDatabase(config, createLogger(config.LOG_LEVEL));
}

export function reportDatabaseFailure(error: unknown): void {
  // SQL errors can contain connection details or row data; expose a code only.
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code);
    console.error(`Database operation failed (${/^[A-Z0-9]{5}$/.test(code) ? code : 'connection error'}). Check the connection, account privileges and migration files.`);
  } else {
    console.error(error instanceof Error ? error.message : 'Database operation failed');
  }
  process.exitCode = 1;
}
