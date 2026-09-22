import type { RequestHandler } from 'express';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { verifyToken, type Principal } from '../auth/tokens.js';

declare global { namespace Express { interface Request { principal?: Principal } } }

export function requireBearer(config: Environment, scope: string): RequestHandler {
  return async (request, _response, next) => {
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ')) return next(new ApiError(401, 40101, 'Bearer token is required'));
    try {
      const principal = await verifyToken(value.slice(7), config);
      if (!principal.scopes.includes(scope)) throw new ApiError(403, 40301, 'Principal is not permitted to access this resource');
      request.principal = principal;
      next();
    } catch (error) { next(error); }
  };
}
