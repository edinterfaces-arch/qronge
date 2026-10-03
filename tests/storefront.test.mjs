import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { articles, articlePath } from '../articles.mjs';
import { products, categoryPaths } from '../render.mjs';
import { pendingDocuments } from '../pages.mjs';

test('storefront routes, editorial SEO, local links, map permissions and legacy redirect', async()=>{
 const origin='http://127.0.0.1:3020';
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3020',DATABASE_URL:'',PUBLIC_ORIGIN:origin,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(new Error('Preview server failed to start')))});
  const paths=['/',...Object.values(categoryPaths),...products.map(p=>`/catalog/${p.slug}/`),'/blog/',...articles.map(articlePath),'/legal/','/privacy/','/terms/',...Object.keys(pendingDocuments).map(s=>`/legal/${s}/`)];
  const pages=new Map();
  for(const path of paths){
   const res=await fetch(origin+path);assert.equal(res.status,200,path);
   const html=await res.text();pages.set(path,html);
   assert.equal((html.match(/<h1[ >]/g)||[]).length,1,path+' must have one main heading');
   assert.ok(html.includes('MOKWHEEL'),path);
   assert.ok(html.includes(`rel="canonical" href="${origin+path}"`),path+' canonical');
  }
  assert.equal(articles.length,12);
  assert.equal(new Set(articles.map(a=>a.slug)).size,12);
  for(const a of articles){
   const html=pages.get(articlePath(a));
   assert.match(html,/"@type":"BlogPosting"/);
   assert.ok(html.includes(a.title));
   assert.ok(a.sections.length>=4);
   for(const related of a.related)assert.ok(articles.some(a=>a.slug===related));
  }
  const home=pages.get('/');assert.match(home,/map-widget\/v1/);assert.match(home,/store-front.jpg/);
  assert.doesNotMatch(home,/class="product-grid"/);
  assert.doesNotMatch(pages.get('/opt/'),/class="hero"/);
  const response=await fetch(origin+'/');assert.match(response.headers.get('content-security-policy'),/frame-src[^;]+https:\/\/yandex.ru/);
  for(const [path,html] of pages){
   for(const [,href] of html.matchAll(/<a[^>]+href="([^"]+)"/g)){
    if(!href.startsWith('/')&&!href.startsWith('#'))continue;
    const target=new URL(href,origin+path);const destination=pages.get(target.pathname);
    assert.ok(destination,`${path} links to missing ${target.pathname}`);
    if(target.hash)assert.ok(destination.includes(`id="${target.hash.slice(1)}"`),`${path} broken anchor ${href}`);
   }
  }
  for(const name of ['store-front','store-parts','store-courier-bikes','store-puckipuppy','store-fatbikes'])assert.equal((await fetch(origin+`/assets/${name}.jpg`)).status,200);
  for(const slug of Object.keys(pendingDocuments))assert.match(pages.get(`/legal/${slug}/`),/noindex, follow/);
  const legacy=await fetch(origin+'/elektrovelosipedy/?utm_source=legacy',{redirect:'manual'});assert.equal(legacy.status,301);assert.equal(legacy.headers.get('location'),'/opt/?utm_source=legacy');
  for(const path of ['/opt','/blog','/legal','/blog/'+articles[0].slug])assert.equal((await fetch(origin+path,{redirect:'manual'})).status,308);
  const sitemap=await(await fetch(origin+'/sitemap.xml')).text();for(const a of articles)assert.ok(sitemap.includes(articlePath(a)));
 } finally {server.kill();await once(server,'exit');}
});
