'use client';
import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {findCustomers,customerSearchFields,vehicleSearchFields} from '../lib/customer-search.mjs';
import {car} from '../lib/shop-display';

export function CustomerPicker({customers,vehicles,value,disabled,onSelect,onNewCustomer}:{customers:any[],vehicles:any[],value:string,disabled:boolean,onSelect:(customer:any,vehicleId:string)=>void,onNewCustomer:()=>void}) {
 const [open,setOpen]=useState(false),[filters,setFilters]=useState<Record<string,string>>({});
 const trigger=useRef<HTMLButtonElement>(null),root=useRef<HTMLDivElement>(null);
 const panelId=useId(),fieldPrefix=useId();
 const hasFilters=Object.values(filters).some(value=>value.trim());
 const chosen=customers.find(customer=>customer.id===value);
 const results=useMemo(()=>findCustomers(customers,vehicles,filters),[customers,vehicles,filters]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
 useEffect(()=>{setOpen(false);setFilters({})},[value]);
 function close(){setOpen(false);trigger.current?.focus()}
 function select(result:any){onSelect(result.customer,result.matchedVehicleId);close()}
 return <div className="customer-picker" ref={root}>
  <button ref={trigger} type="button" className="customer-picker-trigger" disabled={disabled} aria-label={chosen?'Change customer: '+chosen.name:'Find customer'} aria-expanded={open} aria-controls={panelId} onClick={()=>{setFilters({});setOpen(!open)}}><span>{chosen?.name||'Find customer…'}</span>{!disabled&&<span className="customer-picker-action">{chosen?'Change':'Search'}</span>}</button>
  {open&&<section id={panelId} className="customer-picker-panel" aria-label="Customer search" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}>
   <div className="customer-picker-heading"><strong>Find Customer</strong><button type="button" className="link" onClick={close}>Close</button></div>
   <p className="customer-search-help">Fill in any field. Combine fields to narrow the matches.</p>
   {[{name:'Customer details',fields:customerSearchFields},{name:'Vehicle details',fields:vehicleSearchFields}].map(group=><fieldset className="customer-search-fields" key={group.name}><legend>{group.name}</legend><div>{group.fields.map(field=><label key={field.key} htmlFor={fieldPrefix+'-'+field.key}><span>{field.label}</span><input id={fieldPrefix+'-'+field.key} type={field.key==='phone'?'tel':'text'} inputMode={field.key==='phone'?'tel':field.key==='year'?'numeric':'text'} autoFocus={field.key==='name'} autoComplete="off" maxLength={200} placeholder={field.placeholder} value={filters[field.key]||''} onChange={event=>setFilters(current=>({...current,[field.key]:event.target.value}))} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(results.length===1)select(results[0])}}}/></label>)}</div></fieldset>)}
   <div className="customer-search-summary"><div className="customer-search-status" role="status">{!hasFilters?'Enter a detail to find a customer.':results.length?results.length+' matching customer'+(results.length===1?'':'s')+(results.length>20?' — showing 20. Refine your search.':''): 'No customers found. Change or clear a field to try again.'}</div>{hasFilters&&<button type="button" className="link" onClick={()=>setFilters({})}>Clear fields</button>}</div>
   {results.length>0&&<ul className="customer-search-results" aria-label="Matching customers">{results.slice(0,20).map((result:any)=><li key={result.customer.id}><button type="button" onClick={()=>select(result)}><strong>{result.customer.name}</strong><span>{[result.customer.phone,result.customer.email].filter(Boolean).join(' · ')}</span>{result.customer.address&&<span>{result.customer.address}</span>}{result.vehicles.length>0&&<span>{result.vehicles.slice(0,3).map((vehicle:any)=>[car(vehicle),vehicle.plate&&'Plate: '+vehicle.plate,vehicle.vin&&'VIN: '+vehicle.vin].filter(Boolean).join(' · ')).join('; ')}{result.vehicles.length>3?' · More vehicles':''}</span>}{result.customer.notes&&<span className="customer-result-notes">{result.customer.notes}</span>}</button></li>)}</ul>}
   <button type="button" className="link customer-picker-new" onClick={()=>{setOpen(false);onNewCustomer()}}>New Customer &amp; Vehicle</button>
  </section>}
 </div>
}
