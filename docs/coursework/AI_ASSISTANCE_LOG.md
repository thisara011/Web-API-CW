# AI assistance and review log

This is a working disclosure record, not a substitute for the report appendix or the student's own explanations. Append actual prompts, generated artifacts, reviews and fixes as work proceeds. Do not invent interactions or classify planned tests as executed tests.

## Entry 001 — coursework analysis and planning

- Date: 21 September 2026.
- Tool: OpenAI Codex assistant in the project workspace, including delegated independent document/design review.
- User prompt (verbatim):

  > refer this two documents carefully and plan this project prpoerly do the course work, when you planing the project imagine that your web Api expert and best problem slover, after you plan the project ,lets build the project one by one

- Supplied references: coursework brief and marking rubric PDFs at the paths named by the user. A candidate WSO2 REST API design white paper was found in the same module folder and also read.
- AI aid: local PDF text extraction using Swift/PDFKit; workspace inspection; source cross-checks against official Node.js, Express, PostgreSQL and IETF documentation; independent review of grading gaps and API design risks.
- Generated artifacts: `README.md`, `docs/coursework/PROJECT_PLAN.md`, `docs/coursework/REQUIREMENTS.md`, `docs/design/API_DESIGN.md`, and this log.
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

## Entry 008 — district generation summary

- Date: 23 September 2026; tool: Codex (GPT-6).
- User prompt: “lets go with next step”, following the Stage 6 completion and proposed district summary work. Followed the plan's independent Stage 8 path while Stage 7 CRUD remains unresolved.
- Artifacts: summary cutoff validation, district aggregate service, HTTP route with existing bearer/conditional handling, Swagger schemas, arithmetic/coverage/authorization tests and evidence notes.
- Decisions: use one scoped SQL statement for consistent district visibility, current inventory, latest-at-cutoff observations, exact local-midnight baselines and aggregate counts. Sum per-site counter differences, not cumulative values; SQL NUMERIC aggregation occurs before JSON-number conversion. Include inactive installations in the denominator and describe historical replay's current-inventory limit explicitly.
- Review: checked that an exact 30-minute age remains fresh, rows after cutoff are excluded, midnight is computed using Asia/Colombo, null totals differ from measured zero, and stale energy contributors remain visible. No failing application test was observed on the initial full run; this entry does not invent a defect. Strengthened the new HEAD test to assert status and matching ETag as well as the absent body.
- Verification: final check passed strict TypeScript/build, 167 unit/HTTP tests including updated Swagger, and 101 PostgreSQL tests including the full-seed summary. `git diff --check` passed. Results are recorded in Stage 8 evidence. The small fixtures use an unprivileged runtime SQL role and hand-calculated expectations.
- Student checkpoint: derive 7.5 kWh from (104.5−100)+(253−250), distinguish it from a cumulative sum, explain 5 kW measured power, and show how missing/stale installations affect counts rather than silently contributing zero.
- Limits: current asset inventory is not historical lifecycle state; replay can change after backfill. ETags revalidate the cutoff/representation, while date validators are omitted for this time-dependent aggregate. Deployment, production hardening, CRUD clarification and final report/viva work remain outstanding.

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

## Entry 009 — Completion audit and deployment preparation

- Date: 23 September 2026; tool: Codex (GPT-6).
- User direction: “please chek the next step and i want complte this with fully complted one”. The user requested completion beyond the next isolated stage. Hosting details and the lecturer's D1 interpretation were requested; no external resource was provisioned and no message/invitation was sent to anyone.
- Artifacts: complete hierarchy directory service and OpenAPI schemas, login limits/asynchronous verification, production configuration/readiness guards, owner credential CLI, synthetic catch-up, HTTP smoke/device clients, production Compose, CI image check, deployment/submission documentation and regression tests.
- Actual findings: missing root directory coverage/pagination; empty-parent collections needed distinction from invisible parents; synchronous password verification blocked the event loop; production accepted the known local signing key and fixture credentials. During review of the dummy-comparison change, found that a device row with a null credential hash could otherwise pass using the dummy password. Restored an explicit non-null hash requirement and added a regression test. This was a generated-code defect caught during this audit, not a reported external incident.
- Repairs: jurisdiction-scoped repeatable-read pages and parent checks; bounded asynchronous credential work and per-IP limits; private production key enforcement; fixture refusal and versioned owner credential rotation; null-credential rejection. Synthetic catch-up shares reading locks, commits each installation atomically and never mutates history. Runtime role privileges remain unchanged. A final contract audit also found the shared OpenAPI error-code enum still listed only foundation errors; expanded it to match the implemented authentication, validation, conflict, precondition and rate-limit codes and revalidated the document.
- Verification: initial database tests failed because the temporary PostgreSQL server was stopped (ECONNREFUSED), not because the tests passed or were skipped successfully. Restarted it and reran the full suite. The compiled release rehearsal created and removed its own isolated database/role, migrated, seeded twice, disabled fixtures, provisioned private credentials, caught up all 200 sites, verified all 25 districts, exercised device and analyst boundaries and checked restart persistence. Production dependency audit reported zero vulnerabilities. Final counts and limitations are in evidence/COMPLETION_AUDIT.md.
- Student checkpoint: explain why a timing dummy must never become a valid credential, why empty authorized collections differ from hidden parents, why credential rotation invalidates existing JWTs, and why a synthetic-data job must be explicit and labeled.
- Limits: single-process/IP login limits need a configured edge policy behind a proxy; Docker/remote CI/public HTTPS are not claimed as run locally. Full CRUD remains unresolved, and the student must author the report, review/sign the declaration and prepare the viva.

