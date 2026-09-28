# SLSEA Solar Generation API

NB6007CEM Web API Development coursework. A TypeScript, Express 5 and PostgreSQL API for device-owned solar readings and jurisdiction-scoped analysis.

**Live:** [Swagger UI](https://app-slsea-cw-ae65c5ba.azurewebsites.net/docs/) · [OpenAPI](https://app-slsea-cw-ae65c5ba.azurewebsites.net/openapi.json) · [Readiness](https://app-slsea-cw-ae65c5ba.azurewebsites.net/health/ready)

The API is deployed on Azure App Service with PostgreSQL and managed identity. It supports JWT authentication, hierarchy reads, immutable ingestion, paginated/filterable history, conditional requests and district summaries. Installation metadata CRUD uses a separate maintenance role under our [documented coursework interpretation](docs/design/INSTALLATION_MAINTENANCE.md).

Verification: 188 unit/HTTP tests and 117 real PostgreSQL integration tests passed for the maintenance release; public CRUD and regression checks passed. [Dated evidence](docs/evidence/README.md) records the actual results and their limits. The synthetic dataset is explicitly refreshed before demonstrations; stored seed data does not establish current telemetry.

## Start locally

Requires Node.js 24 and PostgreSQL. Docker Compose provides a local database if Docker is installed.

```sh
npm ci
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:grant-runtime
npm run db:seed
npm run dev
```

Copy the template only for initial setup. Local credentials in `.env.example`, Compose and seed fixtures are public development examples. Hosted credentials are configured privately. Open [local Swagger](http://127.0.0.1:3000/docs/).

For complete setup, migration permissions, testing and request examples, use the [development guide](docs/development/README.md). Local maintenance requires the additional owner provisioning and opt-in grants in the [maintenance guide](docs/design/INSTALLATION_MAINTENANCE.md).

## Find your way around

| Folder | Contents |
| --- | --- |
| `src/` | Application, routes, domain services, security and operational commands |
| `db/` | Versioned migrations and local-only role bootstrap |
| `openapi/` | Shared public API contract |
| `tests/` | Unit/HTTP checks and isolated PostgreSQL integration tests |
| `deploy/azure/` | Public Azure configuration template |
| `docs/design/` | Data model, API decisions and maintenance contract |
| `docs/azure/` | Deployment, database operations and cost assumptions |
| `docs/coursework/` | Requirements, plan, disclosure log and submission checklist |
| `docs/evidence/` | Sanitized, dated verification results |
| `scripts/` | Repository publication checks |
| `.github/workflows/` | Automated checks and Linux release packaging |

[Documentation index](docs/README.md) · [Azure operations](docs/azure/AZURE_WEBAPP.md) · [Submission checklist](docs/coursework/SUBMISSION_CHECKLIST.md)

## Checks and publication

```sh
npm run check
npm run test:integration
npm run check:public
```

Integration tests require a dedicated test database; see the development guide. The public-file check detects tracked private files and common credential formats. Git, Docker and release packaging exclude private configuration. VS Code hides generated folders and local credentials while keeping public examples visible.

Private `.env` files, local Azure sessions and generated releases stay on the developer's machine. `.env.example` and `deploy/azure/appsettings.example.json` are safe templates, not hosted credentials. The [repository privacy guide](docs/REPOSITORY_PRIVACY.md) explains the checks and sharing rules.

Remaining coursework gates include repository collaboration, the student's report/declaration/disclosure, submission-time operational checks and viva. Lecturer acceptance of the metadata CRUD interpretation remains unconfirmed.
