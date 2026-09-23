# AI assistance and review log

This is a working disclosure record, not a substitute for the report appendix or the student's own explanations. Append actual prompts, generated artifacts, reviews and fixes as work proceeds. Do not invent interactions or classify planned tests as executed tests.

## Entry 001 — coursework analysis and planning

- Date: 21 September 2026.
- Tool: OpenAI Codex assistant in the project workspace, including delegated independent document/design review.
- User prompt (verbatim):

  > refer this two documents carefully and plan this project prpoerly do the course work, when you planing the project imagine that your web Api expert and best problem slover, after you plan the project ,lets build the project one by one

- Supplied references: coursework brief and marking rubric PDFs at the paths named by the user. A candidate WSO2 REST API design white paper was found in the same module folder and also read.
- AI aid: local PDF text extraction using Swift/PDFKit; workspace inspection; source cross-checks against official Node.js, Express, PostgreSQL and IETF documentation; independent review of grading gaps and API design risks.
- Generated artifacts: `README.md`, `docs/PROJECT_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/API_DESIGN.md`, and this log.
- Scope: planning only. No runtime code, database, deployment, collaborator invitation, signed declaration or assessed report prose produced.
- Findings: append-only/read-client requirements conflict with full CRUD coverage; the likely white paper differs on processing-resource naming and contains misleading Level 1/idempotency wording; static seeds need explicit freshness handling; daily energy must be derived from counter differences.
- Design response: record unresolved interpretations, keep reading history immutable, separate scoped analytical collection from device ingestion, specify coverage-aware summaries, and map each marking requirement to future evidence.
- Verification performed: all pages of both supplied PDFs and the candidate paper read; planning artifacts cross-checked against the rubric. `git diff --check` passed. A document check verified local Markdown links, balanced code fences and 37 unique requirement IDs. No application tests exist or were run.
- Independent design review repairs: clarified that district users may see minimal ancestor identity metadata for hierarchy navigation, and labeled incomplete current-power aggregation as a subtotal with an explicit coverage flag.
- Student review and understanding: pending. These notes must be discussed and understood before their decisions are claimed as part of the submitted work.

## Entry 002 — Stage 1 implementation

- Date: 21 September 2026.
- Tool: OpenAI Codex assistant, with delegated infrastructure, OpenAPI and test work and independent source review.
- User prompt (verbatim):

  > lets complte this

- Selected context: “Next is Stage 1: establish the API foundation, database configuration, health endpoints and Swagger.”
- Scope interpretation: implement Stage 1 with the previously proposed TypeScript/Express/PostgreSQL stack; keep later domain/authentication stages pending.
- Generated artifacts: application/configuration/database-pool/error middleware; OpenAPI JSON; test suites; package and TypeScript/Vitest configuration; Docker/Compose/CI files; README and updated planning records.
- Dependency direction: keep `app.ts` independent of process startup and inject the database health dependency; retain a single OpenAPI document for Swagger and contract validation; verify with real PostgreSQL as well as HTTP test doubles.
- Actual review finding and repair: Zod refinement initially attempted `new URL()` even for malformed input, bypassing the sanitized configuration error. Added `URL.canParse()` before parsing; invalid-input tests pass.
- Actual test finding and repair: Express automatically returned `304` for health requests with `If-None-Match: *`, despite disabling ETag generation. Two tests failed. Health-only middleware now ignores conditional caching headers, and the OpenAPI/README state that probes always evaluate current health. Business-resource caching remains planned for Stage 6.
- Other integration repairs: strict TypeScript required safe access to optional `Allow` headers in tests; CI needed the explicit `TEST_DATABASE_URL` used by integration tests.
- Verified: clean locked install; `npm run check` (typecheck, 81 tests, build); three real PostgreSQL integration tests; built-server HTTP 200 responses for liveness, readiness, Swagger HTML and OpenAPI JSON. Total tests passed: 84. See `docs/evidence/STAGE_1.md`.
- Environment limits: Docker and PostgreSQL were not preinstalled. A PostgreSQL 18.4 instance was run from a temporary package outside the repository for verification; the application dependency list does not include that helper. Container configuration targets PostgreSQL 17 and has not been executed here. Browser automation failed during connection, so interactive browser rendering was not verified; HTTP documentation checks passed.
- Subsequent user question: “so what is the next step”. Answer: Stage 2, establishing the six-entity database schema and migrations; finish Stage 1 evidence first.
- Student explanation checkpoint: distinguish liveness from readiness; trace a request through middleware; explain configuration validation, pooled connections and sanitized errors. Student comprehension is not claimed by the automated checks.

## Entry 003 — resume and Stage 2 database implementation

