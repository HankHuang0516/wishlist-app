import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFile} from 'child_process';
import {randomUUID} from 'crypto';
import type {AddressInfo} from 'net';
import prisma from '../../lib/prisma';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
// Actual compiled CLI -> loopback HTTP -> real admin routes -> isolated DB. Synthetic rows only.
describe('daily capture CSV bridge saves private DB drafts only (isolated only)',()=>{
 const admin='synthetic-records-bridge-admin',prefix='SYNTHETIC-BRIDGE-'+randomUUID().slice(0,8)+'-';
 let server:any,origin='',dir='';
 const header='原帖網址,原始ID,商品名稱,價格,幣別,縣市,行政區,原發日期,來源查核時間,狀態,授權證據';
 const at=(ms:number)=>new Date(Date.now()-ms).toISOString().replace(/\.\d{3}Z$/,'Z');
 const csv=(n:number)=>[header,...Array.from({length:n},(_,i)=>`https://www.facebook.com/groups/1/posts/${900000+i},${prefix}${i},合成橋接測試商品${i},${100+i},TWD,臺北市,大安區,${at(7200000)},${at(60000)},ACTIVE,`)].join('\r\n');
 const run=(args:string[])=>new Promise<any>((resolve)=>execFile(process.execPath,[path.join(__dirname,'../../../scripts/records-bridge.cjs'),...args],{env:{...process.env,ADMIN_API_KEY:admin},timeout:120000},(_e,stdout)=>resolve(JSON.parse(stdout.trim().split('\n').pop()!))));
 beforeAll(async()=>{
  require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB required');
  const app=express();app.use(express.json());app.use('/api/source-lead-admin',createSourceLeadAdmin(()=>admin));app.use('/api/source-leads',createSourceLeadRoutes());
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'records-bridge-'));fs.chmodSync(dir,0o700);
 });
 afterAll(async()=>{const rows=await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}},select:{id:true}});await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:rows.map(r=>r.id)}}});await prisma.externalSourceLead.deleteMany({where:{archiveItemId:{startsWith:prefix}}});await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});await prisma.$disconnect();});
 test('dry-run writes nothing; apply saves PRIVATE_PENDING; resend replays; a second job refuses existing ids',async()=>{
  const file=path.join(dir,'daily.csv');fs.writeFileSync(file,csv(25),{mode:0o600});
  expect((await run(['plan',file])).batches).toBe(2);
  const dry=await run(['dry-run',file,'',dir,origin]);expect(dry.state).toBe('DRY_RUN_PASSED');expect(dry.total).toBe(25);
  expect(await prisma.externalSourceLead.count({where:{archiveItemId:{startsWith:prefix}}})).toBe(0);
  const applied=await run(['apply',file,'',dir,origin]);expect(applied.state).toBe('SAVED_PRIVATE_PENDING');
  const rows=await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}}});
  expect(rows).toHaveLength(25);expect(rows.every(r=>r.status==='PRIVATE_PENDING'&&r.recordOrigin==='DB_MASTER'&&r.recordRevision===1)).toBe(true);
  const pending=rows[0].pendingFacts as any;expect(pending.evidence.publicFacts.priceText).toMatch(/^\d+$/);expect(pending.latitude).toBeNull();
  const pub=await fetch(origin+'/api/source-leads/'+rows[0].id);expect(pub.status).toBe(404);
  expect(await run(['verify',file,'',dir,origin])).toEqual({state:'READBACK_PASSED',checked:25,problems:[]});
  // Simulate a lost acknowledgement for batch 0: the identical body replays without new rows.
  const receipt=path.join(dir,applied.jobId+'.json'),state=JSON.parse(fs.readFileSync(receipt,'utf8'));state.batches[0].state='SENT';state.state='STOPPED';fs.writeFileSync(receipt,JSON.stringify(state));
  const resumed=await run(['apply',file,'',dir,origin]);
  expect(resumed.state).toBe('SAVED_PRIVATE_PENDING');expect(resumed.batches[0].replayed).toBe(true);
  expect(await prisma.externalSourceLead.count({where:{archiveItemId:{startsWith:prefix}}})).toBe(25);
  expect(await prisma.sourceLeadRecordEvent.count({where:{leadId:{in:rows.map(r=>r.id)}}})).toBe(25);
  // A different job (fresh receipt directory) cannot recreate or overwrite the saved ids.
  const other=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'records-bridge-'));fs.chmodSync(other,0o700);
  const second=await run(['apply',file,'',other,origin]);fs.rmSync(other,{recursive:true,force:true});
  expect(second.errorCode).toBe('RECORD_ALREADY_EXISTS');expect(second.overlap).toHaveLength(25);
 },180000);
});
