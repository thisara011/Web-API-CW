# Stage 4 verification record

Date: 22 September 2026.

## Delivered behavior

- `POST /auth/token` verifies a stored scrypt hash and returns a 15-minute bearer JWT.
- Analyst tokens contain an operation scope plus national, province or district jurisdiction attributes.
- Device tokens contain only `readings:write`; hierarchy routes require `geography:read` and reject them with `403`.
- Public health and OpenAPI endpoints remain available without a bearer token.
- Every hierarchy query applies the analyst's jurisdiction as a SQL condition. A request outside scope returns `404`, avoiding confirmation that an out-of-scope resource exists.

## Actual validation

| Command | Result |
| --- | --- |
| `npm run check` | Passed: TypeScript, 103 unit/HTTP tests and production build. |
| `TEST_DATABASE_URL=… npm run test:integration` | Passed: 69 PostgreSQL tests. |

The integration tests migrated and seeded an isolated schema, issued a national analyst token and read all nine provinces, then issued a Colombo district token and saw only Western Province. It verified a Central Province atomic resource is inaccessible to that district token, and that devices, absent bearers, forged tokens and invalid credentials are denied.

## Local demo credentials

These are deliberately public local fixtures only: `analyst-national@slsea.example` with `Coursework-Demo-Password-2026!`, or `SLSEA-COL-001` with `device-SLSEA-COL-001`. Replace them and set a unique `JWT_SECRET` before deployment.
