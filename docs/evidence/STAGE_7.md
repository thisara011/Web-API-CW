# Stage 7 — Installation metadata CRUD

Verified locally on 28 September 2026. This implements the documented maintenance-role interpretation; the conflicting assessment wording remains explicit in INSTALLATION_MAINTENANCE.md.

- TypeScript validation and compiled build passed.
- Unit/HTTP checks: 188 tests passed, including maintenance JWT kind/foreign-claim rejection and OpenAPI validation.
- Real PostgreSQL integration: 7 files, 117 tests passed. The new maintenance file contributes 11 cases covering actual HTTP CRUD, access boundaries, atomic stale-precondition checks, identical/concurrent PUT, history restrictions, column privileges, activation revocation and concurrent ingestion/deletion.
- Temporary PostgreSQL was installed outside the repository because the previous temporary instance was absent. It listens on loopback port 55432; it is not the Azure dataset or an application dependency.

Actual failures and corrections: sandboxed HTTP tests initially failed with socket EPERM and passed outside the sandbox. The first integration run returned 500 for a retained-history DELETE because PostgreSQL ON DELETE RESTRICT used SQLSTATE 23001; mapped both 23001 and 23503 to the documented 409 conflict, then reran the complete integration suite successfully.

The deployed Azure evidence is recorded separately after remote verification. Local checks alone do not establish successful publication or lecturer acceptance of the CRUD interpretation.
