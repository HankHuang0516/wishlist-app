import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import prisma from '../../lib/prisma';
import listingRoutes from '../../routes/listingRoutes';
import { createLoopbackRequest } from './loopbackHttp';
import { getApiUrl } from '../../config/constants';
import authRoutes from '../../routes/authRoutes';
import { authenticateToken } from '../../middleware/auth';
import { getMe } from '../../controllers/userController';
import { getUpcomingBirthdays } from '../../controllers/birthdayController';
import chatRoutes from '../../routes/chatRoutes';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import path from 'path';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated database required');
process.env.JWT_SECRET = 'isolated-scale-test-only';
process.env.API_URL='https://wishlist-qa.invalid/api';
const app=express(); app.use(express.json()); app.use('/api/listings',listingRoutes);
app.use('/api/auth',authRoutes);app.get('/api/users/me',authenticateToken,getMe);app.get('/api/social/upcoming-birthdays',authenticateToken,getUpcomingBirthdays);
app.use('/api/chat',chatRoutes);
const http=createLoopbackRequest(app);
let buyer:number,seller:number,other:number,wish:number,otherWish:number;
const expected=new Set<string>();
const auth=(id:number)=>'Bearer '+jwt.sign({id},process.env.JWT_SECRET!);
beforeAll(async()=>{
 const users=await Promise.all(['buyer','seller','other'].map((role,index)=>prisma.user.create({data:{phoneNumber:`091111110${index}`,password:bcrypt.hashSync('synthetic-local-only-pass',4),name:`SYNTHETIC ${role}`}}))); [buyer,seller,other]=users.map(x=>x.id);
 for(const [id,name] of [[buyer,'Sony 相機'],[other,'Canon 相機']] as const){const w=await prisma.wishlist.create({data:{userId:id,title:'SYNTHETIC isolated scale',items:{create:{name,maxPrice:5000,priceCurrency:'TWD'}}},include:{items:true}});if(id===buyer)wish=w.items[0].id;else otherWish=w.items[0].id;}
});
afterAll(async()=>{if(buyer)await prisma.user.deleteMany({where:{id:{in:[buyer,seller,other]}}});await prisma.$disconnect();});
it(process.env.WEB_QA_FAULT_ONLY==='1'?'real PostgreSQL/HTTP/Web: 300-fixture fault and account-isolation matrix':'real PostgreSQL/HTTP: complete 10k,30k,50k catalogs, independent ID oracle and concurrent user isolation',async()=>{
 const {puppeteer,executablePath}=webQaBrowser();
 const browser=await puppeteer.launch({headless:true,executablePath,args:['--disable-background-networking']});
 const page=await browser.newPage();await page.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,'language',{get:()=> 'zh-TW'});Object.defineProperty(navigator,'languages',{get:()=>['zh-TW','zh']});});await page.setViewport({width:1440,height:900});await page.setBypassServiceWorker(true);await page.setRequestInterception(true);
 const origin='https://wishlist-qa.invalid'; const dist=path.resolve(__dirname,'../../../../client/dist');
 const faults:{path:string;method:string;kind:'FAIL'|'DROP_ACK'|'HOLD';remaining:number;wait?:Promise<void>;started?:()=>void}[]=[];const traffic:{path:string;method:string;status:number}[]=[];
 const bridge=async(req:any)=>{
  try{const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}
   if(/^\/api\/listing-media\/.+\/(image|thumbnail)$/.test(u.pathname)){await req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#cfe8da"/><text x="10" y="100">SYNTHETIC LOCAL QA</text></svg>'});return;}
   if(u.pathname.startsWith('/api/')){const method=req.method().toLowerCase();if(!['get','post','options','head'].includes(method))throw new Error('Unsupported isolated request');
    const fault=faults.find(f=>f.remaining>0&&f.path===u.pathname&&f.method===method);if(fault){fault.remaining--;fault.started?.();if(fault.kind==='FAIL'){traffic.push({path:u.pathname,method,status:503});await req.respond({status:503,contentType:'application/json',body:'{"error":"synthetic injected failure"}'});return;}}
    let q=(http as any)[method](u.pathname+u.search);const h=req.headers();if(h.authorization)q=q.set('Authorization',h.authorization);if(h['content-type'])q=q.set('Content-Type',h['content-type']);if(req.postData())q=q.send(req.postData());const r=await q;traffic.push({path:u.pathname,method,status:r.status});if(fault?.kind==='HOLD')await fault.wait;if(fault?.kind==='DROP_ACK'){await req.abort('failed');return;}await req.respond({status:r.status,contentType:r.headers['content-type']||'application/json',body:r.text??JSON.stringify(r.body)});return;}
   const filename=u.pathname.startsWith('/assets/')?path.join(dist,u.pathname):path.join(dist,'index.html');if(!filename.startsWith(dist+path.sep))throw new Error('Asset outside compiled client');const ext=path.extname(filename);await req.respond({status:200,contentType:ext==='.js'?'application/javascript':ext==='.css'?'text/css':'text/html',body:readFileSync(filename)});
  }catch{if(!req.isInterceptResolutionHandled())try{await req.respond({status:503,contentType:'application/json',body:'{"error":"isolated UI bridge failed"}'});}catch{/* Browser aborted an obsolete or timed-out request. */}}
 }; page.on('request',bridge);
 try{
 let seeded=0;
 const sizes=process.env.WEB_QA_FAULT_ONLY==='1'?[300]:[10000,30000,50000];
 for(const size of sizes){
  const seedStart=performance.now();
  while(seeded<size){
   const n=Math.min(1000,size-seeded);const rows=Array.from({length:n},(_,k)=>{
    const i=seeded+k; const match=i%20===0;const excluded=i%200===0;const id=randomUUID();if(match&&!excluded)expected.add(id);
    return{id,ownerUserId:seller,clientListingId:randomUUID(),requestHash:'SYNTHETIC-NOT-STOCK',title:match?'Sony 相機 A7':'無關冰箱',description:'Isolated synthetic fixture, never production goods',brand:match?'Sony':'Panasonic',category:'electronics',price:4000,currency:'TWD',deliveryMethods:['MEETUP' as const],status:excluded?'SOLD' as const:'ACTIVE' as const,publishedAt:new Date(),mapVisibleUntil:new Date(Date.now()+3600000),expiresAt:new Date(Date.now()+86400000),createdAt:new Date(1700000000000+i*1000)};
   });
   await prisma.listing.createMany({data:rows});
   await prisma.listingLocation.createMany({data:rows.map(r=>({listingId:r.id,county:'臺北市',district:'中正區',publicLatitude:25.05,publicLongitude:121.51,precisionMeters:2200}))});
   await prisma.listingMedia.createMany({data:rows.map(r=>{const id=randomUUID();return{id,listingId:r.id,ownerUserId:seller,imageUrl:getApiUrl()+'/listing-media/'+id+'/image',thumbnailUrl:getApiUrl()+'/listing-media/'+id+'/thumbnail',contentHash:'SYNTHETIC-local-only'};})});seeded+=n;
  }
  const start=performance.now();let cursor:string|undefined;const found:string[]=[];let pages=0,firstMs=0;
  do{const response=await http.get('/api/listings/matches').set('Authorization',auth(buyer)).query({wishItemId:String(wish),limit:'50',...(cursor?{cursor}:{})});expect(response.status).toBe(200);if(!pages)firstMs=performance.now()-start;found.push(...response.body.items.map((v:any)=>v.listing.id));cursor=response.body.nextCursor??undefined;pages++;expect(pages).toBeLessThan(1000);}while(cursor);
  expect(found.length).toBe(expected.size);expect(new Set(found)).toEqual(expected);
  const [wrong,none,own]=await Promise.all([http.get('/api/listings/matches').set('Authorization',auth(other)).query({wishItemId:String(wish)}),http.get('/api/listings/matches').set('Authorization',auth(other)).query({wishItemId:String(otherWish)}),http.get('/api/listings/matches').set('Authorization',auth(buyer)).query({wishItemId:String(wish),limit:'50'})]);
  expect(wrong.status).toBe(404);expect(none.body.items).toEqual([]);expect(own.body.items.every((v:any)=>expected.has(v.listing.id))).toBe(true);
  console.log(JSON.stringify({catalog:size,expected:expected.size,returned:found.length,pages,firstPageMs:Math.round(firstMs),fullMs:Math.round(performance.now()-start),seedMs:Math.round(start-seedStart),oracle:'fixed index modulo 20, excluding modulo 200 SOLD; independent of matching implementation'}));
  const uiStart=performance.now();
  if(size===sizes[0]){await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');await page.type('#identifier','0911111100');await page.type('#password','synthetic-local-only-pass');await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});}else await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction((count:number)=>Array.from(document.querySelectorAll('button[aria-expanded]')).some(b=>b.getAttribute('aria-label')?.replace(/,/g,'').includes(String(count))),{timeout:30000},expected.size);
  const homeReadyMs=Math.round(performance.now()-uiStart);await page.click('button[aria-expanded]');
  await page.waitForFunction((count:number)=>new Set(Array.from(document.querySelectorAll('a[href*="listing="]')).map(a=>new URL((a as HTMLAnchorElement).href).searchParams.get('listing'))).size===count,{timeout:30000},expected.size);
  const visibleIds:string[]=await page.evaluate(()=>[...new Set(Array.from(document.querySelectorAll('a[href*="listing="]')).map(a=>new URL((a as HTMLAnchorElement).href).searchParams.get('listing')))]);
  expect(new Set(visibleIds)).toEqual(expected);
  expect(visibleIds).toEqual([...expected].sort((a,b)=>a.localeCompare(b)));
  await page.screenshot({path:webQaEvidence(`scale-${size}-synthetic.png`)});
  console.log(JSON.stringify({uiCatalog:size,uiExpected:expected.size,uiRenderedUniqueIds:visibleIds.length,homeReadyMs,expandedFullMs:Math.round(performance.now()-uiStart),client:'actual compiled client/dist',auth:'normal UI login through actual auth controller',externalNetwork:'blocked; map tiles not accepted by this test'}));
 }
 await page.setViewport({width:390,height:844});await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('button[aria-expanded]');
 const narrow=await page.evaluate(()=>({viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,heading:!!document.getElementById('home-matches-heading')}));expect(narrow.bodyWidth).toBeLessThanOrEqual(narrow.viewport);expect(narrow.heading).toBe(true);
 await page.screenshot({path:webQaEvidence(`scale-${seeded}-narrow-synthetic.png`)});console.log(JSON.stringify({narrowHome:narrow}));
 await page.goto(origin+'/explore?q=Sony&view=list',{waitUntil:'domcontentloaded'});await page.waitForSelector('#explore-search');await page.waitForFunction(()=>(document.querySelector('#explore-search') as HTMLInputElement)?.value==='Sony');
 await page.click('#explore-search',{clickCount:3});await page.type('#explore-search','完全無結果商品測試');await page.click('form button[type="submit"]');await page.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='完全無結果商品測試');await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(document.querySelector('#explore-search') as HTMLInputElement)?.value==='完全無結果商品測試');expect(new URL(page.url()).searchParams.get('view')).toBe('list');console.log(JSON.stringify({searchReload:'PASS',chineseQuery:'完全無結果商品測試',listMode:'retained in public URL',otherFilters:'not accepted by this minimal fix'}));
 const advanced=origin+`/explore?q=Sony&wish=${wish}&brand=Sony&category=electronics&condition=USED&delivery=MEETUP&minPrice=100&maxPrice=4500&bbox=121.49,25.03,121.53,25.07&radius=10&view=list`;
 await page.goto(advanced,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(document.querySelector('#explore-search') as HTMLInputElement)?.value==='Sony');
 await page.evaluate(()=>{(Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/') as HTMLAnchorElement).click();});await page.waitForFunction(()=>location.pathname==='/');await page.goBack();await page.waitForFunction(()=>(document.querySelector('#explore-search') as HTMLInputElement)?.value==='Sony');
 for(const [key,value] of Object.entries({brand:'Sony',category:'electronics',condition:'USED',delivery:'MEETUP',minPrice:'100',maxPrice:'4500',bbox:'121.49,25.03,121.53,25.07',radius:'10',view:'list'}))expect(new URL(page.url()).searchParams.get(key)).toBe(value);
 await page.goForward();await page.waitForFunction(()=>location.pathname==='/');await page.goBack();await page.waitForSelector('#explore-search');console.log(JSON.stringify({advancedBrowserHistory:'PASS',fields:['Chinese query','wish ID','brand','category','condition','delivery','price range','coarse bbox','wish radius','list mode'],preciseGpsStored:false}));
 const context=await browser.createBrowserContext();const second=await context.newPage();await second.setBypassServiceWorker(true);await second.setRequestInterception(true);second.on('request',bridge);await second.goto(origin+'/login',{waitUntil:'domcontentloaded'});await second.waitForSelector('#identifier');await second.type('#identifier','0911111102');await second.type('#password','synthetic-local-only-pass');await second.click('button[type="submit"]');await second.waitForFunction(()=>location.pathname==='/dashboard');await second.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await second.waitForFunction(()=>{const section=document.querySelector('section[aria-labelledby="home-matches-heading"]');return !!section&&Array.from(section.querySelectorAll('button')).some(b=>!b.disabled&&(b.textContent?.includes('重新整理')||b.textContent?.includes('Refresh')));});
 expect(await second.$$eval('a[href*="listing="]',(a:any[])=>a.length)).toBe(0);console.log(JSON.stringify({secondBuyerHome:'PASS',wish:'Canon 相機',resultCount:0,crossUserSonyLeak:false,session:'separate normal UI login, no copied session'}));await context.close();
 const productIds=[...expected].slice(0,3), rooms:string[]=[];const sharedMessageKey=randomUUID();
 for(let i=0;i<3;i++){
  const opened=await http.post('/api/chat/conversations').set('Authorization',auth(buyer)).send({listingId:productIds[i]});expect(opened.status).toBe(201);rooms.push(opened.body.id);
  const message=await http.post(`/api/chat/conversations/${rooms[i]}/messages`).set('Authorization',auth(buyer)).send({clientMessageId:sharedMessageKey,text:`SYNTHETIC ROOM ${i} PRODUCT ${productIds[i]}`});expect(message.status).toBe(201);
  const terms={startsAt:new Date(Date.now()+86400000+i*7200000).toISOString(),durationMinutes:60,timeZone:'Asia/Taipei',placeName:`合成地點${i}原版`,latitude:25.05,longitude:121.51,notes:'SYNTHETIC NOT REAL MEETUP'};
  const mutate=async(action:string,actor:number,version:number,extra:any={})=>http.post(`/api/chat/conversations/${rooms[i]}/meetup`).set('Authorization',auth(actor)).send({clientActionId:randomUUID(),action,expectedVersion:version,...extra});
  expect((await mutate('PROPOSE',buyer,0,{terms})).status).toBe(201);
  if(i===0)expect((await mutate('CONFIRM',seller,1)).status).toBe(201);
  if(i===1){expect((await mutate('REVISE',seller,1,{terms:{...terms,placeName:'合成地點1改約'}})).status).toBe(201);expect((await mutate('CANCEL',buyer,2)).status).toBe(201);}
 }
 for(let i=0;i<3;i++){
  await page.goto(origin+'/chat?room='+rooms[i],{waitUntil:'domcontentloaded'});
  await page.waitForFunction((id:string)=>document.body.innerText.includes(id),{},productIds[i]);
  const body=await page.evaluate(()=>document.body.innerText);expect(body).toContain(`SYNTHETIC ROOM ${i}`);for(let j=0;j<3;j++)if(i!==j)expect(body).not.toContain(`SYNTHETIC ROOM ${j}`);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.includes('查看或提議面交預約')));
  await page.evaluate(()=>{(Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes('查看或提議面交預約')) as HTMLButtonElement).click();});
  const place=i===1?'合成地點1改約':`合成地點${i}原版`;await page.waitForFunction((p:string)=>document.querySelector('[role="dialog"]')?.textContent?.includes(p),{},place);
  const modal=await page.$eval('[role="dialog"]',(el:any)=>el.innerText);expect(modal).toContain(i===0?'雙方已確認':i===1?'已取消':'提議中');if(i!==0)expect(modal).not.toContain('雙方已確認');for(let j=0;j<3;j++)if(i!==j)expect(modal).not.toContain(`合成地點${j}`);
  await page.screenshot({path:webQaEvidence(`chat-meetup-${i}-synthetic.png`)});
 }
 console.log(JSON.stringify({multiChatUi:'PASS',roomCount:3,uniqueProducts:3,states:['CONFIRMED','REVISED_THEN_CANCELLED','PROPOSED_NOT_CONFIRMED'],sameMessageIdAcrossRooms:'isolated',productionWrites:0}));
 const clickText=async(text:string)=>{await page.waitForFunction((t:string)=>Array.from(document.querySelectorAll('button')).some(b=>!b.disabled&&b.textContent?.includes(t)),{},text);await page.evaluate((t:string)=>{(Array.from(document.querySelectorAll('button')).find(b=>!b.disabled&&b.textContent?.includes(t)) as HTMLButtonElement).click();},text);};
 await page.goto(origin+'/chat?room='+rooms[0],{waitUntil:'domcontentloaded'});await page.waitForSelector('textarea',{visible:true});await page.waitForFunction(()=>{const field=document.querySelector('textarea') as HTMLTextAreaElement|null;return !!field&&!field.disabled;});
 for(const [label,recover] of [['FAULT_ACK_LOOKUP','只查核原訊息回執'],['FAULT_ACK_RETRY','明確重試相同訊息']]){
  const target=`/api/chat/conversations/${rooms[0]}/messages`;faults.push({path:target,method:'post',kind:'DROP_ACK',remaining:1});const before=traffic.filter(t=>t.path===target&&t.method==='post').length;
  await page.type('textarea',label);await page.evaluate(()=>{const b=document.querySelector('textarea')?.closest('form')?.querySelector('button[type="submit"]') as HTMLButtonElement;b.click();b.click();});await page.waitForFunction(()=>document.body.innerText.includes('尚未確認訊息送出'));
  expect(traffic.filter(t=>t.path===target&&t.method==='post').length-before).toBe(1);expect(await prisma.message.count({where:{conversationId:rooms[0],text:label}})).toBe(1);await clickText(recover);await page.waitForFunction(()=>!document.body.innerText.includes('上一則訊息結果尚未確認'));
  expect(await prisma.message.count({where:{conversationId:rooms[0],text:label}})).toBe(1);
 }
 faults.push({path:`/api/chat/conversations/${rooms[0]}`,method:'get',kind:'FAIL',remaining:1});await clickText('只更新聊天');await page.waitForFunction(()=>document.body.innerText.includes('無法更新聊天'));expect(await page.evaluate(()=>document.body.innerText.includes('SYNTHETIC ROOM 0'))).toBe(true);await clickText('只更新聊天');await page.waitForFunction(()=>!document.body.innerText.includes('無法更新聊天'));
 let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>started=r);faults.push({path:`/api/chat/conversations/${rooms[0]}`,method:'get',kind:'HOLD',remaining:1,wait:held,started});await clickText('只更新聊天');await seen;await page.goto(origin+'/chat?room='+rooms[1],{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('SYNTHETIC ROOM 1'));release();await page.waitForFunction(()=>!document.body.innerText.includes('SYNTHETIC ROOM 0'));
 const revisedTitle='Sony 相機 A7 UPDATED-CACHE';await prisma.listing.update({where:{id:productIds[1]},data:{title:revisedTitle}});await clickText('只更新聊天');await page.waitForFunction((t:string)=>document.body.innerText.includes(t),{},revisedTitle);
 const delayed=new Promise<void>(resolve=>setTimeout(resolve,33000));faults.push({path:`/api/chat/conversations/${rooms[1]}`,method:'get',kind:'HOLD',remaining:1,wait:delayed});await clickText('只更新聊天');await page.waitForFunction(()=>document.body.innerText.includes('無法更新聊天'),{timeout:36000});expect(await page.evaluate(()=>document.body.innerText.includes('SYNTHETIC ROOM 1'))).toBe(true);await delayed;await clickText('只更新聊天');await page.waitForFunction(()=>!document.body.innerText.includes('無法更新聊天'));
 let releaseBootstrap!:()=>void,bootstrapStarted!:()=>void;const bootstrapHold=new Promise<void>(r=>releaseBootstrap=r),bootstrapSeen=new Promise<void>(r=>bootstrapStarted=r);faults.push({path:'/api/listings/'+productIds[0],method:'get',kind:'HOLD',remaining:1,wait:bootstrapHold,started:bootstrapStarted});
 await page.goto(origin+`/explore?q=Sony&wish=${wish}&listing=${productIds[0]}`,{waitUntil:'domcontentloaded'});await bootstrapSeen;await clickText('商品列表');expect(new URL(page.url()).searchParams.get('listing')).toBe(productIds[0]);expect(new URL(page.url()).searchParams.get('wish')).toBe(String(wish));expect(new URL(page.url()).searchParams.get('q')).toBe('Sony');releaseBootstrap();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>(document.querySelector('#explore-search') as HTMLInputElement)?.value==='Sony');expect(new URL(page.url()).searchParams.get('view')).toBe('list');
 console.log(JSON.stringify({browserFaults:['committed message lost acknowledgement + receipt-only recovery','committed message lost acknowledgement + explicit same-ID retry','rapid double submit no duplicate','503 preserves previous history and explicit retry recovers','late old-room response cannot overwrite another room','changed product metadata refreshes without stale cache'],productionWrites:0}));
 console.log(JSON.stringify({timeoutRecovery:'PASS actual 30s browser API deadline',lateBootstrapViewChange:'PASS preserves q/wish/product across reload'}));
 let releaseOldAccount!:()=>void,oldAccountStarted!:()=>void;
 const oldAccountHold=new Promise<void>(r=>releaseOldAccount=r),oldAccountSeen=new Promise<void>(r=>oldAccountStarted=r);
 faults.push({path:'/api/users/me',method:'get',kind:'HOLD',remaining:1,wait:oldAccountHold,started:oldAccountStarted});
 await page.reload({waitUntil:'domcontentloaded'});await oldAccountSeen;
 await page.waitForSelector('button[aria-label="登出"]');await page.click('button[aria-label="登出"]');
 await page.waitForSelector('#identifier');await page.type('#identifier','0911111102');await page.type('#password','synthetic-local-only-pass');await page.click('button[type="submit"]');
 await page.waitForFunction(()=>location.pathname==='/dashboard');releaseOldAccount();
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const section=document.querySelector('section[aria-labelledby="home-matches-heading"]');return !!section&&Array.from(section.querySelectorAll('button')).some(b=>!b.disabled&&(b.textContent?.includes('重新整理')||b.textContent?.includes('Refresh')));});
 expect(await page.$$eval('a[href*="listing="]',(a:any[])=>a.length)).toBe(0);
 await page.goto(origin+'/chat?room='+rooms[0],{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.innerText.includes('無法')||document.body.innerText.includes('不存在'));
 expect(await page.evaluate(()=>document.body.innerText.includes('SYNTHETIC ROOM 0'))).toBe(false);
 expect(traffic.some(t=>t.path===`/api/chat/conversations/${rooms[0]}`&&t.status===404)).toBe(true);
 console.log(JSON.stringify({sameBrowserAccountSwitch:'PASS',oldProfileResponse:'held until normal UI logout/new login, then released',newBuyerWish:'Canon 相機',newBuyerResultCount:0,oldRoomReadHTTP:404,oldRoomContentLeak:false,sessionTransfer:false,productionWrites:0}));

 }catch(error){console.log(JSON.stringify({isolatedUiFailureUrl:page.url(),visibleSyntheticUi:(await page.evaluate(()=>document.body.innerText)).slice(0,4000)}));throw error;}finally{await browser.close();}
},180000);
