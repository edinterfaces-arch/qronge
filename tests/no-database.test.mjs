import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('read-only deployment starts without PostgreSQL and disables lead routes', async()=>{
 const origin='http://127.0.0.1:3018';
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',PORT:'3018',PUBLIC_ORIGIN:'',ADMIN_PASSWORD:'',SELLER_NAME:'',SELLER_INN:'',SELLER_ADDRESS:'',PRIVACY_EMAIL:'',DATABASE_URL:'',DATABASE_CA_CERT:''},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(new Error('Read-only server failed to start')))});
 try{
  assert.equal((await fetch(origin+'/')).status,200);
  assert.equal((await fetch(origin+'/healthz')).status,200);
  assert.equal((await fetch(origin+'/readyz')).status,503);
  assert.equal((await fetch(origin+'/admin/')).status,503);
  const response=await fetch(origin+'/api/leads',{method:'POST',headers:{origin:'https://qronge-test.local','Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/ещё не настроен/);
 }finally{server.kill();await once(server,'exit');}
});
