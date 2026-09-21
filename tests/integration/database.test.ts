import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createDatabase } from '../../src/db/pool.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for integration tests. Start PostgreSQL and provide a dedicated test database URL.',
  );
}

const logger = pino({ level: 'silent' });
const configuration = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false',
  LOG_LEVEL: 'silent',
  DB_CONNECTION_TIMEOUT_MS: '1000',
});

describe('real PostgreSQL connectivity', () => {
  const database = createDatabase(configuration, logger);

  beforeAll(async () => {
    await database.checkConnection();
  });

  afterAll(async () => {
    await database.close();
  });

  it('runs a real SQL query through the configured pool', async () => {
    const result = await database.pool.query<{ answer: number }>(
      'SELECT 1::integer AS answer',
    );

    expect(result.rows).toEqual([{ answer: 1 }]);
  });

  it('reports HTTP readiness with the real database dependency', async () => {
    const app = createApp({ database, logger });
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
  });
});

describe('unreachable PostgreSQL dependency', () => {
  const database = createDatabase(
    parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unavailable:unused@127.0.0.1:1/unavailable',
      DATABASE_SSL: 'false',
      LOG_LEVEL: 'silent',
      DB_CONNECTION_TIMEOUT_MS: '250',
    }),
    logger,
  );

  afterAll(async () => {
    await database.close();
  });

  it('fails readiness without taking down liveness', async () => {
    const app = createApp({ database, logger });
    const readiness = await request(app).get('/health/ready');
    const liveness = await request(app).get('/health/live');

    expect(readiness.status).toBe(503);
    expect(readiness.body).toEqual({
      error: {
        code: 50301,
        message: 'Service is not ready',
        details: [{ field: 'database', message: 'Database is unavailable' }],
        requestId: readiness.headers['x-request-id'],
      },
    });
    expect(liveness.status).toBe(200);
    expect(liveness.body).toEqual({ status: 'ok', service: 'slsea-solar-api' });
  });
});
