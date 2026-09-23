import { Router } from 'express';
import type { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { sendRepresentation } from '../http/conditional.js';
import { requireBearer } from '../middleware/auth.js';
import { readOnlyMethods } from '../middleware/requests.js';
import { resourceId } from '../modules/readings/validation.js';
import { SummaryService } from '../modules/summaries/service.js';
import { summaryCutoff } from '../modules/summaries/validation.js';

export function createSummaryRouter(pool: Pool, config: Environment, now: () => number = Date.now): Router {
  const router = Router();
  const service = new SummaryService(pool);
  router.route('/districts/:districtId/generation-summary')
    .get(requireBearer(config, 'installation:read', pool), async (request, response) => {
      const districtId = resourceId(request.params.districtId, 'districtId');
      const asOf = summaryCutoff(request.query, now());
      const summary = await service.district(request.principal!, districtId, asOf);
      sendRepresentation(request, response, summary);
    }).all(readOnlyMethods);
  return router;
}
