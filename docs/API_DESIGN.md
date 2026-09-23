# Proposed API contract

Status: this document retains the original target design; `openapi/openapi.json` is the implemented contract through Stages 1–6 and 8. The following deliberate differences reconcile the running Stage 4 API and the Stage 5 endpoint surface discussed with the student:

- Current base path is `/`, with `/auth/token`, `/substations`, `/installations/{id}/latest-reading`, and canonical `/readings/{readingId}`. The original table below proposes `/solar/v1.0`, `/auth/tokens`, `/grid-substations`, `/last-known-reading`, and nested reading identity. A version-prefix/naming migration requires a separate coordinated change; these alternate URLs are not advertised as implemented.
- Analysts currently use `geography:read` and `installation:read` together with national/provincial/district attributes; devices use `readings:write` and a bound installation identity. Every protected request rechecks stored activity, credential version and (for analysts) jurisdiction. JWT verification requires expiry and issued-at claims, configured issuer/audience, HS256 and JWT type.
- Stage 5 implements numeric measurements (up to three decimal places), timezone-qualified timestamps with seconds and up to three fractional digits, Unix epoch/commissioning lower bounds, and five-minute future tolerance. It serializes counter validation and insertion per installation in a READ COMMITTED transaction. A late observation must fit both neighbours; equal counters are allowed. Counter conflicts return 40902, repeated timestamps 40901.
- The composite remains `/installations/{id}/overview`; `/installations/{id}` remains atomic metadata. The overview has `installation`, `hierarchy`, and nullable `lastKnownReading`. Reading GETs return JSON numbers and UTC timestamps.
- POST returns 201, Location, Content-Location, the canonical immutable reading ETag and receipt-based Last-Modified. Stage 6 implements `/readings` and `/installations/{id}/readings` GET history with strict region/time filters, stable timestamp/UUID sorting and `{data,count,offset,limit,next,previous}` pages in one REPEATABLE READ snapshot. Offset is bounded to 2,147,483,647 and limit to 100. Conditional GET/HEAD applies only after authorized retrieval. GET reading resources support HEAD/OPTIONS and reject mutation with 405/Allow; the ingestion/history collection also permits POST.
- Shared ETag handling covers current hierarchy, collection, atomic, composite and latest resources. Mutable tags include selected URI and jurisdiction plus body; immutable reading tags are representation-only and match POST. Last-Modified is receipt-based for readings/latest/history (omitted for empty history); overview dates also track metadata via migration 003. Hierarchy directories omit Last-Modified because there is no complete membership-change clock. Date-only 304 is limited to immutable atomic readings; millisecond comparisons remain conservative. Mutable views use ETags to avoid date ambiguity from same-second changes and delayed commits. If-Match takes precedence over If-Unmodified-Since, and If-None-Match over If-Modified-Since. Malformed entity-tag lists return 400; invalid date headers are ignored.

JSON property names use camelCase. The unresolved CRUD interpretation remains separate from immutable readings.

## 1. Principals and authorization

| Principal | Token scope | Permitted business operations |
| --- | --- | --- |
| Installation device | `installation-write` plus server-issued installation identity | POST readings for its own installation only |
| National user | `analyst-read-national` | Read all seeded jurisdictions |
| Provincial user | `analyst-read-province` plus one assigned province | Read that province and its descendants |
| District user | `analyst-read-district` plus one assigned district | Read that district and its descendants; minimal ancestor metadata for navigation |
| Maintenance principal | Not part of the confirmed brief | No access implemented until the D1 interpretation is settled |

JWTs include a subject, principal type, issuer, audience, issued/expiry times and scopes. Obtain tokens through credential-verified `POST /auth/tokens`; the server derives scopes and jurisdiction from stored identity, never from a caller's chosen role. Use separate validated request shapes for user and installation credentials. Hash secrets; keep signing keys and real test credentials out of Git. Choose a maintained JWT library, allow only the configured algorithm, and validate issuer/audience and token type as well as the signature. [JWT best current practices](https://www.rfc-editor.org/rfc/rfc8725.html).

Tokens are short-lived; check the current user's active jurisdiction or credential version so reassignment/revocation is not solely delayed until expiry. A device is not a User row. OpenAPI and basic health responses are public; business resources require authentication. Publicly reachable HTTPS does not mean anonymous access to telemetry.

Apply authorization before reading resource contents or evaluating conditional headers. Every query intersects the authenticated jurisdiction with requested filters **before** counting, paging or aggregating. Validate nested ownership in the same scoped query. Never retrieve all rows and filter them only in application memory.

