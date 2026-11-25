import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');
for(const file of ['0000_white_starjammers.sql','0001_clever_sprite.sql']) sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
const adapter={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}}};
adapter.batch=async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}};
globalThis.__shopTestEnv={DB:adapter};
const source=readFileSync(new URL('../app/api/shop/route.ts',import.meta.url),'utf8').replace("import { env } from 'cloudflare:workers';","const env = globalThis.__shopTestEnv;").replace("'../../../lib/core.mjs'",JSON.stringify(new URL('../lib/core.mjs',import.meta.url).href));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const base='http://localhost';
async function fetch(url,options={}){const req=new Request(url,options);return options.method==='POST'?POST(req):GET(req)}
async function request(body){const r=await fetch(base+'/api/shop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
async function get(params=''){const r=await fetch(base+'/api/shop?'+params);assert.equal(r.status,200);return r.json();}
test('shared records: lookup, customer-scoped parts, vehicle ownership, revisions and concurrent payments',async()=>{
 const suffix=crypto.randomUUID().slice(0,8);
 const c=await request({action:'customer',name:'Local API Test '+suffix,phone:'(212) 555-0112'});assert.equal(c.status,200);
 const other=await request({action:'customer',name:'Other Local Test '+suffix,phone:'(212) 555-0113'});assert.equal(other.status,200);
 const v=await request({action:'vehicle',customerId:c.id,year:'2020',make:'Toyota',model:'Corolla',plate:'TST'+suffix.slice(0,4)});assert.equal(v.status,200);
 let payload={action:'job',customerId:c.id,vehicleId:v.id,kind:'Estimate',status:'Draft',date:'2026-11-24',dueDate:'',mileage:12345,title:'Axle service '+suffix,notes:'Road tested',taxBps:662,items:[{description:'Front brake pads',partNumber:'BP-1204',type:'Part',quantity:2,rateCents:8995,taxable:true},{description:'Installation',partNumber:'',type:'Labor',quantity:1.5,rateCents:12000,taxable:false}]};
 const invalid=await request({...payload,customerId:other.id});assert.equal(invalid.status,400);
 const j=await request(payload);assert.equal(j.status,200);
 let row=(await get('job='+j.id)).job;assert.equal(row.total_cents,37181);
 assert.equal((await get('q=2125550112')).jobs.some(x=>x.id===j.id),true);
 assert.equal((await get('q=brakes&customer='+c.id)).jobs.some(x=>x.id===j.id),true);
 assert.equal((await get('q=brakes&customer='+other.id)).jobs.some(x=>x.id===j.id),false);
 assert.equal((await get('q=BP-1204')).jobs.some(x=>x.id===j.id),true);
 assert.equal((await get('q='+encodeURIComponent('TST'+suffix.slice(0,4)))).jobs.some(x=>x.id===j.id),true);
 const edited=await request({...payload,id:j.id,revision:row.revision,title:'Updated service '+suffix});assert.equal(edited.status,200);
 const stale=await request({...payload,id:j.id,revision:row.revision});assert.equal(stale.status,409);
 row=(await get('job='+j.id)).job;assert.equal(row.revision,2);assert.equal(row.title,'Updated service '+suffix);
 assert.equal((await request({action:'convert',id:j.id,revision:row.revision})).status,200);
 const results=await Promise.all([1,2].map(()=>request({action:'payment',jobId:j.id,amountCents:30000,date:'2026-11-24',method:'Cash',note:'Local QA only'})));assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 row=(await get('job='+j.id)).job;assert.equal(row.paid_cents,30000);assert.equal(row.total_cents-row.paid_cents,7181);
 assert.equal((await request({...payload,id:j.id,revision:row.revision})).status,409);
 const r=await fetch(base+'/api/shop?backup=1');const backup=await r.json();assert.equal(backup.format,'shop-desk-v1');assert.equal(backup.jobs.some(x=>x.id===j.id),true);
 const badOrigin=await fetch(base+'/api/shop',{method:'POST',headers:{'content-type':'application/json','origin':'https://unrelated.example'},body:JSON.stringify({action:'customer',name:'No',phone:'2125550111'})});assert.equal(badOrigin.status,400);
});

test('production API rejects missing platform identity', async()=>{const r=await GET(new Request('https://shop.example/api/shop'));assert.equal(r.status,400);assert.match((await r.json()).error,/sign in/)});

test('customer signup saves the first vehicle together, validates before writing, and rolls back both on failure',async()=>{
 const body={action:'customer',name:'Combined Signup',phone:'(732) 555-0144',vehicle:{year:'2021',make:'Honda',model:'Odyssey',plate:'abc123',vin:'',color:'White',notes:'First family vehicle'}};
 const saved=await request(body);assert.equal(saved.status,200);assert.ok(saved.vehicleId);
 const state=await get();const c=state.customers.find(c=>c.id===saved.id);const v=state.vehicles.find(v=>v.id===saved.vehicleId);
 assert.equal(c.name,'Combined Signup');assert.equal(v.customer_id,c.id);assert.equal(v.make,'Honda');assert.equal(v.plate,'ABC123');assert.equal(v.notes,'First family vehicle');
 const invalid=await request({...body,name:'Invalid Combined Signup',vehicle:{...body.vehicle,vin:'INVALID'}});assert.equal(invalid.status,400);
 assert.equal((await get()).customers.some(c=>c.name==='Invalid Combined Signup'),false);
 sqlite.exec("CREATE TEMP TRIGGER reject_test_vehicle BEFORE INSERT ON vehicles WHEN NEW.make='Fail insert' BEGIN SELECT RAISE(ABORT,'Test failure'); END");
 try{const failed=await request({...body,name:'Rollback Combined Signup',vehicle:{...body.vehicle,make:'Fail insert'}});assert.equal(failed.status,500);assert.equal((await get()).customers.some(c=>c.name==='Rollback Combined Signup'),false);}finally{sqlite.exec('DROP TRIGGER reject_test_vehicle')}
 const edit=await request({action:'customer',id:saved.id,name:'Edited Combined Signup',phone:'(732) 555-0144'});assert.equal(edit.status,200);
 assert.equal((await get()).vehicles.filter(v=>v.customer_id===saved.id).length,1);
});
