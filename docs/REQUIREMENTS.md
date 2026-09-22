# Requirements and evidence matrix

Status key: **Planned** means not implemented or verified. **Open** means a decision or external input remains unresolved. All page numbers refer to physical pages in the supplied PDFs. B = coursework brief; R = marking rubric.

## Marking dimensions

| Dimension | Marks | Evidence to produce | Stages | Status |
| --- | ---: | --- | --- | --- |
| Architecture and data model | 15 | Independent conceptual model; five-entity hierarchy plus User; append-only time series; meter attribute; separated read/write responsibilities | 0–3 | Planned |
| API design | 20 | Atomic/collection/composite/derived resources; scoped noun URIs; correct HTTP methods, statuses, validators and JSON | 4–8 | Planned |
| Coverage | 15 | Entire required surface; analytical controls; agreed CRUD; working district summary | 4–8 | Planned; CRUD open |
| Implementation with generated code | 10 | Coherent code; actual review/repair records; prompt and AI-aid disclosure; student explanation | Every stage | Foundation code and review log started |
| Functionality against seed data | 5 | Every endpoint exercised against valid seed plus deliberate edge cases | 3–10 | Planned |
| Deployment and operation | 10 | Public HTTPS, live Swagger, incremental history, shared repository | 1, 9–10 | Planned |
| Security and authentication | 15 | JWT bearer scopes; installation-only writes; jurisdiction reads without leakage; HTTPS; scope/attribute tradeoff explanation | 4–10 | Planned |
| Report quality | 10 | Student-authored justification, Level 2 analysis, evaluation, declaration and disclosure | 10 | Planned |
| Total | 100 | The viva validates these marks; it is not an extra weighted component | | |

## Traceable capabilities

