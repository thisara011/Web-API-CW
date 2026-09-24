# Azure PostgreSQL operations

Server: `psql-slsea-cw-ae65c5ba`, in `rg-slsea-coursework`, Central India. Configuration: PostgreSQL 17, Burstable B1ms, 32 GiB Premium SSD/P4, seven-day locally redundant backups, HA disabled. The reviewed database-only retail estimate is US$22.08/month at 730 compute hours, before variable usage and taxes. The separate Web App is not yet provisioned.

[Open the server in Azure Portal](https://portal.azure.com/#resource/subscriptions/ae65c5ba-0c10-4466-8434-be535e39bc50/resourceGroups/rg-slsea-coursework/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-slsea-cw-ae65c5ba/overview).

## Verified database state

On 24 September 2026, the compiled application connection code connected using the developer's Entra identity with certificate-verified TLSv1.3. PostgreSQL reports version 17.11 and UTF8. All three migrations were applied; a subsequent migration run verified their checksums and reported no pending changes.

The deterministic seed loaded 9 provinces, 25 districts, 25 substations, 200 installations, 35 analysts and 134,600 historical synthetic readings. All 35 published analyst credentials and 200 published device credentials were then disabled. A separate connection confirmed those counts, zero active demo principals, the seed checksum, the enabled append-only reading trigger and the production fixture-credential guard. Private demonstration logins have not yet been provisioned.

See [SQL verification evidence](evidence/AZURE_DATABASE_VERIFICATION.json) and [sanitized resource configuration](evidence/AZURE_RESOURCE_CONFIGURATION.json). These checks used the administrator; they do not certify the future runtime identity's grants. No application HTTP request has yet been served by Azure App Service.

## Authentication and local configuration

Database access uses Microsoft Entra authentication only. The signed-in Azure user is the initial database administrator; password authentication is disabled. This administrative login is for migrations, seed and credential administration, not for serving API traffic.

The local, ignored `.env.azure-admin` file contains the administrator's passwordless connection URL, `MIGRATION_DATABASE_AUTH_MODE=azure-cli` and `MIGRATION_DATABASE_SSL=true`. Its permissions are 0600. It contains no saved access token, database password or API signing key. The existing local `.env` remains unchanged. Sign in with `az login` when the CLI session expires; do not paste tokens into configuration or chat.

The Azure Identity credential obtains a PostgreSQL token when a new connection is needed. Connections verify the server certificate. The database name is `slsea`; migrations create the `solar` schema. The API runtime identity and its restricted SQL grants will be configured with the Web App in the next hosting step.

## Administrative commands

Build before running compiled commands:

```sh
npm run build
node --env-file=.env.azure-admin dist/cli/migrate.js
node --env-file=.env.azure-admin dist/cli/seed.js
CREDENTIAL_ACTION=disable-fixtures node --env-file=.env.azure-admin dist/cli/credentials.js
```

Use the explicit Azure environment file for cloud operations; the ordinary npm database scripts read the local `.env`. Do not copy the administrator URL into App Service runtime settings. Startup never migrates or seeds automatically.

The seed is historical synthetic data, not live telemetry. A seed rerun checks its manifest and exact counts; it intentionally refuses a rerun after new readings have been appended. Disabling fixtures deactivates published demo logins without removing their readings. Private demo credentials must be provisioned separately before the public API demonstration. Do not run the integration test suite against this coursework deployment database.

## Network access

The firewall rule `developer-current-ip` permits exactly one current public IPv4 address. When the developer's network address changes, update that rule to the new single address. Never widen it to all addresses to solve a connection failure. The Web App will need explicit outbound-address rules when it is created.

Azure CLI 2.90.0 created the server with public networking disabled when passed `--public-access None`. Adding a firewall rule in that state was rejected. The setup therefore enabled public networking with no rules first, then added the one-address rule. A public endpoint with a firewall is distinct from internet-wide access.

The initial SQL probe timed out because the developer IP had changed. After replacing the rule with the current single address, the compiled application connection code successfully authenticated to database `slsea`, reporting PostgreSQL **17.11**, UTF8 and **TLSv1.3**. Certificate verification remained enabled throughout. This verifies the administrative Entra path; the Web App managed-identity path remains a separate check.

## Recovery and remaining work

Do not delete this server or reset its database to fix application errors. Use migration checksums, the seed manifest and SQL permissions to diagnose issues. Backups have a seven-day retention window; a recovery drill has not been performed. The initial storage size is fixed at 32 GiB with auto-grow disabled; monitor storage before adding extended synthetic history.

Remaining hosting work: restricted Web App identity and grants, Linux release artifact, private API credentials/signing key, public deployment and end-to-end evidence. Creating the database alone does not establish a deployed API.
