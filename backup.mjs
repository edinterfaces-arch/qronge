import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const folder=resolve('backups');mkdirSync(folder,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'data','leads.sqlite'));
const name=resolve(folder,`leads-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
await backup(db,name);db.close();
for(const file of readdirSync(folder)){const path=resolve(folder,file);if(file.endsWith('.sqlite')&&statSync(path).mtimeMs<Date.now()-7*86400000)unlinkSync(path);}
console.log(name);
