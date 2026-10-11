/** Real Chromium + built Web + compiled public handlers + isolated PostgreSQL.
 * All data is synthetic. No production accounts, imported photos or outbound API.
 * Basemap network is deliberately blocked: this verifies count/search UI, not tiles.
 */
import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import express from 'express';
import request from 'supertest';
import {createServer,type Server} from 'http';
import {randomUUID} from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

describe('real Web global publication count acceptance',()=>{
 const origin='https://wishlist-qa.invalid',root=path.resolve(__dirname,'../../../../client/dist');
 let server:Server,browser:any,db:any,buyer:number,verified=false;
 const prefix='SYNTHETIC-EXPLORE-'+randomUUID();
 const saved={api:process.env.API_URL,secret:process.env.JWT_SECRET,source:process.env.SOURCE_LEADS_PUBLIC_ENABLED,external:process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED};
 let sourceMode:'ok'|'pending'|'failed'='ok',countsFailed=false,releaseSource:(()=>void)|undefined;
 const rows:string[]=[],traffic:{path:string,status:number}[]=[],screens:string[]=[],captures:any[]=[];
 beforeAll(async()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated database required');
  verified=true;process.env.API_URL=origin+'/api';process.env.JWT_SECRET='synthetic-explore-browser-only';
  process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED='0';
  db=require('../../../dist/lib/prisma').default;
  buyer=(await db.user.create({data:{phoneNumber:prefix,password:await bcrypt.hash('synthetic-explore-password',4),name:'合成探索驗收',isEmailVerified:true}})).id;
  const now=Date.now();
  await db.listing.create({data:{ownerUserId:buyer,clientListingId:randomUUID(),requestHash:prefix,title:'合成測試：無打卡刊登',description:'只供隔離測試，非商品。',category:'books',price:10,condition:'USED',deliveryMethods:['MEETUP'],status:'ACTIVE',publishedAt:new Date(now),expiresAt:new Date(now+30*86400000)}});
  const {parseLead}=require('../../../dist/lib/sourceLeadRules');
  for(let i=0;i<101;i++){
   const id=prefix+'-'+i,url='https://www.facebook.com/groups/123456789/posts/'+id;
   const row=parseLead({archiveItemId:id,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:1,archiveSha256:'a'.repeat(64),
    title:'合成來源參考 '+i,summary:'隔離計數驗收，非真實在售商品。',canonicalUrl:url,county:'臺南市',district:'永康區',
    publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,
    postedEarliestAt:new Date(now-86400000).toISOString(),postedLatestAt:new Date(now-86400000).toISOString(),checkedAt:new Date(now).toISOString(),
    evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',
     locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',
     sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'review:synthetic-browser'}});
   rows.push((await db.externalSourceLead.create({data:row})).id);
  }
  const app=express();app.use(express.json());
  app.use(async(q,r,n)=>{
   if(q.path==='/api/explore-counts'&&countsFailed)return r.status(503).json({errorCode:'EXPLORE_COUNTS_UNAVAILABLE'});
   if(q.path==='/api/source-leads'){
    if(sourceMode==='failed')return r.status(503).json({errorCode:'SOURCE_LEAD_UNAVAILABLE'});
    if(sourceMode==='pending')await new Promise<void>(resolve=>{releaseSource=resolve;});
   }
   n();
  });
  app.use('/api/auth',require('../../../dist/routes/authRoutes').default);
  app.get('/api/users/me',require('../../../dist/middleware/auth').authenticateToken,require('../../../dist/controllers/userController').getMe);
  app.use('/api/listings',require('../../../dist/routes/listingRoutes').default);
  require('../../../scripts/web-explore-routes.cjs')(app);
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {puppeteer,executablePath}=webQaBrowser();
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-first-run','--disable-background-networking']});
 },30000);
 afterAll(async()=>{
  releaseSource?.();if(browser)await browser.close();
  if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(verified&&db){await db.externalSourceLead.deleteMany({where:{archiveItemId:{startsWith:prefix}}});if(buyer)await db.user.delete({where:{id:buyer}});await db.$disconnect();}
  for(const [key,value]of [['API_URL',saved.api],['JWT_SECRET',saved.secret],['SOURCE_LEADS_PUBLIC_ENABLED',saved.source],['EXTERNAL_LISTINGS_PUBLIC_ENABLED',saved.external]]){
   if(value===undefined)delete process.env[key!];else process.env[key!]=value;
  }
 });
 test('desktop/narrow order, source pagination, viewport independence, explicit unavailable and source pending/error',async()=>{
  const page=await browser.newPage(),errors:string[]=[];
  await page.evaluateOnNewDocument((expectedOrigin:string)=>{if(window!==window.top||location.origin!==expectedOrigin)return;localStorage.setItem('user-locale','zh-TW');Object.defineProperty(navigator,'language',{get:()=> 'zh-TW'});},origin);
  await page.setRequestInterception(true);page.on('pageerror',(e:Error)=>errors.push(e.message));
  page.on('request',async(req:any)=>{
   try{
    const u=new URL(req.url());
    if(u.origin!==origin){await req.abort();return;}
    if(u.pathname.startsWith('/api/')){
     let actual=(request(server)as any)[req.method().toLowerCase()](u.pathname+u.search);
     const headers=req.headers();if(headers.authorization)actual=actual.set('Authorization',headers.authorization);
     if(headers['content-type'])actual=actual.set('Content-Type',headers['content-type']);
     if(req.postData())actual=actual.send(req.postData());
     const result=await actual;traffic.push({path:u.pathname,status:result.status});
     await req.respond({status:result.status,contentType:result.headers['content-type']||'application/json',body:Buffer.isBuffer(result.body)?result.body:result.text});return;
    }
    const target=path.resolve(root,u.pathname==='/'?'index.html':'.'+u.pathname);
    const asset=target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');
    const type=path.extname(asset)==='.js'?'application/javascript':path.extname(asset)==='.css'?'text/css':path.extname(asset)==='.png'?'image/png':'text/html';
    await req.respond({status:200,contentType:type,body:fs.readFileSync(asset)});
   }catch{try{await req.abort();}catch{}}
  });
  await page.setViewport({width:1280,height:900});
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');
  await page.type('#identifier',prefix);await page.type('#password','synthetic-explore-password');
  await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
  const open=async(search:string)=>{await page.goto(origin+'/explore'+search,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-explore-global-counts]')?.textContent?.includes('全站已上架 102 件'));};
  const shot=async(name:string)=>{
   await page.evaluate(()=>document.fonts.ready.then(()=>{window.scrollTo(0,0);}));
   expect(await page.evaluate(()=>document.fonts.status)).toBe('loaded');
   const measure=await page.evaluate(()=>{
    const global=document.querySelector('[data-explore-global-counts]')!,local=document.querySelector('[data-explore-viewport-summary]')!;
    const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {viewportWidth:innerWidth,viewportHeight:innerHeight,scrollWidth:document.documentElement.scrollWidth,global:rect(global),state:rect(local),
     globalText:global.textContent,stateText:local.textContent,
     lines:Array.from(local.querySelectorAll('p')).map(e=>({text:e.textContent,...rect(e)}))};
   });
   expect(measure.scrollWidth).toBeLessThanOrEqual(measure.viewportWidth);
   expect(measure.global.left).toBeGreaterThanOrEqual(0);expect(measure.global.right).toBeLessThanOrEqual(measure.viewportWidth);
   expect(measure.global.top).toBeGreaterThanOrEqual(0);expect(measure.global.bottom).toBeLessThanOrEqual(measure.viewportHeight);
   for(const line of measure.lines){expect(line.left).toBeGreaterThanOrEqual(measure.state.left);expect(line.right).toBeLessThanOrEqual(measure.state.right);
    expect(line.top).toBeGreaterThanOrEqual(measure.state.top);expect(line.bottom).toBeLessThanOrEqual(measure.state.bottom);}
   await page.screenshot({path:webQaEvidence(name)});screens.push(name);
   const stateName=name.replace(/\.png$/,'-status.png');
   await (await page.$('[data-explore-viewport-summary]'))!.screenshot({path:webQaEvidence(stateName)});screens.push(stateName);
   if(name==='explore-counts-source-failed.png'){const full='explore-counts-source-failed-full.png';await page.screenshot({path:webQaEvidence(full),fullPage:true});screens.push(full);}
   captures.push({name,stateName,...measure});await page.evaluate(()=>window.scrollTo(0,0));
  };
  const ordered=async()=>page.evaluate(()=>{
   const global=document.querySelector('[data-explore-global-counts]')!,form=document.querySelector('input#explore-search')!;
   const local=document.querySelector('[data-explore-viewport-summary]')!,canvas=document.querySelector('.maplibregl-canvas');
   return {beforeForm:!!(global.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING),beforeLocal:!!(global.compareDocumentPosition(local)&Node.DOCUMENT_POSITION_FOLLOWING),
    beforeMap:!canvas||!!(global.compareDocumentPosition(canvas)&Node.DOCUMENT_POSITION_FOLLOWING),globalTop:global.getBoundingClientRect().top,formTop:form.getBoundingClientRect().top,canvasPresent:!!canvas};
  });
  await open('?view=map');await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('101 筆來源線索'));
  expect((await request(server).get('/api/explore-counts')).body).toMatchObject({published:{total:102,sellerListings:1,sourceReferences:101,partnerListings:0},explorable:{total:101},stockVerified:false});
  process.env.SOURCE_LEADS_PUBLIC_ENABLED='0';
  expect((await request(server).get('/api/explore-counts')).body).toMatchObject({published:{sourceReferences:101},explorable:{sourceReferences:0}});
  process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';
  const desktop=await ordered();expect(desktop.beforeForm&&desktop.beforeLocal&&desktop.beforeMap).toBe(true);expect(desktop.globalTop).toBeLessThan(desktop.formTop);
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).not.toContain('目前地圖範圍沒有符合');
  await shot('explore-counts-desktop-map.png');
  const countReads=traffic.filter(r=>r.path==='/api/explore-counts').length;
  await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='商品列表');b?.click();});
  await page.waitForFunction(()=>document.querySelectorAll('article').length>=101);
  expect(traffic.filter(r=>r.path==='/api/explore-counts')).toHaveLength(countReads);
  await page.setViewport({width:390,height:844});const narrow=await ordered();expect(narrow.beforeForm&&narrow.beforeLocal&&narrow.beforeMap).toBe(true);expect(narrow.globalTop).toBeLessThan(narrow.formTop);await shot('explore-counts-narrow-list.png');
  await open('?view=list&bbox=121.5,25,121.6,25.1');
  await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('目前地圖範圍沒有符合'));
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).toContain('0 筆來源線索');
  await shot('explore-counts-empty-viewport.png');
  await page.type('#explore-search','no-match-synthetic');await page.click('button[type="submit"]');
  await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('目前地圖範圍沒有符合'));
  expect(await page.$eval('[data-explore-global-counts]',(el:Element)=>el.textContent)).toContain('全站已上架 102 件');
  countsFailed=true;await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-explore-global-counts]')?.textContent?.includes('全站已上架數量未取得'));
  expect(await page.$eval('[data-explore-global-counts]',(el:Element)=>el.textContent)).not.toContain('全站已上架 0 件');await shot('explore-counts-unavailable.png');
  countsFailed=false;sourceMode='pending';await open('?view=map');
  await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('正在讀取目前範圍'));
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).not.toContain('目前地圖範圍沒有符合');
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).not.toContain('0 筆來源線索');
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).toContain('來源線索數量讀取中');
  await shot('explore-counts-source-pending.png');
  sourceMode='ok';releaseSource?.();await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('101 筆來源線索'));
  sourceMode='failed';await open('?view=list');
  await page.waitForFunction(()=>document.querySelector('[data-explore-viewport-summary]')?.textContent?.includes('來源線索未完成讀取'));
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).not.toContain('目前地圖範圍沒有符合');expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).not.toContain('0 筆來源線索');
  expect(await page.$eval('[data-explore-viewport-summary]',(el:Element)=>el.textContent)).toContain('來源線索數量未取得');
  await shot('explore-counts-source-failed.png');
  expect(errors).toEqual([]);
  const report={head:process.env.EXPLORE_QA_HEAD_SHA??process.env.GITHUB_SHA??null,checkoutSha:process.env.GITHUB_SHA??null,syntheticLocalOnly:true,productionWrites:0,nativeAcceptance:false,basemapNetwork:'BLOCKED_NOT_ACCEPTED',desktop,narrow,sourceRows:rows.length,screens,captures,traffic,errors,
   verified:['global-before-map-and-local-results','source-pagination-101','viewport-and-filter-independent-global-count','unavailable-not-zero','source-pending-not-empty','source-error-not-empty']};
  fs.writeFileSync(webQaEvidence('explore-counts-result.png').replace(/\.png$/,'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({syntheticBrowserAcceptance:true,sourceRows:101,screens,errors,desktop,narrow,nativeAcceptance:false,basemapNetworkAccepted:false}));
 },90000);
});
