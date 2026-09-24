# Deployment and operations runbook

Status: Azure App Service and PostgreSQL Flexible Server are selected; no public URL is deployed. Follow the [Azure delivery plan](AZURE_PLAN.md) for the native Node 24 package and identity configuration. The Docker instructions below remain an alternative release path. Local tests do not establish public deployment, container execution or repository sharing. Confirm actual price, region and account limits before provisioning.

## 1. Prepare the release

Run `npm ci`, `npm run check` and `npm run test:integration` against a dedicated test database. Record the actual Git SHA and test results. Build with `docker build -t slsea-solar-api:release .` on a machine with Docker. The image contains compiled CLI commands, SQL migrations and OpenAPI, runs as the node user and uses readiness for its health check. CI now includes image construction and a packaged-import check; these checks are not claimed as remotely passed until a CI run exists.

Use a persistent database; never store PostgreSQL data inside the API container. Back up before database changes. Provision a schema-owner login and a different application login. The application role must have no elevated attributes, ownership, role memberships or schema/database CREATE grants. The database guide describes the grant checks. Store URLs and secrets in the provider's secret manager or a private, ignored local environment file.

Required runtime settings:

| Setting | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / provider's application port |
| `DATABASE_URL` | Restricted runtime login, PostgreSQL URL without query parameters |
| `DATABASE_AUTH_MODE` | `managed-identity` on Azure; `password` remains the local default |
| `DATABASE_SSL` | `true` for a remote TLS database; certificates must validate |
| `AZURE_CLIENT_ID` | Only for a selected user-assigned managed identity; omit for system-assigned identity |
| `JWT_SECRET` | A private cryptographically random key; generate at least 32 random bytes, encode as hex/base64 |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Stable identifiers matching the clients; defaults are documented in `.env.example` |
| `LOG_LEVEL` | `info` (logs omit passwords, tokens and connection strings) |

A missing/default production signing key stops startup. Production startup and readiness also check required schema access and reject active published seed credentials. Token exchange independently refuses hashes using the known fixture salt prefixes in production. These checks supplement correct credential provisioning; they are not a general password-strength audit.

`MIGRATION_DATABASE_URL`, `MIGRATION_DATABASE_AUTH_MODE`, optional `MIGRATION_DATABASE_SSL` and `MIGRATION_AZURE_CLIENT_ID` belong only to administrative release jobs, never the running API. Owner authentication defaults independently to `password`; use `azure-cli` for an authorized developer's Entra login. The CLI shares environment validation; supply the private signing-key setting when running it with `NODE_ENV=production`. For a pre-created managed-identity role, `RUNTIME_DATABASE_ROLE` lets the grant command operate through the owner connection; it must match the username in the runtime URL. See the Azure plan for the role-mapping prerequisite.

## 2. Initialize and secure the data

With both database URLs securely supplied to the administrative shell, run:

```sh
npm run db:migrate
npm run db:grant-runtime
npm run db:seed
```

In a built image the equivalents are `node dist/cli/migrate.js`, `node dist/cli/grant-runtime.js` and `node dist/cli/seed.js`. Startup never migrates or seeds automatically. Run seed once on an empty deployment database and retain its manifest output. A rerun before ingestion is harmless; after additional readings have been appended, the strict seed-count verifier intentionally refuses a rerun. It never deletes live rows or restores old credentials.

The seed contains public development credentials. Before exposing the server, disable them:

```sh
CREDENTIAL_ACTION=disable-fixtures npm run db:credentials
```

This changes only active fixture credentials, disables their principals and increments credential versions. Repeating it makes no further changes. Existing history remains intact; an inactive installation remains in summary inventory.

Enable each required marker/demo principal with a **unique private password** using `CREDENTIAL_ACTION=rotate`, `CREDENTIAL_TYPE=analyst` or `installation`, `CREDENTIAL_IDENTIFIER` (email or meter ID), and `CREDENTIAL_PASSWORD` (20–256 characters), then run `npm run db:credentials`. Supply passwords through the secret manager or a non-echoing shell prompt; do not put them in committed files, command arguments or evidence. Rotation activates that principal and revokes its previous JWTs by incrementing the credential version. It prints only the ID and version. Prepare one national, provincial and district analyst and at least two installation credentials for boundary demonstrations. The compiled command is `node dist/cli/credentials.js`.

This is owner-only offline administration. It does not satisfy the unresolved HTTP CRUD requirement.

## 3. Keep the synthetic demonstration fresh

The historical seed ends on 25 August 2026 at local midnight. Do not describe that fixed dataset as current telemetry. For a **synthetic coursework database only**, run:

```sh
ALLOW_SYNTHETIC_CATCHUP=true npm run demo:catch-up
```

