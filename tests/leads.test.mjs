import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { once } from 'node:events';
import { saleActive } from '../config.mjs';

test('lead journey: persistence, idempotency, validation, private admin and price integrity', {skip:!process.env.DATABASE_URL}, async()=>{
 const origin='http://127.0.0.1:3017';
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'test',PORT:'3017',PUBLIC_ORIGIN:origin,DATABASE_URL:process.env.DATABASE_URL,ADMIN_PASSWORD:'test-only-password-12345'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(new Error('Server failed to start')))});
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 await db.query('TRUNCATE leads, rate_limits');
 const sample=()=>({requestId:crypto.randomUUID(),phone:'+79990000000',name:'Тест',model:'waterfall-235',variant:'R1010038',quantity:1,consent:true,attribution:{utm_source:'yandex',yclid:'test-click'},price:1,path:'/'});
 const post=(payload,source=origin)=>fetch(origin+'/api/leads',{method:'POST',headers:{origin:source,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 try{
  assert.equal((await fetch(origin+'/')).status,200);
  const first=sample(), response=await post(first);assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.ok,true);
  assert.equal((await(await post(first)).json()).id,saved.id,'repeat must return same saved lead');
  assert.equal((await post({...first,quantity:2})).status,409,'idempotency collision must reject changed request');
  assert.equal((await post({...sample(),consent:false})).status,400);
  assert.equal((await post({...sample(),phone:'123'})).status,400);
  assert.equal((await post({...sample(),variant:'R1010004'})).status,400,'color SKU must belong to model');
  assert.equal((await post({...sample(),quantity:1.5})).status,400);
  assert.equal((await post(sample(),'https://other.example')).status,403);
  assert.equal((await post({...sample(),quantity:3})).status,201);
  assert.equal((await post({...sample(),quantity:10})).status,201);
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM leads')).rows[0].n),3);
  const record=(await db.query('SELECT * FROM leads WHERE id=$1',[saved.id])).rows[0];assert.equal(record.price,saleActive()?35000:null,'single-unit price is wholesale price plus the configured surcharge');assert.equal(JSON.parse(record.attribution).yclid,'test-click');assert.equal((await db.query('SELECT bulk FROM leads WHERE quantity=3')).rows[0].bulk,0);assert.equal((await db.query('SELECT bulk FROM leads WHERE quantity=10')).rows[0].bulk,1);assert.equal((await db.query('SELECT price FROM leads WHERE quantity=10')).rows[0].price,saleActive()?27000:null);
  assert.equal((await fetch(origin+'/admin/')).status,401);assert.equal((await fetch(origin+'/catalog.json')).status,404);
  const admin=await fetch(origin+'/admin/leads.csv',{headers:{Authorization:'Basic '+Buffer.from('manager:test-only-password-12345').toString('base64')}});assert.equal(admin.status,200);assert.match(await admin.text(),/Q-/);
  assert.equal((await fetch(origin+'/nonexistent')).status,404);
  const sitemap=await(await fetch(origin+'/sitemap.xml')).text();assert.match(sitemap,/catalog\/waterfall-235/);
 }finally{server.kill();await once(server,'exit');await db.end();}
});
test('sale ends exactly at November 1, Moscow time',()=>{
 assert.equal(saleActive(Date.parse('2026-10-31T23:59:59+03:00')),true);
 assert.equal(saleActive(Date.parse('2026-11-01T00:00:00+03:00')),false);
});
