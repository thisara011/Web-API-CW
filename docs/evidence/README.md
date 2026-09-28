# Verification evidence

These files record completed checks and their dates. Later evidence supplements earlier snapshots; it does not rewrite historical observations. Read each file's limitations before drawing a current operational or freshness conclusion.

| Area | Evidence |
| --- | --- |
| Latest metadata CRUD increment | [Stage 7 tests](STAGE_7.md), [Azure deployment](AZURE_MAINTENANCE_DEPLOYMENT.json), [public CRUD](AZURE_MAINTENANCE_HTTP.json), [SQL grants](AZURE_MAINTENANCE_GRANTS.json), [regression smoke](AZURE_POST_MAINTENANCE_SMOKE.json) |
| Synthetic coverage snapshot, 25 September 2026 | [All-district freshness](AZURE_FRESHNESS.json), [gap-free histories](AZURE_HISTORY_COVERAGE.json) |
| Initial public deployment | [Web App configuration](AZURE_WEBAPP_VERIFICATION.json), [read-only smoke](AZURE_HTTP_SMOKE.json), [ingestion and restart](AZURE_HTTP_E2E.json), [original read/append grants](AZURE_RUNTIME_GRANTS.json) |
| Azure database provisioning | [Database verification](AZURE_DATABASE_VERIFICATION.json), [resource configuration](AZURE_RESOURCE_CONFIGURATION.json) |
| Azure preparation and prices | [Preparation](AZURE_PREPARATION.md), [price snapshot](AZURE_PRICE_SNAPSHOT.json) |
| Local release completion audit | [Audit](COMPLETION_AUDIT.md), [local smoke](LOCAL_RELEASE_SMOKE.json) |
| Incremental implementation | [Foundation](STAGE_1.md), [schema](STAGE_2.md), [seed](STAGE_3.md), [authentication](STAGE_4.md), [ingestion](STAGE_5.md), [history](STAGE_6.md), [summaries](STAGE_8.md) |

All telemetry is synthetic coursework data. A successful historical freshness check expires; repeat the explicit demo refresh and public checks before marking. Local test results and prepared CI configuration do not establish a successful remote CI run.
