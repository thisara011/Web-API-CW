import SwaggerParser from '@apidevtools/swagger-parser';
import pino from 'pino';
import request, { type Response } from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const logger = pino({ level: 'silent' });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function healthyApp() {
  const checkConnection = vi.fn(async () => undefined);
  return {
    app: createApp({ database: { checkConnection }, logger }),
    checkConnection,
  };
}

function expectError(response: Response, status: number, code: number) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/json\b/);
  expect(response.headers['x-request-id']).toMatch(uuidPattern);
  expect(response.body).toEqual({
    error: {
      code,
      message: expect.any(String),
      details: expect.any(Array),
      requestId: response.headers['x-request-id'],
    },
  });
}

function expectReadOnlyMethods(response: Response) {
  const allow = response.headers.allow;
  expect(allow).toEqual(expect.any(String));
  expect(allow?.split(/\s*,\s*/).sort()).toEqual(['GET', 'HEAD', 'OPTIONS']);
}

describe('operational endpoints', () => {
  it('reports process liveness without querying the database', async () => {
    const { app, checkConnection } = healthyApp();

    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'slsea-solar-api' });
    expect(response.headers['content-type']).toMatch(/^application\/json\b/);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(checkConnection).not.toHaveBeenCalled();
  });

  it('reports readiness only after a successful database check', async () => {
    const { app, checkConnection } = healthyApp();

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(checkConnection).toHaveBeenCalledOnce();
  });

  it.each([
    ['/health/live', 'If-None-Match', '*'],
    ['/health/ready', 'If-None-Match', '*'],
    ['/health/live', 'If-None-Match', '"previous-health-state"'],
    ['/health/ready', 'If-None-Match', '"previous-health-state"'],
    ['/health/live', 'If-Modified-Since', 'Fri, 01 Jan 2100 00:00:00 GMT'],
    ['/health/ready', 'If-Modified-Since', 'Fri, 01 Jan 2100 00:00:00 GMT'],
  ])('keeps %s live with conditional header %s: %s', async (path, header, value) => {
    const { app } = healthyApp();
    const response = await request(app).get(path).set(header, value);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(response.body).toHaveProperty('status');
  });

  it('returns a sanitized 503 when the database is unavailable while remaining live', async () => {
    const privateFailure = 'postgresql://solar:do-not-disclose@private-db/solar';
    const checkConnection = vi.fn(async () => {
      throw new Error(privateFailure);
    });
    const app = createApp({ database: { checkConnection }, logger });

    const readiness = await request(app).get('/health/ready');

    expectError(readiness, 503, 50301);
    expect(readiness.body.error.message).toBe('Service is not ready');
    expect(readiness.body.error.details).toEqual([
      { field: 'database', message: 'Database is unavailable' },
    ]);
    expect(readiness.text).not.toContain(privateFailure);
    expect(readiness.text).not.toContain('do-not-disclose');

    const liveness = await request(app).get('/health/live');
    expect(liveness.status).toBe(200);
    expect(checkConnection).toHaveBeenCalledOnce();
  });

  it('withdraws readiness during shutdown before querying the database', async () => {
    const checkConnection = vi.fn(async () => undefined);
    const app = createApp({
      database: { checkConnection },
      logger,
      isShuttingDown: () => true,
    });

    const response = await request(app).get('/health/ready');

    expectError(response, 503, 50301);
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ field: 'server', message: expect.any(String) }),
    ]);
    expect(checkConnection).not.toHaveBeenCalled();
    expect((await request(app).get('/health/live')).status).toBe(200);
  });

  it('generates distinct request IDs and ignores untrusted client IDs', async () => {
    const { app } = healthyApp();
    const suppliedId = '11111111-1111-4111-8111-111111111111';

    const first = await request(app)
      .get('/health/live')
      .set('X-Request-Id', suppliedId);
    const second = await request(app)
      .get('/health/live')
      .set('X-Request-Id', suppliedId);

    expect(first.headers['x-request-id']).toMatch(uuidPattern);
    expect(second.headers['x-request-id']).toMatch(uuidPattern);
    expect(first.headers['x-request-id']).not.toBe(suppliedId);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
  });
});

