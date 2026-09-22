import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Environment } from '../config/env.js';

export interface DatabaseHealth {
  checkConnection(): Promise<void>;
  pool?: Pool;
}

export function createDatabase(config: Environment, logger: Logger) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    statement_timeout: config.DB_CONNECTION_TIMEOUT_MS,
    query_timeout: config.DB_CONNECTION_TIMEOUT_MS,
    application_name: 'slsea-solar-api',
    options: '-c search_path=solar,pg_catalog -c timezone=UTC',
  });

  // An idle-client error must not become an unhandled process event.
  pool.on('error', () => logger.error('Database connection failed'));

  return {
    pool,
    async checkConnection(): Promise<void> {
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
