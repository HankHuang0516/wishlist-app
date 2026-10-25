/// <reference types="node" />
import {webcrypto,randomUUID} from 'node:crypto';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createWebPendingStore,PendingStoreError} from './webPendingStore';
const crypt=webcrypto as unknown as Crypto;
const key=`wishlist.pending.v1.${'a'.repeat(64)}.42.listing-report`;
beforeEach(()=>{vi.stubGlobal('crypto',crypt);vi.stubGlobal('IDBKeyRange',IDBKeyRange);});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
async function fixture(){
  const factory=new IDBFactory(),name=randomUUID();
  await createWebPendingStore(name,factory,crypt).save(key,'original protected operation');
  return {factory,name};
}
async function database(factory:IDBFactory,name:string){
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=factory.open(name,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
it('releases a silent opening timeout and recovers the exact encrypted original on an explicit read',async()=>{
  const {factory,name}=await fixture();
  const stalled={} as IDBOpenDBRequest;
  const open=vi.spyOn(factory,'open').mockImplementationOnce(()=>stalled);
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  const store=createWebPendingStore(name,factory,crypt);
  const rejected=expect(store.get(key)).rejects.toThrow(PendingStoreError);
  await vi.advanceTimersByTimeAsync(8_000);await rejected;
  expect(open).toHaveBeenCalledTimes(1); // No automatic retry or write.
  expect(await store.get(key)).toBe('original protected operation');
  expect(open).toHaveBeenCalledTimes(2);
  expect(await store.clear(key,'different operation')).toBe(false);
  expect(await store.get(key)).toBe('original protected operation');
});
it('closes a late timed-out handle without replacing or invalidating the recovered connection',async()=>{
  const {factory,name}=await fixture();
  const stalled={} as IDBOpenDBRequest;
  const open=vi.spyOn(factory,'open').mockImplementationOnce(()=>stalled);
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  const store=createWebPendingStore(name,factory,crypt);
  const rejected=expect(store.get(key)).rejects.toThrow(PendingStoreError);
  await vi.advanceTimersByTimeAsync(8_000);await rejected;
  expect(await store.get(key)).toBe('original protected operation');
  const late=await database(factory,name),close=vi.spyOn(late,'close');
  Object.defineProperty(stalled,'result',{value:late});
  stalled.onsuccess!.call(stalled,new Event('success'));
  stalled.onerror!.call(stalled,new Event('error'));
  expect(close).toHaveBeenCalledOnce();
  const attempts=open.mock.calls.length;
  expect(await store.get(key)).toBe('original protected operation');
  expect(open).toHaveBeenCalledTimes(attempts);
});
it('aborts a late upgrade after timeout and retains the journal for recovery',async()=>{
  const {factory,name}=await fixture();
  const abort=vi.fn(),stalled={transaction:{abort}} as unknown as IDBOpenDBRequest;
  vi.spyOn(factory,'open').mockImplementationOnce(()=>stalled);
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  const store=createWebPendingStore(name,factory,crypt);
  const rejected=expect(store.get(key)).rejects.toThrow(PendingStoreError);
  await vi.advanceTimersByTimeAsync(8_000);await rejected;
  stalled.onupgradeneeded!.call(stalled,new Event('upgradeneeded') as IDBVersionChangeEvent);
  expect(abort).toHaveBeenCalledOnce();
  expect(await store.get(key)).toBe('original protected operation');
});
