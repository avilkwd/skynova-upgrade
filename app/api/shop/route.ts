import { env } from 'cloudflare:workers';
import { calculate, required, optional, date, integer, searchTerms, like, InputError } from '../../../lib/core.mjs';
export const dynamic = 'force-dynamic';
const response=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function db(){if(!env.DB)throw new Error('Database unavailable.'); return env.DB;}
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const today=()=>now().slice(0,10);
function protect(req:Request){
  // The private Sites access policy protects every request. Never publish this app publicly.
  if(!['localhost','127.0.0.1'].includes(new URL(req.url).hostname) && !req.headers.get('oai-authenticated-user-id')) throw new InputError('Please sign in to access the shop.');
  if(req.method==='POST' && req.headers.get('origin') && req.headers.get('origin')!==new URL(req.url).origin) throw new InputError('Invalid request origin.');
}
const jobSelect=`SELECT j.*, c.name customer_name, c.phone customer_phone, v.year, v.make, v.model, v.plate, v.vin, COALESCE((SELECT SUM(amount_cents) FROM payments WHERE job_id=j.id),0) paid_cents FROM jobs j JOIN customers c ON c.id=j.customer_id JOIN vehicles v ON v.id=j.vehicle_id`;
function serialize(j:any){return {...j, items:JSON.parse(j.items)};}
export async function GET(req:Request){try{
  protect(req); const url=new URL(req.url); const p=url.searchParams; const d=db();
  if(p.get('job')){const j=await d.prepare(jobSelect+' WHERE j.id=?').bind(p.get('job')).first(); if(!j)return response({error:'Document not found.'},404); const payments=await d.prepare('SELECT * FROM payments WHERE job_id=? ORDER BY date DESC').bind(p.get('job')).all();return response({job:serialize(j),payments:payments.results});}
  if(p.has('backup')){const result:any={format:'shop-desk-v1',exportedAt:now()}; for(const table of ['customers','vehicles','jobs','payments','settings'])result[table]=(await d.prepare(`SELECT * FROM ${table}`).all()).results;return new Response(JSON.stringify(result,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="shop-desk-backup-${today()}.json"`,'Cache-Control':'no-store'}});}
  const clauses:string[]=[];const args:any[]=[];
  for(const term of searchTerms(p.get('q'))){const digits=term.replace(/\D/g,'');clauses.push(`(lower(c.name||' '||c.phone||' '||c.email||' '||v.year||' '||v.make||' '||v.model||' '||v.plate||' '||v.vin||' '||j.title||' '||j.notes||' '||j.number) LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(j.items) i WHERE lower(json_extract(i.value,'$.description')||' '||json_extract(i.value,'$.partNumber')) LIKE ? ESCAPE '\\')${digits.length>=3?" OR c.phone_digits LIKE ? ESCAPE '\\'":''})`);args.push(like(term),like(term));if(digits.length>=3)args.push(like(digits));}
  for(const [key,col] of [['customer','customer_id'],['vehicle','vehicle_id'],['kind','kind']] as const)if(p.get(key)){clauses.push('j.'+col+'=?');args.push(p.get(key));}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const all=p.get('all')==='1';
  const [customers,vehicles,jobs,settings,stats,count]=await Promise.all([
    d.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all(),d.prepare('SELECT * FROM vehicles ORDER BY year DESC').all(),
    d.prepare(jobSelect+where+' ORDER BY j.date DESC,j.created_at DESC'+(all?'':' LIMIT 100')).bind(...args).all(),
    d.prepare("SELECT * FROM settings WHERE id='shop'").first(),
    d.prepare("SELECT COUNT(*) documents, COALESCE(SUM(CASE WHEN kind='Invoice' THEN total_cents - COALESCE((SELECT SUM(amount_cents) FROM payments WHERE job_id=jobs.id),0) ELSE 0 END),0) outstanding, SUM(CASE WHEN status='In progress' THEN 1 ELSE 0 END) active FROM jobs").first(),
    d.prepare('SELECT COUNT(*) n FROM jobs j JOIN customers c ON c.id=j.customer_id JOIN vehicles v ON v.id=j.vehicle_id'+where).bind(...args).first()
  ]);return response({customers:customers.results,vehicles:vehicles.results,jobs:jobs.results.map(serialize),settings:settings||{name:'ANR Empire',phone:'',address:'',email:'',terms:'',tax_bps:0},stats,count:count?.n||0});
}catch(e:any){return response({error:e instanceof InputError?e.message:'Unable to load shop records. Please try again.'},e instanceof InputError?400:500);}}
export async function POST(req:Request){try{
  protect(req);if(Number(req.headers.get('content-length'))>300000)return response({error:'Request too large.'},413);
  const raw=await req.text(); if(raw.length>300000)return response({error:'Request too large.'},413);const b=JSON.parse(raw);const d=db();let result:any;
  switch(b.action){
    case 'customer':{
      const cid=b.id||id(),name=required(b.name,'Customer name'),phone=required(b.phone,'Phone number',50),digits=phone.replace(/\D/g,''); if(digits.length<7||digits.length>15)throw new InputError('Enter a phone number with 7–15 digits.');
      const values=[name,phone,digits,optional(b.email,200),optional(b.address,500),optional(b.notes)];
      if(b.id){result=await d.prepare('UPDATE customers SET name=?,phone=?,phone_digits=?,email=?,address=?,notes=? WHERE id=?').bind(...values,cid).run();if(!result.meta.changes)return response({error:'Customer no longer exists.'},404);}else await d.prepare('INSERT INTO customers(name,phone,phone_digits,email,address,notes,id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(...values,cid,now()).run();return response({id:cid});}
    case 'vehicle':{
      const vid=b.id||id();if(!await d.prepare('SELECT id FROM customers WHERE id=?').bind(b.customerId).first())throw new InputError('Choose an existing customer.');
      const values=[optional(b.year,4),required(b.make,'Make',80),required(b.model,'Model',80),optional(b.plate,30).toUpperCase(),optional(b.vin,17).toUpperCase(),optional(b.color,50),optional(b.notes)];
      if(values[0]&&!/^\d{4}$/.test(values[0]))throw new InputError('Enter a four-digit vehicle year.');
      if(values[4]&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(values[4]))throw new InputError('VIN must contain 17 valid characters.');
      if(b.id){result=await d.prepare('UPDATE vehicles SET year=?,make=?,model=?,plate=?,vin=?,color=?,notes=? WHERE id=? AND customer_id=?').bind(...values,vid,b.customerId).run();if(!result.meta.changes)return response({error:'Vehicle not found.'},404);}else await d.prepare('INSERT INTO vehicles(year,make,model,plate,vin,color,notes,id,customer_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(...values,vid,b.customerId).run();return response({id:vid});}
    case 'job':{
      const vehicle=await d.prepare('SELECT * FROM vehicles WHERE id=? AND customer_id=?').bind(b.vehicleId,b.customerId).first(); if(!vehicle)throw new InputError('Choose a vehicle belonging to this customer.');
      if(!['Estimate','Invoice'].includes(b.kind)||!['Draft','Approved','In progress','Completed','Declined'].includes(b.status))throw new InputError('Choose a valid document type and status.');
      const calc=calculate(b.items,b.taxBps); const jid=b.id||id(); const values=[b.customerId,b.vehicleId,b.kind,b.status,date(b.date),b.dueDate?date(b.dueDate):'',b.mileage===''||b.mileage==null?null:integer(b.mileage,'mileage',0,10000000),required(b.title,'Job title',300),optional(b.notes),JSON.stringify(calc.items),calc.taxBps,calc.totalCents];
      if(b.id){result=await d.prepare('UPDATE jobs SET customer_id=?,vehicle_id=?,kind=?,status=?,date=?,due_date=?,mileage=?,title=?,notes=?,items=?,tax_bps=?,total_cents=?,revision=revision+1 WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM payments WHERE job_id=jobs.id)').bind(...values,jid,integer(b.revision,'revision',1,1000000000)).run();if(!result.meta.changes)return response({error:'This document changed on another computer or already has payments. Reload it before continuing.'},409);}else {const number='RO-'+jid.replace(/-/g,'').slice(0,10).toUpperCase();await d.prepare('INSERT INTO jobs(customer_id,vehicle_id,kind,status,date,due_date,mileage,title,notes,items,tax_bps,total_cents,id,number,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values,jid,number,now()).run();}return response({id:jid});}
    case 'convert':{result=await d.prepare("UPDATE jobs SET kind='Invoice',status='Approved',revision=revision+1 WHERE id=? AND kind='Estimate' AND revision=?").bind(b.id,integer(b.revision,'revision',1,1000000000)).run();if(!result.meta.changes)return response({error:'Estimate changed. Reload and try again.'},409);return response({id:b.id});}
    case 'payment':{
      const cents=integer(b.amountCents,'payment amount',1,10000000000); if(!['Cash','Check','Card','Bank transfer','Other'].includes(b.method))throw new InputError('Choose a payment method.');
      result=await d.prepare("INSERT INTO payments(id,job_id,amount_cents,date,method,note) SELECT ?,id,?,?,?,? FROM jobs WHERE id=? AND kind='Invoice' AND total_cents-COALESCE((SELECT SUM(amount_cents) FROM payments WHERE job_id=jobs.id),0)>=?").bind(id(),cents,date(b.date),b.method,optional(b.note),b.jobId,cents).run();if(!result.meta.changes)return response({error:'Payment exceeds the current balance, or this is not an invoice. Reload and check the balance.'},409);return response({ok:true});}
    case 'settings':{await d.prepare("INSERT INTO settings(id,name,phone,address,email,terms,tax_bps) VALUES('shop',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address,email=excluded.email,terms=excluded.terms,tax_bps=excluded.tax_bps").bind(required(b.name,'Shop name'),optional(b.phone,50),optional(b.address,500),optional(b.email,200),optional(b.terms),integer(b.taxBps,'tax rate',0,2500)).run();return response({ok:true});}
    default:throw new InputError('Unknown action.');
  }
}catch(e:any){return response({error:e instanceof InputError?e.message:e instanceof SyntaxError?'Invalid request.':'Could not save. Please try again.'},e instanceof InputError||e instanceof SyntaxError?400:500);}}
