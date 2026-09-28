import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { sendRepresentation } from '../http/conditional.js';
import { requireBearer } from '../middleware/auth.js';
import { resourceId } from '../modules/readings/validation.js';
import { MaintenanceService,metadataTag,parseMetadata } from '../modules/maintenance/service.js';
const directory=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),offset:z.coerce.number().int().min(0).max(1_000_000).default(0)}).strict();
export function createMaintenanceRouter(pool:Pool,config:Environment){
 const router=Router(),service=new MaintenanceService(pool);
 router.use('/maintenance',requireBearer(config,'installation:manage',pool),(req,_res,next)=>{
  if(req.principal?.kind!=='maintenance')return next(new ApiError(403,40301,'Maintenance access is required'));next();
 });
 const methods=(allow:string)=> (req:import('express').Request,res:import('express').Response,next:import('express').NextFunction)=>{res.set('Allow',allow);if(req.method==='OPTIONS'){res.status(204).end();return;}next(new ApiError(405,40501,'Method not allowed'));};
 router.route('/maintenance/installations').get(async(req,res)=>{
  const q=directory.safeParse(req.query);if(!q.success)throw new ApiError(400,40002,'Invalid directory query');sendRepresentation(req,res,await service.list(q.data.limit,q.data.offset));
 }).post(async(req,res)=>{if(Object.keys(req.query).length)throw new ApiError(400,40002,'Create does not accept query parameters');const row=await service.create(parseMetadata(req.body));res.location(`/maintenance/installations/${row.id}`).set('Content-Location',`/maintenance/installations/${row.id}`).set('ETag',metadataTag(row)).set('Last-Modified',row.updatedAt.toUTCString()).status(201).json(row);}).all(methods('GET, HEAD, POST, OPTIONS'));
 router.route('/maintenance/installations/:id').all((req,_res,next)=>{if(Object.keys(req.query).length)return next(new ApiError(400,40002,'Atomic metadata does not accept query parameters'));if(req.headers['if-none-match']&&['PUT','DELETE'].includes(req.method))return next(new ApiError(400,40002,'Use If-Match for metadata writes'));next();})
 .get(async(req,res)=>{const row=await service.one(resourceId(req.params.id,'id'));sendRepresentation(req,res,row,{modified:row.updatedAt});})
 .put(async(req,res)=>{const row=await service.change(resourceId(req.params.id,'id'),req.headers['if-match'],parseMetadata(req.body));res.set('ETag',metadataTag(row!)).set('Last-Modified',row!.updatedAt.toUTCString()).json(row);})
 .delete(async(req,res)=>{await service.change(resourceId(req.params.id,'id'),req.headers['if-match']);res.status(204).end();}).all(methods('GET, HEAD, PUT, DELETE, OPTIONS'));
 return router;
}
