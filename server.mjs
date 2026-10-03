import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { config, saleActive } from './config.mjs';
import { products, home, productPage, infoPage, notFound, sitemap, categoryPaths, escape } from './render.mjs';

const production=process.env.NODE_ENV==='production', port=Number(process.env.PORT||3000);
if(production){
 const required=['PUBLIC_ORIGIN','ADMIN_PASSWORD','SELLER_NAME','SELLER_INN','SELLER_ADDRESS','PRIVACY_EMAIL'];
 for(const key of required)if(!process.env[key])throw new Error(`Set ${key} before launch.`);
 if(!/^https:\/\//.test(config.origin)||/your-domain|example\./.test(config.origin))throw new Error('Set the real HTTPS origin.');
 if(process.env.ADMIN_PASSWORD.length<20)throw new Error('ADMIN_PASSWORD must have at least 20 characters.');
}
const dataDir=resolve(process.env.DATA_DIR||'./data');mkdirSync(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(dataDir,'leads.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER, bulk INTEGER NOT NULL, consent TEXT NOT NULL, attribution TEXT NOT NULL, path TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
function cleanup(){db.prepare('DELETE FROM leads WHERE created_at < ?').run(new Date(Date.now()-90*86400000).toISOString());db.prepare('DELETE FROM rate_limits WHERE expires < ?').run(Date.now());}
cleanup();setInterval(cleanup,3600000).unref();
const hash=v=>createHash('sha256').update(v).digest('hex');
function limited(req,scope,max){
 const ip=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
 const key=hash(`${scope}|${ip}|${Math.floor(Date.now()/3600000)}`);
 db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,Date.now()+3600000);
 return db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key).count>max;
}
function headers(type='text/html; charset=utf-8'){return {'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' https://mc.yandex.ru https://mc.yandex.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com; connect-src 'self' https://mc.yandex.ru https://mc.yandex.com; frame-src https://mc.yandex.ru https://mc.yandex.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'Cache-Control':'no-store'};}
function send(res,status,body,type,extra={}){res.writeHead(status,{...headers(type),...extra});res.end(body);}
function json(res,status,obj){send(res,status,JSON.stringify(obj),'application/json; charset=utf-8');}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)throw Object.assign(new Error('Слишком большой запрос.'),{status:413});}try{return JSON.parse(raw)}catch{throw Object.assign(new Error('Неверный формат заявки.'),{status:400});}}
const text=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max):'';
async function lead(req,res){
 if(req.headers.origin!==new URL(config.origin).origin)return json(res,403,{error:'Обновите страницу и отправьте заявку с сайта магазина.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Отправьте заявку через форму на сайте или позвоните в магазин.'});
 if(limited(req,'requests',60))return json(res,429,{error:'Слишком много запросов. Позвоните нам или попробуйте через час.'});
 const input=await body(req);
 if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,{error:'Неверный формат заявки.'});
 if(text(input.website))return json(res,400,{error:'Не удалось отправить форму. Позвоните в магазин.'});
 let digits=text(input.phone,24).replace(/\D/g,'');if(digits.length===10)digits='7'+digits;if(digits.length===11&&digits[0]==='8')digits='7'+digits;
 if(!/^7\d{10}$/.test(digits))return json(res,400,{error:'Укажите телефон в формате +7 999 123-45-67.'});
 if(input.consent!==true)return json(res,400,{error:'Необходимо согласие на обработку данных для ответа на заявку.'});
 if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>999)return json(res,400,{error:'Укажите количество от 1 до 999.'});
 if(typeof input.requestId!=='string'||!/^[\da-f-]{36}$/i.test(input.requestId))return json(res,400,{error:'Обновите страницу перед отправкой.'});
 const model=text(input.model,60),p=products.find(p=>p.slug===model),variant=text(input.variant,40);
 if(model&&!p)return json(res,400,{error:'Выберите модель из каталога.'});
 if(variant&&(!p||!p.variants.some(v=>v.sku===variant&&v.stock>0)))return json(res,400,{error:'Выберите доступный цвет выбранной модели.'});
 const attribution={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){if(input.attribution&&typeof input.attribution==='object'&&typeof input.attribution[key]==='string')attribution[key]=text(input.attribution[key],250);}
 const name=text(input.name,80),phone='+'+digits,path=text(input.path,150),fingerprint=hash(JSON.stringify({name,phone,model,variant,quantity:input.quantity}));
 const prior=db.prepare('SELECT id,fingerprint FROM leads WHERE request_id=?').get(input.requestId);
 if(prior){if(prior.fingerprint!==fingerprint)return json(res,409,{error:'Данные заявки изменились. Обновите страницу и повторите.'});return json(res,200,{ok:true,id:prior.id});}
 if(limited(req,'leads',10))return json(res,429,{error:'Лимит заявок на этот час исчерпан. Позвоните нам, и мы поможем с заказом.'});
 const id='Q-'+randomUUID().slice(0,8).toUpperCase(),created=new Date().toISOString(),bulk=input.quantity>=config.bulkFrom;
 const unitPrice=p&&saleActive()?(bulk?p.price:p.price+config.singleUnitSurcharge):null;
 db.prepare('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,input.requestId,fingerprint,created,name,phone,model,variant,input.quantity,unitPrice,bulk?1:0,'2026-10-02-v1',JSON.stringify(attribution),path);
 // Success is returned ONLY after the durable database write completes.
 return json(res,201,{ok:true,id});
}
function authorized(req){const expected=`Basic ${Buffer.from(`${process.env.ADMIN_USER||'manager'}:${process.env.ADMIN_PASSWORD||''}`).toString('base64')}`;return !!process.env.ADMIN_PASSWORD&&timingSafeEqual(Buffer.from(hash(req.headers.authorization||'')),Buffer.from(hash(expected)));}
function admin(req,res,path){
 if(!authorized(req)){if(limited(req,'admin-auth',30))return send(res,429,'Попробуйте позже.','text/plain; charset=utf-8');return send(res,401,'Требуется доступ менеджера.','text/plain; charset=utf-8',{'WWW-Authenticate':'Basic realm="QRONGE manager", charset="UTF-8"'});}
 const list=db.prepare('SELECT id,created_at,name,phone,model,variant,quantity,price,bulk,attribution,path,consent FROM leads ORDER BY created_at DESC LIMIT 5000').all();
 if(path==='/admin/leads.csv'){const cols=['id','created_at','name','phone','model','variant','quantity','price','bulk','attribution','path','consent'];const safe=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';return send(res,200,'\uFEFF'+[cols.join(';'),...list.map(r=>cols.map(k=>safe(r[k])).join(';'))].join('\r\n'),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="qronge-leads.csv"'});}
 send(res,200,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Заявки QRONGE</title><style>body{font:15px/1.5 Arial;padding:25px;color:#222}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:12px;vertical-align:top}small{color:#777}.wrap{overflow:auto}a{color:#285591}</style><h1>Заявки QRONGE</h1><p>${list.length} заявок · <a href="/admin/leads.csv">Скачать CSV</a> · <a href="/admin/">Обновить</a></p><p>Новые заявки появляются здесь. Перед поездкой клиента подтвердите наличие, комплектацию и стоимость. Уведомления в мессенджер пока не подключены.</p><div class="wrap"><table><thead><tr><th>Дата / номер</th><th>Покупатель</th><th>Модель</th><th>Количество</th><th>Цена из каталога</th><th>Источник</th></tr></thead><tbody>${list.map(r=>`<tr><td>${escape(new Date(r.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))}<br><small>${escape(r.id)}</small></td><td>${escape(r.name)}<br><a href="tel:${escape(r.phone)}">${escape(r.phone)}</a></td><td>${escape(products.find(p=>p.slug===r.model)?.name||'Помощь с выбором')}<br><small>${escape(r.variant||'Цвет уточнить')}</small></td><td>${r.quantity}${r.bulk?'<br><strong>Индивидуальная цена</strong>':''}</td><td>${r.price?`${r.price} ₽ / шт.`:'По запросу'}</td><td>${escape(r.attribution)}<br><small>${escape(r.path)}</small></td></tr>`).join('')}</tbody></table></div></html>`);
}
const staticRoot=resolve('public');
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,config.origin),path=decodeURIComponent(u.pathname);
  if(path==='/healthz')return json(res,200,{ok:db.prepare('SELECT 1 AS ok').get().ok===1});
  if(path==='/api/leads'){if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});return await lead(req,res);}
  if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed','text/plain');
  if(path==='/admin'||path.startsWith('/admin/'))return admin(req,res,path);
  if(path==='/robots.txt')return send(res,200,`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /privacy/\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&model /\nSitemap: ${config.origin}/sitemap.xml\n`,'text/plain; charset=utf-8');
  if(path==='/sitemap.xml')return send(res,200,sitemap(),'application/xml; charset=utf-8');
  if(path==='/')return send(res,200,home());
  if(path==='/privacy/'||path==='/terms/')return send(res,200,infoPage(path.split('/')[1]));
  for(const [cat,route] of Object.entries(categoryPaths))if(path===route)return send(res,200,home(cat,route));
  const p=products.find(p=>path===`/catalog/${p.slug}/`);if(p)return send(res,200,productPage(p));
  if(!path.endsWith('/')&&!extname(path)&&(products.some(p=>path===`/catalog/${p.slug}`)||Object.values(categoryPaths).includes(path+'/')||['/privacy','/terms'].includes(path))){res.writeHead(308,{Location:path+'/'+u.search});return res.end();}
  const file=resolve(staticRoot,'.'+path);
  if(file.startsWith(staticRoot+'/')&&existsSync(file)&&extname(file))return send(res,200,readFileSync(file),({'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream',{'Cache-Control':'public, max-age=3600'});
  return send(res,404,notFound());
 }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Не удалось обработать запрос. Повторите позже или позвоните нам.'});else res.end();console.error('Request failed:',error.name);}
});
server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(port,'0.0.0.0',()=>console.log(`QRONGE ready at http://localhost:${port}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>{db.close();process.exit(0)}));