Use `401` plus `WWW-Authenticate: Bearer` for missing/invalid credentials, `403` for a valid principal without the operation scope, and a consistent `404` for resources outside a reader's visible jurisdiction. Authorized collections with no matching rows return an empty page. For hierarchy navigation, district users can see their province's identifier/code/name; this does not grant province-wide reads. Ancestor collections, totals and linked descendants remain limited to the assigned district. Nonexistent and hidden resource responses must not reveal credentials or foreign data.

## 2. Resource surface

All paths below are relative to the base path. `{id}` is a placeholder for the corresponding resource's identifier, not a literal route segment. Explicit named path parameters will be used in OpenAPI.

| Method | Path | Resource / purpose | Access |
| --- | --- | --- | --- |
| POST | `/auth/tokens` | Credential exchange returning a scoped access token; 200, no-store | Valid credentials |
| GET | `/provinces` | Visible province collection | Analyst |
| GET | `/provinces/{id}` | Atomic province | Analyst |
| GET | `/provinces/{id}/districts` | Districts scoped to one province | Analyst |
| GET | `/districts` | District directory within caller scope, optionally filtered by province | Analyst |
| GET | `/districts/{id}` | Atomic district | Analyst |
| GET | `/districts/{id}/grid-substations` | Substations scoped to a district | Analyst |
| GET | `/grid-substations` | Authorized grid directory, optionally filtered by region | Analyst |
| GET | `/grid-substations/{id}` | Atomic substation | Analyst |
| GET | `/grid-substations/{id}/installations` | Installations scoped to a substation | Analyst |
| GET | `/installations` | Asset directory with province/district/substation filters | Analyst |
| GET | `/installations/{id}` | Atomic installation metadata | Analyst |
| GET | `/installations/{id}/overview` | Composite: installation, safe hierarchy metadata and last-known reading | Analyst |
| GET | `/installations/{id}/last-known-reading` | Latest observation for the site, computed from history | Analyst |
| GET | `/installations/{id}/readings` | Paginated historical subcollection | Analyst |
| GET | `/installations/{id}/readings/{reading-id}` | Canonical atomic reading | Analyst |
| POST | `/installations/{id}/readings` | Append a reading for the authenticated installation | Owning device |
| GET | `/readings` | Regional analytical collection, with jurisdiction/time filters | Analyst |
| GET | `/districts/{id}/generation-summary` | Derived district power/energy snapshot | Analyst |

Root directories support national and regional discovery; nested collections express parent membership. The root `/readings` collection has a specific cross-installation analytical use, so it is justified independently of a device's scoped write collection. Keep one canonical atomic URI for each reading under its installation, including in POST Location headers.

The overview excludes an unbounded reading history. It includes `lastKnownReading: null` if no observations exist; the standalone last-known-reading resource returns `404` in that case. Its latest row is determined by observation timestamp, not arrival order. Devices receive the created representation in the POST response but do not gain analyst GET access merely because a Location is returned.

Possible D1 management extension, **not yet part of the accepted surface**: POST on a substation's installation collection, GET/PUT/optional PATCH/DELETE on the canonical installation URI with a separate management scope. PUT replaces the complete writable metadata representation; identity, credentials, geographic ownership and readings are excluded from writable metadata. Deletion of a site with history fails with a conflict, and an empty-site fixture demonstrates successful deletion. Specify the permission model and any additional token issuance before implementing this extension.

## 3. Reading representation and ingestion

Example request to `POST /installations/{id}/readings`:

```json
{
  "timestamp": "2026-09-21T06:30:00Z",
  "powerKw": 3.42,
  "cumulativeEnergyKwh": 1267.84,
  "voltage": 231.2
}
```

The URL and authenticated identity determine the owner. Reject caller-supplied installation ownership, unknown fields, timezone-less timestamps, non-finite/out-of-range measurements and observations beyond the documented clock-skew tolerance (proposed: 5 minutes). Document numeric precision and accepted historical backfill in OpenAPI.

Successful creation returns `201`, a JSON reading containing its generated ID and installation ID, `Location` pointing to the canonical resource, `Content-Location` if the response contains that representation, `ETag`, and `Last-Modified` based on server receipt/creation time. Server-generated IDs and receipt times are not accepted from devices.

Enforce one reading per installation/timestamp. A repeat timestamp returns `409` using the standard error contract, whether identical or conflicting; it never inserts a second reading or silently rewrites history. Document this explicit retry behavior instead of claiming POST is generally idempotent. Concurrent duplicates must be stopped by a database unique constraint.