- Date: 22 September 2026.
- Tool: OpenAI Codex assistant, with separate SQL, integration-test and read-only review tasks delegated to collaborating agents.
- User prompt (verbatim):

  > you cant start what we have stop yesterday

- Scope interpretation: resume yesterday's work and implement the next unfinished stage (database model). Stage 1 was already committed by the start of this turn as `b33fa54` (“1st step”); the workspace was clean.
- Generation direction: derive six domain tables from the approved plan; keep readings immutable; add transaction/checksum-based migrations and narrowly scoped runtime permissions; verify on real PostgreSQL using isolated fixtures.
- Generated artifacts: initial SQL migration; migration/permission helpers and CLI commands; local runtime-role bootstrap; model/migration tests; database guide and updated configuration/planning/evidence.
- Material review finding: effective table-privilege checks do not detect column-only grants. Added `has_any_column_privilege` checks and a regression that supplies an unauthorized column UPDATE grant and expects provisioning to fail.
- Additional review repairs: reject connection URL query parameters that can override identity/TLS settings; reject elevated/owner/member runtime roles; select an energy precision with a defensible JavaScript scaled range; document that immutable ancestry is a conservative first-version choice.
- Actual test correction: PostgreSQL returned SQLSTATE `23001` for a restricted parent deletion, while the initial test expected only `23503`. The test now accepts the documented restriction/FK outcomes and separately confirms the parent row remains. Unknown-parent insert tests still require `23503`. The schema was not weakened to satisfy the test.
- Verification: `npm run check` passed (95 unit/HTTP tests, typecheck and build); PostgreSQL integration suite passed (65 tests); built migration/grant CLI smoke passed against a separately created temporary database/login. See `docs/evidence/STAGE_2.md`.
- Limits: Docker/remote CI remain unexecuted; local SQL verification used PostgreSQL 18.4. No full seed data, JWT flows or business endpoints were implemented in this stage. The runtime database role does not replace future API jurisdiction/installation authorization.
- Student explanation checkpoint: explain the six-table hierarchy, FK restrictions, unique observation key, append-only trigger, migration transaction/ledger and separate database accounts. Student comprehension remains to be confirmed through discussion/viva rehearsal.

## Entry 004 — Stage 3 seed data

- Date: 22 September 2026.
- User direction: resume where work stopped; after the verified Stage 2 commit, proceed to the planned deterministic seed stage.
- Generated artifacts: seed metadata migration, pure deterministic dataset generator, transactional seed command, unit/integration seed tests and Stage 3 evidence.
- Decisions: use all 25 Sri Lankan districts across 9 provinces, one synthetic substation per district and eight synthetic installations per substation. Fix the seed at a documented August 2026 cutoff to ensure repeatable marking data rather than generate time-dependent data.
- Actual review/repair: initially added only unit-level generator coverage. Added a real PostgreSQL integration test that runs the full 134,600-reading seed twice in an isolated schema, checking that the second run reports no writes and exact counts remain intact.
- Verified: pure dataset tests passed; complete unit/HTTP/build check passed with 100 tests; PostgreSQL suite passed with 66 tests; built CLI migrated and seeded a dedicated temporary database, then correctly reported `already-seeded` on repeat. The temporary validation database was removed after testing.
- Limitation: generated analyst hashes are placeholders until Stage 4 creates an actual credential/token flow. The static seed is historical and must not be described as current real-time data; operational catch-up is planned later.
- Student explanation checkpoint: show why a fixed seed supports repeatable demonstrations, calculate 200 × 673 readings, identify the midnight baseline, and explain why the seed refuses unknown pre-existing data.

## Entry 005 — Stage 4 authentication and scoped hierarchy reads

- Date: 22 September 2026.
- Generated artifacts: scrypt password verifier, `jose` JWT integration, token endpoint, bearer middleware, hierarchy routes, OpenAPI contract and PostgreSQL authorization tests.
- Decisions: JWTs are HS256 tokens validated for exact issuer, audience, signature and expiry. A scope grants the operation type; the route then applies an independent database predicate for the analyst's national, province or district jurisdiction. This prevents a broad `geography:read` claim from becoming unrestricted data access.
- Actual review/repair: moved bearer middleware after the public health/OpenAPI routes when review showed an earlier placement would have protected health checks. The seed generator was bumped to v2 so new seed rows have scrypt hashes for demonstration credentials; a v1 manifest refuses to be silently blended with it.
- Verified: complete unit/type/build check passed with 103 tests. Real PostgreSQL suite passed with 69 tests, including a fresh seeded schema, national and district token flows, cross-province denial, device denial, missing/forged bearer tokens and invalid credentials.
- Limitation: HS256 needs a unique protected deployment secret. The documented seed passwords are public local demonstration fixtures and must be replaced before public deployment. Device reading writes and token credential-version revocation checks arrive in Stage 5.
- Student explanation checkpoint: distinguish `geography:read` from jurisdiction attributes, identify why a device token cannot read a hierarchy collection, and trace a forged token to signature verification.

