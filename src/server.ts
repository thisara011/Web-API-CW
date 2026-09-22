import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createDatabase } from './db/pool.js';

async function start(): Promise<void> {
  const config = parseEnv(process.env);
  const logger = createLogger(config.LOG_LEVEL);
  const database = createDatabase(config, logger);
  let shuttingDown = false;
  const app = createApp({ database, logger, config, isShuttingDown: () => shuttingDown });
  const server = app.listen(config.PORT, config.HOST);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  server.on('listening', () => {
    logger.info({ host: config.HOST, port: config.PORT }, 'API listening');
  });
  server.on('error', () => {
    logger.fatal('HTTP server failed; check the configured host and port');
    void database.close().finally(() => { process.exitCode = 1; });
  });

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Stopping API');
    const deadline = setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await database.close();
      logger.info('API stopped');
    } catch {
      logger.error('API shutdown failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  }

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

start().catch((error: unknown) => {
  // Environment errors are sanitized by parseEnv; do not dump process.env.
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
