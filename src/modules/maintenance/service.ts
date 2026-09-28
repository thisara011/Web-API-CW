import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../../http/errors.js';
import { conditionalStatus, representationTag } from '../../http/conditional.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const metadataInput = z.object({
  gridSubstationId: z.uuid(), meterId: z.string().trim().min(1).max(100),
  siteLabel: z.string().trim().min(1).max(200),
  capacityKw: z.number().finite().positive().max(999_999_999.999).refine(v => Number(v.toFixed(3))===v),
  commissionedDate: date.nullable(), isActive: z.boolean(),
}).strict();
export type MetadataInput = z.infer<typeof metadataInput>;
export function parseMetadata(value: unknown): MetadataInput {
  const r=metadataInput.safeParse(value);
  if (!r.success) throw new ApiError(400,40002,'Invalid installation metadata',r.error.issues.map(x=>({field:x.path.join('.'),message:x.message})));
  return r.data;
}
const columns = `id, grid_substation_id AS "gridSubstationId", meter_id AS "meterId", site_label AS "siteLabel", capacity_kw::float8 AS "capacityKw", to_char(commissioned_date,'YYYY-MM-DD') AS "commissionedDate", is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;
export type Metadata = MetadataInput & {id:string;createdAt:Date;updatedAt:Date};
export function metadataTag(row:Metadata) { return representationTag(JSON.stringify(row),[`/maintenance/installations/${row.id}`,null]); }
function precondition(row:Metadata,ifMatch:string|undefined) {
  if (!ifMatch) throw new ApiError(428,42801,'If-Match is required');
  conditionalStatus({'if-match':ifMatch},metadataTag(row));
}
function sqlError(e:unknown):never {
  const code=typeof e==='object'&&e!==null&&'code' in e?e.code:undefined;
  if (code==='23505') throw new ApiError(409,40901,'Meter identifier is already registered');
  if (code==='23503'||code==='23001') throw new ApiError(409,40901,'Installation has dependent records or an invalid substation');
  if (code==='55000') throw new ApiError(409,40901,'Installation identity or historical commissioning date cannot change');
  throw e;
}
export class MaintenanceService {
  constructor(private readonly pool:Pool){}
  async one(id:string,client:Pool|PoolClient=this.pool,lock=false):Promise<Metadata> {
    const r=await client.query<Metadata>(`SELECT ${columns} FROM solar_installations WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
    if(!r.rows[0])throw new ApiError(404,40401,'Resource not found');return r.rows[0];
  }
  async list(limit:number,offset:number){
    const c=await this.pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const rows=await c.query<Metadata>(`SELECT ${columns} FROM solar_installations ORDER BY meter_id,id LIMIT $1 OFFSET $2`,[limit,offset]);
      const count=await c.query('SELECT count(*)::int AS count FROM solar_installations');await c.query('COMMIT');
      const n=count.rows[0].count as number;const link=(o:number)=>`/maintenance/installations?limit=${limit}&offset=${o}`;
      return {items:rows.rows,count:n,limit,offset,next:offset+limit<n?link(offset+limit):null,previous:offset>0?link(Math.max(0,offset-limit)):null};
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  async create(input:MetadataInput){
    try {const r=await this.pool.query<Metadata>(`INSERT INTO solar_installations(grid_substation_id,meter_id,site_label,capacity_kw,commissioned_date,is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,[input.gridSubstationId,input.meterId,input.siteLabel,input.capacityKw,input.commissionedDate,input.isActive]);return r.rows[0]!;}catch(e){sqlError(e)}
  }
  async change(id:string,ifMatch:string|undefined,input?:MetadataInput){
    const c=await this.pool.connect();try{await c.query('BEGIN');
      // Match ingestion's lock order; evaluate the precondition inside the same transaction as the mutation.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('reading:' || $1,0))",[id]);
      const current=await this.one(id,c,true);precondition(current,ifMatch);
      if(!input){await c.query('DELETE FROM solar_installations WHERE id=$1',[id]);await c.query('COMMIT');return undefined;}
      if(current.meterId!==input.meterId||current.gridSubstationId!==input.gridSubstationId)throw new ApiError(409,40901,'Meter identifier and substation are immutable');
      if(current.siteLabel===input.siteLabel&&current.capacityKw===input.capacityKw&&current.commissionedDate===input.commissionedDate&&current.isActive===input.isActive){await c.query('COMMIT');return current;}
      const r=await c.query<Metadata>(`UPDATE solar_installations SET site_label=$2,capacity_kw=$3,commissioned_date=$4,is_active=$5 WHERE id=$1 RETURNING ${columns}`,[id,input.siteLabel,input.capacityKw,input.commissionedDate,input.isActive]);await c.query('COMMIT');return r.rows[0]!;
    }catch(e){await c.query('ROLLBACK');sqlError(e)}finally{c.release()}
  }
}