## Entry 006 — Stage 5 resumed and reviewed

- Date: 23 September 2026; tool: Codex (GPT-6).
- User direction: “lets do it”, followed by “can you start where we have stop”. Resumed the uncommitted reading routes and draft integration test.
- Artifacts: reading validation/service/router, bearer revalidation, expanded OpenAPI, restricted-role PostgreSQL workflow tests, input/token unit tests and evidence notes.
- Actual defects found: draft POST lacked event-time counter checks and concurrency serialization, accepted excessive precision and future timestamps, and returned NUMERIC strings. The old JWT verifier did not require expiry. Existing hierarchy SQL used `d.district_id` where the column is `d.id`, supplied extra bind parameters for national queries, and leaked sibling districts through an ancestor collection.
- Repairs: per-installation transaction advisory lock, predecessor/successor numeric checks, strict input normalization, explicit number output, required JWT claims/type, current identity/version/jurisdiction verification, and focused hierarchy query corrections. Preserved immutable-history DB privileges and triggers.
- Contract decision: retained the root-based paths already discussed/implemented, canonical `/readings/{id}`, and separate `/overview`; reconciled the earlier proposed naming in API_DESIGN.md. Conditional validators remain Stage 6.
- Verification: `npm run check` passed TypeScript, 122 unit/HTTP tests and build; real PostgreSQL suite passed 81 tests. See Stage 5 evidence. Initial sandbox runs were blocked with local-socket EPERM and were rerun with the environment's required approval. Fixed TypeScript header-nullability assertions in the new tests; no application checks were weakened.
- Student checkpoint: explain why 110 fits between 100 and 120; why late receipt does not make an older observation the latest; why concurrent conflicting inserts cannot both succeed; and why a device gets a Location without permission to GET it.
- Limits: public deployment, rate limiting/production secret provisioning, conditional responses and historical collection reads remain pending. Report prose and viva explanation remain the student's work.

## Entry 007 — Stage 6 history and conditional HTTP

- Date: 23 September 2026; tool: Codex (GPT-6).
- User prompt: “lets complte it”, following the completed Stage 5 and Stage 6 proposal.
- Artifacts: strict history query parser, scoped SQL history with snapshot/count/page, filter-preserving links, shared conditional-response helper, hierarchy modification-time migration, OpenAPI and regression tests.
- Decisions: keep current root routes and add regional/nested histories. Apply predicates before aggregates and page selection. Use REPEATABLE READ for a consistent count/page/parent snapshot. Strong ETags hash the actual serialized body; mutable views also include URL and jurisdiction. Do not claim date-only freshness for mutable views with second-resolution HTTP dates.
- Actual review findings: ordinary Express JSON sending would run its own freshness check after our precondition logic. The new helper writes the selected body directly so date ambiguity and If-Match precedence cannot be overridden. Ancestor metadata had no modification timestamp; migration 003 adds one without inventing historical dates. Fixed the new entity-tag parser to accept trailing optional whitespace after a quoted tag during review.
- Verification: final complete check passed 157 unit/HTTP tests (including the updated Swagger contract), typecheck/build, and 88 real PostgreSQL tests; `git diff --check` passed. Results are recorded in Stage 6 evidence. Tests use the existing isolated schema/runtime-role harness and remove fixtures afterward.
- Student checkpoint: explain why an unauthorized matching ETag cannot produce 304; compare weak If-None-Match with strong If-Match; trace a half-open time filter and scoped count; demonstrate why a late off-page reading changes the page count/tag.
- Limits: offset pagination is not a cross-request snapshot, and a fixed event-time window still permits backfill. Directory Last-Modified dates are omitted where a complete membership clock is absent. District summaries, deployment, production hardening and the unresolved CRUD interpretation remain pending.

## Subsequent entry template

- Date / tool and model identifier if known:
- Exact prompt or reference to retained prompt transcript:
- Relevant files and commit:
- Generated or changed behavior:
- What was reviewed against which guideline:
- Actual defect found (or state that no defect was identified):
- Repair and why it is correct:
- Verification commands, actual results and evidence location:
- Student's explanation/checkpoint:
- Remaining limitations:

Retain later student prompts and material generation/revision instructions. Export available session transcripts when preparing the appendix so this summary is not mistaken for a complete transcript. Do not include signing keys, access tokens, passwords or unrelated personal information in disclosure records.
