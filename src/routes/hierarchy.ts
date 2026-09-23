import { Router } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { sendRepresentation } from '../http/conditional.js';
import { ApiError } from '../http/errors.js';
import { requireBearer } from '../middleware/auth.js';
import { readOnlyMethods } from '../middleware/requests.js';
import { HierarchyService, directoryQuery, type Resource } from '../modules/hierarchy/service.js';
import { resourceId } from '../modules/readings/validation.js';

export function createHierarchyRouter(pool: Pool, config: Environment): Router {
  const router = Router(), service = new HierarchyService(pool);
  const read = requireBearer(config, 'geography:read', pool);
  for (const resource of ['provinces', 'districts', 'substations', 'installations'] as const) {
    router.route(`/${resource}`).get(read, async (request, response) => {
      const query = directoryQuery(resource, request.query);
      sendRepresentation(request, response, await service.list(resource, request.principal!, query, `/${resource}`));
    }).all(readOnlyMethods);
    router.route(`/${resource}/:id`).get(read, async (request, response) => {
      if (Object.keys(request.query).length) throw new ApiError(400, 40002, 'Atomic resources do not accept query parameters');
      const id = resourceId(request.params.id, 'id');
      sendRepresentation(request, response, await service.one(resource, request.principal!, id));
    }).all(readOnlyMethods);
  }
  const nested: Array<[Resource, Resource]> = [['provinces', 'districts'], ['districts', 'substations'], ['substations', 'installations']];
  for (const [parent, child] of nested) {
    router.route(`/${parent}/:id/${child}`).get(read, async (request, response) => {
      const id = resourceId(request.params.id, 'id'), query = directoryQuery(child, request.query);
      sendRepresentation(request, response, await service.list(child, request.principal!, query, `/${parent}/${id}/${child}`, { resource: parent, id }));
    }).all(readOnlyMethods);
  }
  return router;
}
