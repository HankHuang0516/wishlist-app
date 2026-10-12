import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
import prisma from '../../lib/prisma';
import {createSourceManagerRoutes} from '../../routes/sourceManagerRoutes';
import {createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {sourceReferenceFixture} from './sourceReferenceFixture';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
describe('actual compiled source manager browser QA (isolated only)',()=>{
 let server:any,browser:any,origin:string;const registryOps:string[]=[],registryPrefix='SYNTHETIC-BROWSER-REGISTRY-',oldPublic=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 beforeAll(async()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';const app=express();app.use('/api/source-leads',createSourceLeadRoutes());app.use('/api/source-manager',createSourceManagerRoutes(()=> 'synthetic-only-browser-manager',()=>origin));app.use(express.static(path.resolve('../client/dist')));app.get('/{*splat}',(_q,r)=>r.sendFile(path.resolve('../client/dist/index.html')));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});},30000);
 afterAll(async()=>{await browser?.close();await new Promise<void>(r=>server?.close(r));const ids=(await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:registryPrefix}},select:{id:true}})).map(v=>v.id);await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:ids}}});await prisma.externalSourceLead.deleteMany({where:{id:{in:ids}}});await prisma.sourceReferenceEvidence.deleteMany({where:{archiveItemId:{startsWith:registryPrefix}}});await prisma.sourceReferenceRegistration.deleteMany({where:{operationId:{in:registryOps}}});await prisma.sourceManagerSession.deleteMany({});if(oldPublic===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldPublic;await prisma.$disconnect();});
 test('normal login and new-source form render at desktop/390px without production credentials or writes',async()=>{
  const out=process.env.WEB_QA_ARTIFACT_DIR??path.resolve('/tmp/wishlist-source-manager-qa');await fs.mkdir(out,{recursive:true});
  const page=await browser.newPage();const mutations:string[]=[];page.on('request',(q:any)=>{if(q.method()==='POST'&&q.url().includes('/records/'))mutations.push(q.url());});
  for(const width of [1366,390]){
   await page.setViewport({width,height:844});await page.goto(origin+'/manage/login',{waitUntil:'networkidle0'});await page.waitForSelector('input[type=password]');await page.screenshot({path:path.join(out,'query-source-manager-login-'+width+'.png'),fullPage:true});
   await page.type('input[type=password]','synthetic-only-browser-manager');await page.evaluate(()=>document.querySelector<HTMLFormElement>('form')!.requestSubmit());await page.waitForFunction(()=>document.body.innerText.includes('管理登入期限'));
   await page.goto(origin+'/manage/source-items/new',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.innerText.includes('新增私人草稿'));
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,publishButtons:[...document.querySelectorAll('button')].filter(b=>/^發布/.test(b.innerText)).length,passwordInputs:document.querySelectorAll('input[type=password]').length,saveHeight:[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('保存'))?.getBoundingClientRect().height}));
   expect(metrics.overflow).toBe(false);expect(metrics.publishButtons).toBe(0);expect(metrics.passwordInputs).toBe(0);expect(metrics.saveHeight).toBeGreaterThanOrEqual(44);
   await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
   await page.screenshot({path:path.join(out,'query-source-manager-form-'+width+'.png'),fullPage:true});
   await fs.writeFile(path.join(out,'query-source-manager-metrics-'+width+'.json'),JSON.stringify({isolated:true,actualCompiledClient:true,width,metrics,productionWrite:false,keyVisible:false}));
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.innerText==='登出此登入')!.click());await page.waitForSelector('input[type=password]');
  }
  expect(mutations).toHaveLength(0);await page.close();
 },120000);
 test('normal browser registration and separate same-source SAVE preserve authority, audit and explicit coordinate HOLD at desktop/390px',async()=>{
  const out=process.env.WEB_QA_ARTIFACT_DIR??path.resolve('/tmp/wishlist-source-manager-qa');await fs.mkdir(out,{recursive:true});const page=await browser.newPage(),traffic:{method:string;path:string}[]=[];
  page.on('request',(q:any)=>{const u=new URL(q.url());if(u.pathname.startsWith('/api/'))traffic.push({method:q.method(),path:u.pathname});});
  const metrics:any[]=[];
  const clickText=async(text:string)=>{await page.waitForFunction((t:string)=>Array.from(document.querySelectorAll('button,a')).some(e=>e.textContent===t&&!(e as HTMLButtonElement).disabled),{},text);await page.evaluate((t:string)=>{const el=Array.from(document.querySelectorAll('button,a')).find(e=>e.textContent===t) as HTMLElement;el.click();},text);};
  for(const width of [1366,390]){
   await page.setViewport({width,height:844});await page.goto(origin+'/manage/login',{waitUntil:'networkidle0'});await page.waitForSelector('input[type=password]');await page.type('input[type=password]','synthetic-only-browser-manager');await page.evaluate(()=>document.querySelector<HTMLFormElement>('form')!.requestSubmit());await page.waitForFunction(()=>document.body.innerText.includes('管理登入期限'));
   for(const mode of ['registered','held']){
    const archive=registryPrefix+randomUUID(),f=sourceReferenceFixture(archive);
    if(mode==='held')f.evidence.coordinateEvidence={sourceUrl:'https://api.openstreetmap.org/api/0.6/node/1',nodeXml:'<osm><node id="1" lat="23" lon="120.236" version="2" visible="true"><tag k="addr:city" v="台南市"/><tag k="addr:district" v="東區"/><tag k="addr:full" v="台南市永康區合成路123號"/></node></osm>',readReceiptRef:'source:synthetic-coordinate-observation'};
    await page.goto(origin+'/manage/source-evidence',{waitUntil:'networkidle0'});await page.waitForSelector('textarea');
    await page.focus('textarea');await page.keyboard.sendCharacter(JSON.stringify({entries:[f.evidence]}));
    await clickText('準備登錄預覽');await page.waitForFunction(()=>document.body.innerText.includes('待登錄1件'));const before=traffic.filter(t=>t.method==='POST'&&t.path==='/api/source-manager/reference-evidence').length;
    await clickText('登錄私人來源證據（不發布）');await page.waitForFunction(()=>document.body.innerText.includes('私人證據登錄已回讀'));
    const op=await page.evaluate(()=>{const s=document.querySelector('section[aria-label="登錄結果"]')!;return s.querySelector('p')!.textContent!.replace('操作編號：','');});registryOps.push(op);
    const text=await page.evaluate(()=>document.body.innerText);expect(text).toContain('不會重新登入Facebook');expect(text).toContain('本次發布0件');if(mode==='held'){expect(text).toContain('PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT');expect(text).toContain('HOLD');}else expect(text).toContain('結構與綁定通過');
    expect(traffic.filter(t=>t.method==='POST'&&t.path==='/api/source-manager/reference-evidence').length-before).toBe(1);expect(traffic.some(t=>t.path.includes('/source-lead-admin'))).toBe(false);
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,passwordInputs:document.querySelectorAll('input[type=password]').length,images:document.querySelectorAll('img').length,linkHeight:(Array.from(document.querySelectorAll('a')).find(e=>e.textContent==='開啟同來源待審表單') as HTMLElement).getBoundingClientRect().height}));
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);expect(layout.passwordInputs).toBe(0);expect(layout.images).toBe(0);expect(layout.linkHeight).toBeGreaterThanOrEqual(44);
    await page.screenshot({path:path.join(out,'query-source-registry-'+mode+'-'+width+'.png'),fullPage:true});
    await clickText('開啟同來源待審表單');await page.waitForFunction(()=>document.body.innerText.includes('新增私人草稿'));
    await clickText('讀取此件已登記實證');await clickText('帶入這份實證與原事實');await clickText('保存並完整核驗來源參考');
    await page.waitForFunction(()=>document.body.innerText.includes('已自動展示來源參考')||document.body.innerText.includes('已保存私人待處理'));
    const id=new URL(page.url()).pathname.split('/').pop()!;const row=await prisma.externalSourceLead.findUniqueOrThrow({where:{id}});expect(row.archiveItemId).toBe(archive);expect(row.recordRevision).toBe(1);
    const pub=await request(server).get('/api/source-leads/'+id);expect(pub.status).toBe(mode==='registered'?200:404);if(pub.status===200){expect(pub.body.id).toBe(id);expect(pub.body.stockStatus).toBe('UNKNOWN');expect(pub.body.qualifiedSupply).toBe(false);}
    const audit=await prisma.sourceReferenceRegistration.findUniqueOrThrow({where:{operationId:op}});expect(audit.actorScope).toBe('SOURCE_REFERENCE_EVIDENCE_VERIFIER');
    expect(await prisma.listing.count({where:{title:f.facts.title}})).toBe(0);
    await page.screenshot({path:path.join(out,'query-source-registry-save-'+mode+'-'+width+'.png'),fullPage:true});
    metrics.push({width,mode,layout,operationId:op,id,sameArchiveId:true,sourceStatus:row.status,publicStatus:pub.status,stock:'UNKNOWN',qualifiedSupply:false});
   }
   await clickText('登出此登入');await page.waitForSelector('input[type=password]');
  }
  await fs.writeFile(path.join(out,'query-source-registry-browser-report.json'),JSON.stringify({head:process.env.QUERY_QA_HEAD_SHA,syntheticOnly:true,actualCompiledClient:true,productionWrites:0,originalProductImagesDownloaded:false,metrics},null,2));await page.close();
 },180000);

});
