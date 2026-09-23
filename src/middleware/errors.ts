import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ApiError } from '../http/errors.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 40401, 'Resource not found'));
};

function publicError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  switch (type) {
    case 'entity.parse.failed':
      return new ApiError(400, 40001, 'Invalid JSON request body');
    case 'entity.too.large':
      return new ApiError(413, 41301, 'Request body exceeds the 32 KB limit');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new ApiError(415, 41501, 'Unsupported request encoding');
    case 'request.aborted':
    case 'request.size.invalid':
      return new ApiError(400, 40001, 'Invalid request body');
    default:
      return new ApiError(500, 50001, 'An unexpected error occurred');
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const failure = publicError(error);
    if (failure.status === 401) response.set('WWW-Authenticate', 'Bearer');
    if (failure.status >= 500) {
      // Do not serialize raw errors: DB errors can include credentials or SQL.
      logger.error({ requestId: response.locals.requestId, code: failure.code }, 'Request failed');
    }
    response.set('Cache-Control', 'no-store').status(failure.status).json({
      error: {
        code: failure.code,
        message: failure.message,
        details: failure.details,
        requestId: response.locals.requestId,
      },
    });
  };
}
