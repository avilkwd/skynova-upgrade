'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FilePenLine,File,Copy,Mail,FileMinus2,Wallet,FileDown,RefreshCw,Archive,Trash2,Undo2,UserRound,ChevronRight} from 'lucide-react';
import {balance} from '../lib/shop-display';
export function InvoiceActions({job,onAction,readOnly=false,busy=false}:{job:any,onAction:(action:string,job:any,value?:string)=>void,readOnly?:boolean,busy?:boolean}){
 const [position,setPosition]=useState<any>(null),[sub,setSub]=useState(false);const anchor=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const inactive=!!job.deleted_at||!!job.archived_at,credit=job.kind==='Credit Note';
 useEffect(()=>{if(!position)return;const close=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!anchor.current?.contains(event.target as Node))setPosition(null);};const reset=()=>setPosition(null);const scroll=(event:Event)=>{if(!menu.current?.contains(event.target as Node))reset();};window.addEventListener('pointerdown',close);window.addEventListener('resize',reset);window.addEventListener('scroll',scroll,true);menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('resize',reset);window.removeEventListener('scroll',scroll,true);};},[position]);
 const run=(action:string,value?:string)=>{setPosition(null);setSub(false);onAction(action,job,value);};
 const item=(action:string,label:string,Icon:any,disabled=false,title='')=><button key={action} type="button" role="menuitem" disabled={disabled||busy} title={title} onClick={()=>run(action)}><Icon size={18}/><span>{label}</span></button>;
 return <><button ref={anchor} type="button" className="invoice-action-trigger" aria-label={'Actions for '+job.number} aria-haspopup="menu" aria-expanded={!!position} onClick={()=>{if(position){setPosition(null);return;}const rect=anchor.current!.getBoundingClientRect();setSub(false);const height=Math.min(470,window.innerHeight-16),top=rect.bottom+height+12>window.innerHeight?Math.max(8,rect.top-height):rect.bottom+3;setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-290)),top,maxHeight:window.innerHeight-top-8});}}>▾</button>{position&&createPortal(<div ref={menu} className="invoice-action-menu" style={position} role="menu" aria-label={'Invoice actions for '+job.number} onKeyDown={event=>{if(event.key==='Escape'){setPosition(null);anchor.current?.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length;buttons[next]?.focus();}}}>
 {item('edit','Edit',FilePenLine,readOnly||inactive||credit,credit?'Issued credit notes cannot be edited.':'')}
 {item('view','View',File)}
 {item('duplicate','Duplicate',Copy,readOnly||credit,'Creates a new unsaved draft without payments or credits.')}
 {item('send','Send',Mail,true,'Email sending is paused for now.')}
 {job.kind==='Invoice'&&item('credit','Convert to Credit Note',FileMinus2,readOnly||inactive||job.total_cents-(job.credited_cents||0)<=0)}
 {job.kind==='Invoice'&&item('payment','Record Payment',Wallet,readOnly||inactive||balance(job)<=0)}
 {item('pdf','Download/Print PDF',FileDown)}
 <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub} disabled={readOnly||inactive||busy} onClick={()=>setSub(!sub)}><RefreshCw size={18}/><span>Change Status to:</span><ChevronRight size={15}/></button>
 {sub&&<div className="action-status-options" role="group" aria-label="Choose document status">{(credit?['Void']:['Draft','Sent','Approved','In progress','Completed','Declined']).map(value=><button role="menuitem" key={value} disabled={credit&&job.status==='Void'} onClick={()=>run('status',value)}>{value}</button>)}{!credit&&<p>Paid and Partial follow recorded payments and credits.</p>}</div>}
 {!job.deleted_at&&item(job.archived_at?'unarchive':'archive',job.archived_at?'Unarchive':'Archive',Archive,readOnly)}
 {job.deleted_at?item('restore','Restore',Undo2,readOnly):item('delete','Delete',Trash2,readOnly||(credit&&job.status!=='Void'),credit&&job.status!=='Void'?'Void this credit note before deleting it.':'Moves to Deleted; you can restore it.')}
 <div className="menu-rule"/>{item('history','Customer History',UserRound)}
 </div>,document.body)}</>;
}
