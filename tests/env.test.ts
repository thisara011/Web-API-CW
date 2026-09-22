import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://solar:local-password@localhost:5432/solar',
};

describe('environment configuration', () => {
  it('applies explicit development defaults', () => {
    expect(parseEnv(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      DATABASE_SSL: false,
      DB_POOL_MAX: 10,
      DB_CONNECTION_TIMEOUT_MS: 2000,
      DB_IDLE_TIMEOUT_MS: 30000,
      LOG_LEVEL: 'info',
    });
  });

  it('parses explicit settings without interpreting false as truthy', () => {
    expect(
      parseEnv({
        ...validEnvironment,
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        DATABASE_SSL: 'false',
        DB_POOL_MAX: '5',
        DB_CONNECTION_TIMEOUT_MS: '1500',
        DB_IDLE_TIMEOUT_MS: '15000',
        LOG_LEVEL: 'warn',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      DATABASE_SSL: false,
      DB_POOL_MAX: 5,
      DB_CONNECTION_TIMEOUT_MS: 1500,
      DB_IDLE_TIMEOUT_MS: 15000,
      LOG_LEVEL: 'warn',
    });
  });

  it('enables database TLS only for the true setting', () => {
    expect(
      parseEnv({ ...validEnvironment, DATABASE_SSL: 'true' }).DATABASE_SSL,
    ).toBe(true);
  });

  it.each(['postgres', 'postgresql'])(
    'accepts the %s connection URL scheme',
    (scheme) => {
      const url = `${scheme}://solar:local-password@localhost:5432/solar`;
      expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
    },
  );

  it.each(['development', 'test', 'production'])(
    'accepts the %s runtime environment',
    (environment) => {
      expect(
        parseEnv({ ...validEnvironment, NODE_ENV: environment }).NODE_ENV,
      ).toBe(environment);
    },
  );

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])(
    'accepts the %s log level',
    (level) => {
      expect(parseEnv({ ...validEnvironment, LOG_LEVEL: level }).LOG_LEVEL).toBe(
        level,
      );
    },
  );

  it.each<[string, string | undefined]>([
    ['DATABASE_URL', undefined],
    ['DATABASE_URL', ''],
    ['DATABASE_URL', 'not-a-url'],
    ['DATABASE_URL', 'https://localhost/solar'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/solar?sslmode=require'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/solar?ssl=true'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/solar?sslcert=certificate.pem'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/solar?user=owner'],
    ['DATABASE_URL', 'postgresql://solar:password@localhost:5432/solar?database=another_database'],
    ['DATABASE_SSL', 'yes'],
    ['DATABASE_SSL', '1'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '3000.5'],
    ['PORT', 'not-a-number'],
    ['DB_POOL_MAX', '0'],
    ['DB_POOL_MAX', '-1'],
    ['DB_POOL_MAX', '1.5'],
    ['DB_CONNECTION_TIMEOUT_MS', '0'],
    ['DB_CONNECTION_TIMEOUT_MS', '-1'],
    ['DB_IDLE_TIMEOUT_MS', '0'],
    ['DB_IDLE_TIMEOUT_MS', 'NaN'],
  ])('rejects invalid %s setting %s', (field, value) => {
    expect(() =>
      parseEnv({ ...validEnvironment, [field]: value }),
    ).toThrow(field);
  });

  it.each(['1', '65535'])(
    'accepts valid port boundary %s',
    (port) => {
      expect(parseEnv({ ...validEnvironment, PORT: port }).PORT).toBe(Number(port));
    },
  );

  it('reports configuration field names without disclosing credentials', () => {
    const secret = 'this-secret-must-not-appear-in-errors';
    const url = `https://solar:${secret}@private-database.example/solar`;

    try {
      parseEnv({ DATABASE_URL: url, PORT: 'invalid' });
      expect.fail('Invalid configuration must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('PORT');
      expect(message).not.toContain(secret);
      expect(message).not.toContain('private-database.example');
      expect(message).not.toContain(url);
    }
  });
});
