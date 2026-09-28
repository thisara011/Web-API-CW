# Installation metadata maintenance

Decision, 28 September 2026: implement full CRUD for installation metadata using a separate maintenance principal. This is the project's explicit interpretation of the brief's inconsistent requirements. Brief p4 and rubric p2 require append-only readings, while brief p5 and rubric p3 require update/delete and full write-path CRUD. Neither names the intended mutable resource. This extension demonstrates real HTTP CRUD while retaining the original device and analyst access rules; it does not establish lecturer approval or guarantee acceptance of the coverage interpretation.

## Contract

Authenticate at `/auth/token` with `principalType=maintenance`, an owner-provisioned email and its private password. Its JWT has only `installation:manage`. Maintenance does not gain analyst geography/history access or device ingestion rights. Analysts and devices cannot use the maintenance surface.

| Operation | Endpoint | Result |
| --- | --- | --- |
| Create | POST `/maintenance/installations` | 201, canonical Location, ETag and Last-Modified |
| List | GET `/maintenance/installations?limit=20&offset=0` | Stable meter/ID pagination, count and next/previous links |
| Retrieve | GET `/maintenance/installations/{id}` | Metadata with ETag/Last-Modified; authorized conditional GET/304 |
| Replace | PUT `/maintenance/installations/{id}` | Full metadata replacement, 200 and new ETag |
| Delete | DELETE `/maintenance/installations/{id}` | 204 for an installation without readings |

Create and PUT require all six fields: `gridSubstationId`, `meterId`, `siteLabel`, `capacityKw`, `commissionedDate` (date or null), `isActive`. Unknown fields, credential material, invalid calendar dates and measurements beyond three decimal places are rejected. Creation generates the ID and timestamps; credentials are separately provisioned offline. Analysts can retrieve the resulting installation through their existing jurisdiction-scoped paths.

Meter ID and substation remain immutable. Commissioning date cannot change after readings exist. DELETE is restricted by the retained-readings foreign key and returns 409 when history exists. Reading UPDATE/DELETE remains prohibited at both HTTP and SQL levels.

PUT and DELETE require `If-Match`: omission is 428; a stale or weak tag is 412. Read the atomic metadata resource to obtain its strong ETag. `*` explicitly requires existence without checking a specific version. Writes take the same per-installation advisory lock as ingestion, then lock the metadata row and evaluate preconditions inside the mutation transaction. An identical PUT retains its representation/ETag; repeated DELETE returns 404 after deletion, with the same resulting absence. No PATCH is offered.

Changing active status increments the device credential version so earlier tokens stay revoked after reactivation. Metadata responses exclude hashes and credential versions. Current asset inventory and capacity remain metadata; this implementation does not reconstruct historical inventory membership.

## Owner-only setup

Apply migration `004_installation_maintenance.sql` through the owner connection before publishing the new application. No maintenance user is seeded or automatically created at startup.

```sh
node --env-file=.env.azure-admin dist/cli/migrate.js
CREDENTIAL_ACTION=provision-maintenance node --env-file=.env.azure-maintenance-admin dist/cli/credentials.js
```

Create the ignored private maintenance administrator environment if using that CLI example; it supplies the existing owner connection, `MAINTENANCE_EMAIL` and a private `MAINTENANCE_PASSWORD` of at least 20 characters. Reprovisioning a maintenance email rotates its hash and credential version; an email belonging to another role is rejected. No public endpoint creates or promotes user accounts.

Runtime grants now have an explicit `ALLOW_INSTALLATION_MAINTENANCE=true` owner-command option. It adds installation DELETE plus INSERT on the six metadata columns and UPDATE on label/capacity/commissioned-date/active-status only. It grants no SQL access to modify installation IDs, parent/meter identity, credential hashes, user records or readings. Lifecycle triggers may update timestamps and invalidate old tokens. The default grant mode remains the original read/append surface and rejects unexpected metadata-write grants rather than silently broadening them.

## Verification

Real PostgreSQL tests use a dedicated runtime role with the exact column grants. They cover token-kind separation, analyst/device boundaries, canonical creation/GET, conditional GET, full replacement, missing/stale/weak preconditions, identical and concurrent PUTs, validation, retained-history deletion/commissioning restrictions, credential-write denial, active-status revocation and concurrent ingestion versus deletion.

The current checks do not make the entire coursework complete. The lecturer may still require another interpretation of the write-path CRUD wording; record and explain this decision in the student's own report and viva.

## Published Azure increment

Release `90de19f` was deployed on 28 September 2026 after migration 004 and the opt-in runtime grants. The private login is in ignored `.env.azure-maintenance.json` (mode 0600). Use its email/password with principalType `maintenance` in live Swagger. The separate owner-only provisioning described above is already completed for this deployment; it is not a required repeat step.

[Deployment evidence](evidence/AZURE_MAINTENANCE_DEPLOYMENT.json), [SQL grant audit](evidence/AZURE_MAINTENANCE_GRANTS.json) and [public CRUD evidence](evidence/AZURE_MAINTENANCE_HTTP.json) record the actual result. The live test created and deleted only a new temporary installation and confirmed the inventory stayed 200. Deleting an existing site with retained history returned 409. Previous evidence files describe the earlier release and its original narrower runtime grants.
