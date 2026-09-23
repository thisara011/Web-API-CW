import { disableFixtureCredentials, rotateCredential } from '../auth/administration.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function credentials() {
  if (!['rotate', 'disable-fixtures'].includes(process.env.CREDENTIAL_ACTION ?? '')) throw new Error('CREDENTIAL_ACTION must be rotate or disable-fixtures');
  const database = migrationDatabase();
  try {
    const result = process.env.CREDENTIAL_ACTION === 'disable-fixtures'
      ? await disableFixtureCredentials(database.pool)
      : await rotateCredential(database.pool, { principalType: process.env.CREDENTIAL_TYPE, identifier: process.env.CREDENTIAL_IDENTIFIER, password: process.env.CREDENTIAL_PASSWORD });
    console.log(JSON.stringify(result));
  } finally { await database.close(); }
}
credentials().catch(reportDatabaseFailure);