Allow delayed readings only when their cumulative counter fits the immediately preceding and following observations in event-time order. Serialize this validation per installation inside a database transaction to prevent simultaneous inserts from bypassing it. Counter resets/meter replacement are an explicitly unsupported first-version case; reject inconsistencies instead of inventing generated energy. A separate authorized lifecycle design would be needed for resets.

## 4. Query and collection contract

Example regional query:

```text
GET /solar/v1.0/readings?district-id={district-id}&from=2026-09-14T00:00:00%2B05:30&to=2026-09-21T00:00:00%2B05:30&sort=-timestamp&offset=0&limit=25
```

| Parameter | Contract |
| --- | --- |
| `province-id`, `district-id`, `substation-id` | Optional exact filters on regional collections; ANDed with each other and the caller's scope |
| `installation-id` | Optional narrowing on the regional readings collection |
| `from`, `to` | ISO 8601 instants with timezone; use `[from, to)`; when both exist, `from < to` |
| `sort` | `timestamp` ascending or `-timestamp` descending; default descending |
| `offset` | Nonnegative integer; default 0 |
| `limit` | Integer 1–100; default 25 |

Use a deterministic ID tie-breaker in the same direction as timestamp for readings across installations. Reject malformed IDs, unsupported sort fields and invalid limits with `400`. Each collection documents its supported filters and ordering; hierarchy directories use a stable name/ID order. Do not interpolate user-provided identifiers or sort expressions into SQL.

Example page shape (illustrative empty collection):

```json
{
  "data": [],
  "count": 0,
  "offset": 0,
  "limit": 25,
  "next": null,
  "previous": null
}
```

`count` is the total authorized, filtered rows, not this page's length. Links retain filters, ordering and limit. A valid empty result or offset beyond the end returns `200` with an empty array. Use a consistent database snapshot for the count and data within a response. Offset pages can shift between requests during ingestion; document this limitation and support a fixed `to` bound for reproducible demonstrations. A time bound limits newly timed observations but cannot exclude subsequently received historical backfill; snapshot cursors are a future improvement.

## 5. HTTP behavior and errors

| Status | Concrete planned use |
| --- | --- |
| 200 | Successful reads, token exchange and agreed updates |
| 201 | A new reading or agreed management resource, with Location |
| 204 | Successful management deletion if D1 is accepted; no response body |
| 304 | Authorized conditional GET whose selected representation is unchanged; no body |
| 400 | Malformed JSON, invalid fields/parameters/time windows |
| 401 | Missing/invalid/expired bearer credentials, with challenge header |
| 403 | Valid identity lacks the operation scope |
| 404 | Missing or jurisdiction-hidden resource, or missing last-known reading |
| 405 | Unsupported methods, including reading PUT/PATCH/DELETE, with Allow |
| 406 | Requested response media types do not accept JSON |
| 409 | Duplicate reading or mutation conflicting with retained history |
| 412 | Failed `If-Match` on an existing retrievable resource or an agreed conditional mutation |
| 415 | Unsupported request Content-Type |
| 429 | Exceeded documented request/authentication rate limit |
| 500/503 | Sanitized unexpected failure / unavailable dependency |

All response bodies use JSON where applicable. Parse Accept with quality values and wildcards; `application/json;q=0` is not acceptable when no more-specific acceptable JSON range applies. `204` and `304` have no JSON envelope. Use one error shape for application errors, including parser/middleware errors:

```json
{
  "error": {
    "code": 40001,
    "message": "Request validation failed",
    "details": [{ "field": "powerKw", "message": "Must be nonnegative" }],
    "requestId": "example-request-id"
  }
}
```

Maintain a documented numeric application-code registry, matching the candidate white paper's error-code type. Request IDs aid debugging; neither stack traces nor credentials appear in responses. Proxy/platform-generated errors may require host configuration to match the application's JSON contract; verify this in deployment.

Derive ETags from stable serialized representations including their selected scope, filters, order, page and linked data. Do not put a new current-time field into ordinary responses, since that would defeat unchanged-resource validation. Track representation changes, including related data and collection membership, for Last-Modified; observation time alone is insufficient for late-arriving readings. All validators must respect the same authorization and query boundaries as the response body.

Conditional requests use HTTP precondition ordering. In particular, matching `If-None-Match` on GET returns bodyless `304`; a nonmatching `If-Match` returns `412`; `If-None-Match` takes precedence over `If-Modified-Since`. Support quoted tags, lists and wildcard behavior through tested code. Use a correct Last-Modified timestamp and handle its one-second resolution conservatively. The conditional GET `If-Match` scenario provides legitimate 412 evidence while the mutable-resource decision remains open; it does not satisfy CRUD by itself. [HTTP conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-13).