This appends synthetic observations for the 200 known seeded installations through the most recent completed 15-minute slot. It uses the deterministic daylight model, trapezoidal interval energy, a monotonic counter and midnight observations. It includes disabled installations because credential state is not equipment lifecycle state. All output remains synthetic; no real meter data is being retrieved.

The command uses the owner connection and the same per-installation lock as HTTP ingestion. Each installation commits atomically. A failed/partial run can be resumed; concurrent runs cannot duplicate observations. It refuses missing history, observations off the 15-minute grid, a missing seed manifest, future cutoffs or more than 60 days of catch-up per installation. To bridge a longer gap, provide consecutive ISO instants in `CATCHUP_UNTIL` and rerun. Do not use this command on a database mixed with real telemetry. Never schedule it implicitly as part of a GET request or startup.

Run it immediately before demonstrating current summaries, or schedule an explicit synthetic-demo job every 15 minutes on the selected host. Record the actual cutoff and row counts. A freshness claim expires as time passes. The compiled command is `node dist/cli/catch-up.js`.

For an HTTP write demonstration, create a JSON file with `timestamp`, `powerKw`, `cumulativeEnergyKwh` and `voltage`. Set `API_BASE_URL`, `DEMO_INSTALLATION_ID`, `DEMO_METER_ID`, `DEMO_DEVICE_PASSWORD` and `DEMO_READING_FILE`; run `npm run demo:reading`. Use a new valid observation time and a counter consistent with both neighbours. The script sends exactly one POST, requires 201 and prints its canonical Location and representation. Repeating the timestamp returns 409; it never overwrites a reading. If synthetic catch-up will run afterward, pause that job and use a new completed 15-minute slot for the manual observation; the catch-up command intentionally refuses off-grid latest observations. The compiled command is `node dist/cli/demo-reading.js`.

## 4. Run behind HTTPS

For a host with Docker and an HTTPS reverse proxy:

```sh
docker compose -f compose.production.yaml up -d --build
```

The production Compose file binds the API to host loopback on port 3000. Configure the chosen proxy/provider to terminate HTTPS and forward requests to that port; configure a provider readiness probe at `/health/ready` and a liveness probe at `/health/live`. Confirm the public certificate and HTTP-to-HTTPS redirect. A managed container host can use the same Dockerfile and environment instead of Compose.

The API intentionally leaves Express `trust proxy` disabled. Its login throttle permits 30 exchanges per socket IP per minute and four concurrent exchanges per process; users behind a proxy share its socket-IP budget. Configure a trusted edge throttle too. Do not set `trust proxy=true` blindly or claim the in-memory limiter is shared across replicas. Start with one API replica for this demonstration.

The runtime must receive only its restricted database URL, private signing key and ordinary runtime settings. Do not pass the owner URL into the API container. Containers should use the supplied nonroot user and readiness health check. Test a restart without deleting the database volume/service; counts, credentials and readings must persist.

## 5. Collect actual deployment evidence

Set `API_BASE_URL` to the HTTPS origin and supply the private national credentials through `SMOKE_ANALYST_IDENTIFIER` and `SMOKE_ANALYST_PASSWORD`. Run:

```sh
npm run smoke
```

The read-only smoke checks health, Swagger/OpenAPI, seed inventory counts, protected reads, latest/overview/history, ETag 304, stale If-Match 412 and a summary. It reports request timings, a sample latest timestamp and sample power coverage, without printing the access token. A stale summary is reported, not passed off as complete freshness. The clients reject credential destinations using remote plain HTTP or redirects. The compiled command is `node dist/cli/smoke.js`.

Also capture:

- National/provincial/district boundary examples and a wrong-device POST rejection.
- A successful device POST, Location retrieval using an analyst token, and a duplicate 409.
- Current coverage for all 25 district summaries after catch-up, including exact midnight baselines.
- Public HTTPS URL, Swagger URL, Git SHA, seed manifest and sanitized smoke output.
- Seed counts before and after restarting the API, proving database persistence.
- Actual CI run URL and container/provider logs showing successful startup.

A single smoke timing is a local observation, not a load benchmark. Record host/database region and workload when evaluating performance. Never include passwords, JWTs, owner URLs or access keys in the submission.

## 6. Recovery

If production startup fails, inspect private operational logs and verify migration files, runtime grants and disabled fixtures. Do not replace runtime credentials with the owner login. Readiness failures are intentionally generic to HTTP callers. A database outage leaves liveness available after startup and readiness returns 503. An initial production database failure stops startup so the platform can retry.

For an application regression, deploy the last verified image only if it remains compatible with the current schema. Do not reverse immutable reading history or rerun seed to repair data. Restore a database backup into a separate recovery database, verify it, then plan any cutover. Stop the API gracefully before maintenance; termination drains HTTP requests and closes the database pool.
