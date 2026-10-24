/** Built Web + compiled public handler + isolated DB. No real sources/images/accounts. */
import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import express from 'express';
import request from 'supertest';
import {createServer} from 'http';
import fs from 'fs';
import path from 'path';


function makeSourceLead(number = 1): any {
  const id = '11111111-1111-4111-8111-' + String(number).padStart(12, '0');
  const date = new Date().toISOString(), canonicalUrl = 'https://example.invalid/source/' + number;
  return {
    id, kind:'SOURCE_LEAD', title:'來源 '+number, summary:'來源原文 {name} $&', canonicalUrl,
    county:'臺南市', district:'永康區', publicPlaceName:'公開地點', publicAddress:'公共地址', latitude:23, longitude:120.2,
    postedEarliestAt:date, postedLatestAt:date, checkedAt:date, stockStatus:'UNKNOWN', qualifiedSupply:false, checkoutEnabled:false,
    notice:'來源待確認', coordinateSourceUrl:'https://www.openstreetmap.org/node/1', coordinateAttribution:null,
    publicFacts:{priceText:'原帖標價：250元',priceUnitStatus:'原文',currencyStatus:'原文',sourceAccessNotice:'原來源使用說明 {source} $&',originalDateLabel:'原帖日期文字',locationRelation:'原地點關係',coordinateQualityNotes:[]},
    contactRouting:{status:'UNVERIFIED',reason:'原貼文與作者身份不等於可收訊路由；尚未核實原賣家可用的聯絡入口，未外送。',checkedAt:null},
    media:[1,2].map(index=>{
      const mid='22222222-2222-4222-8222-'+String(number*10+index).padStart(12,'0');
      const path='https://example.invalid/api/source-leads/'+id+'/media/'+mid+'/';
      return {id:mid,sourceUrl:canonicalUrl,imageUrl:path+'image',thumbnailUrl:path+'thumbnail',alt:'原照片 '+index+' {title} $&'};
    }),
    photoCompleteness:{status:'IMPORTED_COMPLETE',sourceCount:2,physicalSourceCount:1,importedCount:2,limit:32},
  };
}

