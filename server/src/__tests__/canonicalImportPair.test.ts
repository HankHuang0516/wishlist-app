import fs from 'fs';
import os from 'os';
import path from 'path';
import { Base, PendingImportStore, sha } from '../lib/semiAutoImport';
import { digest } from '../lib/sourceLeadRules';
import { CANONICAL_CSV_COLUMNS as columns, checkPair, csvTable, Pair, prepareMotherIncrement, readPairFresh, readObservedPair, reconcilePair, repeatIncrementStatus, restoredBase, serializeTable } from '../lib/canonicalImportPair';
const old={id:'EXISTING-1',sequence:1,name:'舊二手桌',price:100,price_min:100,price_max:100,currency:'TWD',source_post_url:'https://example.com/posts/1',district:'臺南市永康區',stock_status:'unknown',seller_permission:'not_requested',public_listing_eligible:false,safe_to_checkout:false,date_gate:{status:'unknown',evidence:'未知',evidence_history:[{old:true}]},coordinate_gate:{status:'unknown',latitude:null},checked_at:'2026-01-01T00:00:00Z',source_rechecked_at:null,history:[{original:true}],opaque:{keep:'unchanged'}};
function fixture(){const document={schema_version:'1.3',items:[old],summary:{total_archived_items:1,qualified_candidate_count:0},revision_history:[{historical:true}],unknownRoot:{preserve:true}};
 const values:Record<string,unknown>={'序號':1,'商品ID':old.id,'商品名稱':old.name,'價格下限':100,'價格上限':100,'幣別':'TWD','來源貼文':old.source_post_url,'庫存':'未知','刊登同意':'未取得','可公開上架':'false','可直接結帳':'false','原歸檔查閱時間UTC':old.checked_at,'本輪來源查核時間UTC':'','備註':'歷史保持, "引號"','source_region_estimate':'@opaque-history'};
 const json=JSON.stringify(document),csv=serializeTable([columns,columns.map(c=>values[c]??'')]);
 const base:Base={libraryFileId:'libfile_'+'a'.repeat(32),jsonVersion:28,sha256:sha(json),csvLibraryFileId:'libfile_'+'b'.repeat(32),csvVersion:25,csvSha256:sha(csv)};
 const pair:Pair={json:{libraryFileId:base.libraryFileId,version:28,bytes:json},csv:{libraryFileId:base.csvLibraryFileId,version:25,bytes:csv}};return {base,pair};}
