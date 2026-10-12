import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
import prisma from '../../lib/prisma';
import {createSourceManagerRoutes} from '../../routes/sourceManagerRoutes';
describe('actual compiled source manager browser QA (isolated only)',()=>{
 let server:any,browser:any,origin:string;
 beforeAll(async()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');const app=express();app.use('/api/source-manager',createSourceManagerRoutes(()=> 'synthetic-only-browser-manager',()=>origin));app.use(express.static(path.resolve('../client/dist')));app.get('/{*splat}',(_q,r)=>r.sendFile(path.resolve('../client/dist/index.html')));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']});},30000);
 afterAll(async()=>{await browser?.close();await new Promise<void>(r=>server?.close(r));await prisma.sourceManagerSession.deleteMany({});await prisma.$disconnect();});
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
});
