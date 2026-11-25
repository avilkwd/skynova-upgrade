import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,date,searchTerms,like} from '../lib/core.mjs';
const part={description:'Brake pads',partNumber:'BP-1204',type:'Part',quantity:2,rateCents:8995,taxable:true};
test('money: cents, fractional labor, and tax only on selected lines',()=>{const r=calculate([part,{...part,type:'Labor',description:'Brake installation',quantity:1.5,rateCents:12000,taxable:false}],662);assert.equal(r.subtotalCents,35990);assert.equal(r.taxCents,1191);assert.equal(r.totalCents,37181);});
test('rounds line amounts and tax to cents',()=>{assert.equal(calculate([{...part,quantity:1.125,rateCents:111}],0).totalCents,125)});
test('rejects negative and non-finite quantities, fractions of cents, invalid tax',()=>{for(const quantity of [-1,0,Infinity,NaN,0.0001])assert.throws(()=>calculate([{...part,quantity}],0));assert.throws(()=>calculate([{...part,rateCents:1.2}],0));assert.throws(()=>calculate([part],-1));assert.throws(()=>calculate([part],2501));assert.throws(()=>calculate([],0))});
test('calendar dates are real dates',()=>{assert.equal(date('2024-02-29'),'2024-02-29');for(const d of ['2026-02-29','2026-02-30','bad','2026-13-01'])assert.throws(()=>date(d))});
test('search limits terms and escapes SQL wildcard characters',()=>{assert.deepEqual(searchTerms(' Daniel   BRAKES '),['daniel','brake']);assert.equal(like('BP_12%'),'%BP\\_12\\%%')});
