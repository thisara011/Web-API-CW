import { Client } from 'pg';
import { AzureCliCredential, ManagedIdentityCredential, type TokenCredential } from '@azure/identity';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { migrationConfiguration } from '../src/cli/database.js';
import { azureDatabaseCredential, azureDatabasePassword } from '../src/db/azure-auth.js';
import { databasePoolOptions } from '../src/db/pool.js';

const azure = { DATABASE_URL: 'postgresql://slsea-runtime@coursework.postgres.database.azure.com:5432/slsea', DATABASE_AUTH_MODE: 'managed-identity', DATABASE_SSL: 'true' };

describe('Azure PostgreSQL configuration', () => {
  it('requires an explicit passwordless Azure role and verified TLS', () => {
    expect(parseEnv(azure)).toMatchObject({ DATABASE_AUTH_MODE: 'managed-identity', DATABASE_SSL: true });
    for (const changes of [
      { DATABASE_SSL: 'false' }, { DATABASE_AUTH_MODE: 'unknown' },
      { DATABASE_URL: 'postgresql://role:secret@coursework.postgres.database.azure.com/slsea' },
      { DATABASE_URL: 'postgresql://coursework.postgres.database.azure.com/slsea' },
      { DATABASE_URL: 'postgresql://role@untrusted.example/slsea' },
      { DATABASE_URL: 'postgresql://role@coursework.postgres.database.azure.com/slsea?password=secret' },
      { DATABASE_URL: 'postgresql://role@coursework.postgres.database.azure.com/slsea#secret' },
      { DATABASE_URL: 'postgresql://role%ZZ@coursework.postgres.database.azure.com/slsea' },
      { AZURE_CLIENT_ID: 'not-a-uuid' },
    ]) expect(() => parseEnv({ ...azure, ...changes })).toThrow();
  });

  it('keeps a local owner login independent of runtime managed identity settings', () => {
    const config = migrationConfiguration({ ...azure, AZURE_CLIENT_ID: '11111111-1111-4111-8111-111111111111', MIGRATION_DATABASE_URL: 'postgresql://owner:local-test-only@localhost/slsea', MIGRATION_DATABASE_SSL: 'false' });
    expect(config).toMatchObject({ DATABASE_AUTH_MODE: 'password', DATABASE_SSL: false, DB_CONNECTION_TIMEOUT_MS: 30000 });
    expect(config.AZURE_CLIENT_ID).toBeUndefined();
    const owner = migrationConfiguration({ ...azure, MIGRATION_DATABASE_URL: 'postgresql://admin%40example.test@coursework.postgres.database.azure.com/slsea', MIGRATION_DATABASE_AUTH_MODE: 'azure-cli' });
    expect(owner.DATABASE_AUTH_MODE).toBe('azure-cli');
  });

  it('selects the exact credential without falling back from managed identity to a developer account', () => {
    expect(azureDatabaseCredential(parseEnv(azure))).toBeInstanceOf(ManagedIdentityCredential);
    expect(azureDatabaseCredential(parseEnv({ ...azure, DATABASE_AUTH_MODE: 'azure-cli' }))).toBeInstanceOf(AzureCliCredential);
  });

  it('preserves the token callback through the real pg Client constructor and obtains tokens again for new connections', async () => {
    const getToken = vi.fn().mockResolvedValueOnce({ token: 'first-test-token', expiresOnTimestamp: Date.now() + 60_000 }).mockResolvedValueOnce({ token: 'refreshed-test-token', expiresOnTimestamp: Date.now() + 120_000 });
    const options = databasePoolOptions(parseEnv({ ...azure, DATABASE_URL: 'postgresql://developer%40example.test@coursework.postgres.database.azure.com/slsea' }), { getToken } as TokenCredential);
    expect(options.connectionString).toBeUndefined();
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    for (const expected of ['first-test-token', 'refreshed-test-token']) {
      const client = new Client(options);
      expect(client.user).toBe('developer@example.test');
      expect(client.database).toBe('slsea');
      const password = client.password as unknown;
      expect(typeof password).toBe('function');
      expect(await (password as () => Promise<string>)()).toBe(expected);
    }
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledWith('https://ossrdbms-aad.database.windows.net/.default', expect.objectContaining({ abortSignal: expect.anything() }));
  });

  it('rejects missing/expired tokens and sanitizes identity errors', async () => {
    for (const value of [null, { token: '', expiresOnTimestamp: Date.now() + 60_000 }, { token: 'expired-secret', expiresOnTimestamp: 0 }]) {
      const password = azureDatabasePassword({ getToken: async () => value } as TokenCredential, 1000);
      await expect(password()).rejects.toThrow('Azure PostgreSQL authentication failed');
    }
    const password = azureDatabasePassword({ getToken: async () => { throw new Error('private-token-and-tenant-details'); } }, 1000);
    await expect(password()).rejects.toThrow('Azure PostgreSQL authentication failed');
    await expect(password()).rejects.not.toThrow('private-token');
  });

  it('preserves local password connections without invoking Azure credentials', () => {
    const getToken = vi.fn();
    const options = databasePoolOptions(parseEnv({ DATABASE_URL: 'postgresql://local:local-test-only@localhost/test' }), { getToken });
    const client = new Client(options);
    expect(client.password).toBe('local-test-only');
    expect(options.ssl).toBe(false);
    expect(getToken).not.toHaveBeenCalled();
  });
});
