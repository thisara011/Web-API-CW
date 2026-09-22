import { runMigrations } from '../db/migrations.js';
import { migrationDatabase, reportDatabaseFailure } from './database.js';

async function migrate(): Promise<void> {
  const database = migrationDatabase();
  try {
    const result = await runMigrations(database.pool);
    console.log(JSON.stringify(result));
  } finally {
    await database.close();
  }
}

migrate().catch(reportDatabaseFailure);
