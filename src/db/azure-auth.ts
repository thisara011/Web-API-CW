import { AzureCliCredential, ManagedIdentityCredential, type TokenCredential } from '@azure/identity';
import type { Environment } from '../config/env.js';

const postgresScope = 'https://ossrdbms-aad.database.windows.net/.default';

export function azureDatabaseCredential(config: Environment): TokenCredential {
  if (config.DATABASE_AUTH_MODE === 'azure-cli') {
    return new AzureCliCredential({ processTimeoutInMs: config.DB_CONNECTION_TIMEOUT_MS });
  }
  // An explicit credential avoids accidentally using a developer/admin login
  // as a fallback when a deployed managed identity has been misconfigured.
  return new ManagedIdentityCredential(config.AZURE_CLIENT_ID ? { clientId: config.AZURE_CLIENT_ID } : {});
}

export function azureDatabasePassword(credential: TokenCredential, timeoutMs: number) {
  return async (): Promise<string> => {
    try {
      // Called for each new physical pg connection. Azure Identity handles its
      // token cache/refresh; an access token is never saved in DATABASE_URL.
      const token = await credential.getToken(postgresScope, { abortSignal: AbortSignal.timeout(timeoutMs) });
      if (!token?.token || !Number.isFinite(token.expiresOnTimestamp) || token.expiresOnTimestamp <= Date.now()) throw new Error('Token unavailable');
      return token.token;
    } catch {
      // SDK errors may include identity, endpoint or token response details.
      throw new Error('Azure PostgreSQL authentication failed; check identity access and database role mapping');
    }
  };
}
