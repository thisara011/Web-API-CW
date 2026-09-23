import type { Pool } from 'pg';
import { z } from 'zod';
import type { Principal } from '../../auth/tokens.js';
import { ApiError } from '../../http/errors.js';

export type Resource = 'provinces' | 'districts' | 'substations' | 'installations';
const resources = {
  provinces: { id: 'p.id', order: 'p.name, p.id', from: 'FROM provinces p', select: 'p.id, p.code, p.name' },
  districts: { id: 'd.id', order: 'd.name, d.id', from: 'FROM districts d JOIN provinces p ON p.id=d.province_id', select: 'd.id, d.code, d.name, d.province_id AS "provinceId"' },
  substations: { id: 's.id', order: 's.name, s.id', from: 'FROM grid_substations s JOIN districts d ON d.id=s.district_id JOIN provinces p ON p.id=d.province_id', select: 's.id, s.code, s.name, s.district_id AS "districtId"' },
  installations: { id: 'i.id', order: 'i.site_label, i.id', from: 'FROM solar_installations i JOIN grid_substations s ON s.id=i.grid_substation_id JOIN districts d ON d.id=s.district_id JOIN provinces p ON p.id=d.province_id', select: 'i.id, i.meter_id AS "meterId", i.site_label AS "siteLabel", i.capacity_kw::float8 AS "capacityKw", i.commissioned_date::text AS "commissionedDate", i.is_active AS "isActive", i.grid_substation_id AS "gridSubstationId"' },
} as const;
const fields = { 'province-id': 'p.id', 'district-id': 'd.id', 'substation-id': 's.id' } as const;
const allowed: Record<Resource, string[]> = { provinces: [], districts: ['province-id'], substations: ['province-id', 'district-id'], installations: ['province-id', 'district-id', 'substation-id'] };
const pageNumber = (fallback: string, min: number, max: number) => z.string().regex(/^\d+$/).default(fallback).transform(Number).pipe(z.number().int().min(min).max(max));
const querySchema = z.object({ offset: pageNumber('0', 0, 2147483647), limit: pageNumber('25', 1, 100), 'province-id': z.uuid().optional(), 'district-id': z.uuid().optional(), 'substation-id': z.uuid().optional() }).strict();
type Query = z.infer<typeof querySchema>;
export function directoryQuery(resource: Resource, input: unknown): Query {
  const result = querySchema.safeParse(input);
  if (!result.success) throw new ApiError(400, 40002, 'Invalid directory query', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  for (const key of Object.keys(fields)) if (key in result.data && !allowed[resource].includes(key)) throw new ApiError(400, 40002, 'Unsupported directory filter', [{ field: key, message: 'Filter is not supported for this resource' }]);
  return result.data;
}
function scope(resource: Resource, principal: Principal) {
  if (principal.kind !== 'analyst') throw new ApiError(403, 40301, 'Analyst access is required');
  if (principal.role === 'national') return { sql: 'TRUE', values: [] as string[] };
  if (principal.role === 'provincial') return { sql: 'p.id=$1', values: [principal.provinceId!] };
  return { sql: resource === 'provinces' ? 'p.id=(SELECT province_id FROM districts WHERE id=$1)' : 'd.id=$1', values: [principal.districtId!] };
}

export class HierarchyService {
  constructor(private readonly pool: Pool) {}
  async one(resource: Resource, principal: Principal, id: string) {
    const config = resources[resource], filter = scope(resource, principal);
    const result = await this.pool.query(`SELECT ${config.select} ${config.from} WHERE ${filter.sql} AND ${config.id}=$${filter.values.length + 1}`, [...filter.values, id]);
    if (!result.rows[0]) throw new ApiError(404, 40401, 'Resource not found');
    return result.rows[0];
  }
  async list(resource: Resource, principal: Principal, query: Query, path: string, parent?: { resource: Resource; id: string }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if (parent) {
        const config = resources[parent.resource], filter = scope(parent.resource, principal);
        const visible = await client.query(`SELECT ${config.id} ${config.from} WHERE ${filter.sql} AND ${config.id}=$${filter.values.length + 1}`, [...filter.values, parent.id]);
        if (!visible.rows[0]) throw new ApiError(404, 40401, 'Resource not found');
      }
      const config = resources[resource], filter = scope(resource, principal);
      const clauses = [filter.sql], values: Array<string | number> = [...filter.values];
      const add = (column: string, value: string) => { values.push(value); clauses.push(`${column}=$${values.length}`); };
      for (const [key, column] of Object.entries(fields)) {
        const value = query[key as keyof typeof fields]; if (value) add(column, value);
      }
      if (parent) add(resources[parent.resource].id, parent.id);
      const from = `${config.from} WHERE ${clauses.join(' AND ')}`;
      const count = Number((await client.query(`SELECT count(*) AS count ${from}`, values)).rows[0].count);
      const result = await client.query(`SELECT ${config.select} ${from} ORDER BY ${config.order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
      await client.query('COMMIT');
      const link = (offset: number) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) search.set(key, String(value));
        search.set('offset', String(offset)); return `${path}?${search}`;
      };
      return { items: result.rows, count, offset: query.offset, limit: query.limit,
        next: query.offset + query.limit < count ? link(query.offset + query.limit) : null,
        previous: query.offset > 0 && count > 0 ? link(Math.min(Math.max(0, query.offset - query.limit), Math.floor((count - 1) / query.limit) * query.limit)) : null };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
