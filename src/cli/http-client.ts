export function apiOrigin(value: string | undefined): string {
  if (!value || !URL.canParse(value)) throw new Error('API_BASE_URL must be a valid origin');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API_BASE_URL must be an HTTPS origin (HTTP is allowed only on localhost) without credentials, a path or query');
  }
  return url.origin;
}

export async function exchangeToken(origin: string, principalType: 'analyst' | 'installation', identifier: string | undefined, password: string | undefined) {
  if (!identifier || !password) throw new Error('Supply the requested identifier and password environment variables');
  const response = await fetch(`${origin}/auth/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ principalType, identifier, password }) });
  if (!response.ok) throw new Error(`Credential exchange failed (HTTP ${response.status})`);
  const body = await response.json() as { accessToken?: string };
  if (!body.accessToken) throw new Error('Credential exchange returned no access token');
  return body.accessToken;
}

export function reportHttpFailure(error: unknown) {
  // Fetch causes can include private host/connection data. Never dump them or tokens.
  console.error(error instanceof Error && error.name === 'Error' ? error.message : 'HTTP operation failed; check API availability and configuration');
  process.exitCode = 1;
}
