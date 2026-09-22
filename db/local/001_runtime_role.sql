-- Public credentials for a loopback-only development database. Hosted logins
-- must be created separately with deployment secrets by the database operator.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slsea_app') THEN
    CREATE ROLE slsea_app LOGIN PASSWORD 'local_app_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Object grants are applied explicitly after migrations by db:grant-runtime.
