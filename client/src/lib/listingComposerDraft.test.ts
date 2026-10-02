/// <reference types="node" />
import { webcrypto,randomUUID } from 'node:crypto';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { ListingComposerDrafts,composerDetails,parseComposerDraft,parseComposerDetails } from './listingComposerDraft';
import { createWebPendingStore,pendingScope,pendingRequestKey } from './webPendingStore';
import { emptyListingDraft,type SellerDraft,type PublishDetails } from './listingBatch';
const api='https://example.com/api',id='11111111-1111-4111-8111-111111111111',listingId='22222222-2222-4222-8222-222222222222';
const draft:SellerDraft={clientListingId:listingId,form:{...emptyListingDraft(),title:'原始文字'},touched:{title:true}};
const source={id,version:0,serverDraft:draft,draft};
const details:PublishDetails={county:'臺北市',district:'中山區',latitude:'25.051234',longitude:'121.521234',meetup:true,shipping:true,negotiable:false,expiryDate:'2100-01-02',consent:true};
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('IDBKeyRange',IDBKeyRange);});afterEach(()=>vi.unstubAllGlobals());
async function fixture(){const factory=new IDBFactory(),store=createWebPendingStore(randomUUID(),factory,webcrypto as unknown as Crypto),session=new ListingComposerDrafts(api,19,store,vi.fn());await session.loadDetails();await session.restore([source]);return{session,store};}
describe('durable unsent listing composer drafts',()=>{
 it('restores blank fields and unfinished price, validating every identity and field',async()=>{
  const {session,store}=await fixture(),value={...draft,form:{...draft.form,title:'',price:'1.',description:'兩行\n尚未送出'},touched:{title:true,price:true,description:true} as const};session.stage(id,value);expect(await session.flush(id)).toBe(true);
  const raw=(await store.get(await pendingRequestKey(api,19,'listing-compose.'+id)))!;expect(parseComposerDraft(raw,id).draft).toEqual(value);
  for(const mutation of [{mediaId:crypto.randomUUID()},{baseVersion:null},{baseVersion:-1},{revision:'bad'},{draft:{...value,form:{...value.form,token:'forbidden'}}},{extra:true}])expect(()=>parseComposerDraft(JSON.stringify({...JSON.parse(raw),...mutation}),id)).toThrow();
 });
 it('stores only approximate coordinates, restores incomplete coordinates, and never restores consent',()=>{
  const normalized=composerDetails(details);expect(normalized).toMatchObject({latitude:'25.05',longitude:'121.53',consent:false});expect(composerDetails({...details,latitude:'25.',longitude:''})).toMatchObject({latitude:'25.',longitude:''});
  const raw=JSON.stringify({version:1,revision:crypto.randomUUID(),details:normalized});expect(parseComposerDetails(raw)).toEqual(normalized);
  expect(()=>parseComposerDetails(JSON.stringify({version:1,revision:crypto.randomUUID(),details}))).toThrow();
 });
 it('serializes rapid edits and restores the last text plus settings in a new session',async()=>{
  const {session,store}=await fixture();session.stage(id,{...draft,form:{...draft.form,title:'一'}});session.stage(id,{...draft,form:{...draft.form,title:'最後未送出'}});session.stageDetails(details);expect(await session.flush()).toBe(true);
  const restored=new ListingComposerDrafts(api,19,store,vi.fn());expect(await restored.loadDetails()).toMatchObject({county:'臺北市',shipping:true,consent:false});await restored.restore([source]);expect(restored.get(id)!.value.draft.form.title).toBe('最後未送出');expect(restored.get(id)!.conflict).toBe(false);
 });
 it('two pages cannot overwrite a newer unsent draft; the losing page keeps its own text readonly',async()=>{
  const {session,store}=await fixture();session.stage(id,{...draft,form:{...draft.form,title:'已保存初稿'}});await session.flush();
  const other=new ListingComposerDrafts(api,19,store,vi.fn());await other.loadDetails();await other.restore([source]);session.stage(id,{...draft,form:{...draft.form,title:'另一分頁較新'}});await session.flush();other.stage(id,{...draft,form:{...draft.form,title:'舊頁自己的文字'}});
  expect(await other.flush()).toBe(false);expect(other.failed).toBe(true);expect(other.get(id)!.value.draft.form.title).toBe('舊頁自己的文字');expect(parseComposerDraft((await store.get(other.get(id)!.key))!,id).draft.form.title).toBe('另一分頁較新');
 });
 it('an acknowledged server save rebases while retaining edits typed during that request',async()=>{
  const {session,store}=await fixture(),sent={...draft,form:{...draft.form,title:'已送原內容'}},newer={...draft,form:{...draft.form,title:'傳送期間的新修改'}};session.stage(id,sent);await session.flush();session.stage(id,newer);await session.acknowledge(id,1,sent);
  const restored=new ListingComposerDrafts(api,19,store,vi.fn());await restored.loadDetails();await restored.restore([{id,version:1,serverDraft:sent,draft:sent}]);expect(restored.get(id)!.value.draft).toEqual(newer);expect(restored.get(id)!.conflict).toBe(false);
 });
 it('keeps missing-photo text discoverable and cannot authorize a server write',async()=>{
  const {session,store}=await fixture();session.stage(id,{...draft,form:{...draft.form,title:'不能丟的文字'}});await session.flush();const restored=new ListingComposerDrafts(api,19,store,vi.fn());await restored.loadDetails();await restored.restore([]);expect(restored.get(id)!.latest).toBeNull();expect(restored.get(id)!.value.draft.form.title).toBe('不能丟的文字');expect(await restored.flush(id)).toBe(false);
 });
 it('requires explicit version comparison; adoption changes only local baseline, then CAS cleanup is exact',async()=>{
  const {session,store}=await fixture();session.stage(id,{...draft,form:{...draft.form,title:'我的修改'}});await session.flush();const server={...draft,form:{...draft.form,title:'後台新版'}};await session.restore([{id,version:2,serverDraft:server,draft:server}]);expect(await session.flush(id)).toBe(false);
  await session.acknowledge(id,2,server);expect(session.get(id)!.value.draft.form.title).toBe('我的修改');expect(await session.flush(id)).toBe(true);
  const key=session.get(id)!.key,raw=session.get(id)!.raw!;await store.replaceDraft(key,raw,raw.replace('我的修改','更晚的文字'));await expect(session.remove(id)).rejects.toThrow();expect(await store.get(key)).not.toBeNull();
 });
 it('flags changed baseline content even when a broken external writer did not advance the version',async()=>{
  const {session}=await fixture();session.stage(id,{...draft,form:{...draft.form,title:'本機文字'}});await session.flush();const changed={...draft,form:{...draft.form,title:'同版本不同內容'}};await session.restore([{...source,serverDraft:changed,draft:changed}]);expect(session.get(id)!.conflict).toBe(true);
 });
 it('does not invent a conflict for an untouched photo refreshed to a newer server version',async()=>{
  const {session}=await fixture(),changed={...draft,form:{...draft.form,title:'新內容'}};await session.restore([{id,version:1,serverDraft:changed,draft:changed}]);expect(session.get(id)!.conflict).toBe(false);expect(session.get(id)!.value.draft).toEqual(changed);
 });
 it('storage failure preserves the last text and cannot be followed by another replacement',async()=>{
  const {session,store}=await fixture();vi.spyOn(store,'replaceDraft').mockRejectedValueOnce(Error('quota'));session.stage(id,{...draft,form:{...draft.form,title:'未能落盤的文字'}});expect(await session.flush()).toBe(false);session.stage(id,{...draft,form:{...draft.form,title:'不應覆寫'}});expect(session.get(id)!.value.draft.form.title).toBe('未能落盤的文字');
 });
});
