import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createWebPendingStore, pendingRequestKey, type PendingStore } from './webPendingStore';
import { abandonSellerDraftOperation, normalizedSellerDraft, parseSellerDraftJournal, readSellerDraftOperation, sellerDraftJournal, sellerDraftResult, sendSellerDraftOperation } from './sellerDraftWeb';
import type { SellerDraft } from './listingBatch';
const mediaId='11111111-1111-4111-8111-111111111111',actionId='22222222-2222-4222-8222-222222222222';
const draft:SellerDraft={clientListingId:'33333333-3333-4333-8333-333333333333',form:{title:'合成檯燈',description:'原本的私人說明\n尚未公開',brand:'',category:'home',condition:'USED',price:'350.00'},touched:{title:true,price:true}};
const journal=()=>sellerDraftJournal(mediaId,0,draft,actionId);
async function result(raw:string,state='APPLIED'){
  const j=await parseSellerDraftJournal(raw);
  return {receipt:{clientActionId:actionId,mediaId,requestHash:j.requestHash,state,appliedVersion:state==='APPLIED'?1:null,createdAt:'2026-10-01T00:00:00.000Z'},media:{id:mediaId,ownerUserId:19,listingId:null,wishItemId:null,capturePurpose:'BATCH_ITEM',sellerDraft:j.draft,sellerDraftVersion:1}};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('private seller draft journal and authoritative recovery',()=>{
  it('uses a stable content/version/media hash with canonical touched and text order',async()=>{
    const raw=await journal(),j=await parseSellerDraftJournal(raw);
    expect(j.requestHash).toBe(createHash('sha256').update(JSON.stringify({mediaId,expectedVersion:0,draft:{clientListingId:draft.clientListingId,form:{title:draft.form.title,description:draft.form.description,brand:'',category:'home',condition:'USED',price:'350.00'},touched:{price:true,title:true}}})).digest('hex'));
    expect(normalizedSellerDraft({...draft,touched:{price:true,title:true}})).toEqual(j.draft);
    expect(raw).not.toMatch(/token|password|latitude|imageUrl/);
  });
  it.each(['hash','version','id','extra','text','touched','form-private','price','surrogate'])('rejects %s corrupt or unsupported original journal',async mode=>{
    const value=JSON.parse(await journal());
    if(mode==='hash')value.requestHash='f'.repeat(64);if(mode==='version')value.expectedVersion=1000001;if(mode==='id')value.clientActionId='bad';if(mode==='extra')value.token='bad';
    if(mode==='text')value.draft.form.description='x'.repeat(3001);if(mode==='touched')value.draft.touched.title=false;if(mode==='form-private')value.draft.form.latitude='25.03';if(mode==='price')value.draft.form.price='1e2';if(mode==='surrogate')value.draft.form.title='\ud800';
    await expect(parseSellerDraftJournal(JSON.stringify(value))).rejects.toThrow();
  });
  it.each(['hash','owner','receipt-extra','media-extra','old-version','same-version-wrong-content','wrong-media','wrong-applied-version','bad-state'])('rejects %s forged result',async mode=>{
    const raw=await journal(),value:any=await result(raw);
    if(mode==='hash')value.receipt.requestHash='f'.repeat(64);if(mode==='owner')value.media.ownerUserId=20;if(mode==='receipt-extra')value.receipt.token='bad';if(mode==='media-extra')value.media.flickrPhotoId='bad';if(mode==='old-version')value.media.sellerDraftVersion=0;if(mode==='same-version-wrong-content')value.media.sellerDraft.form.title='other';if(mode==='wrong-media')value.receipt.mediaId=actionId;if(mode==='wrong-applied-version')value.receipt.appliedVersion=2;if(mode==='bad-state')value.receipt.state='UNKNOWN';
    await expect(sellerDraftResult(value,raw,19)).rejects.toThrow();
  });
  it('distinguishes original applied truth from current newer draft, attachment or deletion',async()=>{
    const raw=await journal(),value=await result(raw);expect((await sellerDraftResult(value,raw,19)).current).toBe(true);
    value.media.sellerDraftVersion=2;value.media.sellerDraft.form.title='newer';expect((await sellerDraftResult(value,raw,19)).current).toBe(false);
    value.media.listingId=actionId as any;expect((await sellerDraftResult(value,raw,19)).media?.listingId).toBe(actionId);
    expect((await sellerDraftResult({...value,media:null},raw,19)).state).toBe('APPLIED');
    expect((await sellerDraftResult(await result(raw,'CONFLICT'),raw,19)).current).toBe(false);
    expect((await sellerDraftResult(await result(raw,'ABANDONED'),raw,19)).appliedVersion).toBeNull();
  });
  it('GET recovery never POSTs or clears; sending first saves the exact original before HTTP',async()=>{
    const raw=await journal(),value=await result(raw),order:string[]=[],store:PendingStore={get:vi.fn(),save:vi.fn(async()=>{order.push('save');}),clear:vi.fn()};
    const fetch=vi.fn(async (_input:RequestInfo|URL,_init?:RequestInit)=>{order.push('http');return {ok:true,status:200,json:async()=>value};});vi.stubGlobal('fetch',fetch);
    await readSellerDraftOperation('test',raw,19);expect(fetch.mock.calls[0][1]?.method).toBeUndefined();order.length=0;
    await sendSellerDraftOperation('test',raw,19,store,'key',()=>true);expect(order).toEqual(['save','http']);expect(store.clear).not.toHaveBeenCalled();
    expect(fetch.mock.calls[1][1]?.method).toBe('POST');expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({expectedVersion:0,draft:normalizedSellerDraft(draft)});
  });
  it('storage failure or leaving after storage prevents sending; unknown ACK retains original with no auto retry',async()=>{
    const raw=await journal(),store:PendingStore={get:vi.fn(),save:vi.fn(async()=>{}),clear:vi.fn()},fetch=vi.fn(async()=>{throw Error('lost');});vi.stubGlobal('fetch',fetch);
    vi.mocked(store.save).mockRejectedValueOnce(Error('full'));await expect(sendSellerDraftOperation('test',raw,19,store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
    await expect(sendSellerDraftOperation('test',raw,19,store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
    await expect(sendSellerDraftOperation('test',raw,19,store,'key',()=>true)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);expect(store.clear).not.toHaveBeenCalled();
  });
  it('cancel transmits only original hash, and isolates encrypted API/account journals and stale cleanup',async()=>{
    const raw=await journal(),value=await result(raw,'ABANDONED');let sent:RequestInit|undefined;vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{sent=init;return{ok:true,status:200,json:async()=>value};}));
    await abandonSellerDraftOperation('test',raw,19,()=>true);expect(JSON.parse(String(sent?.body))).toEqual({requestHash:(await parseSellerDraftJournal(raw)).requestHash});
    const store=createWebPendingStore('draft-test-'+crypto.randomUUID(),new IDBFactory()),key=await pendingRequestKey('https://example.test/api',19,'listing-draft');await store.save(key,raw);
    expect(await store.get(await pendingRequestKey('https://other.test/api',19,'listing-draft'))).toBeNull();expect(await store.get(await pendingRequestKey('https://example.test/api',20,'listing-draft'))).toBeNull();
    expect(await store.clear(key,'other')).toBe(false);expect(await store.get(key)).toBe(raw);expect(await store.clear(key,raw)).toBe(true);
  });
});
