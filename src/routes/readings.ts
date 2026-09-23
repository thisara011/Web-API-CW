import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { representationTag, sendRepresentation } from '../http/conditional.js';
import { historyLinks, parseHistoryQuery, readingHistory } from '../modules/readings/history.js';
import { requireBearer } from '../middleware/auth.js';
import { readOnlyMethods } from '../middleware/requests.js';
import { ReadingService } from '../modules/readings/service.js';
import { parseReading, resourceId } from '../modules/readings/validation.js';

export function createReadingRouter(pool: Pool, config: Environment): Router {
  const router = Router();
  const service = new ReadingService(pool);
  const read = requireBearer(config, 'installation:read', pool);
  const write = requireBearer(config, 'readings:write', pool);

  const history: RequestHandler = async (request, response) => {
    const installationId = request.params.installationId === undefined ? undefined : resourceId(request.params.installationId, 'installationId');
    const query = parseHistoryQuery(request.query);
    const result = await readingHistory(pool, request.principal!, query, installationId);
    const path = installationId ? `/installations/${installationId}/readings` : '/readings';
    const page = { data: result.data, count: result.count, offset: query.offset, limit: query.limit, ...historyLinks(path, query, result.count) };
    sendRepresentation(request, response, page, { modified: result.modified });
  };
  router.route('/readings').get(read, history).all(readOnlyMethods);
  router.route('/installations/:installationId/readings')
    .get(read, history)
    .post(write, async (request, response) => {
      const id = resourceId(request.params.installationId, 'installationId');
      const principal = request.principal!;
      if (principal.kind !== 'installation' || principal.installationId !== id) {
        throw new ApiError(403, 40301, 'Principal is not permitted to write readings for this installation');
      }
      const reading = await service.append(principal, id, parseReading(request.body));
      response.location(`/readings/${reading.id}`).set('Content-Location', `/readings/${reading.id}`)
        .set('ETag', representationTag(JSON.stringify(reading))).set('Last-Modified', reading.receivedAt.toUTCString())
        .status(201).json(reading);
    })
    .all((request, response, next) => {
      response.set('Allow', 'GET, HEAD, POST, OPTIONS');
      if (request.method === 'OPTIONS') { response.status(204).end(); return; }
      next(new ApiError(405, 40501, 'Method not allowed'));
    });
  router.route('/readings/:readingId')
    .get(read, async (request, response) => {
      const reading = await service.reading(request.principal!, resourceId(request.params.readingId, 'readingId'));
      sendRepresentation(request, response, reading, { modified: reading.receivedAt, immutable: true });
    }).all(readOnlyMethods);
  router.route('/installations/:installationId/latest-reading')
    .get(read, async (request, response) => {
      const reading = await service.latest(request.principal!, resourceId(request.params.installationId, 'installationId'));
      sendRepresentation(request, response, reading, { modified: reading.receivedAt });
    }).all(readOnlyMethods);
  router.route('/installations/:installationId/overview')
    .get(read, async (request, response) => {
      const overview = await service.overview(request.principal!, resourceId(request.params.installationId, 'installationId'));
      sendRepresentation(request, response, overview.body, { modified: overview.modified });
    }).all(readOnlyMethods);
  return router;
}
