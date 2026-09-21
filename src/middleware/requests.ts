import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ApiError } from '../http/errors.js';

export function requestContext(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.set('X-Request-Id', requestId);
    const startedAt = performance.now();
    response.on('finish', () => {
      logger.info({
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }, 'Request completed');
    });
    next();
  };
}

export const requireJsonResponse: RequestHandler = (request, response, next) => {
  response.vary('Accept');
  if (!request.accepts('application/json')) {
    next(new ApiError(406, 40601, 'Only application/json responses are available'));
    return;
  }
  next();
};

export const requireJsonBody: RequestHandler = (request, _response, next) => {
  const hasBody = request.headers['transfer-encoding'] !== undefined
    || Number(request.headers['content-length'] ?? 0) > 0;
  if (hasBody && !request.is('application/json')) {
    next(new ApiError(415, 41501, 'Request Content-Type must be application/json'));
    return;
  }
  next();
};

export const readOnlyMethods: RequestHandler = (request, response, next) => {
  response.set('Allow', 'GET, HEAD, OPTIONS');
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  next(new ApiError(405, 40501, 'Method not allowed'));
};
