import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { API_URL } from '../config';
import { abandonPhotoUpload, parsePhotoUploadJournal, photoUploadJournal, photoUploadResult, readPhotoUpload, sendPhotoUpload } from './listingPhotoUploadWeb';
import { createWebPendingStore, pendingRequestKey } from './webPendingStore';

const id='11111111-1111-4111-8111-111111111111',mediaId='22222222-2222-4222-8222-222222222222';
const file=()=>new File(['synthetic-photo-source'],'photo.jpg',{type:'image/jpeg'});
const base=API_URL.replace(/\/api\/?$/,'');
async function fixture(){
  const raw=await photoUploadJournal(file(),id),journal=await parsePhotoUploadJournal(raw),createdAt=new Date().toISOString();
  const media={id:mediaId,ownerUserId:19,clientUploadId:id,capturePurpose:'BATCH_ITEM',contentHash:'a'.repeat(64),listingId:null,wishItemId:null,
    imageUrl:`${base}/api/listing-media/${mediaId}/image`,thumbnailUrl:`${base}/api/listing-media/${mediaId}/thumbnail`,width:320,height:240,byteSize:1234,createdAt};
  return {raw,result:{receipt:{clientUploadId:id,requestHash:journal.requestHash,state:'STORED',mediaId,createdAt},media}};
}
const reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
describe('web content-bound upload proof',()=>{
  beforeEach(()=>vi.unstubAllGlobals());
  it('hashes exact prepared bytes and purpose without retaining photo bytes, filename or a token',async()=>{
    const raw=await photoUploadJournal(file(),id),journal=await parsePhotoUploadJournal(raw);
    const sourceHash=createHash('sha256').update('synthetic-photo-source').digest('hex');
    expect(journal.sourceHash).toBe(sourceHash);
    expect(journal.requestHash).toBe(createHash('sha256').update(JSON.stringify({sourceHash,capturePurpose:'BATCH_ITEM'})).digest('hex'));
    expect(raw).not.toMatch(/synthetic-photo-source|photo\.jpg|token/);
  });
  it.each([
    (x:Record<string,unknown>)=>{x.sourceHash='f'.repeat(64);},
    (x:Record<string,unknown>)=>{x.capturePurpose='MANUAL_PHOTO';},
    (x:Record<string,unknown>)=>{x.clientUploadId='bad-id';},
    (x:Record<string,unknown>)=>{x.version=2;},
    (x:Record<string,unknown>)=>{x.createdAt='not-a-date';},
    (x:Record<string,unknown>)=>{x.password='private';},
  ])('rejects tampered or unscoped journal data %#',async mutate=>{
    const raw=await photoUploadJournal(file(),id),row=JSON.parse(raw);mutate(row);await expect(parsePhotoUploadJournal(JSON.stringify(row))).rejects.toThrow();
  });
  it.each([
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.receipt.requestHash='b'.repeat(64);},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.receipt.clientUploadId=mediaId;},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.media.ownerUserId=20;},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.media.capturePurpose='MANUAL_PHOTO';},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.media.imageUrl='https://attacker.invalid/image';},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.media.thumbnailUrl='https://attacker.invalid/thumb';},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{Object.assign(x.media,{flickrPhotoId:'private'});},
    (x:Awaited<ReturnType<typeof fixture>>['result'])=>{x.media.width=100000;},
  ])('rejects forged content/workflow/owner proof and private fields %#',async mutate=>{
    const f=await fixture();mutate(f.result);await expect(photoUploadResult(f.result,f.raw,19)).rejects.toThrow();
  });
  it('confirms original storage after binding/removal without reconstructing a private photo',async()=>{
    const f=await fixture();
    expect(await photoUploadResult({...f.result,media:{...f.result.media,listingId:id}},f.raw,19)).toMatchObject({state:'STORED',media:{listingId:id}});
    expect(await photoUploadResult({...f.result,media:null},f.raw,19)).toEqual({state:'STORED',mediaId,media:null});
    expect(await photoUploadResult({receipt:{...f.result.receipt,state:'ABANDONED',mediaId:null},media:null},f.raw,19)).toEqual({state:'ABANDONED',mediaId:null,media:null});
  });
  it('reads only; missing/failed reads never POST or clear browser proof',async()=>{
    const f=await fixture(),fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>reply({error:'not found'},404));vi.stubGlobal('fetch',fetch);
    await expect(readPhotoUpload('token',f.raw,19)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();expect(fetch.mock.calls[0]).toHaveLength(2);
    expect(fetch.mock.calls[0][0]).toContain('/upload-receipts/'+id);
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
  });
  it('requires matching photo and persistent encrypted proof before any upload',async()=>{
    const f=await fixture(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const store={get:vi.fn(),save:vi.fn(async()=>{throw Error('blocked');}),clear:vi.fn()};
    await expect(sendPhotoUpload('token',f.raw,19,file(),store,'key',()=>true)).rejects.toThrow();
    await expect(sendPhotoUpload('token',f.raw,19,new File(['different'],'other.jpg',{type:'image/jpeg'}),store,'key',()=>true)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();expect(store.clear).not.toHaveBeenCalled();
  });
  it('unknown upload ACK with unavailable receipt stays pending with one POST and one read',async()=>{
    const f=await fixture(),fetch=vi.fn(async(_url:unknown,init?:RequestInit)=>{if(init?.method==='POST')throw Error('ACK lost');return reply({},404);});vi.stubGlobal('fetch',fetch);
    const store={get:vi.fn(),save:vi.fn(async()=>{}),clear:vi.fn()};
    await expect(sendPhotoUpload('token',f.raw,19,file(),store,'key',()=>true)).rejects.toThrow('ACK lost');
    expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);expect(store.clear).not.toHaveBeenCalled();
  });
  it('does not read/clear or send another photo after account switches during ACK',async()=>{
    const f=await fixture();let active=true;
    const fetch=vi.fn(async()=>{active=false;return reply({id:mediaId,imageUrl:f.result.media.imageUrl,thumbnailUrl:f.result.media.thumbnailUrl,width:320,height:240,byteSize:1234,createdAt:f.result.media.createdAt});});vi.stubGlobal('fetch',fetch);
    const store={get:vi.fn(),save:vi.fn(async()=>{}),clear:vi.fn()};
    await expect(sendPhotoUpload('token',f.raw,19,file(),store,'key',()=>active)).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();expect(store.clear).not.toHaveBeenCalled();
  });
  it('safely cancels with hash-only proof, never DELETE or file retransmission',async()=>{
    const f=await fixture(),fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>reply({receipt:{...f.result.receipt,state:'ABANDONED',mediaId:null},media:null}));vi.stubGlobal('fetch',fetch);
    expect((await abandonPhotoUpload('token',f.raw,19,()=>true)).state).toBe('ABANDONED');
    expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:JSON.stringify({requestHash:f.result.receipt.requestHash})});
  });
  it('actually encrypts API/account-separated journals and uses exact-value clearing',async()=>{
    const f=await fixture(),store=createWebPendingStore('photo-proof-'+crypto.randomUUID(),new IDBFactory());
    const key=await pendingRequestKey(API_URL,19,'listing-photo'),other=await pendingRequestKey(API_URL,20,'listing-photo'),alternate=await pendingRequestKey('https://example.invalid',19,'listing-photo');
    await store.save(key,f.raw);expect(await store.get(key)).toBe(f.raw);expect(await store.get(other)).toBeNull();expect(await store.get(alternate)).toBeNull();
    expect(await store.clear(key,f.raw+' ')).toBe(false);expect(await store.get(key)).toBe(f.raw);expect(await store.clear(key,f.raw)).toBe(true);
  });
});
