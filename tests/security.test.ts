import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { authRateLimit } from '../src/middleware/rate-limit.js';
import { errorHandler } from '../src/middleware/errors.js';
import { AuthenticationService } from '../src/auth/service.js';
import { parseEnv } from '../src/config/env.js';

describe('authentication resource limits', () => {
  it('never authenticates an installation without credentials using the dummy timing password', async () => {
    const pool = { query: async () => ({ rows: [{ id: '11111111-1111-4111-8111-111111111111', credential_hash: null, credential_version: 1 }] }) } as unknown as Pool;
    const service = new AuthenticationService(pool, parseEnv({ DATABASE_URL: 'postgresql://local:unused@localhost/test' }));
    await expect(service.authenticate({ principalType: 'installation', identifier: 'unprovisioned-meter', password: 'unavailable-account-dummy-password' })).rejects.toMatchObject({ status: 401 });
  });

  it('limits repeated requests despite forged proxy headers, then allows a new window', async () => {
    let now = 1000;
    const app = express();
    app.post('/token', authRateLimit(2, 1000, () => now), (_req, res) => { res.sendStatus(204); });
    app.use(errorHandler(pino({ level: 'silent' })));
    expect((await request(app).post('/token')).status).toBe(204);
    expect((await request(app).post('/token')).status).toBe(204);
    const limited = await request(app).post('/token').set('X-Forwarded-For', '192.0.2.1');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('1');
    expect(limited.body.error.code).toBe(42901);
    now += 1000;
    expect((await request(app).post('/token')).status).toBe(204);
  });

  it('bounds concurrent credential work and releases capacity after a failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const query = vi.fn(async () => { await gate; throw new Error('test database unavailable'); });
    const service = new AuthenticationService({ query } as unknown as Pool, parseEnv({ DATABASE_URL: 'postgresql://local:unused@localhost/test' }));
    const input = { principalType: 'analyst' as const, identifier: 'test@example.test', password: 'test-password' };
    const running = Array.from({ length: 4 }, () => service.authenticate(input).catch((error: unknown) => error));
    await expect(service.authenticate(input)).rejects.toMatchObject({ status: 429 });
    expect(query).toHaveBeenCalledTimes(4);
    release();
    await Promise.all(running);
    await expect(service.authenticate(input)).rejects.toThrow('test database unavailable');
    expect(query).toHaveBeenCalledTimes(5);
  });
});

describe('operational HTTP clients', () => {
  it('accepts HTTPS or loopback origins and refuses unsafe credential destinations', async () => {
    const { apiOrigin } = await import('../src/cli/http-client.js');
    expect(apiOrigin('https://solar.example/')).toBe('https://solar.example');
    expect(apiOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    for (const value of [undefined, 'http://solar.example', 'https://user:secret@solar.example', 'https://solar.example/path', 'https://solar.example?token=secret', 'file:///tmp/test']) {
      expect(() => apiOrigin(value)).toThrow();
    }
  });
});
