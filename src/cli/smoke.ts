import { performance } from 'node:perf_hooks';
import { apiOrigin, exchangeToken, reportHttpFailure } from './http-client.js';

async function smoke() {
  const origin = apiOrigin(process.env.API_BASE_URL);
  const checks: Array<{ path: string; status: number; milliseconds: number }> = [];
  const read = async (path: string, token?: string, headers: Record<string, string> = {}, expected = 200) => {
    const start = performance.now();
    const response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
    checks.push({ path, status: response.status, milliseconds: Math.round(performance.now() - start) });
    if (response.status !== expected) throw new Error(`Smoke check ${path} expected ${expected}, got ${response.status}`);
    return response;
  };
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  await read('/health/live'); await read('/health/ready');
  const contract = await (await read('/openapi.json')).json() as { openapi: string; paths: Record<string, unknown> };
  assert(contract.openapi === '3.1.0' && contract.paths['/installations'], 'OpenAPI is incomplete');
  const docs = await fetch(origin + '/docs/', { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  assert(docs.status === 200 && (await docs.text()).includes('swagger-ui'), 'Swagger UI did not load');
  await read('/installations', undefined, {}, 401);
  const token = await exchangeToken(origin, 'analyst', process.env.SMOKE_ANALYST_IDENTIFIER, process.env.SMOKE_ANALYST_PASSWORD);
  for (const [path, minimum] of [['/provinces', 9], ['/districts', 25], ['/substations', 20], ['/installations', 200]] as const) {
    const page = await (await read(path + '?limit=1', token)).json() as { count: number };
    assert(page.count >= minimum, 'Smoke requires a national analyst and the complete seed');
  }
  const page = await (await read('/installations?limit=1', token)).json() as { items: Array<{ id: string }> };
  const id = page.items[0]!.id;
  const overview = await (await read(`/installations/${id}/overview`, token)).json() as { hierarchy: { district: { id: string } }; lastKnownReading: { timestamp: string } | null };
  assert(overview.lastKnownReading, 'Seeded installation has no reading');
  await read(`/installations/${id}/latest-reading`, token);
  const history = await read(`/installations/${id}/readings?limit=2`, token);
  const tag = history.headers.get('etag'); assert(tag, 'History omitted its ETag');
  const cached = await read(`/installations/${id}/readings?limit=2`, token, { 'If-None-Match': tag! }, 304);
  assert((await cached.text()) === '', '304 included a body');
  await read(`/installations/${id}`, token, { 'If-Match': '"deliberately-stale-tag"' }, 412);
  await read('/readings?limit=1&sort=-timestamp', token);
  const summary = await (await read(`/districts/${overview.hierarchy.district.id}/generation-summary`, token)).json() as { powerCoverageComplete: boolean };
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin, checks, sampleLatestTimestamp: overview.lastKnownReading?.timestamp,
    sampleDistrictPowerCoverageComplete: summary.powerCoverageComplete, note: 'Read-only smoke: public-host persistence, full freshness, restricted analyst boundaries and ingestion require separate evidence.' }, null, 2));
}
smoke().catch(reportHttpFailure);
