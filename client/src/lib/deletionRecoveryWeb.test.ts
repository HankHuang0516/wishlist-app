/// <reference types="node" />
import { randomUUID,webcrypto } from 'node:crypto';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { createDeletionRecoveryVault,createWebPendingStore,deletionRecoveryKey,pendingRequestKey,type PendingStore } from './webPendingStore';
import { PENDING_DELETION_KEY,type PendingDeletion } from './accountDeletionWeb';
import { clearDeletionJournal,deletionJournal,publishDeletionJournal,recoverDeletionJournal,verifyDeletionJournal } from './deletionRecoveryWeb';
const api='https://example.com/api',crypt=webcrypto as unknown as Crypto;
const original:PendingDeletion={version:1,apiUrl:api,userId:19,clientActionId:'11111111-1111-4111-8111-111111111111',originalToken:'synthetic-original-session'};
const newer:PendingDeletion={...original,userId:20,clientActionId:'22222222-2222-4222-8222-222222222222',originalToken:'synthetic-other-session'};
function fixture(){
 const factory=new IDBFactory(),name=randomUUID(),values=new Map<string,string>();
 const legacy={getItem:vi.fn((key:string)=>values.get(key)??null),setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),removeItem:vi.fn((key:string)=>{values.delete(key);})} as unknown as Storage;
 return {factory,name,legacy,vault:createDeletionRecoveryVault(name,factory,crypt)};
}
async function raw(factory:IDBFactory,name:string,table:string,key:string){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=factory.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise<unknown>((resolve,reject)=>{const r=db.transaction(table).objectStore(table).get(key);r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>{reject(r.error);db.close();};});
}
beforeEach(()=>{vi.stubGlobal('crypto',crypt);vi.stubGlobal('IDBKeyRange',IDBKeyRange);});
afterEach(()=>vi.unstubAllGlobals());
describe('encrypted original deletion recovery and legacy migration',()=>{
 it('serializes simultaneous new operations from two accounts into exactly one immutable original',async()=>{
  const {vault,factory,name,legacy}=fixture(),other=createDeletionRecoveryVault(name,factory,crypt);
  const outcomes=await Promise.allSettled([publishDeletionJournal(original,()=>true,vault,legacy),publishDeletionJournal(newer,()=>true,other,legacy)]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
  const a=await recoverDeletionJournal(api,vault,legacy),b=await recoverDeletionJournal(api,other,legacy);
  expect(a.raw).toBe(b.raw);expect([deletionJournal(original),deletionJournal(newer)]).toContain(a.raw);
  const winner=a.journal!;await verifyDeletionJournal(winner,()=>true,other,legacy);
  await expect(verifyDeletionJournal(winner.clientActionId===original.clientActionId?newer:original,()=>true,vault,legacy)).rejects.toThrow('STORAGE');
 });
 it('encrypts the original session with a non-extractable key and restores only its API journal',async()=>{
  const {vault,factory,name,legacy}=fixture(),key=await deletionRecoveryKey(api);await publishDeletionJournal(original,()=>true,vault,legacy);
  const row=await raw(factory,name,'pending',key) as {cipher:ArrayBuffer};expect(new TextDecoder().decode(row.cipher)).not.toMatch(/synthetic-original-session|11111111|userId/);
  const secret=await raw(factory,name,'keys',key.replace(/\.account-deletion$/,'')) as CryptoKey;expect(secret.extractable).toBe(false);await expect(crypt.subtle.exportKey('raw',secret)).rejects.toThrow();
  expect(await createDeletionRecoveryVault(name,factory,crypt).get(key)).toBe(deletionJournal(original));
  expect((await recoverDeletionJournal('https://other.example/api',vault,legacy)).journal).toBeNull();expect(legacy.getItem(PENDING_DELETION_KEY)).toBeNull();
  expect(Object.keys(vault).sort()).toEqual(['clear','get','save']);
 });
 it('retains deletion proof through confirmed owner-data erasure without granting ordinary journals recovery access',async()=>{
  const {vault,factory,legacy}=fixture(),ordinary=createWebPendingStore(randomUUID(),factory,crypt),key=await deletionRecoveryKey(api),normal=await pendingRequestKey(api,19,'feedback');
  await publishDeletionJournal(original,()=>true,vault,legacy);await ordinary.save(normal,'private feedback');await ordinary.eraseScope(normal.slice(0,-9));
  expect(await vault.get(key)).toBe(deletionJournal(original));expect(await ordinary.get(normal)).toBeNull();
  await expect(ordinary.save(key,'session')).rejects.toThrow();await expect(vault.save(normal,'feedback')).rejects.toThrow();
  await clearDeletionJournal(original,vault,legacy);expect(await vault.get(key)).toBeNull();
 });
 it('round-trips a legacy original before removing its exact plaintext record and never stores the password',async()=>{
  const {vault,legacy}=fixture();legacy.setItem(PENDING_DELETION_KEY,JSON.stringify({originalToken:original.originalToken,clientActionId:original.clientActionId,userId:19,apiUrl:api,version:1}));
  const result=await recoverDeletionJournal(api,vault,legacy);expect(result.journal).toEqual(original);expect(result.raw).toBe(deletionJournal(original));expect(await vault.get(result.key)).toBe(result.raw);expect(legacy.getItem(PENDING_DELETION_KEY)).toBeNull();expect(result.raw).not.toMatch(/currentPassword|confirmation/);
 });
 it('preserves both records when another legacy operation appears during encryption',async()=>{
  const {vault,legacy}=fixture();legacy.setItem(PENDING_DELETION_KEY,deletionJournal(original));
  const delayed:PendingStore={...vault,save:async(key,body)=>{await vault.save(key,body);legacy.setItem(PENDING_DELETION_KEY,deletionJournal(newer));}};
  await expect(recoverDeletionJournal(api,delayed,legacy)).rejects.toThrow('STORAGE');expect(legacy.getItem(PENDING_DELETION_KEY)).toBe(deletionJournal(newer));expect(await vault.get(await deletionRecoveryKey(api))).toBe(deletionJournal(original));
 });
 it.each(['save','readback','remove'])('keeps recoverable evidence when migration %s fails',async stage=>{
  const {vault,legacy}=fixture();legacy.setItem(PENDING_DELETION_KEY,deletionJournal(original));
  let reads=0;const faulty:PendingStore={...vault,save:stage==='save'?async()=>{throw Error('private diagnostic');}:vault.save,get:async key=>{if(stage==='readback'&&++reads===2)throw Error('private diagnostic');return vault.get(key);}};
  if(stage==='remove')vi.mocked(legacy.removeItem).mockImplementationOnce(()=>{throw Error('private diagnostic');});
  await expect(recoverDeletionJournal(api,faulty,legacy)).rejects.toThrow(/^STORAGE$/);expect(legacy.getItem(PENDING_DELETION_KEY)).toBe(deletionJournal(original));
  expect(await vault.get(await deletionRecoveryKey(api))).toBe(stage==='save'?null:deletionJournal(original));
 });
 it('freezes different encrypted and legacy originals without overwriting either identity',async()=>{
  const {vault,legacy}=fixture(),key=await deletionRecoveryKey(api);await publishDeletionJournal(original,()=>true,vault,legacy);legacy.setItem(PENDING_DELETION_KEY,deletionJournal(newer));
  await expect(recoverDeletionJournal(api,vault,legacy)).rejects.toThrow('STORAGE');await expect(clearDeletionJournal(original,vault,legacy)).rejects.toThrow('STORAGE');
  expect(await vault.get(key)).toBe(deletionJournal(original));expect(legacy.getItem(PENDING_DELETION_KEY)).toBe(deletionJournal(newer));
 });
 it.each(['{invalid',JSON.stringify({...original,apiUrl:'https://other.example/api'}),JSON.stringify({...original,currentPassword:'must-never-migrate'}),JSON.stringify({...original,clientActionId:'invalid'})])('rejects malformed or different-API legacy records without migrating %#',async body=>{
  const {vault,legacy}=fixture();legacy.setItem(PENDING_DELETION_KEY,body);await expect(recoverDeletionJournal(api,vault,legacy)).rejects.toThrow('STORAGE');expect(await vault.get(await deletionRecoveryKey(api))).toBeNull();expect(legacy.getItem(PENDING_DELETION_KEY)).toBe(body);
 });
 it('preserves a corrupt encrypted record and never falls back to the legacy original',async()=>{
  const {vault,legacy}=fixture(),key=await deletionRecoveryKey(api);await vault.save(key,'{invalid');legacy.setItem(PENDING_DELETION_KEY,deletionJournal(original));
  await expect(recoverDeletionJournal(api,vault,legacy)).rejects.toThrow('STORAGE');expect(await vault.get(key)).toBe('{invalid');expect(legacy.getItem(PENDING_DELETION_KEY)).toBe(deletionJournal(original));
 });
 it('does not publish when the original session departs during the empty read',async()=>{
  const {vault,legacy}=fixture();const save=vi.fn(vault.save);await expect(publishDeletionJournal(original,()=>false,{...vault,save},legacy)).rejects.toThrow('STORAGE');expect(save).not.toHaveBeenCalled();expect(await vault.get(await deletionRecoveryKey(api))).toBeNull();
 });
 it('never clears a newer published journal with a stale acknowledgement',async()=>{
  const {vault,legacy}=fixture();await publishDeletionJournal(original,()=>true,vault,legacy);await clearDeletionJournal(original,vault,legacy);await publishDeletionJournal(newer,()=>true,vault,legacy);
  await expect(clearDeletionJournal(original,vault,legacy)).rejects.toThrow('STORAGE');expect((await recoverDeletionJournal(api,vault,legacy)).journal).toEqual(newer);
 });
 it('keeps confirmed proof if final CAS fails and permits only cleanup retry',async()=>{
  const {vault,legacy}=fixture();await publishDeletionJournal(original,()=>true,vault,legacy);
  await expect(clearDeletionJournal(original,{...vault,clear:async()=>false},legacy)).rejects.toThrow('STORAGE');expect((await recoverDeletionJournal(api,vault,legacy)).journal).toEqual(original);
  await clearDeletionJournal(original,vault,legacy);expect((await recoverDeletionJournal(api,vault,legacy)).journal).toBeNull();
 });
 it('does not report completion if a newer operation arrives immediately after exact original cleanup',async()=>{
  const {vault,legacy}=fixture(),key=await deletionRecoveryKey(api);await publishDeletionJournal(original,()=>true,vault,legacy);
  const racing:PendingStore={...vault,clear:async(k,body)=>{const cleared=await vault.clear(k,body);await vault.save(k,deletionJournal(newer));return cleared;}};
  await expect(clearDeletionJournal(original,racing,legacy)).rejects.toThrow('STORAGE');expect(await vault.get(key)).toBe(deletionJournal(newer));
 });
 it('accepts only trusted API roots including the actual production same-origin API',async()=>{
  vi.stubGlobal('window',{location:{origin:'https://example.com'}});expect(await deletionRecoveryKey('/api')).toBe(await deletionRecoveryKey(api));
  for(const value of ['//evil.example/api','../api','https://user:pass@example.com/api'])await expect(deletionRecoveryKey(value)).rejects.toThrow();
 });
});
