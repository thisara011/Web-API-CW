import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import pino from 'pino';
import request from 'supertest';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createApp} from '../../src/app.js';
import {parseEnv} from '../../src/config/env.js';
import {runMigrations} from '../../src/db/migrations.js';
import {grantRuntimeAccess} from '../../src/db/permissions.js';
import {provisionMaintenanceUser} from '../../src/auth/administration.js';
import {issueToken} from '../../src/auth/tokens.js';
const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL required');
const suffix=randomUUID().replaceAll('-',''),schema='solar_maintenance_'+suffix,role='solar_maint_'+suffix;
const owner=new Pool({connectionString:url,options:`-c search_path=${schema},pg_catalog -c timezone=UTC`});
const runtime=new Pool({connectionString:url,options:`-c search_path=${schema},pg_catalog -c timezone=UTC -c role=${role}`});
const config=parseEnv({NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:'maintenance-test-secret-more-than-thirty-two-characters'});
const app=createApp({database:{pool:runtime,checkConnection:async()=>{}},logger:pino({level:'silent'}),config});
const province=randomUUID(),district=randomUUID(),substation=randomUUID();let token:string,analyst:string,maintenanceId:string;let createdRole=false;
const body=()=>({gridSubstationId:substation,meterId:'meter-'+randomUUID(),siteLabel:'Metadata test',capacityKw:4.125,commissionedDate:'2026-01-01',isActive:false});
const base='/maintenance/installations';const auth=(r:request.Test,t=token)=>r.auth(t,{type:'bearer'});
const create=()=>auth(request(app).post(base)).send(body());
beforeAll(async()=>{
 await runMigrations(owner,{schema});await owner.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);createdRole=true;
 await grantRuntimeAccess(owner,{schema,role,installationMaintenance:true});
 await owner.query("INSERT INTO provinces(id,code,name) VALUES ($1,'P','Province')",[province]);
 await owner.query("INSERT INTO districts(id,province_id,code,name) VALUES ($1,$2,'D','District')",[district,province]);
 await owner.query("INSERT INTO grid_substations(id,district_id,code,name) VALUES ($1,$2,'S','Substation')",[substation,district]);
 const user=await provisionMaintenanceUser(owner,{email:'maintenance@example.test',password:'private-test-maintenance-password'});maintenanceId=user.id;
 const login=await request(app).post('/auth/token').send({principalType:'maintenance',identifier:'maintenance@example.test',password:'private-test-maintenance-password'});expect(login.status).toBe(200);token=login.body.accessToken;
 const id=randomUUID();await owner.query("INSERT INTO users(id,email,password_hash,role) VALUES($1,'national@example.test','unused','national')",[id]);
 analyst=(await issueToken({kind:'analyst',subject:id,credentialVersion:1,role:'national',provinceId:null,districtId:null,scopes:['geography:read','installation:read']},config)).accessToken;
});
afterAll(async()=>{await runtime.end();await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);if(createdRole)await owner.query(`DROP ROLE "${role}"`);await owner.end()});
describe('installation metadata lifecycle with column-restricted runtime grants',()=>{
 it('isolates maintenance authentication from analysts and readings',async()=>{
  expect((await request(app).post('/auth/token').send({principalType:'analyst',identifier:'maintenance@example.test',password:'private-test-maintenance-password'})).status).toBe(401);
  expect((await auth(request(app).get(base),analyst)).status).toBe(403);
  expect((await auth(request(app).get('/readings'))).status).toBe(403);
  expect((await request(app).get(base)).status).toBe(401);
 });
 it('creates canonical metadata with headers, readable by an analyst without credential fields',async()=>{
  const r=await create();expect(r.status).toBe(201);expect(r.headers.location).toBe(base+'/'+r.body.id);
  const get=await auth(request(app).get(r.headers.location!));expect(get.body).toEqual(r.body);expect(get.headers.etag).toBe(r.headers.etag);expect(get.headers['last-modified']).toBeTruthy();
  expect((await auth(request(app).get(r.headers.location!).set('If-None-Match',r.headers.etag!))).status).toBe(304);
  const analystGet=await auth(request(app).get('/installations/'+r.body.id),analyst);expect(analystGet.status).toBe(200);expect(JSON.stringify(analystGet.body)).not.toMatch(/credential|password/);
 });
 it('requires full replacement and If-Match; repeated identical PUT retains its representation',async()=>{
  const r=await create(),path=r.headers.location!,input={...body(),meterId:r.body.meterId,siteLabel:'Replacement'};
  expect((await auth(request(app).put(path)).send(input)).status).toBe(428);
  expect((await auth(request(app).put(path).set('If-Match',r.headers.etag!)).send({siteLabel:'Partial'})).status).toBe(400);
  const updated=await auth(request(app).put(path).set('If-Match',r.headers.etag!)).send(input);expect(updated.status).toBe(200);expect(updated.body.siteLabel).toBe('Replacement');
  expect((await auth(request(app).put(path).set('If-Match',r.headers.etag!)).send(input)).status).toBe(412);
  expect((await auth(request(app).put(path).set('If-Match','W/'+updated.headers.etag!)).send(input)).status).toBe(412);
  const repeated=await auth(request(app).put(path).set('If-Match',updated.headers.etag!)).send(input);expect(repeated.status).toBe(200);expect(repeated.body).toEqual(updated.body);expect(repeated.headers.etag).toBe(updated.headers.etag);
 });
 it('allows one winner among concurrent PUTs against the same version',async()=>{
  const r=await create();const input={...body(),meterId:r.body.meterId};
  const a=auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...input,siteLabel:'A'});
  const b=auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...input,siteLabel:'B'});
  expect((await Promise.all([a,b])).map(x=>x.status).sort()).toEqual([200,412]);
 });
 it('rejects duplicate meters, unknown substations, invalid dates, precision, credentials and mutable identity',async()=>{
  const input=body();expect((await auth(request(app).post(base)).send(input)).status).toBe(201);
  expect((await auth(request(app).post(base)).send(input)).status).toBe(409);
  expect((await auth(request(app).post(base)).send({...body(),gridSubstationId:randomUUID()})).status).toBe(409);
  for(const extra of [{commissionedDate:'2026-02-30'},{capacityKw:1.0001},{credentialHash:'injected'}])expect((await auth(request(app).post(base)).send({...body(),...extra})).status).toBe(400);
  const r=await create();expect((await auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...body(),meterId:r.body.meterId+'-changed'})).status).toBe(409);
 });
 it('deletes only installations without history and repeat DELETE has no further effect',async()=>{
  const r=await create(),path=r.headers.location!;
  expect((await auth(request(app).delete(path))).status).toBe(428);
  expect((await auth(request(app).delete(path).set('If-Match','"stale"'))).status).toBe(412);
  expect((await auth(request(app).delete(path).set('If-Match',r.headers.etag!))).status).toBe(204);
  expect((await auth(request(app).delete(path).set('If-Match',r.headers.etag!))).status).toBe(404);
  expect((await auth(request(app).get(path))).status).toBe(404);
 });
 it('preserves retained readings and commissioning date while allowing a site label change',async()=>{
  const r=await create();await owner.query("INSERT INTO generation_readings(installation_id,timestamp,power_kw,cumulative_energy_kwh,voltage) VALUES($1,'2026-02-01T00:00Z',0,0,230)",[r.body.id]);
  const input={...body(),meterId:r.body.meterId};
  expect((await auth(request(app).delete(r.headers.location!).set('If-Match',r.headers.etag!))).status).toBe(409);
  expect((await auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...input,commissionedDate:'2026-01-02'})).status).toBe(409);
  expect((await auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...input,siteLabel:'New label'})).status).toBe(200);
  expect((await owner.query('SELECT count(*)::int AS count FROM generation_readings WHERE installation_id=$1',[r.body.id])).rows[0].count).toBe(1);
 });
 it('restricts SQL credential writes and history mutation even with metadata grants',async()=>{
  const r=await create();await expect(runtime.query("UPDATE solar_installations SET credential_hash='injected' WHERE id=$1",[r.body.id])).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query('UPDATE generation_readings SET power_kw=0')).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query("INSERT INTO users(email,password_hash,role) VALUES('injected@test.example','x','maintenance')")).rejects.toMatchObject({code:'42501'});
  await grantRuntimeAccess(owner,{schema,role,installationMaintenance:true});
  await expect(grantRuntimeAccess(owner,{schema,role})).rejects.toThrow('unexpected');
 });
 it('revokes old device tokens when an installation is deactivated and reactivated',async()=>{
  const input={...body(),isActive:true};const r=await auth(request(app).post(base)).send(input);
  const device=(await issueToken({kind:'installation',subject:r.body.id,installationId:r.body.id,credentialVersion:1,scopes:['readings:write']},config)).accessToken;
  const inactive=await auth(request(app).put(r.headers.location!).set('If-Match',r.headers.etag!)).send({...input,isActive:false});expect(inactive.status).toBe(200);
  const active=await auth(request(app).put(r.headers.location!).set('If-Match',inactive.headers.etag!)).send(input);expect(active.status).toBe(200);
  expect((await auth(request(app).post(`/installations/${r.body.id}/readings`),device).send({timestamp:'2026-02-01T00:00:00Z',powerKw:0,cumulativeEnergyKwh:0,voltage:230})).status).toBe(401);
 });
 it('serializes deletion with concurrent device ingestion without orphaning readings',async()=>{
  const input={...body(),isActive:true};const r=await auth(request(app).post(base)).send(input);
  const device=(await issueToken({kind:'installation',subject:r.body.id,installationId:r.body.id,credentialVersion:1,scopes:['readings:write']},config)).accessToken;
  const results=await Promise.all([
    auth(request(app).delete(r.headers.location!).set('If-Match',r.headers.etag!)),
    auth(request(app).post(`/installations/${r.body.id}/readings`),device).send({timestamp:'2026-02-01T00:00:00Z',powerKw:0,cumulativeEnergyKwh:0,voltage:230})
  ]);
  expect([[204,401],[409,201]]).toContainEqual(results.map(x=>x.status));
  const count=(await owner.query('SELECT count(*)::int AS count FROM generation_readings WHERE installation_id=$1',[r.body.id])).rows[0].count;
  expect(count).toBe(results[1]!.status===201?1:0);
 });
 it('revalidates maintenance credentials on every request',async()=>{
  await owner.query('UPDATE users SET credential_version=credential_version+1 WHERE id=$1',[maintenanceId]);
  expect((await auth(request(app).get(base))).status).toBe(401);
 });
});
