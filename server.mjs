import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { config, saleActive } from './config.mjs';
import { products, wholesalePage, productPage, infoPage, notFound, sitemap, categoryPaths, escape } from './render.mjs';

const production=process.env.NODE_ENV==='production', port=Number(process.env.PORT||3000);
const {Pool}=pg;
const databaseUrl=process.env.DATABASE_URL?.trim();
if(production&&databaseUrl){
 const required=['PUBLIC_ORIGIN','ADMIN_PASSWORD','SELLER_NAME','SELLER_INN','SELLER_ADDRESS'];
 for(const key of required)if(!process.env[key])throw new Error(`Set ${key} before launch.`);
 if(!/^https:\/\//.test(config.origin)||/your-domain|example\./.test(config.origin))throw new Error('Set the real HTTPS origin.');
 if(process.env.ADMIN_PASSWORD.length<20)throw new Error('ADMIN_PASSWORD must have at least 20 characters.');
}
if(production&&databaseUrl&&!process.env.DATABASE_CA_CERT)throw new Error('Set DATABASE_CA_CERT to the PostgreSQL CA certificate before launch.');
const pool=databaseUrl?new Pool({connectionString:databaseUrl,ssl:production?{ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n'),rejectUnauthorized:true}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000}):null;
if(pool)await pool.query(`CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER, bulk INTEGER NOT NULL, consent TEXT NOT NULL, attribution TEXT NOT NULL, path TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL);`);
async function cleanup(){await pool.query("DELETE FROM leads WHERE created_at < NOW() - INTERVAL '90 days'");await pool.query('DELETE FROM rate_limits WHERE expires < $1',[Date.now()]);}
if(pool){cleanup().catch(error=>console.error('Database cleanup failed:',error.name));setInterval(()=>cleanup().catch(error=>console.error('Database cleanup failed:',error.name)),3600000).unref();}
const hash=v=>createHash('sha256').update(v).digest('hex');
async function limited(req,scope,max){
 const ip=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
 const key=hash(`${scope}|${ip}|${Math.floor(Date.now()/3600000)}`);
 const result=await pool.query('INSERT INTO rate_limits(key,count,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count',[key,Date.now()+3600000]);
 return result.rows[0].count>max;
}
// Exact origins from Yandex's CSP integration guide; private responses stay unframeable.
const metrikaCollectors = ['ru','az','by','co.il','com','com.am','com.ge','com.tr','ee','fr','kg','kz','lt','lv','md','tj','tm','uz'].map(tld=>`https://mc.yandex.${tld}`).concat(['https://mc.webvisor.com','https://mc.webvisor.org']);
const metrikaFrames = ['metrika.yandex.ru','analytics.yandex.by','analytics.yandex.com','analytics.yandex.com.tr','analytics.yandex.kz','analytics.yandex.ru','metr.yandex.by','metr.yandex.com','metr.yandex.com.tr','metr.yandex.kz','metr.yandex.ru','metrica.ya.ru','metrica.yandex','metrica.yandex.by','metrica.yandex.com','metrica.yandex.com.tr','metrica.yandex.kz','metrica.yandex.ru','metrika.ya.ru','metrika.yandex','metrika.yandex.by','metrika.yandex.com','metrika.yandex.com.tr','metrika.yandex.kz','metrika.yandex.uz'].map(host=>`https://${host}`).join(' ');
function headers(type='text/html; charset=utf-8',publicPage=false){
 const collectors=metrikaCollectors.join(' '), sockets=metrikaCollectors.map(origin=>origin.replace('https:','wss:')).join(' ');
 return {'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...(!publicPage?{'X-Frame-Options':'DENY'}:{}),'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':`default-src 'self'; script-src 'self' ${collectors} https://yastatic.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${collectors}; connect-src 'self' ${collectors} ${sockets}; child-src blob: ${collectors}; frame-src blob: ${collectors} https://yandex.ru https://api-maps.yandex.ru; base-uri 'none'; form-action 'self'; frame-ancestors ${publicPage?metrikaFrames:"'none'"}`,'Cache-Control':'no-store'};
}
function send(res,status,body,type,extra={}){res.writeHead(status,{...headers(type),...extra});res.end(body);}
function sendPage(res,status,body,extra={}){res.writeHead(status,{...headers('text/html; charset=utf-8',true),...extra});res.end(body);}
function json(res,status,obj){send(res,status,JSON.stringify(obj),'application/json; charset=utf-8');}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)throw Object.assign(new Error('Слишком большой запрос.'),{status:413});}try{return JSON.parse(raw)}catch{throw Object.assign(new Error('Неверный формат заявки.'),{status:400});}}
const text=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max):'';
async function lead(req,res){
 if(!pool)return json(res,503,{error:'Приём заявок ещё не настроен. Позвоните в магазин.'});
 if(req.headers.origin!==new URL(config.origin).origin)return json(res,403,{error:'Обновите страницу и отправьте заявку с сайта магазина.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Отправьте заявку через форму на сайте или позвоните в магазин.'});
 if(await limited(req,'requests',60))return json(res,429,{error:'Слишком много запросов. Позвоните нам или попробуйте через час.'});
 const input=await body(req);
 if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,{error:'Неверный формат заявки.'});
 if(text(input.website))return json(res,400,{error:'Не удалось отправить форму. Позвоните в магазин.'});
 let digits=text(input.phone,24).replace(/\D/g,'');if(digits.length===10)digits='7'+digits;if(digits.length===11&&digits[0]==='8')digits='7'+digits;
 if(!/^7\d{10}$/.test(digits))return json(res,400,{error:'Укажите телефон в формате +7 999 123-45-67.'});
 if(input.consent!==true)return json(res,400,{error:'Необходимо согласие на обработку данных для ответа на заявку.'});
  if(!Number.isInteger(input.quantity)||input.quantity<config.minOrder||input.quantity>999)return json(res,400,{error:`Минимальный заказ — ${config.minOrder} шт. Заказ от ${config.minOrder} до ${config.bulkFrom-1} штук согласуется индивидуально.`});
 if(typeof input.requestId!=='string'||!/^[\da-f-]{36}$/i.test(input.requestId))return json(res,400,{error:'Обновите страницу перед отправкой.'});
 const model=text(input.model,60),p=products.find(p=>p.slug===model),variant=text(input.variant,40);
 if(model&&!p)return json(res,400,{error:'Выберите модель из каталога.'});
 if(variant&&(!p||!p.variants.some(v=>v.sku===variant&&v.stock>0)))return json(res,400,{error:'Выберите доступный цвет выбранной модели.'});
 const attribution={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid']){if(input.attribution&&typeof input.attribution==='object'&&typeof input.attribution[key]==='string')attribution[key]=text(input.attribution[key],250);}
 const name=text(input.name,80),phone='+'+digits,path=text(input.path,150),fingerprint=hash(JSON.stringify({name,phone,model,variant,quantity:input.quantity}));
 const prior=(await pool.query('SELECT id,fingerprint FROM leads WHERE request_id=$1',[input.requestId])).rows[0];
 if(prior){if(prior.fingerprint!==fingerprint)return json(res,409,{error:'Данные заявки изменились. Обновите страницу и повторите.'});return json(res,200,{ok:true,id:prior.id});}
 if(await limited(req,'leads',10))return json(res,429,{error:'Лимит заявок на этот час исчерпан. Позвоните нам, и мы поможем с заказом.'});
 const id='Q-'+randomUUID().slice(0,8).toUpperCase(),created=new Date().toISOString(),bulk=input.quantity>=config.bulkFrom;
 const unitPrice=p&&bulk&&saleActive()?p.price:null;
 const inserted=await pool.query('INSERT INTO leads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(request_id) DO NOTHING RETURNING id',[id,input.requestId,fingerprint,created,name,phone,model,variant,input.quantity,unitPrice,bulk?1:0,'2026-10-02-v1',JSON.stringify(attribution),path]);
 if(!inserted.rowCount){const concurrent=(await pool.query('SELECT id,fingerprint FROM leads WHERE request_id=$1',[input.requestId])).rows[0];if(concurrent.fingerprint!==fingerprint)return json(res,409,{error:'Данные заявки изменились. Обновите страницу и повторите.'});return json(res,200,{ok:true,id:concurrent.id});}
 // Success is returned ONLY after the durable database write completes.
 return json(res,201,{ok:true,id});
}
function authorized(req){const expected=`Basic ${Buffer.from(`${process.env.ADMIN_USER||'manager'}:${process.env.ADMIN_PASSWORD||''}`).toString('base64')}`;return !!process.env.ADMIN_PASSWORD&&timingSafeEqual(Buffer.from(hash(req.headers.authorization||'')),Buffer.from(hash(expected)));}
async function admin(req,res,path){
 if(!pool)return send(res,503,'Раздел заявок станет доступен после подключения базы данных.','text/plain; charset=utf-8');
 if(!authorized(req)){if(await limited(req,'admin-auth',30))return send(res,429,'Попробуйте позже.','text/plain; charset=utf-8');return send(res,401,'Требуется доступ менеджера.','text/plain; charset=utf-8',{'WWW-Authenticate':'Basic realm="QRONGE manager", charset="UTF-8"'});}
 const list=(await pool.query('SELECT id,created_at,name,phone,model,variant,quantity,price,bulk,attribution,path,consent FROM leads ORDER BY created_at DESC LIMIT 5000')).rows;
 if(path==='/admin/leads.csv'){const cols=['id','created_at','name','phone','model','variant','quantity','price','bulk','attribution','path','consent'];const safe=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';return send(res,200,'\uFEFF'+[cols.join(';'),...list.map(r=>cols.map(k=>safe(r[k])).join(';'))].join('\r\n'),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="qronge-leads.csv"'});}
 send(res,200,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Заявки QRONGE</title><style>body{font:15px/1.5 Arial;padding:25px;color:#222}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:12px;vertical-align:top}small{color:#777}.wrap{overflow:auto}a{color:#285591}</style><h1>Заявки QRONGE</h1><p>${list.length} заявок · <a href="/admin/leads.csv">Скачать CSV</a> · <a href="/admin/">Обновить</a></p><p>Новые заявки появляются здесь. Перед поездкой клиента подтвердите наличие, комплектацию и стоимость. Уведомления в мессенджер пока не подключены.</p><div class="wrap"><table><thead><tr><th>Дата / номер</th><th>Покупатель</th><th>Модель</th><th>Количество</th><th>Цена из каталога</th><th>Источник</th></tr></thead><tbody>${list.map(r=>`<tr><td>${escape(new Date(r.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))}<br><small>${escape(r.id)}</small></td><td>${escape(r.name)}<br><a href="tel:${escape(r.phone)}">${escape(r.phone)}</a></td><td>${escape(products.find(p=>p.slug===r.model)?.name||'Помощь с выбором')}<br><small>${escape(r.variant||'Цвет уточнить')}</small></td><td>${r.quantity}${r.bulk?'<br>Оптовая цена':'<br><strong>Согласовать условия</strong>'}</td><td>${r.price?`${r.price} ₽ / шт.`:'По запросу'}</td><td>${escape(r.attribution)}<br><small>${escape(r.path)}</small></td></tr>`).join('')}</tbody></table></div></html>`);
}
const staticRoot=resolve('public');
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,config.origin),path=decodeURIComponent(u.pathname);
  if(path==='/healthz')return json(res,200,{ok:true});
  if(path==='/readyz'){if(!pool)return json(res,503,{ok:false,database:'not_configured'});await pool.query('SELECT 1');return json(res,200,{ok:true});}
  if(path==='/api/leads'){if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});return await lead(req,res);}
  if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed','text/plain');
  if(path==='/admin'||path.startsWith('/admin/'))return await admin(req,res,path);
  if(path==='/robots.txt')return send(res,200,`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /healthz\nDisallow: /readyz\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&model /\nSitemap: ${config.origin}/sitemap.xml\n`,'text/plain; charset=utf-8');
  if(path==='/sitemap.xml')return send(res,200,sitemap(),'application/xml; charset=utf-8');
  if(path==='/')return sendPage(res,200,wholesalePage('bike','/'));
  if(path==='/blog'||path.startsWith('/blog/'))return send(res,410,'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><script src="/metrika.js?v=1"></script><title>Страница удалена | QRONGE</title></head><body><main><h1>Эта страница больше не публикуется</h1><p><a href="/">Перейти в оптовый каталог QRONGE</a></p></main></body></html>','text/html; charset=utf-8',{'X-Robots-Tag':'noindex, follow'});
  if(path==='/legal/'||path.startsWith('/legal/')){res.writeHead(308,{Location:'/'+u.search});return res.end();}
  if(path==='/elektrovelosipedy/'||path==='/elektrovelosipedy'){res.writeHead(301,{Location:'/'+u.search});return res.end();}
  if(path==='/privacy/'||path==='/terms/')return sendPage(res,200,infoPage(path.split('/')[1]));
  if(path==='/opt'||path==='/opt/'){res.writeHead(308,{Location:'/'+u.search});return res.end();}
  for(const [cat,route] of Object.entries(categoryPaths))if(path===route)return sendPage(res,200,wholesalePage(cat,route));
  const p=products.find(p=>path===`/catalog/${p.slug}/`);if(p)return sendPage(res,200,productPage(p));
  if(!path.endsWith('/')&&!extname(path)&&(products.some(p=>path===`/catalog/${p.slug}`)||Object.values(categoryPaths).includes(path+'/')||['/privacy','/terms'].includes(path))){res.writeHead(308,{Location:path+'/'+u.search});return res.end();}
  const file=resolve(staticRoot,'.'+path);
  if(file.startsWith(staticRoot+'/')&&existsSync(file)&&extname(file))return send(res,200,readFileSync(file),({'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream',{'Cache-Control':'public, max-age=3600'});
  return sendPage(res,404,notFound());
 }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Не удалось обработать запрос. Повторите позже или позвоните нам.'});else res.end();console.error('Request failed:',error.name);}
});
server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(port,'0.0.0.0',()=>console.log(`QRONGE ready at http://localhost:${port}${pool?'':' (database not configured; leads are disabled)'}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(async()=>{if(pool)await pool.end();process.exit(0)}));
