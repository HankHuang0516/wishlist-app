import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {abandonMarketingApproval,marketingApprovalBody,marketingApprovalJournal,marketingApprovalResult,parseMarketingApprovalJournal,readMarketingApproval,sendMarketingApproval} from './marketingApprovalWeb';
const source='11111111-1111-4111-8111-111111111111',listingId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',jobId='44444444-4444-4444-8444-444444444444';
const ids=[1,2,3,4].map(n=>`55555555-5555-4555-8555-55555555555${n}`);
const body={kind:'APPROVE' as const,jobId,sourceMediaId:source,listingId,expectedVersion:3,selectedMediaIds:ids,copy:'合成二手檯燈售價 NT$350；僅供隔離驗收，非真實商品。'};
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
async function fixture(){const raw=await marketingApprovalJournal(body,id),j=await parseMarketingApprovalJournal(raw);return {raw,value:{receipt:{clientActionId:id,jobId,sourceMediaId:source,listingId,requestHash:j.requestHash,state:'APPLIED',reason:null,appliedVersion:4,selectedMediaIds:ids,copy:body.copy,createdAt:'2026-10-01T00:00:00.000Z'}}};}
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('immutable original marketing approval journal and receipt',()=>{
  it('preserves ordered selection, original version and normalized copy in the exact hash',async()=>{
    const {raw}=await fixture();expect((await parseMarketingApprovalJournal(raw)).body).toEqual(body);
    const reordered=await marketingApprovalJournal({...body,selectedMediaIds:[...ids].reverse(),copy:' '+body.copy+' '},id),j=await parseMarketingApprovalJournal(reordered);
    expect(j.body.copy).toBe(body.copy);expect(j.body.selectedMediaIds).toEqual([...ids].reverse());expect(j.requestHash).not.toBe((await parseMarketingApprovalJournal(raw)).requestHash);
    const changed=JSON.parse(raw);changed.body.expectedVersion++;await expect(parseMarketingApprovalJournal(JSON.stringify(changed))).rejects.toThrow();
  });
  it.each([null,{}, {...body,expectedVersion:-1},{...body,expectedVersion:1.5},{...body,expectedVersion:1000001},{...body,copy:'short'},{...body,copy:body.copy+'\u0000'},{...body,copy:body.copy+'\ud800'},{...body,selectedMediaIds:[]},{...body,selectedMediaIds:[ids[0],ids[0]]},{...body,selectedMediaIds:[...ids,id]},{...body,sourceMediaId:'not-uuid'},{...body,token:'private'}])('fails closed on malformed original %#',value=>{expect(()=>marketingApprovalBody(value)).toThrow();});
  it.each(['version','extra','id','canonical'])('rejects damaged journal %#',async field=>{
    const {raw}=await fixture(),j=JSON.parse(raw);if(field==='version')j.version=2;if(field==='extra')j.password='no';if(field==='id')j.clientActionId='bad';if(field==='canonical')j.body.copy+=' ';
    await expect(parseMarketingApprovalJournal(JSON.stringify(j))).rejects.toThrow();
  });
  it('accepts strict immutable APPLIED proof without any mutable current job/media flags',async()=>{
    const {raw,value}=await fixture();expect(await marketingApprovalResult(value,raw)).toEqual({state:'APPLIED',reason:null,appliedVersion:4});
    for(const state of ['CONFLICT','ABANDONED'])expect(await marketingApprovalResult({receipt:{...value.receipt,state,reason:state==='CONFLICT'?'LISTING_CONFLICT':null,appliedVersion:null,selectedMediaIds:null,copy:null}},raw)).toEqual({state,reason:state==='CONFLICT'?'LISTING_CONFLICT':null,appliedVersion:null});
  });
  it.each(['hash','source','job','listing','id','copy','order','version','reason','date','state','extra','outer'])('rejects mismatched or excess proof %#',async field=>{
    const {raw,value}=await fixture(),bad=JSON.parse(JSON.stringify(value)),r=bad.receipt;
    if(field==='hash')r.requestHash='f'.repeat(64);if(field==='source')r.sourceMediaId=id;if(field==='job')r.jobId=id;if(field==='listing')r.listingId=null;if(field==='id')r.clientActionId=source;if(field==='copy')r.copy+='其他';if(field==='order')r.selectedMediaIds.reverse();if(field==='version')r.appliedVersion=3;if(field==='reason')r.reason='STALE_DETAILS';if(field==='date')r.createdAt='2026-10-01';if(field==='state')r.state='COMPLETED';if(field==='extra')r.workerToken='no';if(field==='outer')bad.job={id:jobId};
    await expect(marketingApprovalResult(bad,raw)).rejects.toThrow();
  });
  it.each(['unknown-reason','cancel-reason','version','copy','selection'])('rejects contradictory non-applied proof %#',async field=>{
    const {raw,value}=await fixture(),r={...value.receipt,state:'CONFLICT',reason:'STALE_DETAILS' as string|null,appliedVersion:null as number|null,copy:null as string|null,selectedMediaIds:null as string[]|null};
    if(field==='unknown-reason')r.reason='NEW_UNKNOWN_REASON';if(field==='cancel-reason'){r.state='ABANDONED';r.reason='STALE_DETAILS';}if(field==='version')r.appliedVersion=4;if(field==='copy')r.copy=body.copy;if(field==='selection')r.selectedMediaIds=ids;
    await expect(marketingApprovalResult({receipt:r},raw)).rejects.toThrow();
  });
  it('records before HTTP, preserves original after lost response and resumes with GET only',async()=>{
    const {raw,value}=await fixture(),events:string[]=[],store={get:vi.fn(),clear:vi.fn(),save:vi.fn(async()=>{events.push('save');})};
    const fetch=vi.fn(async(_url:string,init?:RequestInit)=>{events.push(init?.method??'GET');if(init?.method==='POST')throw Error('lost response');return ok(value);});vi.stubGlobal('fetch',fetch);
    await expect(sendMarketingApproval('synthetic',raw,store,'key',()=>true)).rejects.toThrow();expect(events).toEqual(['save','POST']);expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(body);
    expect(await readMarketingApproval('synthetic',raw)).toMatchObject({state:'APPLIED'});expect(events).toEqual(['save','POST','GET']);expect(store.clear).not.toHaveBeenCalled();
  });
  it('explicit retry retains the same action ID and original copy/order/version',async()=>{
    const {raw,value}=await fixture(),store={get:vi.fn(),clear:vi.fn(),save:vi.fn()},fetch=vi.fn(async()=>ok(value));vi.stubGlobal('fetch',fetch);
    await sendMarketingApproval('synthetic',raw,store,'key',()=>true);await sendMarketingApproval('synthetic',raw,store,'key',()=>true);
    expect(fetch.mock.calls).toHaveLength(2);for(const call of fetch.mock.calls as unknown as [string,RequestInit][]){expect(call[0]).toContain('/approvals/'+id);expect(JSON.parse(String(call[1].body))).toEqual(body);}
  });
  it('never sends on storage failure or account change after save; rejects late result',async()=>{
    const {raw,value}=await fixture(),fetch=vi.fn(async()=>ok(value)),store={get:vi.fn(),clear:vi.fn(),save:vi.fn<()=>Promise<void>>(async()=>{throw Error('storage');})};vi.stubGlobal('fetch',fetch);
    await expect(sendMarketingApproval('synthetic',raw,store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();store.save.mockResolvedValue(undefined);
    await expect(sendMarketingApproval('synthetic',raw,store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();let checks=0;
    await expect(sendMarketingApproval('synthetic',raw,store,'key',()=>++checks===1)).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();expect(store.clear).not.toHaveBeenCalled();
  });
  it('cancels only original context/hash, never sends copy, selection, version or photo DELETE',async()=>{
    const {raw,value}=await fixture(),fetch=vi.fn(async(_url:string,_init?:RequestInit)=>ok({receipt:{...value.receipt,state:'ABANDONED',appliedVersion:null,selectedMediaIds:null,copy:null}}));vi.stubGlobal('fetch',fetch);
    expect(await abandonMarketingApproval('synthetic',raw,()=>true)).toMatchObject({state:'ABANDONED'});expect(fetch).toHaveBeenCalledOnce();expect(fetch.mock.calls[0][0]).toContain('/approvals/'+id+'/abandon');expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({jobId,sourceMediaId:source,listingId,requestHash:value.receipt.requestHash});expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    await expect(abandonMarketingApproval('synthetic',raw,()=>false)).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();
  });
});