## Entry 010 — Azure target selected

- User selected Azure Web App and a real PostgreSQL database, with development step by step.
- Used Azure readiness and PostgreSQL skill references and checked Microsoft documentation. Recorded App Service plus PostgreSQL Flexible Server as the target in AZURE_PLAN.md and PROJECT_PLAN.md.
- Static inspection found the existing Node 24/Express/pg stack and release prerequisites. Azure CLI is absent, so subscription/resource access was not verified. Azure managed-identity connection support is planned and explicitly not claimed as implemented.
- Prepared a phased account/configuration/database/deployment/verification plan. Local fixture passwords must stay outside the hosted release; owner operations remain separate from startup. Local Azure session metadata is excluded from Git and Docker build context.
- No new tests/builds, Azure installation, resource creation or deployment ran in this planning step. Existing local verification remains historical evidence; account type, existing resources and budget are pending user input.
- Follow-up: user confirmed a Microsoft Student Ambassador subscription and selected “Nothing created yet.” Updated the Azure plan for new resources and supplied the first resource-group setup step. Credit allowance, expiry and Azure resource availability remain unverified; no resource creation was performed by the agent.

## Entry 011 — Azure login and resource group

- User installed Azure CLI, signed in and replied “logged in.” Verified the selected account and listed available subscriptions: one enabled Visual Studio Enterprise Subscription. No passwords or access tokens were printed or committed.
- Checked `rg-slsea-coursework`: absent. Created the empty resource group in Central India using the explicit subscription, with project/environment tags; Azure returned Succeeded. No Web App, App Service plan or database was created.
- Updated the Azure plan with verified state. Available credits, billing limits and service-specific regional capacity remain unverified. The next application preparation step is managed-identity PostgreSQL authentication and App Service packaging.

## Entry 012 — Azure authentication and release preparation

- Date: 24 September 2026; tool: Codex. User direction: “lets start where we stop”; later reported “i have monthly 150 USD”. Continued application preparation and recorded the allowance without treating it as a verified available balance.
- Added Azure Identity credentials and per-connection PostgreSQL token callbacks with verified TLS; kept local password access and administrative authentication independent. Added an owner-only grant mode for a pre-created runtime identity role.
- Review finding: pg connection-string parsing can replace a supplied password callback. Azure mode therefore passes explicit host/port/user/database fields; tests instantiate the real pg client to verify callback preservation. No deployed authentication incident was observed. Release staging rejects symlinked selected inputs and includes only runtime assets; the production signing-key template is deliberately blank.
- Prepared Linux CI packaging, App Service settings and deployment documentation. No Web App or PostgreSQL server was created or published.
- Verification: TypeScript/build passed; 182 unit/HTTP and 106 real PostgreSQL integration tests passed on complete reruns. Initial timeout/socket failures and verification limits are recorded in [Azure preparation evidence](../evidence/AZURE_PREPARATION.md). Local staging succeeded, and the compiled Azure CLI credential path obtained a PostgreSQL token without exposing it. Remote CI and Azure SQL connectivity are not claimed as tested.
- Student checkpoint: explain why a database access token differs from the API's JWT, why managed identity needs a mapped PostgreSQL role and grants, why migrations use a separate identity, and why a Linux deployment package excludes local fixture/environment files.
- Next: price and validate a small Azure configuration within the reported credit, provision identities/database, then deploy and collect live evidence. Coursework CRUD clarification, report authorship and viva preparation remain open.

