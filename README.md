# SLSEA Solar Generation API

NB6007CEM Web API Development coursework: a REST API for installation-bound solar reading ingestion and jurisdiction-scoped operational and historical reads.

**Status:** API foundation, database model, deterministic seed, JWT authentication and secured hierarchy reads are implemented with TypeScript, Express 5 and PostgreSQL. Stage 5 adds immutable reading ingestion and atomic/latest/overview reads. Stage 6 adds scoped history, pagination and conditional GET/HEAD. Stage 8 adds district generation summaries. Deployment and the Stage 7 CRUD clarification remain outstanding.

## Run locally

Prerequisites: Node.js 24 LTS, npm, and Docker with Compose for the local PostgreSQL service. You can instead use an existing PostgreSQL database by changing `DATABASE_URL`. Docker is not installed in the current workspace machine; the database commands below require it first.

```sh
npm ci
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:grant-runtime
npm run db:seed
npm run dev
```

Copy the environment template only on initial setup; preserve your existing `.env` on later runs. The template's credentials are public, local-development fixtures. Hosted credentials belong in environment secrets. `DATABASE_SSL=true` enables certificate-verified TLS; configure trusted CAs for your provider rather than disabling certificate checks. Connection URL query parameters are rejected because they can override identity and TLS settings.

`MIGRATION_DATABASE_URL` connects as the schema owner (`slsea_dev` in local Compose); `DATABASE_URL` connects as the restricted application account (`slsea_app`). The latter can read the six domain tables and insert readings. It cannot write metadata, change/delete historical readings, edit the migration ledger or create domain objects. The API additionally checks JWT credentials, operation scopes and jurisdiction for protected requests.

For an **existing Stage 1 Compose volume**, PostgreSQL does not rerun initialization scripts automatically. Create the local application role without deleting the volume:

```sh
docker compose exec -T postgres psql -U slsea_dev -d slsea -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/001_runtime_role.sql
```

Update the two connection settings in `.env` to match `.env.example`, then run `db:migrate` and `db:grant-runtime`. The role script creates a missing local role; it does not replace passwords or elevate an existing role. Provisioning refuses an existing application role with unexpected permissions.