Use `Cache-Control: private, no-cache` for authenticated reads and appropriate Vary fields for representation/authentication handling; tokens use `no-store`. Return validators on applicable responses, including `304`. A cache hit never bypasses authentication or scope checks.

## 6. District summary semantics

Implemented in Stage 8 at the root path `/districts/{districtId}/generation-summary`. OpenAPI defines the complete response. `measuredPowerKw` is the fresh subtotal; `energyTodayKwh` is the baseline-qualified subtotal. Freshness threshold is inclusive at 30 minutes. Empty districts have null totals and false completeness flags. Energy completeness means baseline/counter coverage, not freshness; `staleEnergyInstallations` and observation bounds distinguish those.

All installations in the currently stored district inventory are included, even if device authentication is disabled. Historical replay is not an asset-lifecycle reconstruction or an audit of what data was known at the cutoff; later backfill can alter a replay. `invalidCounterInstallations` excludes imported latest counters below midnight baselines. The API ingestion path already rejects counter decreases, but the summary does not silently report negative generation from inconsistent administrative imports.

ETags use the complete body (including cutoff and coverage) plus the selected URI/jurisdiction. Date validators are omitted because time-dependent freshness and inventory membership are not described by a latest receipt time. The following planned semantics are now implemented:

`GET /districts/{id}/generation-summary?as-of={instant}` returns derived state at a cutoff. With no explicit cutoff, use the start of the current 15-minute slot; return that `asOf` and `Asia/Colombo` so the snapshot's timing is visible and cacheable. Reject future cutoffs. The resource is an aggregate snapshot, not a promise of continuous meter connectivity.

- **Current measured power:** find the most recent observation at or before the cutoff for each district installation. Sum only observations no more than 30 minutes older than the cutoff. Return total/fresh/stale/no-reading installation counts and `powerCoverageComplete`. When coverage is incomplete, the number is an explicitly labeled measured subtotal, not a complete district total. If no fresh readings exist, use `null` for power rather than claim zero measured generation.
- **Today's energy:** determine local midnight for the cutoff. For each installation, subtract its cumulative reading at midnight from its most recent cumulative reading between midnight and the cutoff. Never sum cumulative readings across time. Require an exact midnight baseline in this first version; missing baselines mean incomplete coverage, not an assumed zero counter.
- **Coverage:** expose the number of installations contributing energy and their oldest/latest observation times. `energyTodayKwh` is a documented subtotal over usable baselines and observations, with `energyCoverageComplete` and stale counts. If none qualify, return `null`. Even with complete installation coverage, readings may lag the cutoff; the measurement bounds must be visible.
- **Examples:** two counters changing from 100 to 104.5 and 250 to 253 yield 7.5 kWh of observed day energy. If their fresh powers are 2 and 3 kW, the current sum is 5 kW. A missing or stale installation changes coverage rather than silently contributing invented data.

Perform scoped SQL aggregates in a consistent database snapshot; avoid per-installation HTTP calls or hundreds of sequential queries. Test midnight exactly, no readings, stale data, missing baselines, late arrivals, multiple equal timestamps across different installations and hidden districts. Include the cutoff/time bucket and all contributing changes in cache validators so time-dependent freshness does not return an incorrect `304`.

## 7. Operational surface

Plan public `/health/live`, `/health/ready`, `/docs` and `/openapi.json` routes outside the business base path. Liveness reports process health; readiness checks database connectivity without exposing connection details. Swagger describes bearer security, every accepted parameter/body, responses and examples; include failed requests and cross-jurisdiction demonstrations as well as happy paths.

Stage 1 implements these public routes. Its OpenAPI describes only available operations and does not yet claim bearer security. Liveness and readiness always evaluate health, ignore conditional caching headers and return `Cache-Control: no-store`; business-resource validators remain a Stage 6 capability. The error registry currently uses 40001 (invalid body), 40401 (not found), 40501 (method), 40601 (Accept), 41301 (body too large), 41501 (body format/encoding), 50001 (unexpected failure), and 50301 (not ready).

Provide a script-based device simulator and curl examples for demonstration, not a client application. Use environment-supplied demo credentials and document secure marker access. Finish with a remote smoke sequence: readiness → docs → tokens → scoped hierarchy → history → conditional GET → own-device append → authorized latest read → district summary → forbidden request.
