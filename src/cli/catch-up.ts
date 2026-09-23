import { createSeedDataset } from '../seed/dataset.js';
import { catchUpSyntheticReadings } from '../seed/catch-up.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function catchUp() {
  if (process.env.ALLOW_SYNTHETIC_CATCHUP !== 'true') throw new Error('Set ALLOW_SYNTHETIC_CATCHUP=true only for a synthetic coursework demonstration database');
  const cutoff = process.env.CATCHUP_UNTIL ? Date.parse(process.env.CATCHUP_UNTIL) : Date.now();
  const dataset = createSeedDataset();
  const database = migrationDatabase();
  try { console.log(JSON.stringify(await catchUpSyntheticReadings(database.pool, dataset.installations.map((item) => item.id), cutoff))); }
  finally { await database.close(); }
}
catchUp().catch(reportDatabaseFailure);
