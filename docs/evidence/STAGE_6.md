# Stage 6 — historical queries and conditional responses

Date: 23 September 2026. This records local evidence, not public deployment.

## Implemented behavior

- `GET /readings` and `GET /installations/{installationId}/readings` support province/district/substation/installation UUID filters, `[from,to)` observation windows, timestamp sorting, offset and limit. Unknown/repeated/invalid parameters return `40002`.
- Every filter is ANDed with authenticated jurisdiction before count and page selection. Hidden/nonexistent nested parents return 404; regional filters outside scope return an empty page. Empty/beyond-end results remain 200.
- A REPEATABLE READ read-only transaction provides one snapshot for nested parent visibility, count, maximum receipt time and data. Ordering uses timestamp and UUID in the same direction. Links are relative, preserve all validated parameters, and cannot inherit an untrusted Host header.
- Responses use `{data,count,offset,limit,next,previous}`. Limit defaults to 25 and is at most 100; offset defaults to zero and is at most 2,147,483,647. A beyond-end previous link points at the final valid page.
- Current hierarchy and reading GET/HEAD resources use strong SHA-256 ETags. Mutable representations include URL/jurisdiction context; immutable reading tags match their POST representation. Private/no-cache and Vary (Accept, Authorization) accompany successful reads and 304 responses.
- Authorization and ordinary validation/lookup happen before preconditions. Missing, hidden, revoked, wrong-principal and unacceptable-media requests cannot turn into cache hits.

## Conditional policy

Preconditions follow [HTTP evaluation order, RFC 9110 §13.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.2.2): strong If-Match, otherwise applicable If-Unmodified-Since, then weak If-None-Match, otherwise eligible If-Modified-Since. Tag lists, weak tags and standalone wildcards are supported; malformed tag syntax returns 400 and invalid dates are ignored. Failed preconditions return the common 41201 envelope with no-store. A 304 has no response body or Content-Type; HEAD also sends no body.

Receipt times supply Last-Modified for atomic readings, latest and nonempty filtered histories. Overview modification time is the maximum of installation, ancestor and latest-reading receipt times; migration 003 introduces province/district/substation timestamps and update triggers. Existing rows start with migration time, not fabricated earlier modification dates. Directories do not claim a Last-Modified without a complete membership-change clock.

HTTP dates have second precision; stored times retain milliseconds. Date-only 304 is limited to immutable atomic readings and requires the full stored instant to be no later than the supplied date. Mutable views use ETags for 304, avoiding false freshness from same-second edits or late commits. If-Unmodified-Since still rejects known later changes when dates are tracked. This is deliberately conservative; same-second date-only requests may receive 200 even when unchanged. Use ETags for reliable revalidation.

## Verification

Final verification after the OpenAPI/documentation updates:

| Check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, 157 unit/HTTP tests in 8 files (including Swagger validation), and production build |
| `TEST_DATABASE_URL=… npm run test:integration` | Passed: 88 PostgreSQL tests in 5 files, including migration 003 and restricted-role history/conditional workflows |
| `git diff --check` | Passed |

The integration tests cover:

- all region filters and conflicting combinations; national/province/district counts; sibling/foreign filters without leakage;
- timestamp ties in both directions; first/last/beyond-end pages; filter-preserving next/previous links; timezone offsets and exclusive upper bounds;
- absent/empty/hidden nested resources and invalid/repeated query parameters;
- ETag 304 and 412 for atomic/collection/composite/derived/hierarchy resources; HEAD, wildcard/list/weak comparisons and precondition precedence;
- absence of 304 for unauthorized, hidden, revoked, invalid or unacceptable requests;
- page invalidation when a late row arrives outside the selected page, event-time latest behavior, ancestor-name overview invalidation, and deterministic receipt-date cases.

Tests create isolated schemas and a restricted runtime role in the previously provisioned local PostgreSQL 18.4 test service. HTTP queries run with SELECT/INSERT-only domain permissions. Fixtures/roles are removed at teardown. Docker/PostgreSQL 17 CI and remote deployment were not run here.

## Remaining limits and next stage

Offset pages can shift across requests under concurrent ingestion. Fixed from/to bounds do not exclude subsequently received historical backfill. Regional count queries scan the authorized filtered set; no production performance claim is made. Existing hierarchy routes now have ETags; root hierarchy directories/pagination outside the current surface remain a final contract-audit item.

Stage 7's full CRUD interpretation still needs lecturer clarification. Stage 8 district generation summaries can proceed independently, as the plan specifies. Deployment, rate limiting, production secrets, report and viva evidence remain outstanding.
