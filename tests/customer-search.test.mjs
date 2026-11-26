import test from 'node:test';
import assert from 'node:assert/strict';
import {findCustomers} from '../lib/customer-search.mjs';
const customers=[{id:'a',name:'José Cohen',phone:'(732) 555-0142',phone_digits:'7325550142',email:'jose@example.com',address:'14 River Avenue Lakewood',notes:'Call before repairs'},{id:'b',name:'Jose Cohen',phone:'848-555-0188',email:'other@example.com',address:'2 Main Street',notes:''}];
const vehicles=[{id:'v1',customer_id:'a',year:'2019',make:'Toyota',model:'Camry',plate:'ABC-123',vin:'4T1B11HK0KU123456',color:'Silver',notes:'Spare key in office'},{id:'v2',customer_id:'a',year:'2021',make:'Honda',model:'Odyssey',plate:'XYZ789'},{id:'v3',customer_id:'b',year:'2018',make:'Ford',model:'F-150'}];
const ids=query=>findCustomers(customers,vehicles,query).map(result=>result.customer.id);
test('customer search waits for input, includes duplicate names and all customer fields',()=>{
 assert.deepEqual(ids(''),[]);assert.deepEqual(ids('  '),[]);assert.deepEqual(ids('---'),[]);
 assert.deepEqual(ids('jose cohen'),['a','b']);
 for(const query of ['jose@example.com','River Avenue','Lakewood','before repairs'])assert.deepEqual(ids(query),['a']);
});
test('phone searches accept formatting, partial digits and US country code',()=>{
 for(const query of ['7325550142','(732) 555-0142','+1 (732) 555-0142','555-0142','0142'])assert.deepEqual(ids(query),['a']);
 assert.deepEqual(ids('9999999'),[]);
});
test('vehicle fields and mixed customer/vehicle queries find the owner and matching vehicle',()=>{
 for(const query of ['2019','2019 Toyota','ABC123','4T1B11HK0KU123456','Silver','Spare key','Cohen Odyssey'])assert.deepEqual(ids(query),['a']);
 assert.equal(findCustomers(customers,vehicles,'Cohen Odyssey')[0].matchedVehicleId,'v2');
 assert.equal(findCustomers(customers,vehicles,'Jose')[0].matchedVehicleId,'');
 assert.deepEqual(ids('Ford River'),[]);
 assert.deepEqual(ids('unknown customer'),[]);
});
