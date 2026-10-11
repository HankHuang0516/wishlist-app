/** Built Web + compiled public handler + isolated DB. No real sources/images/accounts. */
import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import {auctionFixture} from '../fixtures/officialAuctionFixture';
import express from 'express';
import request from 'supertest';
import {createServer} from 'http';
import fs from 'fs';
import path from 'path';
describe('official auction real Web date disclosure',()=>{
 const origin='https://wishlist-auction-qa.invalid',root=path.resolve(__dirname,'../../../../client/dist');
 let server:any,browser:any,db:any,id:string,buyer:number;const errors:string[]=[];const traffic:{method:string;path:string;status:number}[]=[];
 const saved={api:process.env.API_URL,enabled:process.env.SOURCE_LEADS_PUBLIC_ENABLED,secret:process.env.JWT_SECRET,external:process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED};
 beforeAll(async()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB required');
  process.env.API_URL=origin+'/api';process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';process.env.JWT_SECRET='synthetic-auction-ui-only';process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED='0';
  db=require('../../../dist/lib/prisma').default;
  const b=auctionFixture();b.title='合成拍賣畫面驗收';
  id=(await db.externalSourceLead.create({data:require('../../../dist/lib/sourceLeadRules').parseLead(b)})).id;
  buyer=(await db.user.create({data:{phoneNumber:'synthetic-auction-ui-'+id,password:await require('bcryptjs').hash('synthetic-auction-ui-pass',4),name:'合成拍賣UI',isEmailVerified:true}})).id;
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
  if(db){if(buyer)await db.user.deleteMany({where:{id:buyer}});if(id)await db.externalSourceLead.deleteMany({where:{id}});await db.$disconnect();}
  if(saved.secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=saved.secret;
  if(saved.external===undefined)delete process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED;else process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED=saved.external;
  if(saved.api===undefined)delete process.env.API_URL;else process.env.API_URL=saved.api;
  if(saved.enabled===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=saved.enabled;
 });
 test('desktop and390px show unknown original date, active window, bid and unqualified stock',async()=>{
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('pageerror',(e:Error)=>errors.push(e.message));
  await page.evaluateOnNewDocument((host:string)=>{if(window===window.top&&location.origin===host)localStorage.setItem('user-locale','zh-TW');},origin);
  page.on('request',async(req:any)=>{try{
   const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}
   if(u.pathname.startsWith('/api/')){let actual=(request(server)as any)[req.method().toLowerCase()](u.pathname+u.search);const headers=req.headers();if(headers.authorization)actual=actual.set('Authorization',headers.authorization);if(headers['content-type'])actual=actual.set('Content-Type',headers['content-type']);if(req.postData())actual=actual.send(req.postData());const result=await actual;traffic.push({method:req.method(),path:u.pathname+u.search,status:result.status});
    await req.respond({status:result.status,contentType:result.headers['content-type']||'application/json',body:Buffer.isBuffer(result.body)?result.body:result.text});return;}
   const target=path.resolve(root,u.pathname==='/'?'index.html':'.'+u.pathname);
   const asset=target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');
   await req.respond({status:200,contentType:path.extname(asset)==='.js'?'application/javascript':path.extname(asset)==='.css'?'text/css':path.extname(asset)==='.png'?'image/png':'text/html',body:fs.readFileSync(asset)});
  }catch{try{await req.abort();}catch{}}});
  const captures=[];
  for(const width of [1280,390]){
   await page.setViewport({width,height:900});await page.goto(origin+'/source-leads?id='+id,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.body.textContent?.includes('原刊日未知；有效拍賣期間'));
   await page.evaluate(()=>document.fonts.ready.then(()=>window.scrollTo(0,0)));
   const view=await page.evaluate(()=>({text:document.body.textContent||'',width:innerWidth,scrollWidth:document.documentElement.scrollWidth,fonts:document.fonts.status}));
   expect(view.text).toContain('合成拍賣畫面驗收');expect(view.text).toContain('起標價非成交價');expect(view.text).toContain('官方公開取貨點');expect(view.text).not.toContain('1970');expect(view.scrollWidth).toBeLessThanOrEqual(width);expect(view.fonts).toBe('loaded');
   await page.screenshot({path:webQaEvidence('auction-date-'+width+'.png')});
   await page.screenshot({path:webQaEvidence('auction-date-'+width+'-full.png'),fullPage:true});captures.push(view);
  }
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');
  await page.type('#identifier','synthetic-auction-ui-'+id);await page.type('#password','synthetic-auction-ui-pass');await page.click('button[type="submit"]');
  await page.waitForFunction(()=>location.pathname==='/dashboard');
  for(const width of [1280,390]){
   await page.setViewport({width,height:900});await page.goto(origin+'/explore?source='+id+'&view=list',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent?.includes('原刊日未知；有效拍賣期間'));
   await page.evaluate(()=>document.fonts.ready.then(()=>window.scrollTo(0,0)));
   const detail=await page.$eval('[role="dialog"]',(el:Element)=>el.textContent||'');expect(detail).toContain('起標價非成交價');expect(detail).toContain('公開官方拍賣參考');expect(detail).toContain('官方拍賣來源');expect(detail).not.toContain('1970');
   await page.screenshot({path:webQaEvidence('auction-explore-detail-'+width+'.png')});
   await (await page.$('[role="dialog"]'))!.screenshot({path:webQaEvidence('auction-explore-detail-'+width+'-full.png')});
   await page.click('a[href="/chat?source='+id+'"]');
   await page.waitForFunction(()=>location.pathname==='/chat'&&document.querySelector('[role="dialog"]')?.textContent?.includes('合成拍賣畫面驗收'));
   await page.screenshot({path:webQaEvidence('auction-first-chat-'+width+'.png')});
  }
  expect(traffic.some(x=>x.path.startsWith('/api/source-leads/'+id+'?dateContract=auction-v1')&&x.status===200)).toBe(true);
  expect(traffic.some(x=>x.method==='POST'&&x.path.includes('/inquiry'))).toBe(false);
  expect(errors).toEqual([]);
  fs.writeFileSync(webQaEvidence('auction-date-report.png').replace(/\.png$/,'.json'),JSON.stringify({head:process.env.AUCTION_QA_HEAD_SHA,syntheticOnly:true,productionWrites:0,nativeAcceptance:false,basemapAccepted:false,errors,captures,traffic},null,2));
 },60000);
});
