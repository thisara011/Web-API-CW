import { readFileSync } from 'node:fs';

// One document is used by Swagger, the JSON endpoint and contract checks.
export const openApiDocument = JSON.parse(
  readFileSync(new URL('../openapi/openapi.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
