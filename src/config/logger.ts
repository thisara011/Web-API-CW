import { pino } from 'pino';
import type { Environment } from './env.js';

export function createLogger(level: Environment['LOG_LEVEL']) {
  return pino({
    level,
    base: { service: 'slsea-solar-api' },
    redact: ['password', 'token', 'authorization', 'databaseUrl', 'req.headers.authorization'],
  });
}
