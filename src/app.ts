import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { DatabaseHealth } from './db/pool.js';
import { ApiError } from './http/errors.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { readOnlyMethods, requestContext, requireJsonBody, requireJsonResponse } from './middleware/requests.js';
import { openApiDocument } from './openapi.js';
import type { Environment } from './config/env.js';
import { AuthenticationService } from './auth/service.js';
import { createAuthRouter } from './routes/auth.js';
import { createHierarchyRouter } from './routes/hierarchy.js';
import { requireBearer } from './middleware/auth.js';
import { createReadingRouter } from './routes/readings.js';

interface AppDependencies {
  database: DatabaseHealth;
  logger: Logger;
  config?: Environment;
  isShuttingDown?: () => boolean;
}

export function createApp({ database, logger, config, isShuttingDown = () => false }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  // Health stays uncached; business routes explicitly hash their selected representations.
  app.disable('etag');
  app.use(requestContext(logger));
  app.use(helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  }));
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, {
    customSiteTitle: 'SLSEA Solar API — Swagger',
    swaggerOptions: {
      url: '/openapi.json',
      validatorUrl: null,
      persistAuthorization: false,
    },
  }));

  app.use(requireJsonResponse);
  app.use(requireJsonBody);
  app.use(express.json({ limit: '32kb', strict: true }));

  app.use(['/health/live', '/health/ready'], (request, _response, next) => {
    // Probes always evaluate current health. Express otherwise turns even an
    // uncached response into 304 for If-None-Match: *, without an ETag.
    delete request.headers['if-none-match'];
    delete request.headers['if-modified-since'];
    next();
  });

  app.route('/health/live')
    .get((_request, response) => {
      response.json({ status: 'ok', service: 'slsea-solar-api' });
    })
    .all(readOnlyMethods);

  app.route('/health/ready')
    .get(async (_request, response) => {
      if (isShuttingDown()) {
        throw new ApiError(503, 50301, 'Service is not ready', [
          { field: 'server', message: 'Server is shutting down' },
        ]);
      }
      try {
        await database.checkConnection();
      } catch {
        throw new ApiError(503, 50301, 'Service is not ready', [
          { field: 'database', message: 'Database is unavailable' },
        ]);
      }
      response.json({ status: 'ready', checks: { database: 'up' } });
    })
    .all(readOnlyMethods);

  app.route('/openapi.json')
    .get((_request, response) => {
      response.json(openApiDocument);
    })
    .all(readOnlyMethods);

  if (config && database.pool) {
    app.use('/auth', createAuthRouter(new AuthenticationService(database.pool, config)));
    app.use(createReadingRouter(database.pool, config));
    app.use(requireBearer(config, 'geography:read', database.pool), createHierarchyRouter(database.pool));
  }

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
