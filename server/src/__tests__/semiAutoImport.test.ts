import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { PendingImportStore, normalize, parseInput, sha } from '../lib/semiAutoImport';
const now=new Date('2026-10-09T02:00:00Z');
const base={libraryFileId:'libfile_'+'a'.repeat(32),jsonVersion:28,csvVersion:25,sha256:'a'.repeat(64),csvLibraryFileId:'libfile_'+'b'.repeat(32),csvSha256:'b'.repeat(64)};
const row=(key='1')=>({sourceUrl:'https://www.facebook.com/groups/123/posts/456',itemKey:key,title:'測試二手桌',price:100,currency:'TWD',county:'臺南市',district:'永康區',originalPostedAt:'2026-09-01T00:00:00Z',checkedAt:'2026-10-08T00:00:00Z',status:'ACTIVE'});
let root:string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wishlist-pending-test-'));fs.chmodSync(root,0o700);});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
test('CSV quoted commas, aliases and JSON map to identical item IDs; never public or qualified',()=>{
 const csv='原帖網址,原始ID,商品名稱,價格,幣別\r\nhttps://example.com/items/1,1,"二手桌,椅",100,TWD\r\n';
 const a=normalize(parseInput(csv,'csv')[0],now),b=normalize({sourceUrl:'https://example.com/items/1',itemKey:'1',title:'二手桌,椅',price:100,currency:'TWD'},now);
 expect(a).toEqual(b);expect(a.public).toBe(false);expect(a.rights).toBe('UNKNOWN');expect(a.issues).toContain('STOCK_UNVERIFIED');
});
test('one post multiple keys survive; same item duplicate and differing facts conflict',()=>{
 const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row(),row('2'),row(),{...row(),price:200}]),'json',base,now);
 j=s.advance(j.id,0,base);expect(j).toMatchObject({accepted:2,duplicates:2,rejected:1,state:'COMPLETE'});
 expect(s.page(j.id).items.map(r=>r.outcome)).toEqual(['PENDING_REVIEW','PENDING_REVIEW','DUPLICATE','CONFLICT']);
});
test('calendar months and 48h are independent; missing/old dates kept for review without refreshed check',()=>{
 const unknown=normalize({...row(),originalPostedAt:null,checkedAt:null},now);expect(unknown.issues).toContain('ORIGINAL_DATE_UNKNOWN');expect(unknown.checkedAt).toBeNull();
 const old=normalize({...row(),originalPostedAt:'2026-07-01T00:00:00Z'},now);expect(old.issues).toContain('OUTSIDE_TWO_CALENDAR_MONTHS');expect(old.issues).not.toContain('SOURCE_CHECK_STALE');
 const stale=normalize({...row(),checkedAt:'2026-09-01T00:00:00Z'},now);expect(stale.issues).toContain('SOURCE_CHECK_STALE');expect(stale.checkedAt).toBe('2026-09-01T00:00:00.000Z');
});
test.each([{county:'臺中市',district:'西屯區'},{county:'臺南市',district:'永康區'},{county:'高雄市',district:'左營區'}])('Taiwan valid district %j',loc=>expect(normalize({...row(),...loc},now).county).toBe(loc.county));
test.each([{county:'臺中市',district:'永康區'},{county:'東京',district:'新宿'},{price:-1},{price:true},{originalPostedAt:'2026-02-30T00:00:00Z'},{sourceUrl:'https://localhost/items/1'},{sourceUrl:'https://example.com/item?token=secret'},{title:'09'+'12345678'},{rightsRef:'unverified'},{extra:'not allowed'}])('invalid facts reject %j',value=>expect(()=>normalize({...row(),...value},now)).toThrow());
test('reference is a claim, SOLD not active; missing stable key blocked review',()=>{
 const item=normalize({...row(),itemKey:undefined,rightsRef:'consent:example123',status:'SOLD'},now);
 expect(item.issues).toEqual(expect.arrayContaining(['STABLE_ITEM_KEY_REQUIRED','RIGHTS_NEED_REVIEW','STOCK_UNVERIFIED','NOT_AVAILABLE']));expect(item.rights).toBe('CLAIMED_WITH_REFERENCE');
});
test('format corruption, duplicate mapped headers and excessive rows reject',()=>{
 for(const text of ['title,title\na,b','名稱,title\na,b','title\n"unclosed','title\n"x"y','title,itemKey\nx'])expect(()=>parseInput(text,'csv')).toThrow();
 expect(()=>parseInput(JSON.stringify(Array(10001).fill(row())),'json')).toThrow('ROW_LIMIT');
});
test('checkpoint resume, idempotent create and duplicate across chunks; evaluation frozen',()=>{
 const s=new PendingImportStore(root),text=JSON.stringify([row(),row('2'),row(),row('3')]);let j=s.create(text,'json',base,now);j=s.advance(j.id,0,base,2);
 const recovered=new PendingImportStore(root);expect(recovered.create(text,'json',base,new Date('2027-01-01'))).toEqual(j);
 j=recovered.advance(j.id,j.revision,base,2);expect(j.accepted).toBe(3);expect(j.duplicates).toBe(1);expect(j.evaluationAt).toBe(now.toISOString());
 expect(fs.statSync(path.join(root,j.id,'job.json')).mode&0o777).toBe(0o600);
});
test('concurrent writer/revision/base conflicts and cancel preserve committed checkpoint',()=>{
 const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row(),row('2')]),'json',base,now);
 expect(()=>s.advance(j.id,1,base)).toThrow('REVISION_CONFLICT');expect(()=>s.advance(j.id,0,{...base,jsonVersion:29})).toThrow('BASE_VERSION_CONFLICT');
 fs.writeFileSync(path.join(root,'writer.lock'),'existing',{mode:0o600});expect(()=>s.advance(j.id,0,base)).toThrow('WRITER_BUSY');fs.unlinkSync(path.join(root,'writer.lock'));
 j=s.advance(j.id,0,base,1);j=s.cancel(j.id,j.revision);expect(s.advance(j.id,j.revision,base).cursor).toBe(1);expect(()=>s.export(j.id,j.revision,base)).toThrow('INCOMPLETE_JOB');
});
test('CSV/JSON pair verified, spreadsheet injection escaped, stale export fails, no canonical mutation',()=>{
 const s=new PendingImportStore(root);let j=s.create(JSON.stringify([{...row(),title:'=SUM(A1)'}]),'json',base,now);j=s.advance(j.id,0,base);
 const output=s.export(j.id,j.revision,base);expect(output.manifest.count).toBe(1);expect(output.manifest.canonicalWrite).toBe(false);expect(output.manifest.jsonSha256).toBe(sha(output.json));expect(output.csv).toContain("'=SUM(A1)");
 expect(JSON.parse(output.json).qualifiedSupplyAdded).toBe(0);expect(()=>s.export(j.id,j.revision,{...base,csvVersion:26})).toThrow('EXPORT_VERSION_CONFLICT');
 expect(s.export(j.id,j.revision,base).manifest).toEqual(output.manifest);
});
test('unsafe symlink store denied',()=>{const link=root+'-link';fs.symlinkSync(root,link);try{expect(()=>new PendingImportStore(link).create(JSON.stringify([row()]),'json',base,now)).toThrow('PRIVATE_STORE_REQUIRED');}finally{fs.unlinkSync(link);}});
test('nested post splits explicit item keys without inventing dates',()=>{const rows=parseInput(JSON.stringify([{sourceUrl:row().sourceUrl,originalPostedAt:row().originalPostedAt,items:[{title:'桌',itemKey:'table'},{title:'椅',itemKey:'chair'}]}]),'json');expect(rows).toHaveLength(2);expect(normalize(rows[0],now).id).not.toBe(normalize(rows[1],now).id);expect(normalize(rows[0],now).checkedAt).toBeNull();});
test('review decisions bound to facts/revision; no rights promotion; retained in paired export',()=>{const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row()]),'json',base,now);j=s.advance(j.id,0,base);const item=s.page(j.id).items[0].item;
 expect(()=>s.review(j.id,j.revision,base,[{id:item.id,contentHash:'wrong',reviewRef:'review:example123',action:'KEEP_PENDING'}])).toThrow('BOUND_REVIEW_REQUIRED');
 j=s.review(j.id,j.revision,base,[{id:item.id,contentHash:item.contentHash,reviewRef:'review:example123',action:'KEEP_PENDING'}]);const output=s.export(j.id,j.revision,base);expect(JSON.parse(output.json).items[0]).toMatchObject({reviewAction:'KEEP_PENDING',rights:'UNKNOWN',public:false});expect(output.csv).toContain('KEEP_PENDING');
});
test('conflict preserves changed price/status and proposed record instead of losing it',()=>{const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row(),{...row(),price:200,status:'SOLD'}]),'json',base,now);j=s.advance(j.id,0,base);const change=s.page(j.id).items[1];expect(change.changedFields).toEqual(expect.arrayContaining(['price','sourceStatus']));expect(change.proposed.price).toBe(200);});
test('base key ordering does not cause false conflict',()=>{const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row()]),'json',base,now);const reversed={csvSha256:base.csvSha256,csvLibraryFileId:base.csvLibraryFileId,sha256:base.sha256,csvVersion:25,jsonVersion:28,libraryFileId:base.libraryFileId};expect(()=>s.advance(j.id,0,reversed)).not.toThrow();});
test('live lock never recovered, exact unknown hash denied',()=>{const s=new PendingImportStore(root);fs.writeFileSync(path.join(root,'writer.lock'),JSON.stringify({pid:process.pid,host:os.hostname(),nonce:'fixture'}),{mode:0o600});expect(()=>s.recoverLock('0'.repeat(64))).toThrow('LOCK_RECOVERY_DENIED');expect(()=>s.recoverLock(s.lockStatus()!.sha256)).toThrow('LOCK_OWNER_NOT_PROVEN_DEAD');expect(fs.existsSync(path.join(root,'writer.lock'))).toBe(true);});
test('actual interrupted child resumes from durable cursor only after same-host dead-owner recovery',()=>{
 const s=new PendingImportStore(root),j=s.create(JSON.stringify([row(),row('2'),row('3')]),'json',base,now);
 const code=`require('ts-node').register({transpileOnly:true});const fs=require('fs');const {PendingImportStore}=require('./src/lib/semiAutoImport');const original=fs.renameSync;fs.renameSync=(a,b)=>{original(a,b);if(b.endsWith('/job.json'))process.kill(process.pid,'SIGKILL');};new PendingImportStore(${JSON.stringify(root)}).advance(${JSON.stringify(j.id)},0,${JSON.stringify(base)},1);`;
 const child=spawnSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'../..'),timeout:10000});expect(child.signal).toBe('SIGKILL');
 const checkpoint=s.get(j.id);expect(checkpoint.cursor).toBe(1);expect(()=>s.advance(j.id,checkpoint.revision,base)).toThrow('WRITER_BUSY');
 expect(s.recoverLock(s.lockStatus()!.sha256).recovered).toBe(true);const completed=s.advance(j.id,checkpoint.revision,base);expect(completed.accepted).toBe(3);expect(s.page(j.id).items).toHaveLength(3);
});
test('interrupted paired export rebuilds missing file only when existing bytes exactly match',()=>{
 const s=new PendingImportStore(root);let j=s.create(JSON.stringify([row()]),'json',base,now);j=s.advance(j.id,0,base);const result=s.export(j.id,j.revision,base),dir=path.join(root,j.id,'export-'+j.revision);
 fs.unlinkSync(path.join(dir,'manifest.json'));fs.unlinkSync(path.join(dir,'pending.csv'));expect(s.export(j.id,j.revision,base).manifest).toEqual(result.manifest);
 fs.writeFileSync(path.join(dir,'pending.csv'),'changed');expect(()=>s.export(j.id,j.revision,base)).toThrow('EXPORT_RECOVERY_CONFLICT');
});
test('two-calendar-month cutoff uses Taipei date and clamps month ends',()=>{
 expect(normalize({...row(),originalPostedAt:'2026-08-08T16:00:00Z'},now).issues).not.toContain('OUTSIDE_TWO_CALENDAR_MONTHS');
 expect(normalize({...row(),originalPostedAt:'2026-08-08T15:59:59Z'},now).issues).toContain('OUTSIDE_TWO_CALENDAR_MONTHS');
 const end=new Date('2026-04-30T00:00:00Z');expect(normalize({...row(),originalPostedAt:'2026-02-27T16:00:00Z'},end).issues).not.toContain('OUTSIDE_TWO_CALENDAR_MONTHS');
 expect(normalize({...row(),originalPostedAt:'2026-02-27T15:59:59Z'},end).issues).toContain('OUTSIDE_TWO_CALENDAR_MONTHS');
});
