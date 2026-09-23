import { readFile } from 'node:fs/promises';
import { parseReading, resourceId } from '../modules/readings/validation.js';
import { apiOrigin, exchangeToken, reportHttpFailure } from './http-client.js';

async function sendReading() {
  const origin = apiOrigin(process.env.API_BASE_URL);
  const installationId = resourceId(process.env.DEMO_INSTALLATION_ID, 'DEMO_INSTALLATION_ID');
  if (!process.env.DEMO_READING_FILE) throw new Error('DEMO_READING_FILE must name a JSON reading file');
  const reading = parseReading(JSON.parse(await readFile(process.env.DEMO_READING_FILE, 'utf8')));
  const token = await exchangeToken(origin, 'installation', process.env.DEMO_METER_ID, process.env.DEMO_DEVICE_PASSWORD);
  const response = await fetch(`${origin}/installations/${installationId}/readings`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(reading) });
  if (response.status !== 201) throw new Error(`Reading was not created (HTTP ${response.status}); inspect timestamp, ownership and neighbouring cumulative counters before retrying`);
  console.log(JSON.stringify({ status: response.status, location: response.headers.get('location'), reading: await response.json() }, null, 2));
}
sendReading().catch(reportHttpFailure);
