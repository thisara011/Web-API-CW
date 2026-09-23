# Stage 8 — district generation summaries

Date: 23 September 2026. Local implementation and tests; public deployment remains pending. Stage 7's CRUD interpretation is still open.

## Contract

`GET /districts/{districtId}/generation-summary?as-of={instant}` requires an active analyst with `installation:read` and an appropriate national/province/district jurisdiction. Hidden and nonexistent districts both return 404. The optional cutoff is inclusive, timezone-qualified and never future; it defaults to the current 15-minute slot start. Unknown/repeated parameters, bad UUIDs and invalid cutoffs return 40002.

The response includes district metadata, UTC `asOf`/`dayStart`, local date, `Asia/Colombo`, a 30-minute freshness threshold, two measured subtotals, coverage counts/completeness flags and bounds of contributing latest observation times. It excludes installation secrets and individual histories.

One scoped SQL statement selects each current installation's latest observation at/before cutoff and exact local-midnight baseline, then computes the aggregates. Counts and totals therefore share the same database snapshot; there is no HTTP or sequential application query per installation. SQL NUMERIC arithmetic is performed before the final JSON-number conversion.

## Hand-calculated evidence

| Case | Expected result |
| --- | --- |
| Two midnight counters 100 and 250, latest 104.5 and 253, fresh powers 2 and 3 | 7.5 kWh energy, 5 kW power, complete coverage |
| One fresh with baseline, one stale with baseline, one fresh without baseline, one without cutoff observations | Fresh-only power subtotal, two-site energy subtotal, incomplete coverage and explicit missing/stale counts |
| Latest at exactly cutoff minus 30 minutes | Fresh; one millisecond older is stale |
| Fresh night-time power of zero | 0 kW; absence of fresh data instead returns null |
| Cutoff exactly at Asia/Colombo midnight | Zero energy delta with a usable baseline; local day differs from UTC day |
| Empty district or no usable energy contributors | Null totals and false completeness, never fabricated zero generation |
| Imported latest counter below midnight baseline | Excluded from energy with invalid-counter count; no negative generation |
| Only observations after cutoff | No-reading count at that cutoff |

Energy coverage means every installation has a usable midnight baseline and counter. It does not guarantee freshness: stale energy contributors and oldest/newest observation times remain visible. Sites with only previous-day observations have no local-day baseline and do not contribute energy.

## Authorization and cache verification

Tests cover national/province/district access, sibling and other-province denial, missing identities, revoked users and device denial. Matching conditional headers never bypass these checks. The shared conditional helper supplies private/no-cache, Vary, strong ETags, bodyless 304, 412 and HEAD behavior. Unsupported writes return 405 with Allow.

A clock-injected HTTP test advances from 06:44:59.999Z to 06:45:00Z: the default cutoff moves from 06:30 to 06:45, a previously fresh observation becomes stale, and its old ETag returns 200 with changed coverage. Historical-cutoff tests add a midnight baseline or another contributor and verify tag invalidation; post-cutoff observations leave that replay unchanged. No Last-Modified is invented from receipt times for the time-dependent aggregate.

## Actual verification

Final verification on 23 September 2026:

| Check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, 167 unit/HTTP tests in 9 files including Swagger validation, and production build |
| `TEST_DATABASE_URL=… npm run test:integration` | Passed: 101 PostgreSQL tests in 6 files |
| `git diff --check` | Passed |

The full-seed check passed at its final local-midnight boundary: eight Colombo installations, eight fresh measurements, 0 kW and 0 kWh with complete coverage. The initial run had 100 PostgreSQL tests before this additional full-seed test.

The PostgreSQL suite uses the existing local PostgreSQL 18.4 test service, isolated schemas and a SELECT/INSERT-only runtime role for summary HTTP queries. Test fixtures and roles are removed at teardown. No new Stage 8 migration is required. Docker/PostgreSQL 17 CI and public HTTPS verification were not run here.

## Limits and next work

The inventory denominator is the currently stored district inventory, including inactive installations. `as-of` replays observation time using data currently stored; it does not reconstruct historical asset membership or the earlier receipt-time database state. Late backfill can therefore change historical summaries. Stale seed data is not described as live generation. No national-scale latency claim is made.

Next work is the remaining API contract audit and deployment preparation. Actual deployment needs a chosen host/account; production secrets and rate limiting remain to be prepared. Mutable CRUD still requires the documented lecturer clarification. Report text, declaration and viva explanation remain student responsibilities.
