import type { Pool } from 'pg';
import { applicationSchema, quoteIdentifier } from './identifiers.js';

const domainTables = ['provinces', 'districts', 'grid_substations', 'solar_installations', 'generation_readings', 'users'];

export async function grantRuntimeAccess(
  pool: Pool,
  { schema = 'solar', role }: { schema?: string; role: string },
): Promise<void> {
  const namespace = applicationSchema(schema);
  const grantee = quoteIdentifier(role);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ unsafe: boolean }>(
      `SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        OR oid = (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname = $2)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = pg_roles.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = current_database() AND datdba = pg_roles.oid)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c
                   JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
                   WHERE n.nspname = $2 AND c.relowner = pg_roles.oid)
        OR pg_catalog.has_database_privilege(oid, current_database(), 'CREATE') AS unsafe
       FROM pg_catalog.pg_roles WHERE rolname = $1`,
      [role, schema],
    );
    if (!result.rows[0]) throw new Error('Runtime role does not exist; provision a dedicated unprivileged role first');
    if (result.rows[0].unsafe) throw new Error('Runtime role must be unprivileged, without ownership, elevated attributes or other role memberships');
    const schemaPrivilege = await client.query<{ unsafe: boolean }>(
      'SELECT pg_catalog.has_schema_privilege($1, $2, $3) AS unsafe', [role, schema, 'CREATE'],
    );
    if (schemaPrivilege.rows[0]?.unsafe) throw new Error('Runtime role already has schema CREATE access; remove the unexpected grant first');

    for (const table of [...domainTables, 'schema_migrations']) {
      const qualified = `${namespace}.${quoteIdentifier(table)}`;
      const forbidden = table === 'schema_migrations'
        ? 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        : table === 'generation_readings'
          ? 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          : 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
      const forbiddenColumns = table === 'schema_migrations'
        ? 'SELECT,INSERT,UPDATE,REFERENCES'
        : table === 'generation_readings' ? 'UPDATE,REFERENCES' : 'INSERT,UPDATE,REFERENCES';
      const permission = await client.query<{ unsafe: boolean }>(
        `SELECT pg_catalog.has_table_privilege($1, $2, $3)
          OR pg_catalog.has_any_column_privilege($1, $2, $4) AS unsafe`,
        [role, qualified, forbidden, forbiddenColumns],
      );
      if (permission.rows[0]?.unsafe) {
        throw new Error(`Runtime role has unexpected privileges on ${table}; remove the grant before provisioning`);
      }
    }
    await client.query(`GRANT USAGE ON SCHEMA ${namespace} TO ${grantee}`);
    await client.query(`GRANT SELECT ON ${domainTables.map((table) => `${namespace}.${quoteIdentifier(table)}`).join(', ')} TO ${grantee}`);
    await client.query(`GRANT INSERT ON ${namespace}.generation_readings TO ${grantee}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
