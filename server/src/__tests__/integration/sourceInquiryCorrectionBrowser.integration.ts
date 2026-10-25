/** Real compiled Web + isolated HTTP/database; never contacts a seller or production. */
import express from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import prisma from '../../lib/prisma';
import authRoutes from '../../routes/authRoutes';
import paymentRoutes from '../../routes/paymentRoutes';
import {inquiryWeek} from '../../lib/inquiryAllowance';
import chatRoutes from '../../routes/chatRoutes';
import { authenticateToken } from '../../middleware/auth';
import { getMe } from '../../controllers/userController';
import { createSourceLeadRoutes } from '../../routes/sourceLeadRoutes';
import { transferSnapshot } from '../../lib/sourceLeadRules';
import { createLoopbackRequest } from './loopbackHttp';
import { fixture } from './consignmentFixture';
import { webQaBrowser, webQaEvidence } from './webQaBrowser';
const run=process.env.TEST_DATABASE_URL?describe:describe.skip;
run('built source inquiry correction and restart',()=>{
 let buyer:number,leadId:string,browser:any;
 const origin='https://wishlist-inquiry-qa.invalid',key=randomUUID(),phone='synthetic-inquiry-correction',password='synthetic-local-only-pass';
  const app=express();app.use(express.json());app.use('/api/auth',authRoutes);app.use('/api/payment',paymentRoutes);app.get('/api/users/me',authenticateToken,getMe);app.use('/api/chat',chatRoutes);app.use('/api/source-leads',createSourceLeadRoutes());const http=createLoopbackRequest(app);
 beforeAll(()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
  if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Explicit isolated database required');
  process.env.JWT_SECRET='isolated-inquiry-correction-only';process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';process.env.API_URL=origin+'/api';
 });
 afterAll(async()=>{
  if(browser)await browser.close();
  if(buyer)await prisma.user.deleteMany({where:{id:buyer}});
  if(leadId)await prisma.externalSourceLead.deleteMany({where:{id:leadId}});
  await prisma.$disconnect();
 });
 test('desktop/mobile: normal login, correct, withdraw, reload, ask again and recover a lost correction receipt',async()=>{
  buyer=(await prisma.user.create({data:{phoneNumber:phone,password:await bcrypt.hash(password,4),apiKey:key,name:'合成詢問測試帳號',inquiryWeekStart:inquiryWeek().startsAt,inquiryFreeUsed:1}})).id;
  const item=fixture().lead;item.archiveItemId='SYNTHETIC-INQUIRY-CORRECTION-BROWSER';leadId=(await prisma.externalSourceLead.create({data:item})).id;
  const qa=webQaBrowser();browser=await qa.puppeteer.launch({headless:true,executablePath:qa.executablePath,args:['--disable-background-networking']});
  const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
  await page.evaluateOnNewDocument((host:string)=>{if(window===window.top&&location.origin===host&&!localStorage.getItem('user-locale'))localStorage.setItem('user-locale','zh-TW');},origin);
  const dist=path.resolve(__dirname,'../../../../client/dist'),traffic:any[]=[],errors:string[]=[];let loseCorrection=false;
  page.on('pageerror',(e:Error)=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',async(req:any)=>{try{
   const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}
   if(u.pathname.startsWith('/api/')){
    const method=req.method().toLowerCase();if(!['get','post'].includes(method)){await req.abort();return;}
    let call=(http as any)[method](u.pathname+u.search);const headers=req.headers();if(headers.authorization)call=call.set('Authorization',headers.authorization);if(headers['content-type'])call=call.set('Content-Type',headers['content-type']);if(req.postData())call=call.send(req.postData());const result=await call;
    const body=req.postData()?JSON.parse(req.postData()):null;traffic.push({method:req.method(),path:u.pathname,status:result.status,action:body?.action??null});
    if(loseCorrection&&body?.action==='REVISE'&&result.status===200){loseCorrection=false;await req.abort('failed');return;}
    await req.respond({status:result.status,contentType:result.headers['content-type']??'application/json',body:result.text??JSON.stringify(result.body)});return;
   }
   const requested=path.resolve(dist,'.'+u.pathname),file=requested.startsWith(dist+path.sep)&&fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
   const ext=path.extname(file);await req.respond({status:200,contentType:ext==='.js'?'application/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':ext==='.svg'?'image/svg+xml':'text/html',body:fs.readFileSync(file)});
  }catch{if(!req.isInterceptResolutionHandled())await req.abort();}});
  const click=async(label:string)=>{
   try{await page.waitForFunction((value:string)=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent===value&&!b.disabled),{},label);}catch{throw Error('Control unavailable: '+label+'; '+await page.evaluate(()=>JSON.stringify({buttons:Array.from(document.querySelectorAll('button')).map(b=>({label:b.textContent,disabled:b.disabled})),alerts:Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent)})));}
   for(const button of await page.$$('button'))if(await button.evaluate((b:Element,value:string)=>b.textContent===value,label)){await button.evaluate((element:Element)=>element.scrollIntoView({block:'center',inline:'nearest'}));await button.click();return;}
   throw Error('Missing visible control '+label);
  };
  const write=async(value:string)=>{const field='textarea[aria-label="詢問內容"]';await page.waitForSelector(field);try{await page.waitForFunction((selector:string)=>{const field=document.querySelector(selector) as HTMLTextAreaElement|null;return !!field&&!field.disabled;},{},field);}catch{throw Error('Synthetic inquiry editor locked: '+JSON.stringify({step:value,traffic:traffic.slice(-12),ui:await page.evaluate(()=>({buttons:Array.from(document.querySelectorAll('button')).map(b=>({text:b.textContent,disabled:b.disabled})),alerts:Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent)}))}));}await page.click(field,{clickCount:3});await page.type(field,value);expect(await page.$eval(field,(e:HTMLTextAreaElement)=>e.value)).toBe(value);};
  const own=()=>prisma.sourceLeadInquiry.findUniqueOrThrow({where:{leadId_buyerUserId:{leadId,buyerUserId:buyer}},include:{lead:true}});
  const save=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:webQaEvidence(name),fullPage:true});};
  await page.goto(origin+'/login');await page.waitForSelector('#identifier');await page.type('#identifier',phone);await page.type('#password',password);await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
  await page.goto(origin+'/chat?source='+leadId);await page.waitForFunction(()=>document.body.innerText.includes('本週免費代問剩 2／3 次'));await write('合成詢問：3000元可以嗎？');await click('送出並委託聯絡賣家');await page.waitForFunction(()=>document.body.innerText.includes('WAITING_ROUTE'));await save('inquiry-before-correction-desktop.png');
  const before=(await own()).events;
  await click('更正詢問');expect(await page.$eval('textarea',(e:HTMLTextAreaElement)=>e.value)).toBe('合成詢問：3000元可以嗎？');
  await write('合成更正：3500元可面交嗎？');await click('送出更正並重新委託');await page.waitForFunction(()=>document.body.innerText.includes('更正詢問：合成更正：3500元可面交嗎？'));await click('更新');
  let saved=await own();expect((saved.events as any[])[0]).toEqual((before as any[])[0]);expect(transferSnapshot(saved.lead,saved.events as any).questions.map(q=>q.text)).toEqual(['合成更正：3500元可面交嗎？']);await save('inquiry-corrected-desktop.png');
  await click('撤回委託');await page.waitForFunction(()=>document.body.innerText.includes('CANCELLED'));await click('更新');await save('inquiry-cancelled-ask-again-desktop.png');
  const count=traffic.filter(r=>r.method==='POST'&&r.action).length;await page.reload();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='再次發問'&&!b.disabled));expect(traffic.filter(r=>r.method==='POST'&&r.action)).toHaveLength(count);
  await click('再次發問');expect(await page.$eval('textarea',(e:HTMLTextAreaElement)=>e.value)).toBe('合成更正：3500元可面交嗎？');await write('合成重問：請確認3500元與時間');await click('送出新詢問並重新委託');await page.waitForFunction(()=>document.body.innerText.includes('再次發問：合成重問：請確認3500元與時間'));
  saved=await own();expect(saved.state).toBe('WAITING_ROUTE');expect((saved.events as any[]).map(e=>e.action)).toEqual(['ASK','REVISE','CANCEL','REOPEN']);expect(transferSnapshot(saved.lead,saved.events as any).questions.map(q=>q.text)).toEqual(['合成重問：請確認3500元與時間']);await page.waitForFunction(()=>document.body.innerText.includes('本週免費代問剩 0／3 次'));expect((await prisma.user.findUniqueOrThrow({where:{id:buyer}})).inquiryFreeUsed).toBe(3);await save('inquiry-reopened-desktop.png');
  await page.setViewport({width:390,height:844});await page.reload();await click('更正詢問');await write('合成手機更正：星期六面交可以嗎？');await save('inquiry-mobile-editing.png');loseCorrection=true;await click('送出更正並重新委託');await page.waitForSelector('[role="alert"]');
  const posts=traffic.filter(r=>r.method==='POST'&&r.action).length;await click('更新');await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));expect(traffic.filter(r=>r.method==='POST'&&r.action)).toHaveLength(posts);
  saved=await own();expect((saved.events as any[]).filter(e=>e.action==='REVISE')).toHaveLength(2);expect(transferSnapshot(saved.lead,saved.events as any).questions.map(q=>q.text)).toEqual(['合成手機更正：星期六面交可以嗎？']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await prisma.user.findUniqueOrThrow({where:{id:buyer}})).inquiryFreeUsed).toBe(3);await save('inquiry-mobile-recovered.png');
  await page.evaluate(()=>localStorage.setItem('user-locale','en-US'));await page.reload();await click('Correct question');expect(await page.$eval('textarea',(e:HTMLTextAreaElement)=>e.value)).toBe('合成手機更正：星期六面交可以嗎？');await save('inquiry-mobile-english.png');await click('Cancel editing');
  expect(errors).toEqual([]);expect(traffic.filter(r=>r.method==='POST'&&r.action).map(r=>r.action)).toEqual(['ASK','REVISE','CANCEL','REOPEN','REVISE']);
  console.log(JSON.stringify({inquiryCorrectionBrowser:'PASS',normalLogin:true,desktopAndMobile:true,locales:['zh-TW','en-US'],actionSequence:['ASK','REVISE','CANCEL','REOPEN','REVISE'],lostCorrectionRecoveredWithoutResend:true,historyPreserved:true,onlyNewQuestionInSnapshot:true,externalSellerActions:0,productionWrites:0}));
 },60000);
});
