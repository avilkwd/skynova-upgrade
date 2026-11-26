import { env } from 'cloudflare:workers';
import { calculate, required, optional, date, integer, searchTerms, like, vehicleValues, taxMillis, InputError } from '../../../lib/core.mjs';
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
const paidSql=(alias='j')=>`COALESCE((SELECT SUM(amount_cents) FROM payments WHERE job_id=${alias}.id),0)`;
const creditedSql=(alias='j')=>`COALESCE((SELECT SUM(total_cents) FROM jobs credit WHERE credit.source_invoice_id=${alias}.id AND credit.kind='Credit Note' AND credit.status='Issued'),0)`;
const jobSelect=`SELECT j.*,c.name customer_name,c.phone customer_phone,v.year,v.make,v.model,v.plate,v.vin,${paidSql()} paid_cents,${creditedSql()} credited_cents,(SELECT number FROM jobs original WHERE original.id=j.source_invoice_id) source_number FROM jobs j JOIN customers c ON c.id=j.customer_id JOIN vehicles v ON v.id=j.vehicle_id`;
function serialize(j:any){return {...j,items:JSON.parse(j.items)};}
export async function GET(req:Request){try{
 protect(req);const p=new URL(req.url).searchParams,d=db();
 if(p.get('job')){
  const j=await d.prepare(jobSelect+' WHERE j.id=?').bind(p.get('job')).first();if(!j)return response({error:'Document not found.'},404);
  const [payments,credits]=await Promise.all([d.prepare('SELECT * FROM payments WHERE job_id=? ORDER BY date DESC').bind(j.id).all(),d.prepare("SELECT id,number,date,status,total_cents FROM jobs WHERE source_invoice_id=? AND kind='Credit Note' ORDER BY date DESC,created_at DESC").bind(j.id).all()]);
  return response({job:serialize(j),payments:payments.results,credits:credits.results});
 }
 if(p.has('backup')){const result:any={format:'shop-desk-v1',exportedAt:now()};for(const table of ['customers','vehicles','jobs','payments','payment_changes','settings'])result[table]=(await d.prepare(`SELECT * FROM ${table}`).all()).results;return new Response(JSON.stringify(result,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="shop-desk-backup-${today()}.json"`,'Cache-Control':'no-store'}});}
 const clauses:string[]=[],args:any[]=[];
 for(const term of searchTerms(p.get('q'))){const digits=term.replace(/\D/g,'');clauses.push(`(lower(c.name||' '||c.phone||' '||c.email||' '||v.year||' '||v.make||' '||v.model||' '||v.plate||' '||v.vin||' '||j.title||' '||j.notes||' '||j.number) LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(j.items) i WHERE lower(json_extract(i.value,'$.description')||' '||json_extract(i.value,'$.partNumber')) LIKE ? ESCAPE '\\')${digits.length>=3?" OR c.phone_digits LIKE ? ESCAPE '\\'":''})`);args.push(like(term),like(term));if(digits.length>=3)args.push(like(digits));}
 for(const [key,col] of [['customer','customer_id'],['vehicle','vehicle_id'],['kind','kind']] as const)if(p.get(key)){clauses.push('j.'+col+'=?');args.push(p.get(key));}
 const selected=p.get('status')||'All',paid=paidSql(),credited=creditedSql();
 if(selected==='Deleted')clauses.push('j.deleted_at IS NOT NULL');
 else if(selected==='Archived')clauses.push('j.deleted_at IS NULL AND j.archived_at IS NOT NULL');
 else{
  clauses.push('j.deleted_at IS NULL AND j.archived_at IS NULL');
  if(selected!=='All'){
   const day=p.get('today')?date(p.get('today')):today();
   clauses.push(`(CASE WHEN j.kind='Credit Note' THEN j.status WHEN j.kind='Invoice' AND j.total_cents>0 AND ${credited}>=j.total_cents THEN 'Credited' WHEN j.kind='Invoice' AND j.total_cents>0 AND ${paid}>=j.total_cents THEN 'Paid' WHEN j.kind='Invoice' AND j.total_cents>0 AND ${paid}+${credited}>=j.total_cents THEN 'Settled' WHEN ${paid}+${credited}>0 THEN 'Partial' WHEN j.kind='Invoice' AND j.status!='Draft' AND j.due_date!='' AND j.due_date<? AND j.total_cents>${paid}+${credited} THEN 'Late' ELSE j.status END)=?`);args.push(day,selected);
  }
 }
 if(p.get('from')){clauses.push('j.date>=?');args.push(date(p.get('from')));}if(p.get('to')){clauses.push('j.date<=?');args.push(date(p.get('to')));}
 const where=' WHERE '+clauses.join(' AND '),limit=p.get('limit')?integer(p.get('limit'),'page size',1,100):100,offset=p.get('offset')?integer(p.get('offset'),'page offset',0,10000000):0,sort=p.get('sort')==='oldest'?'ASC':'DESC';
 const [customers,vehicles,jobs,settings,stats,count]=await Promise.all([
  d.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all(),d.prepare('SELECT * FROM vehicles ORDER BY year DESC').all(),
  d.prepare(jobSelect+where+` ORDER BY j.date ${sort},j.created_at ${sort}`+(p.get('all')==='1'?'':` LIMIT ${limit} OFFSET ${offset}`)).bind(...args).all(),d.prepare("SELECT * FROM settings WHERE id='shop'").first(),
  d.prepare(`SELECT COUNT(*) documents,COALESCE(SUM(CASE WHEN j.kind='Invoice' THEN MAX(0,j.total_cents-${paid}-${credited}) ELSE 0 END),0) outstanding,SUM(CASE WHEN j.status='In progress' THEN 1 ELSE 0 END) active FROM jobs j WHERE j.deleted_at IS NULL`).first(),
  d.prepare(`SELECT COUNT(*) n,COALESCE(SUM(CASE WHEN j.kind='Credit Note' THEN CASE WHEN j.status='Issued' THEN -j.total_cents ELSE 0 END ELSE j.total_cents END),0) total,COALESCE(SUM(CASE WHEN j.kind='Invoice' THEN MAX(0,j.total_cents-${paid}-${credited}) ELSE 0 END),0) balance FROM jobs j JOIN customers c ON c.id=j.customer_id JOIN vehicles v ON v.id=j.vehicle_id`+where).bind(...args).first()
 ]);
 return response({customers:customers.results,vehicles:vehicles.results,jobs:jobs.results.map(serialize),settings:settings||{name:'ANR Empire',phone:'',address:'',email:'',terms:'',tax_bps:0},stats,count:count?.n||0,totals:{total:count?.total||0,balance:count?.balance||0}});
}catch(e:any){return response({error:e instanceof InputError?e.message:'Unable to load shop records. Please try again.'},e instanceof InputError?400:500);}}
export async function POST(req:Request){try{
  protect(req);if(Number(req.headers.get('content-length'))>300000)return response({error:'Request too large.'},413);
  const raw=await req.text(); if(raw.length>300000)return response({error:'Request too large.'},413);const b=JSON.parse(raw);const d=db();let result:any;
  switch(b.action){
    case 'customer':{
      const cid=b.id||id(),name=required(b.name,'Customer name'),phone=required(b.phone,'Phone number',50),digits=phone.replace(/\D/g,''); if(digits.length<7||digits.length>15)throw new InputError('Enter a phone number with 7–15 digits.');
      const values=[name,phone,digits,optional(b.email,200),optional(b.address,500),optional(b.notes)];
      if(b.id){result=await d.prepare('UPDATE customers SET name=?,phone=?,phone_digits=?,email=?,address=?,notes=? WHERE id=?').bind(...values,cid).run();if(!result.meta.changes)return response({error:'Customer no longer exists.'},404);return response({id:cid});}
      const firstVehicle=b.vehicle==null?null:vehicleValues(b.vehicle);
      const vehicleId=firstVehicle?id():null;
      const inserts=[d.prepare('INSERT INTO customers(name,phone,phone_digits,email,address,notes,id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(...values,cid,now())];
      if(firstVehicle)inserts.push(d.prepare('INSERT INTO vehicles(year,make,model,plate,vin,color,notes,id,customer_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(...firstVehicle,vehicleId,cid));
      await d.batch(inserts);
      return response({id:cid,vehicleId});}
    case 'vehicle':{
      const vid=b.id||id();if(!await d.prepare('SELECT id FROM customers WHERE id=?').bind(b.customerId).first())throw new InputError('Choose an existing customer.');
      const values=vehicleValues(b);
      if(b.id){result=await d.prepare('UPDATE vehicles SET year=?,make=?,model=?,plate=?,vin=?,color=?,notes=? WHERE id=? AND customer_id=?').bind(...values,vid,b.customerId).run();if(!result.meta.changes)return response({error:'Vehicle not found.'},404);}else await d.prepare('INSERT INTO vehicles(year,make,model,plate,vin,color,notes,id,customer_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(...values,vid,b.customerId).run();return response({id:vid});}
    case 'job':{
      const vehicle=await d.prepare('SELECT * FROM vehicles WHERE id=? AND customer_id=?').bind(b.vehicleId,b.customerId).first();if(!vehicle)throw new InputError('Choose a vehicle belonging to this customer.');
      const credit=b.kind==='Credit Note';
      if(!['Estimate','Invoice','Credit Note'].includes(b.kind)||(!credit&&!['Draft','Sent','Approved','In progress','Completed','Declined'].includes(b.status)))throw new InputError('Choose a valid document type and status.');
      const defaultMillis=b.taxRate==null?integer(b.taxBps,'tax rate',0,2500)*10:taxMillis(b.taxRate);
      if(!Array.isArray(b.items))throw new InputError('Add at least one line item.');
      const calc=calculate(b.items.map((item:any)=>({...item,taxRate:item.taxRate??defaultMillis/1000})),Math.round(defaultMillis/10)),creationId=b.creationId==null?null:required(b.creationId,'Draft identifier',36);
      if(creationId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creationId))throw new InputError('Invalid draft identifier.');
      const jid=b.id||creationId||id();
      const values=[b.customerId,b.vehicleId,b.kind,credit?'Issued':b.status,date(b.date),b.dueDate?date(b.dueDate):'',b.mileage===''||b.mileage==null?null:integer(b.mileage,'mileage',0,10000000),required(b.title,'Job title',300),optional(b.notes),JSON.stringify(calc.items),calc.taxBps,calc.totalCents,defaultMillis];
      const existingDraft=async()=>{
        if(!creationId||b.id)return null;
        const previous:any=await d.prepare('SELECT * FROM jobs WHERE id=?').bind(jid).first();if(!previous)return null;
        const fields=['customer_id','vehicle_id','kind','status','date','due_date','mileage','title','notes','items','tax_bps','total_cents','tax_millis'];
        if(fields.every((field,n)=>previous[field]===values[n])&&(previous.source_invoice_id||null)===(credit?b.sourceInvoiceId:null))return response({id:jid});
        return response({error:'This draft was already saved or changed. Reload the saved document before editing it.'},409);
      };
      const previous=await existingDraft();if(previous)return previous;
      if(b.id){
        // Issued credit notes are immutable. Paid invoices can be corrected without changing ownership or removing recorded money.
        result=await d.prepare(`UPDATE jobs AS j SET customer_id=?,vehicle_id=?,kind=?,status=?,date=?,due_date=?,mileage=?,title=?,notes=?,items=?,tax_bps=?,total_cents=?,tax_millis=?,revision=revision+1 WHERE id=? AND revision=? AND kind!='Credit Note' AND archived_at IS NULL AND deleted_at IS NULL AND (?=0) AND (MAX(${paidSql()},${creditedSql()})<=?) AND ((${paidSql()}+${creditedSql()}=0) OR (kind=? AND customer_id=? AND vehicle_id=?))`).bind(...values,jid,integer(b.revision,'revision',1,1000000000),credit?1:0,calc.totalCents,b.kind,b.customerId,b.vehicleId).run();
        if(!result.meta.changes)return response({error:'Document changed, is archived/deleted, or the edit conflicts with recorded payments or credits. Reload and check it.'},409);
      }else{
        const number=(credit?'CN-':'RO-')+jid.replace(/-/g,'').slice(0,10).toUpperCase();
        if(credit){
          if(calc.totalCents<=0)throw new InputError('A credit note must have a positive amount.');
          const sourceId=required(b.sourceInvoiceId,'Original invoice');
          result=await d.prepare(`INSERT OR IGNORE INTO jobs(customer_id,vehicle_id,kind,status,date,due_date,mileage,title,notes,items,tax_bps,total_cents,tax_millis,id,number,created_at,source_invoice_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM jobs j WHERE j.id=? AND j.kind='Invoice' AND j.customer_id=? AND j.vehicle_id=? AND j.archived_at IS NULL AND j.deleted_at IS NULL AND j.total_cents-${creditedSql()}>=?`).bind(...values,jid,number,now(),sourceId,sourceId,b.customerId,b.vehicleId,calc.totalCents).run();
          if(!result.meta.changes){const retried=await existingDraft();if(retried)return retried;return response({error:'Credit exceeds the remaining invoice amount, or the original invoice changed or is archived/deleted. Reload the invoice.'},409);}
        }else await d.prepare('INSERT INTO jobs(customer_id,vehicle_id,kind,status,date,due_date,mileage,title,notes,items,tax_bps,total_cents,tax_millis,id,number,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values,jid,number,now()).run();
      }
      return response({id:jid});}
    case 'document_action':{
      const docId=required(b.id,'Document'),revision=integer(b.revision,'revision',1,1000000000);
      let change='',condition='',values:any[]=[];
      switch(b.operation){
        case 'archive':change='archived_at=?';condition='deleted_at IS NULL AND archived_at IS NULL';values=[now()];break;
        case 'unarchive':change='archived_at=NULL';condition='deleted_at IS NULL AND archived_at IS NOT NULL';break;
        case 'delete':change='deleted_at=?';condition="deleted_at IS NULL AND (kind!='Credit Note' OR status='Void')";values=[now()];break;
        case 'restore':change='deleted_at=NULL';condition='deleted_at IS NOT NULL';break;
        case 'status':{
          if(!['Draft','Sent','Approved','In progress','Completed','Declined','Void'].includes(b.status))throw new InputError('Choose a valid status. Payment statuses update from payments and credits.');
          change='status=?';values=[b.status];condition=b.status==='Void'?"kind='Credit Note' AND status='Issued' AND archived_at IS NULL AND deleted_at IS NULL":"kind!='Credit Note' AND archived_at IS NULL AND deleted_at IS NULL";break;
        }
        default:throw new InputError('Unknown document action.');
      }
      result=await d.prepare(`UPDATE jobs SET ${change},revision=revision+1 WHERE id=? AND revision=? AND ${condition}`).bind(...values,docId,revision).run();
      if(!result.meta.changes)return response({error:'Document changed or this action is unavailable. Issued credit notes must be voided before deletion. Reload and try again.'},409);
      return response({id:docId});}
    case 'convert':{result=await d.prepare("UPDATE jobs SET kind='Invoice',status='Approved',revision=revision+1 WHERE id=? AND kind='Estimate' AND revision=? AND archived_at IS NULL AND deleted_at IS NULL").bind(b.id,integer(b.revision,'revision',1,1000000000)).run();if(!result.meta.changes)return response({error:'Estimate changed. Reload and try again.'},409);return response({id:b.id});}
    case 'payment':{
      const cents=integer(b.amountCents,'payment amount',1,10000000000);if(!['Cash','Check','Card','Bank transfer','Other'].includes(b.method))throw new InputError('Choose a payment method.');
      result=await d.prepare(`INSERT INTO payments(id,job_id,amount_cents,date,method,note) SELECT ?,j.id,?,?,?,? FROM jobs j WHERE j.id=? AND j.kind='Invoice' AND j.archived_at IS NULL AND j.deleted_at IS NULL AND j.total_cents-${paidSql()}-${creditedSql()}>=?`).bind(id(),cents,date(b.date),b.method,optional(b.note),b.jobId,cents).run();if(!result.meta.changes)return response({error:'Payment exceeds the current balance, or this invoice is archived/deleted. Reload and check the balance.'},409);return response({ok:true});}
    case 'payment_edit':{
      const paymentId=required(b.id,'Payment'),jobId=required(b.jobId,'Invoice'),revision=integer(b.revision,'payment revision',1,1000000000);
      const cents=integer(b.amountCents,'payment amount',1,10000000000),paymentDate=date(b.date),note=optional(b.note),changedAt=now();
      if(!['Cash','Check','Card','Bank transfer','Other'].includes(b.method))throw new InputError('Choose a payment method.');
      // Both statements run in one transaction; the same guard controls the audit entry and update.
      const condition=`p.id=? AND p.job_id=? AND p.revision=? AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=p.job_id AND j.kind='Invoice' AND j.archived_at IS NULL AND j.deleted_at IS NULL AND ?<=MAX(p.amount_cents,j.total_cents-${creditedSql()}-COALESCE((SELECT SUM(other.amount_cents) FROM payments other WHERE other.job_id=j.id AND other.id!=p.id),0)))`;
      const guard=[paymentId,jobId,revision,cents];
      const after=JSON.stringify({amount_cents:cents,date:paymentDate,method:b.method,note,revision:revision+1});
      const results=await d.batch([
        d.prepare(`INSERT INTO payment_changes(id,payment_id,before_json,after_json,changed_at,actor_id) SELECT ?,p.id,json_object('amount_cents',p.amount_cents,'date',p.date,'method',p.method,'note',p.note,'revision',p.revision),?,?,? FROM payments p WHERE ${condition}`).bind(id(),after,changedAt,req.headers.get('oai-authenticated-user-id'),...guard),
        d.prepare(`UPDATE payments AS p SET amount_cents=?,date=?,method=?,note=?,revision=revision+1,updated_at=? WHERE ${condition}`).bind(cents,paymentDate,b.method,note,changedAt,...guard)
      ]);
      if(!results[1].meta.changes)return response({error:'Payment changed on another computer, exceeds the available invoice balance, or belongs to an archived/deleted invoice. Reload the invoice and try again.'},409);
      return response({ok:true,revision:revision+1});}
    case 'settings':{
      const millis=b.taxRate==null?integer(b.taxBps,'tax rate',0,2500)*10:taxMillis(b.taxRate);
      await d.prepare("INSERT INTO settings(id,name,phone,address,email,terms,tax_bps,tax_millis) VALUES('shop',?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address,email=excluded.email,terms=excluded.terms,tax_bps=excluded.tax_bps,tax_millis=excluded.tax_millis").bind(required(b.name,'Shop name'),optional(b.phone,50),optional(b.address,500),optional(b.email,200),optional(b.terms),Math.round(millis/10),millis).run();return response({ok:true});}
    default:throw new InputError('Unknown action.');
  }
}catch(e:any){return response({error:e instanceof InputError?e.message:e instanceof SyntaxError?'Invalid request.':'Could not save. Please try again.'},e instanceof InputError||e instanceof SyntaxError?400:500);}}
