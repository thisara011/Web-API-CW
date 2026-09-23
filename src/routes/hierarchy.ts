import { Router } from 'express';
import type { Pool } from 'pg';
import type { Principal } from '../auth/tokens.js';
import { ApiError } from '../http/errors.js';

type Row = Record<string, unknown>;
function requireAnalyst(principal: Principal | undefined): Extract<Principal, { kind: 'analyst' }> {
  if (!principal || principal.kind !== 'analyst') throw new ApiError(403, 40301, 'Principal is not permitted to access this resource');
  return principal;
}
function scopeSql(principal: Extract<Principal, { kind: 'analyst' }>, alias: string): { text: string; values: string[] } {
  if (principal.role === 'national') return { text: 'TRUE', values: [] };
  if (principal.role === 'provincial') return { text: `${alias}.province_id = $1`, values: [principal.provinceId!] };
  return { text: `${alias}.id = $1`, values: [principal.districtId!] };
}
async function one(pool: Pool, text: string, values: unknown[]): Promise<Row> {
  const result = await pool.query<Row>(text, values);
  if (!result.rows[0]) throw new ApiError(404, 40401, 'Resource not found');
  return result.rows[0];
}
export function createHierarchyRouter(pool: Pool): Router {
  const router = Router();
  router.use((request, _response, next) => { try { requireAnalyst(request.principal); next(); } catch (error) { next(error); } });
  router.get('/provinces', async (request, response) => {
    const p = requireAnalyst(request.principal);
    const where: { sql: string; values: Array<string | undefined> } = p.role === 'national' ? { sql: 'TRUE', values: [] } : { sql: 'p.id = $1', values: [p.provinceId ?? (await pool.query<{ province_id: string }>('SELECT province_id FROM districts WHERE id = $1', [p.districtId])).rows[0]?.province_id] };
    const result = await pool.query('SELECT id, code, name FROM provinces p WHERE ' + where.sql + ' ORDER BY code', where.values); response.json({ items: result.rows });
  });
  router.get('/provinces/:provinceId', async (request, response) => {
    const p = requireAnalyst(request.principal); const permitted = p.role === 'national' ? 'TRUE' : 'p.id = $2';
    const parameter = p.provinceId ?? (await pool.query<{ province_id: string }>('SELECT province_id FROM districts WHERE id = $1', [p.districtId])).rows[0]?.province_id;
    response.json(await one(pool, `SELECT p.id, p.code, p.name FROM provinces p WHERE p.id = $1 AND ${permitted}`, p.role === 'national' ? [request.params.provinceId] : [request.params.provinceId, parameter]));
  });
  router.get('/provinces/:provinceId/districts', async (request, response) => {
    const p = requireAnalyst(request.principal); const allowedProvince = p.provinceId ?? (p.role === 'district' ? (await pool.query<{ province_id: string }>('SELECT province_id FROM districts WHERE id = $1', [p.districtId])).rows[0]?.province_id : null);
    const result = await pool.query('SELECT d.id, d.code, d.name, d.province_id AS "provinceId" FROM districts d WHERE d.province_id = $1 AND ($2::uuid IS NULL OR d.province_id = $2) AND ($3::uuid IS NULL OR d.id = $3) ORDER BY d.code', [request.params.provinceId, p.role === 'national' ? null : allowedProvince, p.role === 'district' ? p.districtId : null]);
    if (result.rowCount === 0 && p.role !== 'national') throw new ApiError(404, 40401, 'Resource not found'); response.json({ items: result.rows });
  });
  router.get('/districts/:districtId', async (request, response) => {
    const p = requireAnalyst(request.principal); const clause = p.role === 'national' ? 'TRUE' : p.role === 'provincial' ? 'd.province_id = $2' : 'd.id = $2'; const scope = p.role === 'provincial' ? p.provinceId : p.districtId;
    response.json(await one(pool, `SELECT d.id, d.code, d.name, d.province_id AS "provinceId" FROM districts d WHERE d.id = $1 AND ${clause}`, p.role === 'national' ? [request.params.districtId] : [request.params.districtId, scope]));
  });
  router.get('/districts/:districtId/substations', async (request, response) => {
    const p = requireAnalyst(request.principal); const clause = p.role === 'national' ? 'TRUE' : p.role === 'provincial' ? 'd.province_id = $2' : 'd.id = $2'; const scope = p.role === 'provincial' ? p.provinceId : p.districtId;
    const result = await pool.query(`SELECT s.id, s.code, s.name, s.district_id AS "districtId" FROM grid_substations s JOIN districts d ON d.id=s.district_id WHERE s.district_id=$1 AND ${clause} ORDER BY s.code`, p.role === 'national' ? [request.params.districtId] : [request.params.districtId, scope]); if (result.rowCount === 0) throw new ApiError(404, 40401, 'Resource not found'); response.json({ items: result.rows });
  });
  router.get('/substations/:substationId', async (request, response) => {
    const p = requireAnalyst(request.principal); const filter = scopeSql(p, 'd'); response.json(await one(pool, `SELECT s.id,s.code,s.name,s.district_id AS "districtId" FROM grid_substations s JOIN districts d ON d.id=s.district_id WHERE s.id=$${filter.values.length + 1} AND ${filter.text}`, [...filter.values, request.params.substationId]));
  });
  router.get('/substations/:substationId/installations', async (request, response) => {
    const p = requireAnalyst(request.principal); const filter = scopeSql(p, 'd'); const result = await pool.query(`SELECT i.id,i.meter_id AS "meterId",i.site_label AS "siteLabel",i.capacity_kw AS "capacityKw",i.commissioned_date AS "commissionedDate",i.is_active AS "isActive",i.grid_substation_id AS "gridSubstationId" FROM solar_installations i JOIN grid_substations s ON s.id=i.grid_substation_id JOIN districts d ON d.id=s.district_id WHERE s.id=$${filter.values.length + 1} AND ${filter.text} ORDER BY i.meter_id`, [...filter.values, request.params.substationId]); if (result.rowCount === 0) throw new ApiError(404, 40401, 'Resource not found'); response.json({ items: result.rows });
  });
  router.get('/installations/:installationId', async (request, response) => {
    const p = requireAnalyst(request.principal); const filter = scopeSql(p, 'd'); response.json(await one(pool, `SELECT i.id,i.meter_id AS "meterId",i.site_label AS "siteLabel",i.capacity_kw AS "capacityKw",i.commissioned_date AS "commissionedDate",i.is_active AS "isActive",i.grid_substation_id AS "gridSubstationId" FROM solar_installations i JOIN grid_substations s ON s.id=i.grid_substation_id JOIN districts d ON d.id=s.district_id WHERE i.id=$${filter.values.length + 1} AND ${filter.text}`, [...filter.values, request.params.installationId]));
  });
  return router;
}
