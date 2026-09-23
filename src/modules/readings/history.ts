import { z } from 'zod';
import type { Pool } from 'pg';
import type { Principal } from '../../auth/tokens.js';
import { ApiError } from '../../http/errors.js';
import { analystFilter, hierarchy, readingColumns, type Reading } from './service.js';

const integer = (fallback: string, minimum: number, maximum: number) => z.string().regex(/^\d+$/).default(fallback).transform(Number).pipe(z.number().int().min(minimum).max(maximum));
const instant = z.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)) && !/\.\d{4}/.test(value), 'Use a valid instant with at most three fractional digits').transform((value) => new Date(value).toISOString());
const schema = z.object({
  'province-id': z.uuid().transform((value) => value.toLowerCase()).optional(),
  'district-id': z.uuid().transform((value) => value.toLowerCase()).optional(),
  'substation-id': z.uuid().transform((value) => value.toLowerCase()).optional(),
  'installation-id': z.uuid().transform((value) => value.toLowerCase()).optional(),
  from: instant.optional(), to: instant.optional(),
  sort: z.enum(['timestamp', '-timestamp']).default('-timestamp'),
  offset: integer('0', 0, 2_147_483_647), limit: integer('25', 1, 100),
}).strict().refine((value) => !value.from || !value.to || value.from < value.to, { path: ['to'], message: 'Must be later than from (half-open interval)' });
export type HistoryQuery = z.infer<typeof schema>;
export function parseHistoryQuery(value: unknown): HistoryQuery {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 40002, 'Invalid history query', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
}
export function historyLinks(path: string, query: HistoryQuery, count: number) {
  const link = (offset: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) search.set(key, String(value));
    search.set('offset', String(offset));
    return `${path}?${search.toString()}`;
  };
  return {
    next: query.offset + query.limit < count ? link(query.offset + query.limit) : null,
    previous: query.offset > 0 && count > 0 ? link(Math.min(Math.max(0, query.offset - query.limit), Math.floor((count - 1) / query.limit) * query.limit)) : null,
  };
}

export async function readingHistory(pool: Pool, principal: Principal, query: HistoryQuery, installationId?: string) {
  const scope = analystFilter(principal);
  const client = await pool.connect();
  try {
    // Parent visibility, count, dates and page use the same database snapshot.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (installationId) {
      const parent = await client.query(`SELECT i.id ${hierarchy} WHERE ${scope.sql} AND i.id = $${scope.values.length + 1}`, [...scope.values, installationId]);
      if (!parent.rows[0]) throw new ApiError(404, 40401, 'Resource not found');
    }
    const values: Array<string | number> = [...scope.values];
    const clauses = [scope.sql];
    const add = (column: string, operator: string, value: string | undefined) => {
      if (value !== undefined) { values.push(value); clauses.push(`${column} ${operator} $${values.length}`); }
    };
    add('p.id', '=', query['province-id']); add('d.id', '=', query['district-id']);
    add('s.id', '=', query['substation-id']); add('i.id', '=', query['installation-id']);
    add('i.id', '=', installationId); add('r.timestamp', '>=', query.from); add('r.timestamp', '<', query.to);
    const from = `${hierarchy} JOIN generation_readings r ON r.installation_id = i.id WHERE ${clauses.join(' AND ')}`;
    const total = await client.query<{ count: string; modified: Date | null }>(`SELECT count(*) AS count, max(r.received_at) AS modified ${from}`, values);
    const direction = query.sort === 'timestamp' ? 'ASC' : 'DESC';
    const rows = await client.query<Reading>(`SELECT ${readingColumns} ${from}
      ORDER BY r.timestamp ${direction}, r.id ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
    await client.query('COMMIT');
    return { data: rows.rows, count: Number(total.rows[0]!.count), modified: total.rows[0]!.modified };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
