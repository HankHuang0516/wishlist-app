import { webcrypto } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { marketingQueueJournal,parseMarketingQueueJournal,marketingQueueResult,sendMarketingQueue,readMarketingQueue,abandonMarketingQueue,parseMarketingJob } from './marketingQueueWeb';
const source='11111111-1111-4111-8111-111111111111',listingId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',jobId='44444444-4444-4444-8444-444444444444';
const body={kind:'CREATE' as const,sourceMediaId:source,listingId,expectedVersion:1};
const ok=(v:unknown)=>({ok:true,status:200,json:async()=>v});
async function fixture(){const raw=await marketingQueueJournal(body,id),j=await parseMarketingQueueJournal(raw);return {raw,value:{receipt:{clientRequestId:id,sourceMediaId:source,requestHash:j.requestHash,state:'QUEUED',jobId,createdAt:'2026-10-01T00:00:00.000Z'},job:{id:jobId,status:'PENDING',sourceMediaId:source,listingId,parentJobId:null}}};}
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('marketing exact original queue contract',()=>{
  it('canonicalizes and hashes creation version and revision prompt/slots, rejects altered evidence',async()=>{
    const {raw}=await fixture();expect((await parseMarketingQueueJournal(raw)).body).toEqual(body);
    const revision=await marketingQueueJournal({kind:'REVISION',sourceMediaId:source,listingId,parentJobId:jobId,prompt:' 調整背景 ',slots:[4,2]},id);
    expect((await parseMarketingQueueJournal(revision)).body).toMatchObject({prompt:'調整背景',slots:[2,4]});
    const altered=JSON.parse(raw);altered.body.expectedVersion=2;await expect(parseMarketingQueueJournal(JSON.stringify(altered))).rejects.toThrow();
  });
  it.each([null,{}, {version:2}, {kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:-1},{kind:'REVISION',sourceMediaId:source,listingId,parentJobId:jobId,prompt:'valid',slots:[1,1]}])('fails closed on malformed original %#',async value=>{await expect(parseMarketingQueueJournal(JSON.stringify(value))).rejects.toThrow();});
  it('validates exact receipt and accepts queued job erasure without recreating it',async()=>{
    const {raw,value}=await fixture();expect(await marketingQueueResult(value,raw)).toMatchObject({state:'QUEUED',job:{id:jobId}});
    expect(await marketingQueueResult({...value,job:null},raw)).toEqual({state:'QUEUED',job:null});
    expect(await marketingQueueResult({receipt:{...value.receipt,state:'ABANDONED',jobId:null},job:null},raw)).toEqual({state:'ABANDONED',job:null});
  });
  it.each(['hash','source','id','parent','listing','status','state','extra'])('rejects mismatched receipt/job %#',async field=>{
    const {raw,value}=await fixture(),bad=JSON.parse(JSON.stringify(value));
    if(field==='hash')bad.receipt.requestHash='f'.repeat(64);if(field==='source')bad.job.sourceMediaId=id;if(field==='id')bad.job.id=id;if(field==='parent')bad.job.parentJobId=id;if(field==='listing')bad.job.listingId=null;if(field==='status')bad.job.status='UNKNOWN';if(field==='state')bad.receipt.state='ABANDONED';if(field==='extra')bad.receipt.token='no';
    await expect(marketingQueueResult(bad,raw)).rejects.toThrow();
  });
  it('writes safe journal before HTTP, preserves exact original after lost ACK, and reads only on resume',async()=>{
    const {raw,value}=await fixture(),events:string[]=[],store={get:vi.fn(),save:vi.fn(async()=>{events.push('save');}),clear:vi.fn()},fetch=vi.fn(async(_url:string,init?:RequestInit)=>{events.push(init?.method??'GET');if(init?.method==='POST')throw Error('lost ACK');return ok(value);});vi.stubGlobal('fetch',fetch);
    await expect(sendMarketingQueue('synthetic-session',raw,store,'key',()=>true)).rejects.toThrow();expect(events).toEqual(['save','POST']);
    expect(await readMarketingQueue('synthetic-session',raw)).toMatchObject({state:'QUEUED'});expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(body);
  });
  it('never sends if recording fails or account changed after recording',async()=>{
    const {raw}=await fixture(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const store={get:vi.fn(),save:vi.fn<()=>Promise<void>>(async()=>{throw Error('storage unavailable');}),clear:vi.fn()};await expect(sendMarketingQueue('token',raw,store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
    store.save.mockImplementation(async()=>{});await expect(sendMarketingQueue('token',raw,store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels using the original hash only and never sends job details or deletes a photo',async()=>{
    const {raw,value}=await fixture(),fetch=vi.fn(async()=>ok({receipt:{...value.receipt,state:'ABANDONED',jobId:null},job:null}));vi.stubGlobal('fetch',fetch);
    expect((await abandonMarketingQueue('token',raw,()=>true)).state).toBe('ABANDONED');expect(fetch.mock.calls).toHaveLength(1);
    const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toContain('/requests/'+id+'/abandon');expect(JSON.parse(String(init.body))).toEqual({sourceMediaId:source,requestHash:value.receipt.requestHash});
  });
  it('rejects incomplete four-image review, foreign full job, duplicate slots and impossible selection',()=>{
    const media=[1,2,3,4].map(slot=>({id:`55555555-5555-4555-8555-55555555555${slot}`,marketingSlot:slot,marketingSelected:false}));
    const job={id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null,deliveredAt:'2026-10-01T00:00:00.000Z',copy:'測試商品文案',generatedMedia:media,previousMedia:[],selectedMediaIds:[]};
    expect(parseMarketingJob(job,source,listingId,jobId).generatedMedia).toHaveLength(4);
    for(const bad of [{...job,sourceMediaId:id},{...job,generatedMedia:media.slice(1)},{...job,generatedMedia:[media[0],media[0],...media.slice(2)]},{...job,selectedMediaIds:[id]},{...job,status:'COMPLETED'}])expect(()=>parseMarketingJob(bad,source,listingId,jobId)).toThrow();
  });
});
