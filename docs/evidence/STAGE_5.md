# Stage 5 — immutable ingestion and operational reads

Date: 23 September 2026. Local implementation; public deployment remains pending.

## Delivered contract

- `POST /installations/{installationId}/readings`: owning installation only, `201`, canonical `/readings/{readingId}` Location, Content-Location and JSON reading.
- `GET /readings/{readingId}`: scoped analyst atomic read.
- `GET /installations/{installationId}/latest-reading`: latest observation timestamp (not receipt time); `404` for absent/empty/hidden installations.
- `GET /installations/{installationId}/overview`: safe installation and ancestor metadata, plus `lastKnownReading` or null. One SQL statement provides a consistent snapshot.
- Measurements serialize as JSON numbers; timestamps serialize as UTC. No credentials or unbounded history are included.

## Rules and examples

The API accepts finite nonnegative numbers with at most three decimals. Maximum power is 999,999,999.999 kW, cumulative energy 999,999,999,999.999 kWh, and voltage 999,999.999 V, matching existing SQL precision; these are storage bounds, not physical plausibility claims. Timestamps require seconds and a timezone, with at most three fractional digits; they must be on/after Unix epoch, on/after any recorded local commissioning date, and no more than five minutes ahead of server time. Older valid backfill has no additional age limit.

Given 100 kWh at 06:00 and 120 kWh at 08:00, a delayed 07:00 counter of 110 succeeds. Values 99 or 121 fail with `40902`. Equal neighbouring counters are permitted. Duplicate instants, including offset-equivalent timestamps, fail with `40901` whether the body is identical or conflicting. History is never overwritten.

Each API append takes a transaction-scoped advisory lock for its installation, then checks neighbours and inserts under READ COMMITTED isolation. Separate statements after lock acquisition see the previous writer's commit. This avoids adding UPDATE privileges merely to lock an installation row. PostgreSQL describes [transaction advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) and [READ COMMITTED visibility](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED). This is an application-level writer protocol: offline administrative writers must follow the same protocol if used concurrently. The database independently enforces uniqueness and immutable history.

Every protected request rechecks the principal's active status and credential version. Analyst tokens also have to match the current stored role/jurisdiction. Signed tokens missing expiry, or with wrong type, issuer, audience, algorithm or installation binding, are rejected. Missing/invalid credentials return `401` with `WWW-Authenticate: Bearer`.

## Verification

Final validation on 23 September 2026:

| Check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, 122 unit/HTTP tests in 6 files, Swagger validation and production build |
| `TEST_DATABASE_URL=… npm run test:integration` | Passed: 81 PostgreSQL integration tests in 5 files |
| `git diff --check` | Passed |

The local database was PostgreSQL 18.4 at the previously provisioned temporary test runtime. Docker/PostgreSQL 17 CI execution and public deployment were not run in this stage. The PostgreSQL tests use isolated schemas and an unprivileged role for HTTP SQL with SELECT on domain tables and INSERT on readings only. Test fixtures and roles are removed afterward.

Covered cases: creation and Location retrieval; national/provincial/district access; sibling and foreign district denial; device-read and analyst-write denial; own-device binding; no-history and absent resources; offset-equivalent duplicates; both counter neighbours; event-time latest; concurrent conflicting counters and concurrent retries; commissioning midnight; validation failures with no insert; credential rotation/deactivation/reassignment; expired tokens; 405/Allow and HEAD/OPTIONS; previous hierarchy query regressions.

## Review findings and remaining work

The unfinished draft directly inserted a reading without checking surrounding counters, future timestamps, input precision or credential revocation. It also returned PostgreSQL NUMERIC values as strings. These have been repaired. Reviewing dependencies found a district query using nonexistent `d.district_id`, national queries supplying an unused SQL parameter, and a district ancestor collection exposing sibling districts; all three now have regression coverage.

Current URLs preserve the previous implemented root-based surface and the Stage 5 endpoint proposal. Differences from the original versioned/nested URI proposal are recorded in API_DESIGN.md. Validators (ETag/Last-Modified), conditional requests, historical pagination, summary calculations and deployment are not claimed here. Latest is not necessarily live. Local fixture credentials and the default development signing key must be replaced before deployment; production secret provisioning and authentication rate limiting remain deployment-hardening work. An existing v1 seed or a seed with appended rows is not reset automatically.