describe('HTTP method contract', () => {
  it.each(['/health/live', '/health/ready', '/openapi.json'])(
    'supports bodyless HEAD on %s',
    async (path) => {
      const { app } = healthyApp();
      const response = await request(app).head(path);

      expect(response.status).toBe(200);
      expect(response.text ?? '').toBe('');
      expect(response.headers['content-type']).toMatch(/^application\/json\b/);
      expect(response.headers['x-request-id']).toMatch(uuidPattern);
    },
  );

  it.each(['/health/live', '/health/ready', '/openapi.json'])(
    'advertises allowed methods through OPTIONS on %s',
    async (path) => {
      const { app } = healthyApp();
      const response = await request(app).options(path);

      expect(response.status).toBe(204);
      expect(response.text ?? '').toBe('');
      expectReadOnlyMethods(response);
    },
  );

  it.each(['/health/live', '/health/ready', '/openapi.json'])(
    'rejects POST to known read resource %s with 405 and Allow',
    async (path) => {
      const { app } = healthyApp();
      const response = await request(app).post(path);

      expectError(response, 405, 40501);
      expectReadOnlyMethods(response);
    },
  );

  it('distinguishes an unknown resource from an unsupported method', async () => {
    const { app } = healthyApp();
    expectError(await request(app).get('/does-not-exist'), 404, 40401);
    expectError(await request(app).post('/does-not-exist'), 404, 40401);
  });
});

describe('JSON negotiation and request errors', () => {
  it.each([
    'application/json',
    'application/*',
    '*/*',
    'text/html, application/json;q=0.5',
    'text/plain;q=1, */*;q=0.5',
  ])('serves JSON for compatible Accept value %s', async (accept) => {
    const { app } = healthyApp();
    const response = await request(app).get('/health/live').set('Accept', accept);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json\b/);
  });

  it.each([
    'text/html',
    'application/xml',
    'application/json;q=0',
    '*/*;q=0',
    'application/json;q=0, */*;q=1',
    'application/json;q=0, application/*;q=1',
    'application/*;q=0, */*;q=1',
  ])('returns 406 for unacceptable JSON with Accept %s', async (accept) => {
    const { app } = healthyApp();
    const response = await request(app).get('/health/live').set('Accept', accept);
    expectError(response, 406, 40601);
  });

  it('reports malformed JSON using the common error contract', async () => {
    const { app } = healthyApp();
    const response = await request(app)
      .post('/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"incomplete":');

    expectError(response, 400, 40001);
    expect(response.body.error).not.toHaveProperty('stack');
  });

  it('rejects a JSON body exceeding the 32 KiB limit', async () => {
    const { app } = healthyApp();
    const response = await request(app)
      .post('/does-not-exist')
      .send({ payload: 'x'.repeat(33 * 1024) });

    expectError(response, 413, 41301);
  });

  it('rejects non-JSON request bodies with 415', async () => {
    const { app } = healthyApp();
    const response = await request(app)
      .post('/does-not-exist')
      .set('Content-Type', 'text/plain')
      .send('plain-text-body');

    expectError(response, 415, 41501);
  });

  it('sanitizes unexpected failures using the common 500 error contract', async () => {
    const privateFailure = 'internal-state-failure-with-private-detail';
    const app = createApp({
      database: { checkConnection: async () => undefined },
      logger,
      isShuttingDown: () => {
        throw new Error(privateFailure);
      },
    });
    const response = await request(app).get('/health/ready');

    expectError(response, 500, 50001);
    expect(response.text).not.toContain(privateFailure);
    expect(response.body.error).not.toHaveProperty('stack');
  });
});

describe('live API documentation', () => {
  it('serves Swagger UI as HTML without requiring JSON Accept', async () => {
    const { app } = healthyApp();
    const response = await request(app).get('/docs/').set('Accept', 'text/html');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html\b/);
    expect(response.text).toMatch(/swagger-ui/i);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
  });

  it('serves a valid OpenAPI 3.1 document for implemented operational endpoints', async () => {
    const { app } = healthyApp();
    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\.1\./);
    expect(response.body.paths['/health/live'].get.responses).toHaveProperty('200');
    expect(response.body.paths['/health/ready'].get.responses).toHaveProperty('200');
    expect(response.body.paths['/health/ready'].get.responses).toHaveProperty('503');
    await expect(SwaggerParser.validate(response.body)).resolves.toBeDefined();
  });
});
