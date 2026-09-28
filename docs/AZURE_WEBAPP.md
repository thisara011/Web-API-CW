# Azure Web App operations

Initial deployment verification, 25 September 2026: the public API runs on Linux App Service B1 and connects to Azure PostgreSQL through its system-assigned managed identity. A Web App restart preserved all 134,601 readings, including the synthetic reading added through the public API.

- [Swagger UI](https://app-slsea-cw-ae65c5ba.azurewebsites.net/docs/)
- [Readiness](https://app-slsea-cw-ae65c5ba.azurewebsites.net/health/ready)
- [OpenAPI](https://app-slsea-cw-ae65c5ba.azurewebsites.net/openapi.json)

## Resources and configuration

Resource group `rg-slsea-coursework`, Central India: plan `asp-slsea-coursework` (Linux B1, one instance), app `app-slsea-cw-ae65c5ba`, PostgreSQL server `psql-slsea-cw-ae65c5ba` (17/B1ms, 32 GiB). Both compute resources are billable. The reviewed combined retail baseline is US$35.22/month at 730 hours; actual consumption and remaining credit are unverified. See [cost assumptions](AZURE_HOSTING_COST.md).

The app uses `NODE|24-lts`, `node dist/server.js`, `HOST=0.0.0.0`, Azure's supplied `PORT`, Always On, HTTPS-only, minimum TLS 1.2 and `/health/ready`. FTP and basic publishing authentication are disabled. Its runtime uses `DATABASE_AUTH_MODE=managed-identity`, verified database TLS and a five-connection pool. No migration/owner settings are installed in the Web App.

PostgreSQL role `slsea_runtime` maps to the exact Web App identity. It can SELECT the six domain tables and INSERT readings; it has no elevated role flags, memberships, schema/database CREATE, or history UPDATE/DELETE. [Grant audit](evidence/AZURE_RUNTIME_GRANTS.json). Public readiness and HTTP ingestion verify actual managed-identity connectivity, beyond the earlier administrator checks.

The database firewall has 14 single-address rules: one developer address and 13 current Web App outbound addresses. No allow-all-Azure rule exists. Recheck outbound addresses after changing the plan or networking; the broader possible-address list is not automatically permitted.

## Credentials

Three analysts (national, provincial, district) and two installations have private rotated credentials. All other published fixture accounts remain disabled; published passwords are not deployment credentials. Ignored local files with permissions 0600:

- `.env.azure-demo.json`: private API demonstration credentials.
- `.env.azure-smoke`: national analyst settings for read-only smoke checks.
- `.env.azure-appsettings.json`: private Web App configuration, including the signing key.
- `.env.azure-admin`: separate administrator connection configuration.

Open these locally when needed; do not commit or paste their contents into reports/chat. In Swagger, call `/auth/token` using the appropriate private credentials, then enter the returned access token using **Authorize**. An installation principal may append only its own readings; analysts can read within their jurisdiction.

## Release procedure

The deployed source is `ab0a7f752b66f2037ef718a992251261246369f0`. [Deployment evidence](evidence/AZURE_WEBAPP_VERIFICATION.json) records its ZIP hash and successful deployment ID.

This deployment used the explicit Azure installation mode:

```sh
npm run build
node dist/cli/stage-release.js --azure-install
```

ZIP the contents of the returned staging directory at archive root. It contains precompiled runtime assets and locked manifests, excluding private configuration, local bootstrap SQL and tests. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and `ENABLE_ORYX_BUILD=true` for this mode. Its staged build hook runs `npm ci --omit=dev` on Azure Linux and verifies runtime imports; it does not compile omitted TypeScript sources. Azure's successful log recorded Node 24.18.0 and `Linux runtime imports verified`.

Deploy that ZIP with `az webapp deploy --type zip` to the existing app. The original CLI request returned HTTP 504 while the server continued building; deployment polling subsequently reported status 4, complete. Inspect deployment logs/status before retrying a timed-out upload.

The alternative CI artifact already contains Linux production dependencies and uses the default staging mode with both remote-build settings false. Do not mix these modes. Remote GitHub CI and local Docker execution are not claimed as verified.

After deployment:

```sh
node --env-file=.env.azure-smoke dist/cli/smoke.js
```

Do not rerun migrations, seed or credential rotation as part of app startup. The strict seed verifier will refuse its original exact-count rerun after successful ingestion.

## Verification and limits

[Read-only smoke evidence](evidence/AZURE_HTTP_SMOKE.json) covers readiness/liveness, OpenAPI, hierarchy counts, unauthorized access, history, ETag/304, stale If-Match/412 and summary requests. Swagger HTML also loaded successfully.

[End-to-end evidence](evidence/AZURE_HTTP_E2E.json) records provincial/district collection boundaries and hidden outside-scope resources, device read denial, wrong-device and analyst write denial, successful POST/201 with canonical Location/GET, duplicate/409 and count growth from 134,600 to 134,601. After an actual Web App restart, a fresh login retrieved the identical reading and unchanged count.

The added reading is explicitly synthetic and historical: the next 15-minute night-time slot after the seed cutoff, with zero power and unchanged energy. At that initial deployment check, a summary correctly reported incomplete current power coverage. The later explicit refresh below fills the intervening synthetic history. Before a live marking demonstration, use the documented append-only synthetic catch-up procedure and check freshness; do not present seed history as current measurements.

## Refresh synthetic demonstration data

Completed 25 September 2026: appended 603,599 synthetic readings through **05:00 UTC / 10:30 Asia/Colombo**, bringing the total to **738,200**. Public requests verified complete power and energy coverage across all 25 districts and 200 installations, with zero missing midnight baselines, stale sites or invalid counters. See [dated freshness evidence](evidence/AZURE_FRESHNESS.json). [History verification](evidence/AZURE_HISTORY_COVERAGE.json) also confirmed aligned, gap-free intervals for every installation and preservation of the earlier HTTP-created reading. This is a point-in-time demonstration result, not a recurring feed.

From the project directory, use the separate Azure administrator configuration:

```sh
ALLOW_SYNTHETIC_CATCHUP=true node --env-file=.env.azure-admin dist/cli/catch-up.js
node --env-file=.env.azure-smoke dist/cli/smoke.js
```

The first command appends observations through the latest completed 15-minute slot for the 200 seeded installations. It preserves existing rows, uses a transaction per installation and can resume after a partial run. The database must contain only synthetic coursework telemetry. Do not run the ordinary npm catch-up command against an unintended local environment or install owner settings in the Web App.

Check all 25 district summaries after completion: `powerCoverageComplete` and `energyCoverageComplete` must be true, with no missing midnight baselines, invalid counters or stale installations. A single sample in the smoke output is insufficient to establish national coverage. Record the actual cutoff and verification time; the API's freshness window is 30 minutes, so repeat this explicit operation before a later demonstration. No recurring job is configured.

Next coursework work: resolve the lecturer's mutable-resource CRUD interpretation, implement the agreed scope, and finish student-authored report, declaration and viva evidence. Recovery testing, load capacity and remote CI remain separate from this successful deployment verification.

## Installation maintenance release (28 September 2026)

The current release is `90de19f`, adding the protected installation metadata lifecycle after migration 004. Runtime grants additionally permit column-restricted metadata INSERT/UPDATE and DELETE of installations without history. Device credential hashes, user mutations and reading UPDATE/DELETE remain unavailable to the runtime. The earlier source hash and grant audit above describe the initial deployment. See [current maintenance operations/evidence](INSTALLATION_MAINTENANCE.md). Private maintenance credentials are in ignored mode-0600 `.env.azure-maintenance.json`.
