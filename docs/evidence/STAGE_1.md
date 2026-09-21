# Stage 1 verification record

Date: 21 September 2026. Scope: API foundation only.

## Implemented

- TypeScript/Express application separated from process startup.
- Validated environment settings, PostgreSQL pool with bounded connection/query timeouts and verified-TLS option.
- Liveness and database-backed readiness endpoints; graceful process shutdown.
- Consistent JSON errors, generated request IDs, JSON negotiation and request-size limit.
- OpenAPI 3.1 document and Swagger UI, advertising only implemented endpoints.
- Locked dependencies, build/typecheck/test commands, CI configuration, local database Compose service and application Dockerfile.

## Checks actually performed

| Check | Result |
| --- | --- |
| `npm ci --offline --cache /private/tmp/web-api-cw-npm-cache --no-audit` | Clean locked install passed using the dependency cache populated during setup |
| `npm run check` | Typecheck passed; 81 HTTP/configuration tests passed; production compilation passed |
| `npm run test:integration` with temporary `TEST_DATABASE_URL` | Three tests passed: real SQL, healthy readiness, unreachable DB with surviving liveness |
| Dependency installation audit | Reported zero known vulnerabilities at installation time; not a guarantee against future advisories |
| `git diff --check` | Passed |
| Compose and CI YAML parsing | Passed; runtime execution is a separate check |
| OpenAPI parser validation | Passed in the HTTP suite |
| `.env` ignore behavior | Local environment file ignored; `.env.example` retained |

Verification environment: Node.js 24.13.0 on macOS. The database integration run used PostgreSQL 18.4 on loopback port 55432, installed through a temporary `embedded-postgres` helper outside this repository. Database and HTTP tests required local socket/shared-memory permissions beyond the execution sandbox. The helper and its temporary data are not application dependencies or coursework seed data.

## Built-server HTTP smoke results

The compiled entrypoint was started with `npm start` and the temporary local database URL.

| Request | Observed result |
| --- | --- |
| `GET /health/live` | `200`, `{"status":"ok","service":"slsea-solar-api"}` |
| `GET /health/ready` | `200`, `{"status":"ready","checks":{"database":"up"}}` |
| `GET /docs/` | `200`, Swagger HTML |
| `GET /openapi.json` | `200`, OpenAPI document |

The tests additionally verified failed DB readiness (`503`), missing paths (`404`), unsupported methods (`405` with Allow), Accept rejection (`406`), malformed JSON (`400`), oversized bodies (`413`), unsupported body format (`415`), sanitized unexpected errors (`500`), HEAD/OPTIONS behavior and noncached health probes.

## Defects found and corrected

1. Invalid database URLs caused a native URL exception instead of the intended field-only configuration error. Guarded URL construction and verified malformed-input cases.
2. Health GETs with a wildcard cache validator became `304` through Express's automatic freshness handling. Added explicit health-probe behavior; the two failing cases now pass and the behavior is documented.
3. Optional HTTP header typing and the integration-test environment variable needed alignment across tests and CI. Corrected and typechecked.

## Verification limits and next gate

- Docker is not installed locally. Docker image build, Compose execution and the PostgreSQL 17 CI service have **not** run here. YAML parsing does not establish container correctness.
- The GitHub Actions workflow is prepared; no remote CI result is claimed.
- Browser automation failed while connecting to the in-app browser. Swagger's HTTP surface and OpenAPI schema are verified; interactive browser rendering and “Try it out” remain unchecked.
- No schema, solar seed, JWT authentication or public deployment exists yet. Current readiness proves connectivity, not coursework completeness.
- Stage 2 needs a persistent development PostgreSQL database, versioned migrations and constraint tests for the six-entity hierarchy. The temporary verification database is not the persistent development environment.
