# Completion audit and local release verification

Date: 23 September 2026. Baseline: Stage 8 commit `020eff0`; the completion changes are recorded in the subsequent repository commit. This is local evidence, not a public deployment or a completed submission.

## Changes verified

- Completed all four root hierarchy directories and existing nested pages, scoped ancestor filters, stable ordering, counts/links and visible-empty versus absent/hidden-parent handling.
- Added bounded asynchronous password verification, a per-process login throttle, production signing-key/fixture checks and owner-only credential rotation with token-version invalidation.
- Fixed a generated dummy-verification edge case: an installation with no credential hash must not authenticate with the timing dummy password. The regression test directly attempts that password against a null-credential row.
- Added explicit append-only synthetic catch-up, a credential-safe HTTP device client and a read-only smoke command.
- Updated OpenAPI resource/page schemas, query controls, login limits and the shared error-code registry. The final registry covers the actual authentication, validation, conflict, precondition and rate-limit codes as well as foundation errors.
- Prepared production Compose, CI image construction, deployment instructions and submission/viva checklists.

## Actual checks

| Check | Observed result |
| --- | --- |
| `npm run check` | TypeScript, 173 unit/HTTP tests across 10 files, and production compilation passed |
| `npm run test:integration` | 106 tests across 6 files passed against local PostgreSQL 18.4 |
| Final Swagger Parser validation | OpenAPI 3.1 document passed after the error-code registry correction |
| `npm audit --omit=dev --audit-level=high` | Registry audit returned zero vulnerabilities at the time of this run; this is not a security guarantee |
| `git diff --check` | Passed |
| Compiled release rehearsal | Passed using isolated temporary database and restricted runtime role |
| Docker/container execution | Not run locally: Docker is unavailable |
| Remote CI, public HTTPS and provider persistence | Not verified; no host/account supplied |

The first integration attempt failed with ECONNREFUSED because the existing temporary PostgreSQL process was stopped. It did not establish passing tests. After restarting the server, all integration tests passed; the final authentication correction was followed by another complete passing run.

## Compiled local release rehearsal

The rehearsal used `dist/server.js` and compiled administrative/client commands with `NODE_ENV=production`, a random private signing key, private rotated credentials and a separate restricted database login. It created only its own temporary database/role and removed them afterward. The ordinary workspace environment file was not rewritten.

Observed sequence:

1. Applied migrations 001–003 and granted the runtime role only the intended domain reads and reading inserts.
2. Seeded 9 provinces, 25 districts, 25 substations, 200 installations, 35 analysts and 134,600 historical readings. A second seed invocation returned `already-seeded` with the same checksum.
3. Disabled all 35 public analyst credentials and all 200 public installation credentials. Rotated private credentials for the analyst/device scenarios.
4. Appended 573,600 synthetic observations through `2026-09-23T15:30:00.000Z`. Rerunning catch-up for that cutoff inserted zero additional rows.
5. Started the compiled API in production mode and ran the HTTP smoke client. All 25 districts had complete fresh power and midnight-baseline energy coverage at the checked cutoff.
6. Verified national/provincial/district access, hidden-district denial, device POST with 201, analyst retrieval of Location, duplicate 409 and wrong-installation 403.
7. Stopped and restarted the API. The new reading remained retrievable and the database count remained **708,201**.

The [sanitized smoke output](LOCAL_RELEASE_SMOKE.json) records timings and the sample timestamp. The temporary loopback URL is no longer serving this rehearsal. One regional-history request took 140 ms on this run; sample other business reads took 1–4 ms. These single-request local observations are not a load test or production performance claim. The final null-credential guard and documentation registry fix were checked after the rehearsal; they do not change its provisioned-principal workflow.

## Remaining gates

D1 still needs the lecturer's intended mutable-resource/principal interpretation, followed by actual HTTP CRUD implementation/tests. The public host, HTTPS, remote CI/container run, marker access and repository sharing still need real evidence. The student must write the report, review/sign the declaration, complete disclosure and attend the viva. See [submission checklist](../coursework/SUBMISSION_CHECKLIST.md) and [deployment runbook](../azure/DEPLOYMENT.md).
