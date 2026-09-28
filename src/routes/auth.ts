import { Router } from 'express';
import { z } from 'zod';
import { AuthenticationService } from '../auth/service.js';
import { ApiError } from '../http/errors.js';
import { authRateLimit } from '../middleware/rate-limit.js';

const tokenSchema = z.object({
  principalType: z.enum(['analyst', 'installation', 'maintenance']), identifier: z.string().trim().min(1).max(254), password: z.string().min(12).max(256),
}).strict();

export function createAuthRouter(service: AuthenticationService): Router {
  const router = Router();
  router.route('/token').post(authRateLimit(), async (request, response) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 40002, 'Invalid token request', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
    const token = await service.authenticate(parsed.data);
    response.set('Cache-Control', 'no-store').status(200).json(token);
  }).all((request, response, next) => {
    response.set('Allow', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') { response.status(204).end(); return; }
    next(new ApiError(405, 40501, 'Method not allowed'));
  });
  return router;
}
