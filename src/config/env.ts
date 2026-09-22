import { z } from 'zod';

const databaseUrl = z.string().url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['postgres:', 'postgresql:'].includes(url.protocol)
    && url.hostname.length > 0
    && url.pathname.length > 1
    // pg URL parameters can override the username/database/TLS configuration.
    // Keep connection identity explicit and configure TLS separately.
    && url.search.length === 0;
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: databaseUrl,
  // Do not use Boolean("false"), which evaluates to true.
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(2000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1).max(600_000).default(30_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Zod issue text may contain input values; name the invalid settings only.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}. Check .env.example.`);
  }
  return result.data;
}
