/** Built Web + compiled public handler + isolated DB. No real sources/images/accounts. */
import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import express from 'express';
import request from 'supertest';
import {createServer} from 'http';
import fs from 'fs';
import path from 'path';
describe('official auction real Web date disclosure',()=>{
 const origin='https://wishlist-query-qa.invalid',root=path.resolve(__dirname,'../../../../client/dist');
 let server:any,browser:any,db:any,buyer:number;let mode='empty';const errors:string[]=[];const traffic:{method:string;path:string;status:number}[]=[];
 const saved={api:process.env.API_URL,enabled:process.env.SOURCE_LEADS_PUBLIC_ENABLED,secret:process.env.JWT_SECRET,external:process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED};
 beforeAll(async()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB required');
  process.env.API_URL=origin+'/api';process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';process.env.JWT_SECRET='synthetic-query-ui-only';process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED='1';
  db=require('../../../dist/lib/prisma').default;
  buyer=(await db.user.create({data:{phoneNumber:'synthetic-query-ui',password:await require('bcryptjs').hash('synthetic-query-ui-pass',4),name:'合成查詢UI',isEmailVerified:true}})).id;
  const app=express();app.use(express.json());
  app.use('/api/chat',require('../../../dist/routes/chatRoutes').default);
  app.use('/api/auth',require('../../../dist/routes/authRoutes').default);
  app.get('/api/users/me',require('../../../dist/middleware/auth').authenticateToken,require('../../../dist/controllers/userController').getMe);
  app.use('/api/listings',require('../../../dist/routes/listingRoutes').default);
  app.use('/api/external-listings',require('../../../dist/routes/externalListingRoutes').default);
  app.use('/api/source-leads',require('../../../dist/routes/sourceLeadRoutes').createSourceLeadRoutes());
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const qa=webQaBrowser();browser=await qa.puppeteer.launch({executablePath:qa.executablePath,headless:true,args:['--no-first-run','--disable-background-networking']});
 },30000);
 afterAll(async()=>{
  if(browser)await browser.close();if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(db){if(buyer)await db.user.deleteMany({where:{id:buyer}});await db.$disconnect();}
  if(saved.secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=saved.secret;
  if(saved.external===undefined)delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED=saved.external;
  if(saved.api===undefined)delete process.env.API_URL;else process.env.API_URL=saved.api;
  if(saved.enabled===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=saved.enabled;
 });
 test('actual built Explore evidence distinguishes empty, disabled,404 and failure without extra reads',async()=>{
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.evaluateOnNewDocument((host:string)=>{if(window===window.top&&location.origin===host)localStorage.setItem('user-locale','zh-TW');},origin);
  page.on('request',async(req:any)=>{try{
   const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}
   if(u.pathname.startsWith('/api/')){
    if(u.pathname==='/api/external-listings'&&mode!=='empty'){const status=mode==='fallback404'?404:mode==='failure'?503:200;traffic.push({method:req.method(),path:u.pathname,status});await req.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{items:[],nextCursor:null,enabled:false}:{errorCode:'SYNTHETIC_READ_FAILURE'})});return;}
    let actual=(request(server)as any)[req.method().toLowerCase()](u.pathname+u.search);const headers=req.headers();if(headers.authorization)actual=actual.set('Authorization',headers.authorization);if(headers['content-type'])actual=actual.set('Content-Type',headers['content-type']);if(req.postData())actual=actual.send(req.postData());const result=await actual;traffic.push({method:req.method(),path:u.pathname,status:result.status});
    await req.respond({status:result.status,contentType:result.headers['content-type']||'application/json',body:Buffer.isBuffer(result.body)?result.body:result.text});return;
   }
   const target=path.resolve(root,u.pathname==='/'?'index.html':'.'+u.pathname);
   const asset=target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');
   await req.respond({status:200,contentType:path.extname(asset)==='.js'?'application/javascript':path.extname(asset)==='.css'?'text/css':path.extname(asset)==='.png'?'image/png':'text/html',body:fs.readFileSync(asset)});
  }catch{try{await req.abort();}catch{}}});
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');
  await page.type('#identifier','synthetic-query-ui');await page.type('#password','synthetic-query-ui-pass');await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
  const reports:any[]=[];
  for(const width of [1280,390])for(const scenario of ['empty','disabled','fallback404','failure']){
   mode=scenario;const before=traffic.length;await page.setViewport({width,height:900});
   await page.goto(origin+'/explore?view=list&bbox=117,20,123.8,26.6',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const el=document.querySelector('[data-testid="explore-query-evidence"] pre');if(!el?.textContent)return false;const r=JSON.parse(el.textContent);return Object.values(r.layers).every((l:any)=>l.phase!=='pending');});
   await page.click('[data-testid="explore-query-evidence"] summary');await page.evaluate(()=>document.fonts.ready);
   const receipt=await page.$eval('[data-testid="explore-query-evidence"] pre',(el:Element)=>JSON.parse(el.textContent||'null'));
   expect(receipt.query.bbox).toEqual([117,20,123.8,26.6]);expect(receipt.layers.external.phase).toBe(scenario==='empty'?'complete':scenario==='failure'?'error':scenario);
   expect(receipt.comparable).toBe(scenario==='empty');
   const body=await page.evaluate(()=>document.body.textContent||'');if(scenario==='empty'){expect(body).toContain('目前範圍已載入');expect(body).toContain('目前地圖範圍沒有符合條件');}else{expect(body).toContain('本次查詢尚未建立完整基準');expect(body).not.toContain('0 件外部來源');expect(body).not.toContain('目前地圖範圍沒有符合條件');}expect(receipt.qualifiedSupplyCount).toBeNull();expect(receipt.layers.seller.terminal).toBe(true);expect(receipt.layers.source.terminal).toBe(true);
   const counts=traffic.slice(before).filter(x=>['/api/listings','/api/external-listings','/api/source-leads'].includes(x.path));expect(counts).toHaveLength(3);
   await page.evaluate(()=>{(window as any).__export='';const create=URL.createObjectURL;URL.createObjectURL=(blob:Blob)=>{void blob.text().then(text=>{(window as any).__export=text;});return create(blob);};});
   await page.click('[data-testid="explore-query-evidence"] button');
   await page.waitForFunction(()=>!!(window as any).__export);
   const exported=await page.evaluate(()=>JSON.parse((window as any).__export));expect(exported.query).toEqual(receipt.query);expect(exported.layers).toEqual(receipt.layers);expect(traffic.slice(before).filter(x=>['/api/listings','/api/external-listings','/api/source-leads'].includes(x.path))).toHaveLength(3);
   expect(JSON.stringify(exported)).not.toMatch(/Bearer|synthetic-query-ui-pass|phoneNumber|authorization/i);
   const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(bounds.scroll).toBeLessThanOrEqual(width);
   await (await page.$('[data-testid="explore-query-evidence"]')).screenshot({path:webQaEvidence('query-evidence-'+scenario+'-'+width+'.png')});
   reports.push({width,scenario,receipt:exported,requests:counts});
  }
  expect(errors).toEqual([]);
  // Built assets must retain the existing public icon bytes; no redesign or H editing.
  const crypto=require('crypto'),publicRoot=path.resolve(root,'../public'),icons:any[]=[];
  const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const source=path.join(dir,entry.name);if(entry.isDirectory())walk(source);else if(/icon|favicon|logo|apple-touch|android/i.test(source)){const relative=path.relative(publicRoot,source),dest=path.join(root,relative);expect(fs.existsSync(dest)).toBe(true);const sourceBytes=fs.readFileSync(source),builtBytes=fs.readFileSync(dest);expect(builtBytes.equals(sourceBytes)).toBe(true);icons.push({path:relative,sha256:crypto.createHash('sha256').update(builtBytes).digest('hex')});}}};walk(publicRoot);expect(icons.length).toBeGreaterThan(0);
  fs.writeFileSync(webQaEvidence('query-evidence-report.png').replace(/\.png$/,'.json'),JSON.stringify({head:process.env.QUERY_QA_HEAD_SHA,syntheticOnly:true,productionWrites:0,basemapAcceptance:false,reports,icons,errors},null,2));
 },90000);
});
