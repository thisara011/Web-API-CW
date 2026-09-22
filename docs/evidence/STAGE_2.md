# Stage 2 verification record

Date: 22 September 2026. Starting point: clean Stage 1 commit `b33fa54`.

## Implemented

- Six domain tables in a dedicated `solar` schema, derived from the conceptual hierarchy.
- Restrictive FKs, unique meter/observation identifiers, finite measurement/time checks and exclusive user jurisdiction scopes.
- Indexes for hierarchy traversal, installation history and regional chronology.
- Database triggers preventing reading UPDATE/DELETE/TRUNCATE and historical ancestry/meter reassignment.
- A migration ledger with file checksums, concurrent-runner locking and transaction-wide rollback for pending changes.
- Separate migration and runtime connection settings. Runtime provisioning verifies existing effective permissions and grants only domain SELECT and reading INSERT.
- Local-only account bootstrap, revised setup instructions and a database explanation guide.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm run check` | Strict TypeScript passed; 95 unit/HTTP tests passed; production build passed |
| `npm run test:integration` with temporary local `TEST_DATABASE_URL` | 65 tests passed, including 62 model/migration/permission cases and 3 connectivity cases |
| Built CLI smoke in a separate temporary database | Fresh migration succeeded; repeated migration applied nothing; runtime grants and regrant succeeded; owner-as-runtime configuration rejected |
| Actual restricted LOGIN connection in CLI smoke | Domain SELECT succeeded; metadata INSERT and migration-ledger SELECT failed with insufficient privileges |

Both migration and permission test suites use real PostgreSQL, not an emulated query layer. Tests create distinct schemas/roles and remove only their own fixtures. The built-command smoke created a separate database and LOGIN, checked them, then removed them. No coursework seed or existing application database was reset.

Database environment: the local temporary PostgreSQL 18.4 instance used for Stage 1, listening on loopback port 55432. Container configuration targets PostgreSQL 17; that version/container path has not been executed here. The temporary helper remains outside application dependencies.

## Failure and repair evidence

The first real integration run passed 64 tests and failed one assertion: a restricted parent deletion returned `23001`, whereas the test expected `23503`. The schema correctly denied the deletion. The corrected test accepts the documented restriction/FK errors and confirms the protected row still exists. The subsequent run passed all 65 tests. [PostgreSQL error-code reference](https://www.postgresql.org/docs/18/errcodes-appendix.html).

Independent code review also found that table-only permission checks miss column-specific grants. The implementation now checks both. A regression grants only `UPDATE(site_label)` to the runtime role, verifies provisioning rejection, revokes that fixture grant, and verifies UPDATE remains denied.

Other important passing cases: concurrent migration runners; changed/missing applied files; rollback after a later migration fails; successful repaired retry; nonexistent parents; duplicate readings; finite/nonnegative measurements; valid/invalid user scopes; no history deletion or truncation; denial of runtime DDL and metadata writes.

## Remaining scope

Stage 3 must generate the required 9 provinces, 25 districts, at least 20 substations, 200 installations and one week of readings per installation. The tiny integration fixtures do not satisfy seed requirements. Stage 4 must implement JWT, installation ownership and scoped query authorization. Stage 5 must enforce cross-reading counter order and input precision. Docker execution, public deployment and remote CI remain later verification tasks.
