import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createWebPendingStore, pendingScope } from './webPendingStore';
import { parseSourcePending, parseSourceReceipt, readSourceRecovery, sourceJournalKey } from './sourceInquiryRecovery';
const leadId='11111111-1111-4111-8111-111111111111',roomId='22222222-2222-4222-8222-222222222222',api='https://example.invalid/api';
const body=()=>JSON.stringify({version:1,leadId,roomId,payload:{requestId:crypto.randomUUID(),action:'ASK',text:'合成私有問題',consent:true,transferHash:'a'.repeat(64)}});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('IDBKeyRange',IDBKeyRange);sessionStorage.clear()});afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
it('encrypted inquiry and withdrawal survive reopening separately and isolate API, owner and item',async()=>{
 const factory=new IDBFactory(),name=crypto.randomUUID(),store=createWebPendingStore(name,factory,webcrypto as unknown as Crypto),key=await sourceJournalKey(api,42,leadId),cancel=await sourceJournalKey(api,42,leadId,true),original=body();
 await store.save(key,original);await store.save(cancel,JSON.stringify({version:1,leadId,roomId,payload:{requestId:crypto.randomUUID(),action:'CANCEL'}}));const reopened=createWebPendingStore(name,factory,webcrypto as unknown as Crypto);
 expect((await readSourceRecovery(reopened,api,42,leadId,sessionStorage)).inquiry?.body).toBe(original);expect(await store.get(await sourceJournalKey(api,43,leadId))).toBeNull();expect(await store.get(await sourceJournalKey('https://other.invalid/api',42,leadId))).toBeNull();
 expect(await store.clear(key,'stale')).toBe(false);expect(await store.clear(key,original)).toBe(true);const newer=body();await store.save(key,newer);expect(await store.clear(key,original)).toBe(false);expect(await store.get(key)).toBe(newer);expect(await store.get(cancel)).not.toBeNull();await expect(store.replaceDraft(key,newer,original)).rejects.toThrow();
 const db=await new Promise<IDBDatabase>(resolve=>{const r=factory.open(name);r.onsuccess=()=>resolve(r.result)});const row=await new Promise<any>(resolve=>{const r=db.transaction('pending').objectStore('pending').get(key);r.onsuccess=()=>resolve(r.result)});expect(new TextDecoder().decode(row.cipher)).not.toContain('合成私有問題');db.close();
 await store.eraseScope(await pendingScope(api,42));expect(await reopened.get(key)).toBeNull();expect(await reopened.get(cancel)).toBeNull();await expect(reopened.save(key,original)).rejects.toThrow();
});
it.each(['broken',JSON.stringify({requestId:'invalid',action:'ASK'}),JSON.stringify({requestId:leadId,action:'ASK',token:'never-import'})])('corrupt legacy metadata fails closed %#',async raw=>{
 const store=createWebPendingStore(crypto.randomUUID(),new IDBFactory(),webcrypto as unknown as Crypto);sessionStorage.setItem('source-lead-request:42:'+leadId,raw);await expect(readSourceRecovery(store,api,42,leadId,sessionStorage)).rejects.toThrow();expect(sessionStorage.getItem('source-lead-request:42:'+leadId)).toBe(raw);
});
it('legacy cleanup failure preserves the encrypted identity until an explicit recovery',async()=>{
 const store=createWebPendingStore(crypto.randomUUID(),new IDBFactory(),webcrypto as unknown as Crypto),raw=JSON.stringify({requestId:leadId,action:'ASK'});sessionStorage.setItem('source-lead-request:42:'+leadId,raw);const unavailable={getItem:sessionStorage.getItem.bind(sessionStorage),removeItem:()=>{throw Error('private storage error')}} as unknown as Storage;await expect(readSourceRecovery(store,api,42,leadId,unavailable)).rejects.toThrow();const key=await sourceJournalKey(api,42,leadId);expect(JSON.parse((await store.get(key))!).version).toBe(0);expect((await readSourceRecovery(store,api,42,leadId,sessionStorage)).inquiry?.operation.version).toBe(0);
});
it('receipt must bind the original text, consent snapshot, operation, lead and room',()=>{
 const original=parseSourcePending(body(),leadId);if(original.version!==1)throw Error();const p=original.payload,room={id:roomId,leadId,state:'WAITING_ROUTE',available:true,events:[{requestId:p.requestId,action:p.action,text:p.text,at:new Date().toISOString()}],transferHash:'b'.repeat(64),routeVerified:false,delivered:false,delivery:null,checkoutEnabled:false,orderCreated:false,notice:'not an order'},receipt={leadId,roomId,operation:p,room};
 expect(parseSourceReceipt(receipt,original,roomId)?.id).toBe(roomId);expect(parseSourceReceipt(null,original,roomId)).toBeNull();for(const changed of [{...receipt,leadId:roomId},{...receipt,roomId:leadId},{...receipt,operation:{...p,text:'replacement'}},{...receipt,operation:{...p,transferHash:'c'.repeat(64)}},{...receipt,operation:{...p,consent:false}},{...receipt,room:{...room,events:[]}}])expect(()=>parseSourceReceipt(changed,original,roomId)).toThrow();
});
