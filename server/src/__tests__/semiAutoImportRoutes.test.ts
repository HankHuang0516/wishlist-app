import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSemiAutoImportRoutes, pendingImportBodyAdmission } from '../routes/semiAutoImportRoutes';
const credential='synthetic-admin-test-only';
const base={libraryFileId:'libfile_'+'a'.repeat(32),jsonVersion:28,csvVersion:25,sha256:'a'.repeat(64),csvLibraryFileId:'libfile_'+'b'.repeat(32),csvSha256:'b'.repeat(64)};
let root:string,app:express.Express;
beforeEach(()=>{root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wishlist-pending-api-test-'));fs.chmodSync(root,0o700);app=express();app.use('/pending',...pendingImportBodyAdmission(()=>credential));app.use(express.json({limit:'1mb'}));app.use('/pending',createSemiAutoImportRoutes(()=>credential,root));});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
test('administrator header required; query credentials never accepted',async()=>{
 expect((await request(app).get('/pending/'+'a'.repeat(64))).status).toBe(401);
 expect((await request(app).get('/pending/'+'a'.repeat(64)+'?key=synthetic').set('x-admin-key',credential)).status).toBe(400);
});
test('create, advance, review, paginated read and paired export with original base; no public write',async()=>{
 const input=[{sourceUrl:'https://example.com/item/1',itemKey:'one',title:'測試二手椅',price:10,currency:'TWD'}];
 const create=await request(app).post('/pending').set('x-admin-key',credential).send({text:JSON.stringify(input),format:'json',base});expect(create.status).toBe(201);
 const id=create.body.id;const advanced=await request(app).post('/pending/'+id+'/advance').set('x-admin-key',credential).send({revision:0,base});expect(advanced.status).toBe(200);expect(advanced.body.accepted).toBe(1);
 const read=await request(app).get('/pending/'+id+'?limit=1').set('x-admin-key',credential);expect(read.headers['cache-control']).toBe('private, no-store');expect(read.body.items[0].item.public).toBe(false);expect(read.body.items[0].item.rights).toBe('UNKNOWN');
 const item=read.body.items[0].item;const review=await request(app).post('/pending/'+id+'/review').set('x-admin-key',credential).send({revision:1,base,decisions:[{id:item.id,contentHash:item.contentHash,reviewRef:'review:fixture123',action:'KEEP_PENDING'}]});expect(review.status).toBe(200);
 const stale=await request(app).post('/pending/'+id+'/export').set('x-admin-key',credential).send({revision:1,base});expect(stale.status).toBe(409);
 const result=await request(app).post('/pending/'+id+'/export').set('x-admin-key',credential).send({revision:2,base});expect(result.status).toBe(200);expect(result.body.manifest.canonicalWrite).toBe(false);expect(result.body.manifest.count).toBe(1);expect(JSON.parse(result.body.json).items[0].reviewAction).toBe('KEEP_PENDING');
});
test('invalid batch size/field and changed canonical base fail closed',async()=>{
 const created=await request(app).post('/pending').set('x-admin-key',credential).send({text:'[{"title":"缺來源"}]',format:'json',base});
 const id=created.body.id;expect((await request(app).post('/pending/'+id+'/advance').set('x-admin-key',credential).send({revision:0,base:{...base,jsonVersion:29}})).status).toBe(409);
 expect((await request(app).post('/pending/'+id+'/advance').set('x-admin-key',credential).send({revision:0,base,batchSize:10000})).status).toBe(400);
 expect((await request(app).post('/pending/'+id+'/advance').set('x-admin-key',credential).send({revision:0,base,skipValidation:true})).status).toBe(400);
 const result=await request(app).post('/pending/'+id+'/advance').set('x-admin-key',credential).send({revision:0,base});expect(result.body.accepted).toBe(0);expect(result.body.rejected).toBe(1);
});
test('bounded 10000-item upload accepted after auth without changing ordinary body limit',async()=>{
 const items=Array.from({length:10000},(_,i)=>({sourceUrl:'https://example.com/posts/'+Math.floor(i/5),itemKey:String(i%5),title:'測試二手商品'+i,county:'臺南市',district:'永康區',originalPostedAt:'2026-10-01T00:00:00Z',checkedAt:'2026-10-08T00:00:00Z',price:i+1,currency:'TWD',status:'ACTIVE'}));
 const body={text:JSON.stringify(items),format:'json',base};expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(1024*1024);
 expect((await request(app).post('/pending').send(body)).status).toBe(401);
 const admitted=await request(app).post('/pending').set('x-admin-key',credential).send(body);expect(admitted.status).toBe(201);expect(admitted.body.total).toBe(10000);
});