let root:string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wishlist-mother-pair-test-'));fs.chmodSync(root,0o700);});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
function pending(base:Base,change:Record<string,unknown>={}){const store=new PendingImportStore(root);let job=store.create(JSON.stringify([{sourceUrl:old.source_post_url,itemKey:'table',title:'二手桌新價格',price:200,currency:'TWD',county:'臺南市',district:'永康區',originalPostedAt:'2026-10-01T00:00:00Z',checkedAt:'2026-10-08T00:00:00Z',status:'SOLD',...change}]),'json',base,new Date('2026-10-09T02:00:00Z'));job=store.advance(job.id,0,base);const item=store.page(job.id).items[0].item;job=store.review(job.id,job.revision,base,[{id:item.id,contentHash:item.contentHash,reviewRef:'review:fixture123',action:'KEEP_PENDING'}]);const bundle=store.export(job.id,job.revision,base);return {bundle,item,decision:{pendingId:item.id,contentHash:item.contentHash,archiveItemId:old.id,previousItemHash:digest(old),reviewRef:'review:fixture123'}};}
test('actual 55-column schema checked; mismatched core facts, duplicate IDs or missing columns stop',()=>{
 const {base,pair}=fixture();expect(columns).toHaveLength(55);expect(checkPair(base,pair).items.size).toBe(1);
 const corrupt=pair.csv.bytes.replace('舊二手桌','錯誤商品');expect(()=>checkPair({...base,csvSha256:sha(corrupt)},{...pair,csv:{...pair.csv,bytes:corrupt}})).toThrow('CANONICAL_FIELD_CONFLICT');
 const missing=serializeTable([columns.slice(0,54),columns.slice(0,54).map(()=> '')]);expect(()=>checkPair({...base,csvSha256:sha(missing)},{...pair,csv:{...pair.csv,bytes:missing}})).toThrow('CANONICAL_55_COLUMNS_REQUIRED');
});
test('updated private row retains ID/history/unknowns and source times, preserves every other CSV cell',()=>{
 const {base,pair}=fixture(),p=pending(base),increment=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[p.decision]);
 const out=JSON.parse(increment.json),item=out.items[0];expect(item).toMatchObject({id:old.id,name:'二手桌新價格',price:200,stock_status:'unknown',seller_permission:'not_requested',public_listing_eligible:false,safe_to_checkout:false,checked_at:old.checked_at,source_rechecked_at:null});
 expect(item.history).toEqual(old.history);expect(item.date_gate).toEqual(old.date_gate);expect(item.coordinate_gate).toEqual(old.coordinate_gate);expect(item.opaque).toEqual(old.opaque);expect(out.unknownRoot).toEqual({preserve:true});expect(out.revision_history).toEqual([{historical:true}]);
 const before=csvTable(pair.csv.bytes)[1],after=csvTable(increment.csv)[1];for(let i=0;i<55;i++)if(!['商品名稱','價格下限','價格上限','幣別','本輪來源查核','本輪狀態摘要','候選分類','計價單位證據','總交易金額'].includes(columns[i]))expect(after[i]).toBe(before[i]);
 expect(item.current_source_check).toMatchObject({status:'STALE_AFTER_MANUAL_FACT_CHANGE',price_currently_verified:false,checked_at_utc:null});expect(item.semi_auto_import_history[0].previousFacts.price).toBe(100);
 expect(increment.receipt).toMatchObject({canonicalWrites:0,qualifiedSupplyAdded:0,sourceChecks:0,changedCount:1});expect(item.semi_auto_import_fact_claim.sourceStatus).toBe('SOLD');
});
test('new row mapped to all 55 columns with unknown stock/rights/location, no invented check or coordinates',()=>{
 const {base,pair}=fixture(),p=pending(base,{sourceUrl:'https://example.com/posts/2',itemKey:'new',title:'=SUM(A1)',originalPostedAt:null,checkedAt:null}),decision={...p.decision,archiveItemId:'NEW-2',previousItemHash:null};
 const increment=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[decision]),doc=JSON.parse(increment.json),item=doc.items[1];
 expect(doc.items[0]).toEqual(old);expect(doc.summary.total_archived_items).toBe(2);expect(item).toMatchObject({id:'NEW-2',stock_status:'unknown',seller_permission:'not_requested',checked_at:null,source_rechecked_at:null,public_listing_eligible:false,safe_to_checkout:false});expect(item.coordinate_gate.latitude).toBeNull();expect(item.current_source_check.checked_at_utc).toBeNull();expect(csvTable(increment.csv)[2]).toHaveLength(55);expect(csvTable(increment.csv)[2][columns.indexOf('商品名稱')]).toBe("'=SUM(A1)");
});
test('fresh reader checks both versions before reading bytes and after reading; hashes verified',async()=>{
 const {base,pair}=fixture(),metadata=jest.fn(async(id:string)=>({libraryFileId:id,version:id===base.libraryFileId?28:25})),bytes=jest.fn(async(id:string)=>id===base.libraryFileId?pair.json.bytes:pair.csv.bytes);
 expect(await readPairFresh(base,{metadata,bytes})).toEqual(pair);expect(metadata).toHaveBeenCalledTimes(4);expect(bytes).toHaveBeenCalledTimes(2);
 metadata.mockImplementation(async(id:string)=>({libraryFileId:id,version:id===base.libraryFileId?29:25}));bytes.mockClear();await expect(readPairFresh(base,{metadata,bytes})).rejects.toThrow('CANONICAL_VERSION_CONFLICT');expect(bytes).not.toHaveBeenCalled();
});
test('race or byte mismatch fails without any mutation',async()=>{
 const {base,pair}=fixture();let calls=0;await expect(readPairFresh(base,{metadata:async(id)=>({libraryFileId:id,version:++calls>2?99:id===base.libraryFileId?28:25}),bytes:async(id)=>id===base.libraryFileId?pair.json.bytes:pair.csv.bytes})).rejects.toThrow('CANONICAL_READ_RACE');
 expect(()=>checkPair(base,{...pair,csv:{...pair.csv,bytes:pair.csv.bytes+'\n'}})).toThrow('CANONICAL_BYTES_CONFLICT');
});
test('stale row/review/public record and altered pending payload are blocked',()=>{
 const {base,pair}=fixture(),p=pending(base);expect(()=>prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[{...p.decision,previousItemHash:'0'.repeat(64)}])).toThrow('ITEM_VERSION_CONFLICT');expect(()=>prepareMotherIncrement(p.bundle.json+' ',p.bundle.manifest,pair,[p.decision])).toThrow('PENDING_HASH_CONFLICT');expect(()=>prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[{...p.decision,reviewRef:'review:wrong123'}])).toThrow('BOUND_INCREMENT_REVIEW_REQUIRED');
});
test('one-file success reconciles as partial, concurrent change blocks; both readbacks complete',()=>{
 const {base,pair}=fixture(),p=pending(base),i=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[p.decision]),jsonAfter={...pair.json,version:29,bytes:i.json},csvAfter={...pair.csv,version:26,bytes:i.csv};
 expect(reconcilePair(i,pair).state).toBe('NOT_APPLIED');expect(reconcilePair(i,{json:jsonAfter,csv:pair.csv})).toMatchObject({state:'PARTIAL_REQUIRES_RECONCILIATION',retryAutomatically:false,rollbackAutomatically:false});expect(reconcilePair(i,{json:pair.json,csv:csvAfter}).state).toBe('PARTIAL_REQUIRES_RECONCILIATION');
 expect(reconcilePair(i,{json:jsonAfter,csv:csvAfter}).state).toBe('COMPLETE');expect(reconcilePair(i,{json:jsonAfter,csv:{...csvAfter,version:27}}).state).toBe('STOP_CONFLICT');
});
test('repeated identical import gives zero changes after writer versions advance; no doubled history',()=>{
 const {base,pair}=fixture(),p=pending(base),i=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[p.decision]);const afterPair={json:{...pair.json,version:29,bytes:i.json},csv:{...pair.csv,version:26,bytes:i.csv}},afterBase={...base,jsonVersion:29,csvVersion:26,sha256:i.after.jsonSha256,csvSha256:i.after.csvSha256};
 // Rebase wrapper represents an explicit current pair read, not a blind resend.
 const bundle=JSON.parse(p.bundle.json);bundle.base=afterBase;const bytes=JSON.stringify(bundle);const m={...p.bundle.manifest,base:afterBase,jsonSha256:sha(bytes)};
 // Changed wrapper hash must not be used as a new operation: original operation
 // fingerprint includes reviewed payload bytes. A repeat is checked directly.
 const original=JSON.parse(i.json).semi_auto_import_batches[0];expect(original.operationId).toBe(i.operationId);expect(JSON.parse(i.json).items[0].semi_auto_import_history).toHaveLength(1);
 expect(repeatIncrementStatus(i,afterPair)).toMatchObject({state:'ALREADY_MERGED_NO_CHANGE',changedCount:0,canonicalWrites:0});
 expect(()=>prepareMotherIncrement(p.bundle.json,p.bundle.manifest,afterPair,[p.decision])).toThrow('CANONICAL_VERSION_CONFLICT');
 expect(()=>prepareMotherIncrement(bytes,m,afterPair,[p.decision])).toThrow('ITEM_VERSION_CONFLICT');expect(checkPair(afterBase,afterPair).items.size).toBe(1);
 const repeated=prepareMotherIncrement(bytes,m,afterPair,[{...p.decision,previousItemHash:digest(JSON.parse(i.json).items[0])}]);expect(repeated.receipt.state).toBe('IDENTICAL_FACTS_NO_CHANGE');expect(repeated.json).toBe(i.json);expect(repeated.changes).toHaveLength(0);expect(JSON.parse(repeated.json).items[0].semi_auto_import_history).toHaveLength(1);
});
test('explicit restored old bytes at new Library versions create a new base; unknown recovery blocked',()=>{
 const {base,pair}=fixture(),p=pending(base),i=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[p.decision]);
 expect(restoredBase(i,{json:{...pair.json,version:30},csv:{...pair.csv,version:25}})).toMatchObject({jsonVersion:30,csvVersion:25,sha256:base.sha256});
 expect(()=>restoredBase(i,{json:{...pair.json,version:30,bytes:i.json},csv:pair.csv})).toThrow('RESTORED_PAIR_NOT_VERIFIED');
});
test('contradictory quality flags and fake source check times in CSV are rejected',()=>{
 const {base,pair}=fixture();const table=csvTable(pair.csv.bytes);table[1][columns.indexOf('可公開上架')]='true';let changed=serializeTable(table);expect(()=>checkPair({...base,csvSha256:sha(changed)},{...pair,csv:{...pair.csv,bytes:changed}})).toThrow('CANONICAL_QUALITY_STATE_CONFLICT');
 table[1][columns.indexOf('可公開上架')]='false';table[1][columns.indexOf('本輪來源查核時間UTC')]='2026-10-09T02:00:00Z';changed=serializeTable(table);expect(()=>checkPair({...base,csvSha256:sha(changed)},{...pair,csv:{...pair.csv,bytes:changed}})).toThrow('CANONICAL_SOURCE_TIME_CONFLICT');
});
test('new manual price never inherits old verified-price/current content checks',()=>{
 const {base,pair}=fixture(),doc=JSON.parse(pair.json.bytes);doc.items[0].current_source_check={status:'VERIFIED',checked_at_utc:'2026-10-08T00:00:00Z',price_currently_verified:true,stock_confirmed:false};doc.items[0].independent_content_reviewed=true;const json=JSON.stringify(doc),table=csvTable(pair.csv.bytes);table[1][columns.indexOf('本輪來源查核時間UTC')]='2026-10-08T00:00:00Z';const csv=serializeTable(table),currentBase={...base,sha256:sha(json),csvSha256:sha(csv)},currentPair={json:{...pair.json,bytes:json},csv:{...pair.csv,bytes:csv}},p=pending(currentBase),decision={...p.decision,previousItemHash:digest(doc.items[0])};
 const increment=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,currentPair,[decision]),item=JSON.parse(increment.json).items[0];expect(item.current_source_check).toMatchObject({checked_at_utc:'2026-10-08T00:00:00Z',price_currently_verified:false,status:'STALE_AFTER_MANUAL_FACT_CHANGE'});expect(item.current_source_check_history[0].price_currently_verified).toBe(true);expect(item.independent_content_reviewed).toBe(false);
});
test('partial pair readback probes both current versions twice without pretending coherence',async()=>{
 const {base,pair}=fixture(),p=pending(base),increment=prepareMotherIncrement(p.bundle.json,p.bundle.manifest,pair,[p.decision]);const observed=await readObservedPair(base,{metadata:async id=>({libraryFileId:id,version:id===base.libraryFileId?29:25}),bytes:async id=>id===base.libraryFileId?increment.json:pair.csv.bytes});expect(reconcilePair(increment,observed).state).toBe('PARTIAL_REQUIRES_RECONCILIATION');
});
