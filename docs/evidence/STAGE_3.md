# Stage 3 verification record

Date: 22 September 2026. Scope: deterministic foreign-key-consistent seed data.

## Implemented

- A fixed generator version, random seed and reference instant.
- Synthetic Sri Lankan geographic hierarchy: 9 provinces, 25 districts and one substation per district.
- Eight installations per substation: 200 total, each with a unique meter identifier and positive capacity.
- 673 readings per installation at a fixed 15-minute interval, inclusive of local midnight boundaries across seven days: 134,600 readings total.
- Daylight-shaped power, zero overnight power, plausible voltage and nondecreasing cumulative energy.
- One national, nine provincial and 25 district analyst user records. These have placeholder credential hashes until the authentication stage; no usable credentials are published by this seed.
- A seed manifest storing the generator version, checksum, reference timestamp and expected counts.

## Actual checks

| Check | Result |
| --- | --- |
| Dataset unit checks | 5 passed: determinism, cardinality, hierarchy, interval/history, diurnal profile and user scopes |
| Full `npm run check` | 100 tests passed, strict typecheck passed and production build passed |
| PostgreSQL integration suite | 66 tests passed; included a fresh 134,600-reading seed and a repeat seed in an isolated schema |
| Built CLI validation database | Migration applied both schema files; first seed returned `seeded`; second returned `already-seeded`; final counts were 9 / 25 / 25 / 200 / 134600 with one manifest |

The validation database was separate from all other work and was removed after its checks. The integration seed test creates/removes only a unique test schema.

## Seed behavior

`npm run db:seed` uses `MIGRATION_DATABASE_URL`, not the restricted runtime application login. It runs inside one transaction. A new empty domain is populated and then gets its manifest. A matching repeat run verifies every expected count and does no writes. A database that has domain rows without the expected manifest, a different generator checksum or missing rows stops with an error instead of being blended or reset.

The generator's fixed historical cutoff is 25 August 2026 at local midnight (`2026-08-24T18:30:00Z`). This makes the seed reproducible and gives daily-energy calculations reliable midnight baselines. It is not current telemetry: before assessment deployment, Stage 5/9 work must append an up-to-date demonstration reading sequence or use the documented `as-of` view so the API does not claim the old seed is live.

## Next scope

Stage 4 adds JWT bearer authentication, credential setup and jurisdiction-scoped hierarchy reads. The runtime database login can read all domain data by design, so it does not substitute for per-request installation ownership or provincial/district authorization.
