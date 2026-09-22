import { Router } from 'express';
import { z } from 'zod';
import { AuthenticationService } from '../auth/service.js';
import { ApiError } from '../http/errors.js';

const tokenSchema = z.object({
  principalType: z.enum(['analyst', 'installation']), identifier: z.string().trim().min(1).max(254), password: z.string().min(12).max(256),
}).strict();

export function createAuthRouter(service: AuthenticationService): Router {
  const router = Router();
  router.post('/token', async (request, response) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 40002, 'Invalid token request', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
    const token = await service.authenticate(parsed.data);
    response.set('Cache-Control', 'no-store').status(200).json(token);
  });
  return router;
}
