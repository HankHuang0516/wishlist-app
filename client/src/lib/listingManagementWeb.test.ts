import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { managementBody, managementJournal, parseManagementJournal, managementResult, readManagement, sendManagement, abandonManagement } from './listingManagementWeb';
import type { ManagedListing } from './managedListingWeb';
import type { PendingStore } from './webPendingStore';
const id='11111111-1111-4111-8111-111111111111',actionId='22222222-2222-4222-8222-222222222222';
const item:ManagedListing={id,ownerUserId:42,version:1,title:'合成二手檯燈',description:'原商品說明',price:350,status:'ACTIVE',condition:'USED',category:'home',createdAt:'2026-10-01T00:00:00Z',publishedAt:'2026-10-01T00:00:00Z',expiresAt:'2100-10-30T15:59:59Z',location:null,media:[]};
const body=()=>managementBody({kind:'EDIT',listingId:id,expectedVersion:1,changes:{title:'  合成二手檯燈  ',description:' 新商品說明 ',price:320}});
async function fixture(){const raw=await managementJournal(body(),item,actionId),j=await parseManagementJournal(raw);return{raw,j,receipt:{clientActionId:actionId,listingId:id,kind:'EDIT',expectedVersion:1,requestHash:j.requestHash,state:'APPLIED',reason:null,appliedVersion:2,createdAt:'2026-10-01T12:00:00.000Z'}};}
const store=():PendingStore=>({get:vi.fn(async()=>null),save:vi.fn(async()=>{}),clear:vi.fn(async()=>true)});
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
describe('scoped immutable listing management journals',()=>{
  it('canonicalizes original dates and content while retaining exact editable intent',async()=>{
    const {raw,j}=await fixture();expect(j.original.expiresAt).toBe('2100-10-30T15:59:59.000Z');expect(j.body.changes).toEqual({title:'合成二手檯燈',description:'新商品說明',price:320});expect(raw).not.toContain('token');
    expect(await managementResult({receipt:(await fixture()).receipt},raw)).toEqual({state:'APPLIED',reason:null,appliedVersion:2});
  });
  it.each([
    {kind:'OTHER',listingId:id,expectedVersion:1,changes:{}},
    {kind:'EDIT',listingId:id,expectedVersion:0,changes:{title:'合成'}},
    {kind:'EDIT',listingId:id,expectedVersion:1,changes:{title:'合成',price:0.001}},
    {kind:'EDIT',listingId:id,expectedVersion:1,changes:{title:'\ud800'}},
    {kind:'STATUS',listingId:id,expectedVersion:1,changes:{action:'publish'}},
    {kind:'EXTEND',listingId:id,expectedVersion:1,changes:{expiryDate:'2100-02-29'}},
    {kind:'EXTEND',listingId:id,expectedVersion:1,changes:{expiryDate:'2100-12-15',other:true}},
  ])('rejects malformed management input %#',value=>expect(()=>managementBody(value)).toThrow());
  it('rejects tampered journals, unknown fields, foreign original versions and mismatched listing IDs',async()=>{
    const {raw,j}=await fixture();
    for(const value of [{...j,version:2},{...j,token:'synthetic'},{...j,requestHash:'a'.repeat(64)},{...j,original:{...j.original,version:2}},{...j,body:{...j.body,changes:{...j.body.changes,price:1}}}])await expect(parseManagementJournal(JSON.stringify(value))).rejects.toThrow();
    await expect(managementJournal(body(),{...item,id:actionId},actionId)).rejects.toThrow();expect((await parseManagementJournal(raw)).clientActionId).toBe(actionId);
  });
  it('rejects wrong receipt identity/hash/version and unknown private projections',async()=>{
    const {raw,receipt}=await fixture();
    for(const r of [{...receipt,clientActionId:id},{...receipt,listingId:actionId},{...receipt,requestHash:'a'.repeat(64)},{...receipt,appliedVersion:1},{...receipt,reason:'CONFLICT'},{...receipt,token:'synthetic'},{...receipt,createdAt:'bad'},{...receipt,expectedVersion:2}])await expect(managementResult({receipt:r},raw)).rejects.toThrow();
  });
  it('accepts only valid terminal conflicts or cancellations without fake applied versions',async()=>{
    const {raw,receipt}=await fixture();expect((await managementResult({receipt:{...receipt,state:'CONFLICT',reason:'LISTING_CONFLICT',appliedVersion:null}},raw)).state).toBe('CONFLICT');
    expect((await managementResult({receipt:{...receipt,state:'ABANDONED',reason:null,appliedVersion:null}},raw)).state).toBe('ABANDONED');
    for(const r of [{...receipt,state:'UNKNOWN'},{...receipt,state:'CONFLICT',reason:null,appliedVersion:null},{...receipt,state:'CONFLICT',reason:['LISTING_CONFLICT'],appliedVersion:null},{...receipt,state:'ABANDONED',appliedVersion:2}])await expect(managementResult({receipt:r},raw)).rejects.toThrow();
  });
  it('saves before POST, never replaces identity, and GET recovery never writes',async()=>{
    const {raw,receipt}=await fixture(),saved=store();const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>({ok:true,status:200,json:async()=>({receipt})}));vi.stubGlobal('fetch',fetch);
    await sendManagement('synthetic-session',raw,saved,'key',()=>true);expect(saved.save).toHaveBeenCalledWith('key',raw);expect(vi.mocked(saved.save).mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(body());await readManagement('synthetic-session',raw);expect(fetch.mock.calls[1][1]?.method??'GET').toBe('GET');expect(fetch.mock.calls[1][0]).toContain('/management-operations/'+actionId);expect(saved.clear).not.toHaveBeenCalled();
  });
  it('storage failure or account switch after saving prevents transmission',async()=>{
    const {raw}=await fixture(),saved=store(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    vi.mocked(saved.save).mockRejectedValueOnce(Error('safe store unavailable'));await expect(sendManagement('synthetic-session',raw,saved,'key',()=>true)).rejects.toThrow();
    await expect(sendManagement('synthetic-session',raw,saved,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  });
  it('departure during journal verification prevents a late storage write and any POST',async()=>{
    const {raw}=await fixture(),saved=store(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const verifiedHash=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body())));
    let finish!:(value:ArrayBuffer)=>void,active=true;
    vi.stubGlobal('crypto',{subtle:{digest:vi.fn(()=>new Promise<ArrayBuffer>(resolve=>{finish=resolve;}))}});
    const operation=sendManagement('synthetic-session',raw,saved,'original-key',()=>active);
    const rejected=expect(operation).rejects.toThrow();
    expect(finish).toBeDefined();active=false;finish(verifiedHash);await rejected;
    expect(saved.save).not.toHaveBeenCalled();expect(saved.clear).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it('explicit cancellation sends a hash-only tombstone and preserves already-applied evidence',async()=>{
    const {raw,receipt,j}=await fixture(),fetch=vi.fn(async(_url:string,_init?:RequestInit)=>({ok:true,status:200,json:async()=>({receipt})}));vi.stubGlobal('fetch',fetch);
    expect((await abandonManagement('synthetic-session',raw,()=>true)).state).toBe('APPLIED');const sent=JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(sent).toEqual({kind:'EDIT',listingId:id,expectedVersion:1,requestHash:j.requestHash});expect(sent.changes).toBeUndefined();
  });
  it('binds an original check-in deadline to its exact journal even after the deadline has passed',async()=>{
    const b=managementBody({kind:'MAP',listingId:id,expectedVersion:1,changes:{display:true,consentToMap:true}}),raw=await managementJournal(b,item,actionId),j=await parseManagementJournal(raw);
    const receipt={...(await fixture()).receipt,kind:'MAP',requestHash:j.requestHash,mapVisibleUntil:'2026-10-01T13:00:00.000Z'};
    expect(await managementResult({receipt},raw)).toEqual({state:'APPLIED',reason:null,appliedVersion:2,mapVisibleUntil:receipt.mapVisibleUntil});
    for(const value of [{...receipt,mapVisibleUntil:null},{...receipt,mapVisibleUntil:'2026-10-01T14:00:00.000Z'},{...receipt,mapVisibleUntil:'bad'},{...receipt,kind:'EDIT'}])await expect(managementResult({receipt:value},raw)).rejects.toThrow();
    const {raw:old,receipt:legacy}=await fixture();await expect(managementResult({receipt:{...legacy,mapVisibleUntil:null}},old)).rejects.toThrow();
  });
  it('stop/cancel evidence cannot fabricate a deadline, and consent is exact per check-in',async()=>{
    for(const changes of [{display:true,consentToMap:false},{display:false,consentToMap:true},{display:true,consentToMap:true,latitude:25}])expect(()=>managementBody({kind:'MAP',listingId:id,expectedVersion:1,changes})).toThrow();
    const b=managementBody({kind:'MAP',listingId:id,expectedVersion:1,changes:{display:false,consentToMap:false}}),raw=await managementJournal(b,item,actionId),j=await parseManagementJournal(raw),receipt={...(await fixture()).receipt,kind:'MAP',requestHash:j.requestHash,mapVisibleUntil:null};
    expect((await managementResult({receipt},raw)).mapVisibleUntil).toBeNull();await expect(managementResult({receipt:{...receipt,mapVisibleUntil:'2026-10-01T13:00:00.000Z'}},raw)).rejects.toThrow();
    expect((await managementResult({receipt:{...receipt,state:'ABANDONED',appliedVersion:null}},raw)).state).toBe('ABANDONED');
  });
});
