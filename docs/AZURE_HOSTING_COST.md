# Azure hosting configuration and cost

Checked on 24 September 2026. This is the first hosting step: select and price the configuration before provisioning. No paid resource was created during this check.

Subsequent status: the student authorized the next step and the PostgreSQL server was created with the configuration below. Its database is migrated and seeded; see [database operations and verification](AZURE_DATABASE.md). The Web App remains unprovisioned. The original pricing check above is historical, not a statement that the subscription still has no paid project resources.

## Proposed configuration

| Resource | Configuration | Purpose |
| --- | --- | --- |
| Resource group | Existing `rg-slsea-coursework` | Keep the coursework resources together |
| Region | Central India for the app and database | Same-region placement; both service catalogs list the selected sizes |
| App Service plan | `asp-slsea-coursework`, Linux Basic B1, one instance | Run the Node 24 API with Always On |
| Web App | Proposed `app-slsea-cw-ae65c5ba`; global name availability must be checked | HTTPS API and Swagger; system-assigned managed identity; `node dist/server.js` |
| PostgreSQL server | Proposed `psql-slsea-cw-ae65c5ba`; global name availability must be checked | Flexible Server, PostgreSQL 17, Burstable `Standard_B1ms` (1 vCore, 2 GiB RAM) |
| Database/storage | Database `slsea`; 32 GiB Premium SSD, default P4 IOPS tier | Persistent relational data; monitor storage and query performance |
| Backups | Seven-day retention, locally redundant; no HA or geo-redundant replica | Small coursework deployment with a recovery window |
| Authentication | Entra administrator for setup; restricted Web App identity for runtime | Keep administrator privileges outside API startup |
| Networking | Public PostgreSQL endpoint with verified TLS and explicit firewall entries for developer IP and Web App outbound addresses | No internet-wide or all-Azure firewall rule; check connectivity after deployment |

Burstable compute is suitable for a lightly used demonstration. Its sustained CPU capacity is limited; measure seed/catch-up and summary performance before describing the hosted system as production-ready. PostgreSQL 17 matches the CI database version; current local integration evidence uses PostgreSQL 18. App Service's single instance and the absence of HA are intentional coursework tradeoffs. [PostgreSQL compute options](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute).

## Estimate

Live public USD retail rates for Central India were retrieved from the [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices). Exact returned meters and retrieval time are saved in [the price snapshot](evidence/AZURE_PRICE_SNAPSHOT.json). Calculations assume 730 compute hours per month and 32 storage billing units.

| Item | Rate | Estimated monthly cost |
| --- | --- | ---: |
| Linux App Service B1 | US$0.018/hour × 730 | US$13.14 |
| PostgreSQL B1ms | US$0.0245/hour × 730 | US$17.89 |
| PostgreSQL storage | US$0.131/GB-month × 32 | US$4.19 |
| **Base total** | Rounded after calculation | **US$35.22** |

Use **US$50/month as a planning allowance**, leaving room within the student's reported US$150 monthly credit. This is not an enforced cap, a confirmed remaining balance or a guaranteed invoice. Actual calendar hours, taxes, outbound transfer, backup overage, optional log ingestion and offer-specific rates can change the total. No separate paid monitoring service, custom domain, gateway, private endpoint or replica is included.

PostgreSQL includes backup capacity up to the provisioned storage amount; extra locally redundant backup storage is listed at US$0.095/GB-month. A seven-day retention period does not guarantee zero overage because write activity generates backup/WAL data. [Backup cost and retention](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore).

Before creating resources, confirm the remaining credit and reset/expiry in the subscription's billing view. A budget alert can notify about spending but does not stop resources automatically. [Microsoft budget behavior](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets). Do not upgrade the subscription or disable its credit spending limit as part of deployment.

## Checks performed

- Azure CLI login: enabled Visual Studio Enterprise Subscription. The project resource list returned empty.
- `az appservice list-locations --sku B1 --linux-workers-enabled`: Central India listed.
- `az postgres flexible-server list-skus --location centralindia`: `Standard_B1ms`, PostgreSQL 17 and 32 GiB ManagedDisk/P4 listed. The offer-restriction feature was disabled; null status fields are not a capacity reservation.
- Installed the Azure CLI `quota` extension. The initial quota request failed because `Microsoft.Quota` was not registered. Requested registration for that provider and `Microsoft.DBforPostgreSQL`; `Microsoft.Web` was already registered.
- Final provider checks returned `Registered` for both `Microsoft.Quota` and `Microsoft.DBforPostgreSQL`.
- After registration was requested, `az quota list` returned only wildcard `Total Regional VMs`: limit 30, `isQuotaApplicable=false`. The App Service regional usages endpoint returned current use 0 and limit 30. These results do **not** establish a B1-specific quota or guarantee deployment success. No quota increase was requested.
- Python's HTTPS certificate validation failed for the public price endpoint; macOS curl fetched it successfully with certificate verification enabled. TLS verification was not disabled.

## Next step: provision and verify PostgreSQL

1. Check the proposed global server name. Resolve the signed-in Entra administrator in the selected tenant; provider registration is complete.
2. Create exactly the selected PostgreSQL configuration, with Entra authentication and no broad firewall exception. Provision the database and an explicit developer-IP rule; verify a TLS connection with Azure CLI authentication.
3. Apply migrations, seed the demonstration data and disable published fixture credentials through the separate administrative connection.
4. Create the planned Web App and its identity, map that identity into PostgreSQL and grant restricted runtime access. Update the database firewall for the Web App's outbound addresses.
5. Produce the Linux release, configure private application credentials, deploy and test publicly. Record the actual resulting costs, resource sizes and endpoint.

If Azure refuses the selected region or size, inspect the error and re-price an alternative before changing it. Do not silently select a larger database or more expensive plan.
