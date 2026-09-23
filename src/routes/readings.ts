import { Router } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { requireBearer } from '../middleware/auth.js';
import { readOnlyMethods } from '../middleware/requests.js';
import { ReadingService } from '../modules/readings/service.js';
import { parseReading, resourceId } from '../modules/readings/validation.js';

export function createReadingRouter(pool: Pool, config: Environment): Router {
  const router = Router();
  const service = new ReadingService(pool);
  const read = requireBearer(config, 'installation:read', pool);
  const write = requireBearer(config, 'readings:write', pool);

  router.route('/installations/:installationId/readings')
    .post(write, async (request, response) => {
      const id = resourceId(request.params.installationId, 'installationId');
      const principal = request.principal!;
      if (principal.kind !== 'installation' || principal.installationId !== id) {
        throw new ApiError(403, 40301, 'Principal is not permitted to write readings for this installation');
      }
      const reading = await service.append(principal, id, parseReading(request.body));
      response.location(`/readings/${reading.id}`).set('Content-Location', `/readings/${reading.id}`)
        .status(201).json(reading);
    })
    .all((request, response, next) => {
      response.set('Allow', 'POST, OPTIONS');
      if (request.method === 'OPTIONS') { response.status(204).end(); return; }
      next(new ApiError(405, 40501, 'Method not allowed'));
    });
  router.route('/readings/:readingId')
    .get(read, async (request, response) => {
      response.json(await service.reading(request.principal!, resourceId(request.params.readingId, 'readingId')));
    }).all(readOnlyMethods);
  router.route('/installations/:installationId/latest-reading')
    .get(read, async (request, response) => {
      response.json(await service.latest(request.principal!, resourceId(request.params.installationId, 'installationId')));
    }).all(readOnlyMethods);
  router.route('/installations/:installationId/overview')
    .get(read, async (request, response) => {
      response.json(await service.overview(request.principal!, resourceId(request.params.installationId, 'installationId')));
    }).all(readOnlyMethods);
  return router;
}
