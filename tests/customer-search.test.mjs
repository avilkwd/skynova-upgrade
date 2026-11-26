import test from 'node:test';
import assert from 'node:assert/strict';
import {findCustomers} from '../lib/customer-search.mjs';
const customers=[{id:'a',name:'José Cohen',phone:'(732) 555-0142',phone_digits:'7325550142',email:'jose@example.com',address:'14 River Avenue Lakewood',notes:'Call before repairs'},{id:'b',name:'Jose Cohen',phone:'848-555-0188',email:'other@example.com',address:'2 Main Street',notes:''}];
const vehicles=[{id:'v1',customer_id:'a',year:'2019',make:'Toyota',model:'Camry',plate:'ABC-123',vin:'4T1B11HK0KU123456',color:'Silver',notes:'Spare key in office'},{id:'v2',customer_id:'a',year:'2021',make:'Honda',model:'Odyssey',plate:'XYZ789'},{id:'v3',customer_id:'b',year:'2018',make:'Ford',model:'F-150'}];
const ids=filters=>findCustomers(customers,vehicles,filters).map(result=>result.customer.id);
test('separate customer fields search only their own parameter',()=>{
 assert.deepEqual(ids({}),[]);assert.deepEqual(ids({name:'  '}),[]);assert.deepEqual(ids({name:'---'}),[]);
 assert.deepEqual(ids({name:'jose cohen'}),['a','b']);
 for(const [key,value] of Object.entries({email:'jose@example.com',address:'River Avenue',customerNotes:'before repairs'}))assert.deepEqual(ids({[key]:value}),['a']);
 assert.deepEqual(ids({name:'River'}),[]);assert.deepEqual(ids({email:'Cohen'}),[]);assert.deepEqual(ids({address:'repairs'}),[]);assert.deepEqual(ids({phone:'2019'}),[]);
});
test('phone field accepts formatting, partial digits and US country code',()=>{
 for(const phone of ['7325550142','(732) 555-0142','+1 (732) 555-0142','555-0142','0142'])assert.deepEqual(ids({phone}),['a']);
 assert.deepEqual(ids({phone:'9999999'}),[]);assert.deepEqual(ids({phone:'ABC'}),[]);
});
test('each vehicle parameter finds the owner and matching vehicle',()=>{
 for(const [key,value] of Object.entries({year:'2019',make:'Toyota',model:'Camry',plate:'ABC123',vin:'4T1B11HK0KU123456',color:'Silver',vehicleNotes:'Spare key'}))assert.deepEqual(ids({[key]:value}),['a']);
 assert.deepEqual(ids({make:'Camry'}),[]);assert.deepEqual(ids({model:'Toyota'}),[]);
 assert.equal(findCustomers(customers,vehicles,{model:'Odyssey'})[0].matchedVehicleId,'v2');
 assert.equal(findCustomers(customers,vehicles,{name:'Jose'})[0].matchedVehicleId,'');
});
test('combined filters must all match and vehicle parameters must belong to one car',()=>{
 assert.deepEqual(ids({name:'Jose',phone:'0142'}),['a']);
 assert.deepEqual(ids({name:'Cohen',year:'2021',make:'Honda',model:'Odyssey'}),['a']);
 assert.deepEqual(ids({make:'Toyota',model:'Odyssey'}),[]);
 assert.deepEqual(ids({name:'Jose',phone:'9999999'}),[]);
 assert.deepEqual(ids({phone:'0188',model:'Odyssey'}),[]);
 assert.deepEqual(ids({name:'Jose',email:'other@example.com'}),['b']);
});
