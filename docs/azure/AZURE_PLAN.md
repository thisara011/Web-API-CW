# Azure delivery plan

Selected by the student: **Azure App Service (Web App)** for the API and **Azure Database for PostgreSQL Flexible Server** for persistent data. Work proceeds one verified step at a time. PostgreSQL and the Web App are deployed. Public readiness, authenticated access boundaries, ingestion and restart persistence are verified; see [Web App operations](AZURE_WEBAPP.md). See [database operations](AZURE_DATABASE.md).

The current API already uses real PostgreSQL locally. Azure changes where the database runs and how the application authenticates and connects; it does not require replacing the relational model or rebuilding the API.

## Delivery sequence

| Step | Work | Acceptance gate |
| --- | --- | --- |
| 1 — Account and resources | Confirm Azure subscription type, existing Web App/database resources, budget and permitted regions. Check names, access and current pricing before selecting tiers. | Target subscription, resource reuse/new-resource choice and cost estimate recorded. |
| 2 — Azure application preparation | Prepare Linux Node 24 App Service configuration, an explicit deployment package, and managed-identity PostgreSQL connections with refreshed tokens. Preserve local password connections and owner/runtime separation. | Azure settings and connection changes tested locally; release excludes private environment files and local bootstrap credentials. |
| 3 — PostgreSQL setup | Create or reuse Flexible Server; configure verified TLS, chosen network access, Entra administrator and restricted application identity. Run migrations, grant checks, seed and private application-credential setup as separate administrative steps. | Tables, seed manifest and restricted permissions verified on the target database. |
| 4 — API deployment | Configure App Service identity, environment, startup, HTTPS and readiness. Deploy the reviewed release. | Public readiness, Swagger and authenticated requests work against Azure PostgreSQL. |
| 5 — End-to-end verification | Demonstrate scoped reads, device ingestion, duplicates, histories, ETags, summaries and synthetic freshness. Restart the Web App. | Sanitized remote evidence and unchanged persistent data recorded. |
| 6 — Remaining coursework | Resolve and implement the agreed mutable-resource CRUD path, then finish evidence and student-authored submission materials. | Requirement matrix and actual submission gates closed. |

CRUD clarification is tracked separately. It does not block account setup, database connection work or deployment preparation. Do not implement historical-reading updates/deletes or grant analyst writes merely to remove the ambiguity.

## Proposed App Service configuration

- Linux with the built-in Node.js 24 runtime; confirm the available runtime identifier on the actual subscription before configuring it. Microsoft documents Node 24 for App Service. [Microsoft Node.js quickstart](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs).
- Start the compiled API with `node dist/server.js`. Use `HOST=0.0.0.0` and App Service's supplied `PORT`; never bind the hosted API to loopback. [Node.js configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs).
- Prepare a Linux-built deployment package containing compiled code, production dependencies, package metadata, OpenAPI and SQL migration files. Exclude `.env`, local Compose/bootstrap SQL, test data, Git metadata and local Azure session files. Choose one explicit build strategy; do not combine a prebuilt artifact lacking TypeScript sources with an enabled remote TypeScript build.
- Keep `NODE_ENV=production`, a private JWT key, verified database TLS and `/health/ready`. Current production guards require migrated tables and disabled published fixture credentials before successful startup.
- Configure App Service managed identity as a restricted PostgreSQL principal, with token acquisition for new pool connections. The code now supports `DATABASE_AUTH_MODE=managed-identity`, `azure-cli` or `password`; Azure modes require verified TLS and a passwordless Flexible Server URL. Live managed-identity database access is now verified through public readiness and ingestion. JWT authentication for API users/devices remains a separate concern. [Microsoft managed-identity connection guide](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity).
- Run owner migrations/seed/credential commands outside API startup. The Web App must not receive the schema-owner database credentials or permissions.

## Current readiness

Application preparation is locally verified: TypeScript validation/build, 182 unit/HTTP tests and 106 real PostgreSQL integration tests passed. Compiled release staging and Azure CLI PostgreSQL token acquisition also succeeded. See [Azure preparation evidence](../evidence/AZURE_PREPARATION.md) for commands, initial failures and remaining live checks. Earlier API verification is in [completion evidence](../evidence/COMPLETION_AUDIT.md).

Azure CLI is installed and the user's login was verified on 23 September 2026. The only returned subscription is **Visual Studio Enterprise Subscription**, with state **Enabled**. This is the actual Azure display name; the student describes the benefit as Student Ambassador. The credit balance and renewal/expiry have not been verified.

The agent created **rg-slsea-coursework** in **Central India** after verifying that it did not exist. It now contains **psql-slsea-cw-ae65c5ba**, PostgreSQL 17/B1ms with 32 GiB Premium SSD and seven-day locally redundant backups. Azure returned `Ready`; Entra-only authentication, a single-IP developer firewall and 13 individual Web App outbound-address rules are configured. The application connection code verified PostgreSQL 17.11 and TLSv1.3. Linux B1 plan `asp-slsea-coursework` and app `app-slsea-cw-ae65c5ba` were subsequently created successfully. Both resources are now billable.

The current `compose.yaml` and `db/local` SQL contain intentionally public local fixture passwords. They are not suitable hosted artifacts and stay outside the selected native App Service release. The release staging command copies an explicit set of runtime files and excludes those files, private environment files and local Azure session metadata.

Before creating billable resources, record a concrete resource list and cost estimate using the actual subscription and region. An App Service plan and PostgreSQL server are distinct resources; do not assume a free Web App tier covers the database.

## Step 1 input

Confirmed by the student: Microsoft Student Ambassador benefit, with no project resources initially created. CLI verification identifies the selected subscription as Visual Studio Enterprise Subscription. Do not assume its credit allowance from its display name or treat it as a standard Azure for Students offer.

