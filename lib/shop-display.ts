export const amount=(cents:number)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format((cents||0)/100);
export const money=(cents:number)=>'$'+amount(cents);
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const dateText=(value:string)=>value?new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}):'';
export const car=(v:any)=>[v?.year,v?.make,v?.model].filter(Boolean).join(' ');
export const balance=(j:any)=>Math.max(0,j.total_cents-(j.paid_cents||0)-(j.credited_cents||0));
export const creditDue=(j:any)=>Math.max(0,(j.paid_cents||0)+(j.credited_cents||0)-j.total_cents);
export function status(j:any){
 if(j.deleted_at)return 'Deleted';if(j.archived_at)return 'Archived';if(j.kind==='Credit Note')return j.status;
 if(j.kind==='Invoice'&&j.total_cents>0){if((j.credited_cents||0)>=j.total_cents)return 'Credited';if((j.paid_cents||0)>=j.total_cents)return 'Paid';if(balance(j)===0)return 'Settled';}
 if((j.paid_cents||0)+(j.credited_cents||0)>0)return 'Partial';
 if(j.kind==='Invoice'&&j.status!=='Draft'&&j.due_date&&j.due_date<today()&&balance(j)>0)return 'Late';return j.status;
}
export const daysOld=(date:string)=>Math.max(0,Math.round((Date.parse(today()+'T12:00:00')-Date.parse(date+'T12:00:00'))/86400000));

export const defaultTaxRate=(record:any)=>record?.tax_millis==null?(record?.tax_bps||0)/100:record.tax_millis/1000;
