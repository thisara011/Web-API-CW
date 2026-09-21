# SLSEA Solar Generation API

NB6007CEM Web API Development coursework: a REST API for installation-bound solar reading ingestion and jurisdiction-scoped operational and historical reads.

**Status:** Stage 1 foundation implemented with TypeScript, Express 5 and PostgreSQL. The domain schema, seed data, JWT authentication and solar business endpoints are later stages.

## Run locally

Prerequisites: Node.js 24 LTS, npm, and Docker with Compose for the local PostgreSQL service. You can instead use an existing PostgreSQL database by changing `DATABASE_URL`. Docker is not installed in the current workspace machine; the database commands below require it first.

```sh
npm ci
cp .env.example .env
npm run db:up
npm run dev
```

Copy the environment template only on initial setup; preserve your existing `.env` on later runs. The template's credentials are public, local-development fixtures. Hosted credentials belong in environment secrets. `DATABASE_SSL=true` enables certificate-verified TLS; configure trusted CAs for your provider rather than disabling certificate checks. Configure TLS through that setting, not through URL query parameters.

Open [Swagger UI](http://127.0.0.1:3000/docs/) or [OpenAPI JSON](http://127.0.0.1:3000/openapi.json).

| Endpoint | Expected behavior |
| --- | --- |
| `GET /health/live` | `200` when the HTTP process is serving requests; does not query PostgreSQL |
| `GET /health/ready` | `200` after a successful database query; `503` when PostgreSQL is unavailable or the process is stopping |
| `GET /docs/` | Interactive Swagger documentation |
| `GET /openapi.json` | OpenAPI 3.1 document for the implemented foundation endpoints |

The API can serve liveness and documentation while PostgreSQL is offline; readiness correctly remains `503`. Readiness currently checks connectivity, not domain migrations or seed completeness. Later stages will extend that gate.

```sh
curl -i http://127.0.0.1:3000/health/live
curl -i http://127.0.0.1:3000/health/ready
curl -i -H 'Accept: application/xml' http://127.0.0.1:3000/health/live
```

The last request demonstrates a JSON `406` error. All application responses include a server-generated `X-Request-Id`. Health probes use `no-store` and ignore conditional caching headers; conditional retrieval of business resources arrives in Stage 6.

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

The CI workflow runs the same checks using a PostgreSQL 17 service. It will run after this work is pushed to GitHub; a local test pass is not a claimed CI run.

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
src/http/errors.ts          public application error type
src/middleware/             negotiation, request IDs and consistent errors
openapi/openapi.json        shared Swagger/OpenAPI contract
tests/                      HTTP and configuration checks
tests/integration/          real PostgreSQL checks
compose.yaml                persistent local development database
Dockerfile                  nonroot application image for later deployment
.github/workflows/ci.yml    automated build and database checks
```

Do not expose this foundation as the completed coursework API. Authentication and jurisdiction checks will be implemented before the business resources are published. The local Compose user is a development database owner; separate migration/runtime privileges arrive with the data model.

## Coursework plan

- [Project plan, architecture and build stages](docs/PROJECT_PLAN.md)
- [Requirements, marking evidence and submission checklist](docs/REQUIREMENTS.md)
- [Proposed API contract and security rules](docs/API_DESIGN.md)
- [AI assistance and review log](docs/AI_ASSISTANCE_LOG.md)

The plan targets the First-band descriptors, including the district generation summary. It does not guarantee a mark. A public HTTPS deployment, live Swagger documentation, an incremental repository, the student's own report and viva explanation are all part of completion.

Continue with **Stage 2: data model** in the project plan. Build one stage at a time, verify its acceptance criteria, explain it, and record a meaningful commit. The coursework's conflict between append-only readings and full CRUD is tracked explicitly before any mutable management API is added.