Completed: resource group `rg-slsea-coursework`, location `centralindia`, provisioning state `Succeeded`. Select the actual Web App/database region together after checking service availability and the subscription's restrictions.

The student reports **US$150 monthly credit** (24 September 2026). This is a user-reported allowance, not a verified remaining balance or approval to consume it all. After reviewing the cost plan, the student authorized the next PostgreSQL step. The B1ms server is now running and billable (database-only base estimate US$22.08/month); current consumption and the credit reset/expiry remain unverified. Do not send passwords, access tokens or publish profiles in chat.

Regional pricing and service catalogs have now been checked, and PostgreSQL/Quota provider registrations are complete. The [hosting configuration and cost](AZURE_HOSTING_COST.md) selects Central India, Linux B1 and PostgreSQL B1ms with 32 GiB storage: US$35.22/month base at 730 hours, with a US$50 planning allowance. PostgreSQL is provisioned, migrated and seeded with 134,600 synthetic readings; public fixture credentials are disabled. See [database verification](../evidence/AZURE_DATABASE_VERIFICATION.json). Web App deployment, managed-identity mapping and Linux dependency installation are now verified. An explicit refresh subsequently reached 738,200 synthetic readings with full coverage across all districts. Next: settle the CRUD interpretation in the supplied brief/rubric and complete the remaining coursework requirements.

## Step 2 — Connection and release implementation

The application now has three explicit database authentication modes:

| Mode | Intended use | Connection settings |
| --- | --- | --- |
| `password` (default) | Local PostgreSQL and an explicitly configured owner login | Existing `DATABASE_URL`; local TLS policy unchanged |
| `azure-cli` | Developer/administrator Entra access from an authenticated local Azure CLI | Passwordless Azure PostgreSQL URL, role in URL, `DATABASE_SSL=true` |
| `managed-identity` | API running on App Service | Passwordless Azure PostgreSQL URL, restricted identity-mapped role, `DATABASE_SSL=true`; optional `AZURE_CLIENT_ID` for user-assigned identity |

Azure modes use the public-cloud PostgreSQL token scope `https://ossrdbms-aad.database.windows.net/.default`. No CLI-user fallback occurs in managed-identity mode. A token callback runs for every new physical connection, with Azure Identity responsible for cache/refresh. The pool receives explicit host/user/database fields so URL parsing cannot replace the callback. Missing/expired tokens and credential errors fail with sanitized messages. Sovereign-cloud endpoints are outside this implementation.

The database role in the URL must be mapped to the exact Entra user/managed identity by the server administrator; merely signing into Azure does not create that database role. URL-encode roles containing characters such as `@`. Credentials must not be embedded in an Azure-mode URL.

Owner jobs use `MIGRATION_DATABASE_URL`, `MIGRATION_DATABASE_AUTH_MODE` (defaults independently to `password`), optional `MIGRATION_DATABASE_SSL` and `MIGRATION_AZURE_CLIENT_ID`. They do not inherit the application's managed identity. For example, a laptop can use `MIGRATION_DATABASE_AUTH_MODE=azure-cli` with its separately authorized administrator role while the Web App uses managed identity.

For `db:grant-runtime`, set `RUNTIME_DATABASE_ROLE` to the already-created restricted identity role and use that same username in `DATABASE_URL`. The CLI then grants through the owner connection without attempting to impersonate the Web App on your laptop. It still validates the target server/database and all existing privilege checks. Without this setting, the original two-connection verification remains available. Entra role creation and successful Azure SQL access are verified for `slsea_runtime`.

### Release artifact

Run `npm run release:stage` to build and stage a new directory under ignored `artifacts/`. The command selects compiled JavaScript/maps, package manifests, `.nvmrc`, OpenAPI and migration SQL. It excludes root/private `.env` files, local bootstrap SQL, Git metadata and Azure sessions, and rejects symbolic links in selected inputs. The output is staging, not yet a deployable archive: production dependencies must be installed on Linux with Node 24.

The CI workflow now stages the release after its checks, runs `npm ci --omit=dev` inside that isolated Linux directory, verifies imports, ZIPs its contents and retains `slsea-appservice-<commit>` for seven days. A remote successful CI run has not yet been claimed. Download the artifact and use the included `slsea-appservice.zip`; do not deploy a ZIP of the entire working directory or a parent folder containing the package. [App Service ZIP deployment](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip).

`deploy/azure/appsettings.example.json` is a template only. Replace its server/role placeholders and supply a private signing key through App Service settings. The blank `JWT_SECRET` deliberately fails validation until configured. The intended runtime is the verified `NODE|24-lts`, startup is `node dist/server.js`, and readiness is `/health/ready`. Let App Service supply `PORT`. The package is precompiled with production dependencies, so remote build/Oryx build settings are false. No owner URL belongs in the Web App settings.

### Executed release mode (25 September 2026)

The deployed release used `node dist/cli/stage-release.js --azure-install`, with remote build/Oryx settings true. That mode stages a build hook to install locked production dependencies and verify imports on Azure Linux; it does not run TypeScript compilation remotely. The prebuilt CI mode described above retains false remote-build settings. See [actual deployment evidence and runbook](AZURE_WEBAPP.md).

Maintenance increment (28 September 2026): release 90de19f is published and verified with full installation-metadata CRUD under the documented assessment interpretation, using a separate private principal and opt-in column grants. See [maintenance operations/evidence](../design/INSTALLATION_MAINTENANCE.md). Remaining work: submission-time refresh, repository sharing, student-authored report/declaration, disclosure and viva; lecturer acceptance of D1 remains unconfirmed.