| ID | Requirement | Source | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| M01 | Model hierarchy and User before implementation | B p4; R p2 | ER diagram agrees with migrations and FK tests | Schema implemented; hierarchy/FK tests pass |
| M02 | Meter/inverter identifier is an installation attribute | B p4; R p2 | No separate Device domain entity | Implemented on installation; unique meter constraint tested |
| M03 | Readings are an append-only historical entity | B p4; R p2 | Retained history; API/runtime DB reject mutation | Database triggers/privileges tested; business API pending |
| M04 | Reading carries installation, timestamp, kW, cumulative kWh, voltage | B p4 | Schema and OpenAPI validations | Schema implemented and tested; business OpenAPI pending |
| D01 | 9 provinces and 25 districts | B p5 | Seed verifier and authoritative mapping reference | Planned |
| D02 | At least 20 substations and 200 installations | B p5 | Plan uses 25 substations and 200 installations; FK audit | Planned |
| D03 | At least a week per installation at a fixed reporting interval | B p5 | Per-installation count/time-span verification and seed manifest | Planned |
| D04 | Plausible day/night shape | B p5 | Inspect daytime/nighttime samples and counter progression | Planned |
| A01 | Atomic and collection hierarchy resources, with appropriate nesting | B p5; R p2 | Scoped HTTP examples and parent mismatch tests | Planned |
| A02 | Installation composite resource | B p5; R p3 | Overview contains site, hierarchy and most recent reading without full history | Planned |
| A03 | Last-known-reading derived resource | B pp5–6 | Latest by observation timestamp; handles absent history | Planned |
| A04 | Per-installation readings subcollection and atomic read | B p5 | Historical page and Location target retrieval by authorized analyst | Planned |
| A05 | Device ingestion creates a resource using correct method and headers | B p5; R p2 | POST returns 201, Location, JSON and validators | Planned |
| A06 | Full CRUD on an appropriate writable resource | B p5; R p3 | Agreed mutable resource; real create/read/update/delete tests | Open: D1 |
| A07 | Consistent nouns, lowercase/hyphens, plural collections | R p2; B p9 | OpenAPI path audit against model and guideline differences | Planned |
| A08 | Correct update/idempotency semantics | B p5; R p2 | PUT complete replacement if adopted; explicit partial-update contract; repeat-request checks | Open: D1 |
| A09 | Deliberate 200, 201, 400, 404, 406 and 412 | B p9; R p2 | Positive and negative integration scenarios | Planned |
| A10 | Location, ETag, Last-Modified and Content-Type | B p9; R p2 | Header assertions on applicable responses | Planned |
| Q01 | Pagination with total count, next and previous links | B p5; R p3 | First/middle/final/empty page checks; filter-preserving links | Planned |
| Q02 | Filtering by province, district, substation and time | B p5; R p3 | Multi-installation analytical queries with authorized regional filters | Planned |
| Q03 | Timestamp sorting ascending and descending | B p5; R p3 | Stable ordering and tie-breaking tests | Planned |
| Q04 | Conditional GET; 304 has empty body | B p6; R p3 | ETag/date tests on atomic, collection, composite and derived responses | Planned |
| Q05 | District generation summary | B p6; R p3 | Verified power and daily-energy arithmetic, coverage and jurisdiction tests | Planned for First band |
| E01 | One client-error body contract with code, message and detail | B p6; R p3 | Validation, parser, auth, not-found and method errors use same schema | Foundation implemented/tested; auth and domain errors pending |
| S01 | Device authenticates as one installation; can only append its readings | B pp3–4,6; R p5 | Wrong installation and analyst-write attempts denied | Planned |
| S02 | National/province/district reads enforce jurisdiction | B pp3–4,6; R p5 | Negative tests for all resources, counts, links, aggregates and cache responses | Planned |
| S03 | JWT bearer with scopes for First-band descriptor | R p5 | Verified signature/claims/expiry, principal type and scopes | Planned |
| S04 | Explain scopes versus finer-grained attribute checks | R p5 | Student traces both operation scope and resource jurisdiction checks | Planned |
| O01 | Public operational deployment over HTTPS | B pp6,8; R p4 | Remote smoke test from public URL with persistent seeded data | Planned |
| O02 | Live OpenAPI/Swagger interface | B p6; R p4 | Live paths, schemas, JWT security and negative examples match behavior | Foundation served locally; business documentation and public deployment pending |
| O03 | Incremental commits and repository shared with module leader | B pp6,8; R p4 | Actual history and confirmed collaborator invitation | Planned |
| I01 | Complete prompt and AI-aid disclosure | B pp1,7; R pp3,6 | Maintained log, appendix assembled from actual activity | Planning and Stages 1–2 log maintained |
| I02 | Critical evaluation of generated output | R p3 | Actual findings, fixes, regression evidence and student explanation | Stages 1–2 findings/repairs recorded; student explanation pending |
| P01 | Report has six required sections and 2250–2750 words | B p7; R p5 | Student-authored final document and word count | Planned |
| P02 | Signed declaration plus AI appendix | B pp6–8; R pp5–6 | Actual signed declaration and complete appendix | Planned |
| P03 | Accurate Level 2 evaluation and Level 3 gap | B pp3,7; R p5 | Concrete deployed resource/method/status examples; honest limitation | Planned |
| V01 | Attend viva and explain every submitted artifact | B pp7–8; R p6 | Stage explanations and rehearsal; attendance | Planned |

## Submission gate

These remain unchecked until actual evidence exists. See brief pp8–9 and rubric p6.

- [ ] Report within 2250–2750 words, containing all six required sections.
- [ ] Signed coursework declaration included.
- [ ] AI-disclosure appendix includes prompts and AI-aid references.
- [ ] Repository shared with the module leader and showing genuine incremental history.
- [ ] Public HTTPS API operational against the required seed at submission time.
- [ ] Live Swagger/OpenAPI URL provided.
- [ ] Seed freshness and authenticated marker access verified.
- [ ] Richardson Level 2 stated and defended accurately.
- [ ] Viva attended; all submitted code and design choices explainable.

No planning artifact, passing local test or target band substitutes for these submission actions.
