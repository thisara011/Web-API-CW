# Azure application preparation

Verified on 24 September 2026, against the working changes following `c1084af`. This records application preparation, not a completed Azure deployment.

## Implemented

- Explicit password, Azure CLI and managed-identity database authentication. Azure connections require verified TLS and a passwordless Flexible Server URL with a role name.
- Token acquisition for new pool connections, missing/expired-token rejection and sanitized authentication errors. The real `pg.Client` constructor is tested to retain the callback; parsed URL fields cannot overwrite it.
- Independent administrative authentication configuration. The owner can grant to an already-created runtime identity role without logging in as the Web App. Existing privilege restrictions remain enforced.
- Release staging with a file whitelist, symlink rejection and isolated output directories. CI installs production dependencies on Linux, verifies imports and archives the staged runtime. App Service settings are provided as a template with an intentionally blank signing key.

## Actual verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test -- --maxWorkers=1` | 12 files, 182 tests passed |
| `TEST_DATABASE_URL=<temporary test database> npm run test:integration` | 6 files, 106 tests passed |
| `npm run release:stage` | TypeScript build passed; compiled staging command created a release directory under ignored `artifacts/` |
| Staged-file and settings inspection | 98 runtime files, including three migrations; required runtime assets present; no environment, local bootstrap or Azure session files; unconfigured production settings rejected |
| Compiled Azure CLI authentication probe | Obtained a PostgreSQL-scope access token using the existing login; no token was printed or saved; no SQL connection was attempted |

The first combined check encountered two five-second timeouts (migration-file reading and an existing malformed-JSON HTTP test): 180 passed, two failed. Other verification processes had previously stalled and were stopped before restarting. The single-worker rerun passed without changing timeout thresholds or assertions. An initial integration run reported one `socket hang up` in an existing summary validation test: 105 passed, one failed. A complete rerun passed all 106. The underlying cause of these transient failures has not been established; recurrence should be investigated rather than hidden with retries.

The new tests cover Azure configuration rejection, owner/runtime separation, credential selection, token callbacks and failures, local password compatibility, release contents and symlink exclusion. Existing PostgreSQL tests exercise the local password path and database privilege rules; they do not prove Azure identity mapping or TLS connectivity.

## Verified Azure state and remaining work

The CLI login selects an enabled Visual Studio Enterprise Subscription. The empty `rg-slsea-coursework` resource group exists in Central India. The runtime listing includes `NODE|24-lts`. The student reports US$150 monthly credit; the remaining balance, reset/expiry and current consumption are not verified.

No App Service plan, Web App or Flexible Server has been provisioned by this work. Before provisioning, check regional capacity and current prices and record the intended sizes/cost. Then configure Entra role mapping, runtime grants, migrations, seed and private application credentials; run the Linux CI package build; deploy and verify public HTTPS, Swagger, scoped requests, writes and persistence. Managed-identity SQL access, hosted token refresh, firewall rules and the explicit-role grant path against Azure remain live acceptance checks. CRUD clarification and student-authored submission materials remain outstanding.