Open [Swagger UI](http://127.0.0.1:3000/docs/) or [OpenAPI JSON](http://127.0.0.1:3000/openapi.json).

| Endpoint | Expected behavior |
| --- | --- |
| `GET /health/live` | `200` when the HTTP process is serving requests; does not query PostgreSQL |
| `GET /health/ready` | `200` after a successful database query; `503` when PostgreSQL is unavailable or the process is stopping |
| `GET /docs/` | Interactive Swagger documentation |
| `GET /openapi.json` | OpenAPI 3.1 document for all implemented endpoints |

The API can serve liveness and documentation while PostgreSQL is offline; readiness correctly remains `503`. Readiness currently checks connectivity, not domain migrations or seed completeness. Later stages will extend that gate.

`npm run db:seed` uses the migration owner and writes one fixed, reproducible historical demonstration dataset: 9 provinces, 25 districts, 25 substations, 200 installations and 134,600 readings from seven inclusive days at 15-minute intervals. It does not seed current live power. Running it again verifies the recorded generator checksum and counts, then exits without changing data. If a database contains domain data but no matching seed manifest, it stops instead of mixing datasets.

For local Swagger demonstration only, seed analysts use their seeded email address and `Coursework-Demo-Password-2026!`; a device uses its meter identifier, such as `SLSEA-COL-001`, and `device-SLSEA-COL-001`. Exchange these credentials at `POST /auth/token`. They are public coursework fixtures and must be replaced before any deployment. Tokens expire after 15 minutes by default. Set a unique `JWT_SECRET` of at least 32 characters before deploying.

```sh
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/health/ready
curl -i -H 'Accept: application/xml' http://127.0.0.1:3000/health/live
```

The last request demonstrates a JSON `406` error. All application responses include a server-generated `X-Request-Id`. Health probes use `no-store` and ignore conditional caching headers; business reads support authorized ETag revalidation.

## Reading workflow (Stage 5)

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/installations/{installationId}/readings` | Owning device with `readings:write` |
| GET | `/readings/{readingId}` | Analyst within the installation jurisdiction |
| GET | `/installations/{installationId}/latest-reading` | Scoped analyst; latest by observation time |
| GET | `/installations/{installationId}/overview` | Scoped analyst; metadata, hierarchy and nullable `lastKnownReading` |

All paths currently use the host root. `/installations/{id}` remains the atomic metadata resource; `/overview` is the composite. This preserves the established Stage 4 routes. The original proposed version prefix and nested atomic-reading URI are tracked in [the API design](docs/API_DESIGN.md).

Use Swagger to obtain an analyst token, navigate to a substation's installations and copy the chosen installation ID. Obtain the corresponding device token through `/auth/token`, then POST a timezone-qualified timestamp, `powerKw`, `cumulativeEnergyKwh` and `voltage`. Measurements are JSON numbers with at most three decimal places. The counter must fit the preceding and following observations; timestamps cannot precede commissioning or exceed server time by five minutes.

Successful POST returns `201`, the reading, and matching `Location`/`Content-Location` headers. Switch to the analyst token to GET that Location or the latest/overview resources. Devices receive the created representation but do not gain GET access. Retrying the timestamp returns `409`, even for an identical body. An empty site has `lastKnownReading: null` in its overview and `404` for latest-reading. Latest may be historical; the API does not claim it is live telemetry.

See [Stage 5 verification](docs/evidence/STAGE_5.md) for the checks and counter/concurrency examples. Seed once before ingestion: the existing seed verifier requires exact manifest counts and will refuse a re-run after additional live readings are present; it never deletes them.

## History and conditional requests (Stage 6)

Run `npm run db:migrate` before starting this version. Migration 003 tracks hierarchy modification times used by overview responses; it preserves existing rows. No seed reset is needed.

Analysts can GET `/readings` or `/installations/{installationId}/readings`. Supported query parameters are `province-id`, `district-id`, `substation-id`, `installation-id`, `from`, `to`, `sort`, `offset` and `limit`. All filters are ANDed with the authenticated jurisdiction. Unknown or repeated parameters return `400`.

- `from` is inclusive and `to` exclusive; timestamps require a timezone. Encode `+` as `%2B` in URLs.
- Sort is `timestamp` or `-timestamp` (default). UUID breaks ties in the same direction.
- `offset` defaults to 0; `limit` defaults to 25 and ranges from 1 to 100.
- The response is `{data, count, offset, limit, next, previous}`. Count and page share one database snapshot. Links retain filters and sorting; empty and beyond-end pages return `200`.
- Hidden or nonexistent nested installations return `404`. Regional filters that match nothing visible return an empty page.

For example, after obtaining an analyst token:

```sh
curl -i 'http://127.0.0.1:3000/readings?from=2026-08-17T18%3A30%3A00Z&to=2026-08-24T18%3A30%3A00Z&sort=-timestamp&offset=0&limit=25' \
  -H "Authorization: Bearer $ANALYST_TOKEN"
```

Business GET/HEAD responses carry strong `ETag`, `Cache-Control: private, no-cache` and `Vary: Accept, Authorization`. Repeat the same URL with `If-None-Match` set to its returned tag for bodyless `304`; a stale `If-Match` returns `412`. Authentication and jurisdiction checks always run first. POST returns the canonical reading's ETag and receipt-based Last-Modified too.

Reading, latest and nonempty history responses expose receipt-based `Last-Modified`; overviews include metadata changes as well. Immutable atomic readings support conservative date-only revalidation. Mutable views require ETags for `304`, because date-only comparison can miss same-second changes or delayed commits. Hierarchy directories use ETags without inventing a complete modification date. Count/page consistency holds within a response; offset pages may shift between requests as new or late readings arrive.

See [Stage 6 verification and limits](docs/evidence/STAGE_6.md).

## District summaries (Stage 8)

`GET /districts/{districtId}/generation-summary` is available to analysts within their jurisdiction. `as-of` is an optional inclusive ISO timestamp; it defaults to the current 15-minute slot start. Future cutoffs are rejected. The response reports `asOf`, local `dayStart`, `localDate` and `timeZone: Asia/Colombo`.

- `measuredPowerKw` sums each site's latest observation at/before cutoff only when no more than 30 minutes old. No fresh measurements means `null`; observed night-time zero remains `0`.
- `energyTodayKwh` sums each site's latest counter minus its exact local-midnight counter. Missing baselines and inconsistent counters are excluded; no usable contributors means `null`.
- Installation counts, completeness flags, stale-energy counts and oldest/newest contributing observation times show how much data supports the subtotal. Energy coverage can be complete while observations are stale; check the separate freshness fields.
- The denominator includes all installations in the current district inventory, including inactive devices. Historical replay uses current stored metadata and observations, so late backfill can change earlier summaries.

For example, counters moving from 100 to 104.5 and 250 to 253 yield **7.5 kWh**. If their fresh powers are 2 and 3, the summary reports **5 kW**. It does not sum cumulative counters or assume missing devices generated zero.

To replay the static seed, use a district ID from the hierarchy and a cutoff inside the seeded week, for example:

```sh
curl -i "http://127.0.0.1:3000/districts/$DISTRICT_ID/generation-summary?as-of=2026-08-24T06%3A30%3A00Z" \
  -H "Authorization: Bearer $ANALYST_TOKEN"
```

The default present-time summary will correctly mark old seed observations stale. Summary ETags support authorized GET/HEAD revalidation and change when the cutoff or representation changes; no Last-Modified is invented for this time-dependent aggregate. See [Stage 8 evidence](docs/evidence/STAGE_8.md). Stage 8 requires no new database migration beyond the existing Stage 6 migration 003.

## Checks

```sh
npm run check
```

This runs strict TypeScript checking, the HTTP/configuration tests and the production build. The HTTP tests create temporary local listeners. They require local socket access but do not require a running database.

For real database integration tests, create a separate test database once:

```sh
docker compose exec postgres createdb -U slsea_dev slsea_test
npm run test:integration
```

`.env.example` includes `TEST_DATABASE_URL` for that database. If it already exists, omit the `createdb` command. An explicitly requested integration run fails if the setting or database is unavailable; it never silently skips database verification. Set `TEST_DATABASE_SSL=true` if your test database requires verified TLS.

The database tests create their own temporary schemas and roles, then remove only those fixtures. `TEST_DATABASE_URL` must identify a dedicated test database account allowed to create schemas/roles and use `SET ROLE`. Do not use a production database. The CI workflow uses a PostgreSQL 17 service with an isolated test account. A local test pass is not a claimed CI run.

To run the compiled application:

```sh
npm run build
npm start
```

To stop local PostgreSQL without deleting its volume:

```sh
npm run db:stop
```

## Structure

```text
src/app.ts                  HTTP composition and operational routes
src/server.ts               process startup, signals and connection cleanup
src/config/                 validated settings and structured logging
src/db/pool.ts              PostgreSQL pool, timeouts and health query
src/db/migrations.ts        transactional SQL migrations and checksum ledger
src/db/permissions.ts       restricted application-role grants and verification
src/cli/                   explicit migration and permission commands
db/migrations/             versioned SQL schema
db/local/                  local-only PostgreSQL role bootstrap
src/http/errors.ts          public application error type
src/middleware/             bearer verification, negotiation and consistent errors
src/modules/readings/       measurement validation, transactional ingestion and scoped reads
src/routes/readings.ts      reading HTTP routes and method contracts
openapi/openapi.json        shared Swagger/OpenAPI contract
tests/                      HTTP and configuration checks
tests/integration/          real PostgreSQL checks
compose.yaml                persistent local development database
Dockerfile                  nonroot application image for later deployment
.github/workflows/ci.yml    automated build and database checks
```

The coursework API is still in progress; agreed mutable-resource CRUD, deployment and final submission checks remain planned. Database owner credentials are for migrations and seed administration, not the running server. In a built container, migration commands are `node dist/cli/migrate.js` and `node dist/cli/grant-runtime.js`; startup never runs them automatically.

See [the database guide](docs/DATABASE.md) for the model, immutability rules, migration behavior and account separation.

## Coursework plan

- [Project plan, architecture and build stages](docs/PROJECT_PLAN.md)
- [Requirements, marking evidence and submission checklist](docs/REQUIREMENTS.md)
- [Proposed API contract and security rules](docs/API_DESIGN.md)
- [AI assistance and review log](docs/AI_ASSISTANCE_LOG.md)

The plan targets the First-band descriptors, including the district generation summary. It does not guarantee a mark. A public HTTPS deployment, live Swagger documentation, an incremental repository, the student's own report and viva explanation are all part of completion.

Continue with **deployment preparation and the remaining contract audit**; actual hosting needs a provider/account decision, and Stage 7 CRUD still awaits lecturer clarification in the project plan. Build one stage at a time, verify its acceptance criteria, explain it, and record a meaningful commit. The coursework's conflict between append-only readings and full CRUD is tracked explicitly before any mutable management API is added.