describe('actual Explore query evidence display and download',()=>{
 const origin='https://wishlist-query-qa.invalid',root=path.resolve(__dirname,'../../../../client/dist');
 let server:any,browser:any,db:any,buyer:number;let mode='empty';let downloadRoot:string;const errors:string[]=[];const traffic:{method:string;path:string;status:number}[]=[];
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
 },60000);
 afterAll(async()=>{
  if(browser)await browser.close();if(downloadRoot)fs.rmSync(downloadRoot,{recursive:true,force:true});if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(db){if(buyer)await db.user.deleteMany({where:{id:buyer}});await db.$disconnect();}
  if(saved.secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=saved.secret;
  if(saved.external===undefined)delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED=saved.external;
  if(saved.api===undefined)delete process.env.API_URL;else process.env.API_URL=saved.api;
  if(saved.enabled===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=saved.enabled;
 });
 test('actual built Explore evidence distinguishes empty, disabled,404 and failure without extra reads',async()=>{
  const page=await browser.newPage();await page.setRequestInterception(true);
  downloadRoot=fs.mkdtempSync(path.join(require('os').tmpdir(),'wishlist-query-downloads-'));
  const cdp=await page.target().createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadRoot,eventsEnabled:true});
  page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.evaluateOnNewDocument((host:string)=>{if(window===window.top&&location.origin===host)localStorage.setItem('user-locale','zh-TW');},origin);
  page.on('request',async(req:any)=>{try{
   const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}
   if(u.pathname.startsWith('/api/')){
    if(u.pathname==='/api/source-leads'&&mode==='public-browse'){
      const first=u.searchParams.get('cursor')?Number(u.searchParams.get('cursor')!.slice(-12))+1:1,last=Math.min(first+24,564);
      const items=Array.from({length:last-first+1},(_,i)=>makeSourceLead(first+i));
      traffic.push({method:req.method(),path:u.pathname,status:200});
      await req.respond({status:200,contentType:'application/json',body:JSON.stringify({items,nextCursor:last<564?items[items.length-1].id:null,enabled:true})});return;
    }
    if(u.pathname==='/api/source-leads'&&['references-disabled','references-throttled'].includes(mode)){traffic.push({method:req.method(),path:u.pathname,status:200});await req.respond({status:200,contentType:'application/json',body:JSON.stringify({items:[1,2,3].map(makeSourceLead),nextCursor:null,enabled:true})});return;}
    if(u.pathname==='/api/external-listings'&&mode!=='empty'){const status=mode==='fallback404'?404:mode==='failure'?503:mode==='references-throttled'?429:200;traffic.push({method:req.method(),path:u.pathname,status});await req.respond({status,headers:status===429?{'Retry-After':'4'}:{},contentType:'application/json',body:JSON.stringify(status===200?{items:[],nextCursor:null,enabled:false}:{errorCode:status===429?'EXTERNAL_INDEX_RATE_LIMIT':'SYNTHETIC_READ_FAILURE'})});return;}
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
  for(const width of [1280,390])for(const scenario of ['empty','disabled','fallback404','failure','references-disabled','references-throttled']){
   mode=scenario;const before=traffic.length;await page.setViewport({width,height:900});
   await page.goto(origin+'/explore?view=list&bbox=117,20,123.8,26.6',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{const el=document.querySelector('[data-testid="explore-query-evidence"] pre');if(!el?.textContent)return false;const r=JSON.parse(el.textContent);return Object.values(r.layers).every((l:any)=>l.phase!=='pending');});
   await page.click('[data-testid="explore-query-evidence"] summary');await page.evaluate(()=>document.fonts.ready);
   const receipt=await page.$eval('[data-testid="explore-query-evidence"] pre',(el:Element)=>JSON.parse(el.textContent||'null'));
   expect(receipt.query.bbox).toEqual([117,20,123.8,26.6]);expect(receipt.layers.external.phase).toBe(scenario==='empty'?'complete':['failure','references-throttled'].includes(scenario)?'error':scenario==='references-disabled'?'disabled':scenario);
   expect(receipt.comparable).toBe(scenario==='empty');
   const body=await page.evaluate(()=>document.body.textContent||'');expect(body).not.toContain('0 件站內商品');expect(body).not.toContain('0 件外部來源');if(['empty','disabled','fallback404'].includes(scenario)){expect(body).toContain('目前地圖範圍沒有符合條件');}else if(!scenario.startsWith('references-')){expect(body).toContain('部分外部來源查詢未完成');expect(body).not.toContain('目前地圖範圍沒有符合條件');}if(scenario.startsWith('references-')){expect(body).toContain(scenario==='references-disabled'?'3 筆外部來源（資料參考）':'至少 3 筆外部來源');expect(body).toContain('庫存与交易'.replace('与','與'));const rows=await page.evaluate(()=>Array.from(document.querySelectorAll('[data-source-type="SOURCE_REFERENCE"]')).map(el=>({id:el.getAttribute('data-original-id'),stock:el.getAttribute('data-stock-status')})));expect(rows).toHaveLength(3);expect(new Set(rows.map((x:any)=>x.id)).size).toBe(3);expect(rows.every((x:any)=>x.stock==='UNKNOWN')).toBe(true);if(scenario==='references-throttled'){expect(body).toContain('等待');await new Promise(resolve=>setTimeout(resolve,4500));expect(traffic.slice(before).filter(x=>x.path==='/api/external-listings')).toHaveLength(1);}}
   expect(receipt.qualifiedSupplyCount).toBeNull();expect(receipt.layers.seller.terminal).toBe(true);expect(receipt.layers.source.terminal).toBe(true);
   const counts=traffic.slice(before).filter(x=>['/api/listings','/api/external-listings','/api/source-leads'].includes(x.path));expect(counts).toHaveLength(3);
   const downloadName='explore-query-'+receipt.query.serial+'.json',downloadFile=path.join(downloadRoot,downloadName);
   if(fs.existsSync(downloadFile))fs.unlinkSync(downloadFile);
   await page.click('[data-testid="explore-query-evidence"] button');
   await new Promise<void>((resolve,reject)=>{const deadline=Date.now()+10000;const check=()=>{if(fs.existsSync(downloadFile)){try{JSON.parse(fs.readFileSync(downloadFile,'utf8'));resolve();return;}catch{}}if(Date.now()>deadline){reject(Error('Normal browser download did not complete'));return;}setTimeout(check,50);};check();});
   const downloadedBytes=fs.readFileSync(downloadFile),exported=JSON.parse(downloadedBytes.toString('utf8'));
   expect(exported.query).toEqual(receipt.query);expect(exported.layers).toEqual(receipt.layers);
   expect(traffic.slice(before).filter(x=>['/api/listings','/api/external-listings','/api/source-leads'].includes(x.path))).toHaveLength(3);
   expect(JSON.stringify(exported)).not.toMatch(/Bearer|synthetic-query-ui-pass|phoneNumber|authorization/i);
   const actualDownloadPath=webQaEvidence('query-evidence-download-'+scenario+'-'+width+'.png').replace(/\.png$/,'.json');
   fs.copyFileSync(downloadFile,actualDownloadPath);
   // Element screenshots auto-scroll to the sticky navbar's covered top edge.
   // Use ordinary document scrolling plus viewport screenshots, never hide the navbar.
   await page.evaluate(()=>{const panel=document.querySelector('[data-testid="explore-query-evidence"]')as HTMLElement;const header=document.querySelector('header');const cover=header?.getBoundingClientRect().height??0;window.scrollTo(0,window.scrollY+panel.getBoundingClientRect().top-cover-12);});
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const layout=await page.evaluate(()=>{
    const panel=document.querySelector('[data-testid="explore-query-evidence"]')as HTMLDetailsElement,summary=panel.querySelector('summary')!,identity=summary.nextElementSibling!;
    const visible=(el:Element)=>{const r=el.getBoundingClientRect(),x=r.left+Math.min(r.width/2,80),y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return r.top>=0&&r.bottom<=innerHeight&&!!hit&&(el===hit||el.contains(hit));};
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,expanded:panel.open,titleVisible:visible(summary),identityVisible:visible(identity),titleTop:summary.getBoundingClientRect().top,navBottom:document.querySelector('header')?.getBoundingClientRect().bottom};
   });
   expect(layout.expanded).toBe(true);expect(layout.titleVisible).toBe(true);expect(layout.identityVisible).toBe(true);expect(layout.scrollWidth).toBeLessThanOrEqual(width);
   await page.screenshot({path:webQaEvidence('query-evidence-'+scenario+'-'+width+'.png')});
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:webQaEvidence('query-evidence-full-'+scenario+'-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>{const panel=document.querySelector('[data-testid="explore-query-evidence"]')!;panel.nextElementSibling?.scrollIntoView({block:'end'});});
   await page.screenshot({path:webQaEvidence('query-classifiers-'+scenario+'-'+width+'.png')});
   reports.push({width,scenario,receipt:exported,requests:counts,layout,download:{actualChromeDownload:true,originalName:downloadName,artifactName:path.basename(actualDownloadPath),bytes:downloadedBytes.length,sha256:require('crypto').createHash('sha256').update(downloadedBytes).digest('hex')}});
  }
  // Regression: ordinary public products with no map consent are browsable;
  // explicit source pages beyond 500 remain usable and never change consent.
  mode='public-browse';const actualIds:string[]=[];
  for(let i=0;i<4;i++){const mediaId=require('crypto').randomUUID();actualIds.push((await db.listing.create({data:{ownerUserId:buyer,clientListingId:'query-public-'+i,requestHash:'synthetic-public-'+i,title:'公開商品 '+i,description:'公開二手用品，合成隔離資料庫測試',category:'other',status:'ACTIVE',publishedAt:new Date(),expiresAt:new Date(Date.now()+86400000),mapVisibleUntil:null,price:100,currency:'TWD',condition:'USED',deliveryMethods:['MEETUP'],media:{create:{id:mediaId,ownerUserId:buyer,imageUrl:origin+'/api/listing-media/'+mediaId+'/image',thumbnailUrl:origin+'/api/listing-media/'+mediaId+'/thumbnail',contentHash:'synthetic-image-'+i}},location:{create:{county:'臺南市',district:'永康區',publicLatitude:23,publicLongitude:120.2}}}})).id);}
  for(const width of [1280,390]){
   await page.setViewport({width,height:900});await page.goto(origin+'/explore',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('[data-testid="explore-loaded-count"]')?.textContent?.includes('4 件站內商品')&&document.querySelectorAll('[data-source-type="SOURCE_REFERENCE"]').length===100);
   expect((await page.$$eval('[data-source-type="ON_SITE"]',(rows:Element[])=>rows.map(r=>r.getAttribute('data-original-id')))).sort()).toEqual([...actualIds].sort());
   for(let next=200;next<=600;next+=100){await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='載入更多來源');if(!b)throw Error('Load more control missing');b.click();});await page.waitForFunction((count:number)=>document.querySelectorAll('[data-source-type="SOURCE_REFERENCE"]').length===Math.min(count,564),{},next);}
   const result=await page.$eval('[data-testid="explore-query-evidence"] pre',(el:Element)=>JSON.parse(el.textContent||'null'));
   expect(result.query.scope).toBe('all');expect(result.layers.seller.visibleIds.sort()).toEqual([...actualIds].sort());expect(result.layers.source.phase).toBe('complete');expect(result.layers.source.terminal).toBe(true);expect(result.layers.source.cap).toBe(false);expect(result.layers.source.ids).toHaveLength(564);
   expect(await page.$$eval('[data-source-type="SOURCE_REFERENCE"]',(rows:Element[])=>new Set(rows.map(r=>r.getAttribute('data-original-id'))).size)).toBe(564);
   expect(await page.$eval('body',(el:Element)=>el.textContent)).not.toMatch(/0 件站內商品|部分外部來源未完成讀取/);
   expect(await db.listing.count({where:{id:{in:actualIds},mapVisibleUntil:null}})).toBe(4);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:webQaEvidence('query-public-products-'+width+'.png')});
   reports.push({width,scenario:mode,actualDatabaseListingIds:actualIds,sourceFixtures:564,receipt:result,productionWrites:0});
  }
  expect(errors).toEqual([]);
  // Built assets must retain the existing public icon bytes; no redesign or H editing.
  const crypto=require('crypto'),publicRoot=path.resolve(root,'../public'),icons:any[]=[];
  const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const source=path.join(dir,entry.name);if(entry.isDirectory())walk(source);else if(/icon|favicon|logo|apple-touch|android/i.test(source)){const relative=path.relative(publicRoot,source),dest=path.join(root,relative);expect(fs.existsSync(dest)).toBe(true);const sourceBytes=fs.readFileSync(source),builtBytes=fs.readFileSync(dest);expect(builtBytes.equals(sourceBytes)).toBe(true);icons.push({path:relative,sha256:crypto.createHash('sha256').update(builtBytes).digest('hex')});}}};walk(publicRoot);expect(icons.length).toBeGreaterThan(0);
  fs.writeFileSync(webQaEvidence('query-evidence-report.png').replace(/\.png$/,'.json'),JSON.stringify({head:process.env.QUERY_QA_HEAD_SHA,syntheticOnly:true,productionWrites:0,basemapAcceptance:false,reports,icons,errors},null,2));
 },120000);
});