## Entry 013 — Azure sizing and pricing

- Date: 24 September 2026; tool: Codex. User direction: “oky.lets slove one by one”. Completed the hosting selection/cost step using the Azure quotas skill, authenticated CLI checks and Microsoft documentation/pricing.
- Confirmed the project resource group is empty and Central India catalogs list Linux B1, PostgreSQL B1ms, version 17 and 32 GiB storage. Installed the quota CLI extension and requested the required Quota/PostgreSQL provider registrations; this did not create a Web App or database.
- Final checks confirmed both newly requested providers reached `Registered`.
- Saved the public retail meters and a concrete configuration/cost plan: US$35.22 base per 730-hour month; US$50 planning allowance, not an enforced cap. Remaining credits and actual invoice rates are unverified.
- Actual findings: initial quota lookup required provider registration; the subsequent response exposes only a wildcard regional limit with `isQuotaApplicable=false`. Did not misrepresent that as B1 capacity approval. Python certificate verification failed on the pricing endpoint; system curl worked with certificate checks enabled.
- No application code changed, so application tests were not rerun. Checked JSON syntax, pricing arithmetic and documentation whitespace. Live SQL connectivity, global resource names, deployment capacity and remote release verification remain next-step checks.
- Student checkpoint: distinguish a monthly estimate from a spending cap, a service catalog from available subscription capacity, and administrator access from the runtime identity.

## Entry 014 — Azure PostgreSQL provisioning and initialization

- Date: 24 September 2026; tool: Codex. User authorized “okay,lets go to next step” after reviewing the costed configuration, then asked to resume. Used the Azure PostgreSQL skill and current Microsoft CLI/authentication documentation.
- Created `psql-slsea-cw-ae65c5ba` in Central India: PostgreSQL 17, B1ms, 32 GiB Premium SSD/P4, seven-day local backups, no HA, Entra-only authentication. Configured the user's Entra identity as administrator and one explicit developer-IP firewall rule. This is a running, billable database; no Web App was created.
- Kept administrative connection settings in the ignored, mode-0600 `.env.azure-admin` file. It contains a passwordless URL and authentication mode, with no saved token/password. Existing local `.env` was preserved.
- Actual setup issues: CLI `--public-access None` resulted in networking disabled, so Azure refused a firewall rule until the endpoint was enabled. The database command rejected charset without collation; corrected by accepting the UTF8/en_US.utf8 defaults. An administrator-command name and firewall-list flag were corrected for CLI 2.90.0. These were setup command errors, not API code defects.
- The first SQL connection timed out; DNS resolved but TCP did not connect. Rechecking the public IP found it had changed. Updated the existing rule to the current single address; the next connection succeeded with PostgreSQL 17.11 and TLSv1.3. Did not widen the firewall or disable TLS validation.
- Applied all three migrations and loaded the deterministic seed: 9 provinces, 25 districts/substations, 200 installations, 35 analysts and 134,600 historical synthetic readings. Disabled all published fixture credentials while retaining history.
- Verification: build passed; a fresh Azure connection verified counts, seed checksum, enabled append-only trigger and zero active fixture principals. Re-running migrations confirmed checksums and no pending migrations. Production readiness's fixture/schema checks passed through the owner connection. [SQL evidence](../evidence/AZURE_DATABASE_VERIFICATION.json) and [resource evidence](../evidence/AZURE_RESOURCE_CONFIGURATION.json) omit tokens, administrator identifiers and developer IP addresses. Application code was unchanged; the full local test suite was not rerun or executed against the hosted database.
- Student checkpoint: explain the two independent Entra/SQL permission layers, why a changed developer IP can cause timeouts, what TLSv1.3 verification establishes, and why seeded historical readings are not current telemetry.
- Remaining: Web App creation, managed-identity role/grants, private API credentials, Linux artifact build/deployment and public HTTP verification. Backup recovery and deployed runtime privileges are not yet verified. Coursework CRUD clarification/report/viva remain open.

## Entry 015 — Azure Web App deployment and remote verification

