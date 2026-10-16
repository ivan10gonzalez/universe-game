import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createManagementApp} from '../server.js';
test('Violet connection is Super Master only, session scoped, and cannot mutate white-site data',async()=>{
 const remote=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/login'){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);res.setHeader('Set-Cookie','violeta_session=demo; HttpOnly');res.end(JSON.stringify({user:{role:body.username==='agent'?'agent':'master'}}));}else if(req.url==='/api/session'){res.end(JSON.stringify({user:{role:'master'}}));}else if(req.url==='/api/branding'){res.end(JSON.stringify({revision:1,images:{},slots:[{id:'logo',image:'logo.png'}]}));}else res.end(JSON.stringify({user:{username:'violet',role:'master'},users:[]}));});
 await new Promise(r=>remote.listen(0,'127.0.0.1',r));
 const dir=await mkdtemp(path.join(tmpdir(),'white-bridge-'));const app=http.createServer(createManagementApp({dataDir:dir,bootstrapPassword:'TestSuperPassword123!',violetOrigin:`http://127.0.0.1:${remote.address().port}`}));await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}`;
 const req=(route,cookie,body)=>fetch(base+'/api/management/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Management-Request':'1',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const login=async(username,password)=>(await req('login',null,{username,password})).headers.get('set-cookie').split(';')[0];
 try{
  const superCookie=await login('super_master','TestSuperPassword123!'),otherSuper=await login('super_master','TestSuperPassword123!'),masterCookie=await login('universe_admin','UniverseAdmin2026!');
  const superSites=(await (await req('me',superCookie)).json()).sites,masterSites=(await (await req('me',masterCookie)).json()).sites;
  assert.equal(superSites.length,2);assert.equal(masterSites.length,1);assert(!masterSites.some(s=>s.external));
  const route='sites/connected-panel-violeta/';assert.equal((await req(route+'branding',null)).status,401);assert.equal((await req(route+'branding',masterCookie)).status,403);
  assert.equal((await req(route+'panel',superCookie)).status,428);
  assert.equal((await req(route+'connect',superCookie,{username:'agent',password:'irrelevant'})).status,403);
  assert.equal((await req(route+'connect',superCookie,{username:'master',password:'irrelevant'})).status,200);
  assert.equal((await req(route+'branding',superCookie)).status,200);
  assert.equal((await req(route+'panel',otherSuper)).status,428);
  const branding=await (await req(route+'branding',superCookie,{revision:0,images:{}})).json();assert(branding.slots[0].defaultUrl.endsWith('/assets/logo.png'));
  const white=await (await req(`sites/${masterSites[0].id}/banners`,masterCookie)).json();assert.deepEqual(white.banners,[]);
  await req('logout',superCookie,{});assert.equal((await req(route+'branding',superCookie)).status,401);
 }finally{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>remote.close(r))]);await rm(dir,{recursive:true,force:true});}
});