- Dates: 24–25 September 2026; tool: Codex. User repeatedly authorized continuation of the next hosting step and asked to resume where work stopped. Created the reviewed Linux B1 plan/Web App, system-assigned identity and individual PostgreSQL outbound firewall rules; configured HTTPS, Node 24, health checks and private runtime settings.
- Created and audited the identity-mapped PostgreSQL runtime role. The initial hyphenated name did not satisfy the grant helper's identifier validation; renamed that newly created role to `slsea_runtime`, preserving its identity mapping, then applied restricted grants. Rotated private credentials for three analyst roles and two devices without changing historical readings.
- Added explicit Azure Linux dependency-install staging mode (commit `ab0a7f7`). Four release tests, TypeScript validation and build passed for that packaging change. The earlier 182 unit/HTTP and 106 integration results remain prior evidence; the full suite was not rerun against this deployment database.
- Deployed a whitelisted compiled ZIP. Azure's Linux build installed locked production dependencies and verified runtime imports on Node 24.18.0. The upload CLI returned HTTP 504 while the backend continued; subsequent deployment polling confirmed status 4/complete. Did not duplicate the upload or increase the pricing tier.
- Public checks passed: readiness, Swagger/OpenAPI, authenticated hierarchy/history/summary, 401, ETag/304, If-Match/412, provincial/district boundaries and outside-scope 404s. Device reads, another device's writes and analyst writes returned 403. One historical synthetic reading returned 201 and canonical Location/GET; repeat POST returned 409. Count increased from 134,600 to 134,601.
- Restarted the actual Web App, obtained a new analyst token and verified readiness, an identical saved reading and unchanged count. Dataset freshness is not claimed: historical summaries correctly report incomplete current power coverage.
- Final firewall inspection used `--server-name` after incorrect name aliases were rejected. Verified 14 individual-address rules, complete coverage of the 13 current outbound addresses, no allow-all-Azure rule, and no owner/migration settings in the runtime. Private credentials remain ignored and mode 0600.
- Evidence: [deployment](../evidence/AZURE_WEBAPP_VERIFICATION.json), [runtime grants](../evidence/AZURE_RUNTIME_GRANTS.json), [smoke](../evidence/AZURE_HTTP_SMOKE.json), [remote read/write/restart](../evidence/AZURE_HTTP_E2E.json). Updated the runbooks to distinguish actual deployment from historical database-only snapshots.
- Student checkpoint: demonstrate Swagger login and jurisdiction boundaries; explain database managed identity versus API JWT, immutable ingestion/duplicates, persistence across restart, the two release modes and stale versus fresh telemetry. Next: fresh demonstration data, lecturer clarification of mutable-resource CRUD, student-authored report/declaration and viva preparation. No report authorship, signature, invitation, remote CI or recovery drill is claimed.

## Entry 016 — Fresh synthetic Azure demonstration data

- Date: 25 September 2026; tool: Codex. User asked to complete the fresh-data and CRUD next steps. Used the existing explicit owner-only synthetic catch-up command; no application code changed.
- The first connection timed out. Compared the current public IP with the existing developer firewall rule and found a mismatch; updated only that single-address rule. Public readiness remained healthy. Resumed the catch-up without deleting or replacing data.
- Catch-up appended 603,599 observations for 200 installations through 2026-09-25T05:00:00Z (10:30 Asia/Colombo), reaching 738,200 readings. Public checks of all 25 districts confirmed complete power and energy coverage, zero stale installations, zero missing midnight baselines and zero invalid counters. This is synthetic point-in-time coverage, not real telemetry or an automatically maintained feed. See [freshness evidence](../evidence/AZURE_FRESHNESS.json).
- SQL verification also confirmed aligned, gap-free histories for all 200 installations and preservation of the earlier HTTP-created reading; see [history coverage](../evidence/AZURE_HISTORY_COVERAGE.json).
- Updated the Azure refresh instructions, requirement status and submission checklist. No full application test rerun was necessary for data/documentation operations.
- User said they have lecturer guidance, then said they have a document to upload. Requested the attachment and left the mutable-resource/principal decision pending its contents; did not adopt the proposed maintenance role or claim lecturer approval.
- Student checkpoint: explain why explicit catch-up preserves history, why 15-minute slots and midnight baselines matter, why coverage expires, and why HTTP CRUD must follow the lecturer's clarification.

## Entry 017 — Recheck supplied assessment documents

- Date: 25 September 2026; tool: Codex. Student clarified that the original brief and rubric are the complete guidance and were already supplied. Reread all nine brief pages and seven rubric pages directly from the supplied PDFs using local PDFKit text extraction.
- Corrected the mistaken expectation of another lecturer document in the project plan and requirement notes. Brief p4 requires append-only GenerationReading; brief p5 asks for create/retrieve/update/delete semantics; rubric p3 requires full write-path CRUD. Neither document identifies a mutable alternative or explicitly authorizes a maintenance principal.
- Retained the installation-metadata/maintenance-role proposal as an unapproved design interpretation, without claiming that it automatically satisfies the rubric. No runtime, permissions, database records or deployed resources changed. Documentation whitespace checked; application tests were not rerun for this correction.

## Entry 018 — Installation metadata lifecycle

- Date: 28 September 2026; tool: Codex. Student asked to resume completion. Implemented the stated maintenance-principal/installation-metadata interpretation of D1, documenting that the supplied PDFs do not explicitly select this resource or role and that lecturer acceptance is unconfirmed.
- Added migration 004, owner-only private maintenance credential provisioning, a distinct maintenance JWT kind/scope and protected metadata endpoints. Full PUT requires all metadata fields and If-Match; row/advisory locks evaluate preconditions atomically with updates/deletion. Identical PUT retains its representation; DELETE is limited to assets without readings. Credential fields remain outside HTTP metadata.
- Retained immutable meter/substation identity and readings, guarded historical commissioning dates, and invalidated old device tokens when active status changes. Runtime metadata grants are explicit, optional and column-restricted; users and credential hashes stay outside runtime writes.
- Verification: typecheck/build passed, 188 unit/HTTP tests and 117 real PostgreSQL integration tests passed. A temporary PostgreSQL helper was installed outside project dependencies after the previous test instance was removed. Sandbox socket restrictions caused the initial HTTP failures; outside-sandbox checks passed. PostgreSQL's RESTRICT violation used code 23001; repaired conflict mapping and reran the full integration suite.
- Student checkpoint: explain the assessment ambiguity and chosen extension, strong ETags/preconditions, replacement versus partial update, repeat DELETE semantics, why retained-history deletion fails, and why per-device credential revocation must survive reactivation. No report prose, signature, lecturer approval or collaborator invitation is claimed.

Entry 018 deployment continuation: corrected the changed developer-IP firewall rule to the new single address, applied only migration 004, configured reviewed column grants and created a private maintenance principal in an ignored mode-0600 file. Published release 90de19f to the existing Web App without new resources. Deployment reported status 4/complete; public CRUD/conditional/authorization tests passed, including rejection of retained-history deletion and removal of the temporary asset (inventory 200 before/after). Evidence records migration, artifact hash, SQL grants and HTTP checks. Existing historical data remains synthetic; freshness must be renewed before a later demonstration.

Entry 018 final verification: post-deployment read-only smoke passed, and owner SQL confirmed all 738,200 readings and 200 seeded installations persisted after the temporary CRUD asset was removed. No synthetic refresh was rerun during the CRUD increment: the latest stored cutoff is still 25 September 2026 and current summary coverage correctly reports stale/incomplete. Renew the explicit demo data before marking; do not label this result current telemetry.

## Entry 019 — Repository organization and publication privacy

- Date: 28 September 2026; tool: Codex. User requested clearer folders, removal of unnecessary files and a push to their GitHub repository with private files protected.
- Grouped documentation into design, Azure operations, development and coursework folders; retained dated evidence and added indexes. Shortened the root README and moved the detailed setup/reference material into the development guide. Updated relative links and public template references. Preserved source modules, migrations, tests and genuine incremental history.
- Removed only ignored, reproducible dist/release output; retained dependencies and all private environment files. Build recreates compiled output. Set existing private environment files to mode 0600; added Git/Docker exclusions for local secrets, publishing profiles and keys, with public examples retained. Shared VS Code settings hide generated/local credential files for easier navigation.
- Added a public-file guard to npm scripts and CI. The guard checks tracked paths/common credential formats without printing values. Tested acceptance of the public template and rejection of private configuration, publishing profiles and a synthetic token format in isolated temporary Git repositories.
- Before publication, scanned 281 historical blobs and public working files for current private values, and checked history for private/generated paths: no matches found. This targeted scan does not guarantee detection of every unknown credential format.
- Public repository publishing and final local checks are recorded after their actual results; no forced history rewrite, credential disclosure or collaborator invitation is part of the cleanup.

Entry 019 validation: all documentation links resolved; public-file guard passed for 130 tracked files; private environment permissions verified. Typecheck, 188 unit/HTTP tests and compiled build passed. No application logic or schema changed, so the database integration suite was not repeated. The remote main branch is an ancestor of the local history; the cleanup can use a normal push without rewriting remote commits.
