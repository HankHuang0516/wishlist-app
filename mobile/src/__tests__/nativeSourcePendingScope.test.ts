import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(()=>new Map<string,string>());
vi.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'SHA256'},digestStringAsync:async (_:string,url:string)=>url.includes('other.example')?'b'.repeat(64):'a'.repeat(64),randomUUID:()=> '22222222-2222-4222-8222-222222222222'}));
vi.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:'local',getItemAsync:async(k:string)=>storage.get(k)??null,setItemAsync:async(k:string,v:string)=>{storage.set(k,v)},deleteItemAsync:async(k:string)=>{storage.delete(k)}}));
import { pendingRequestKey, validPendingResource } from '../nativePendingStore';
import { createPrivatePendingIndex } from '../privatePendingIndex';
import { createPendingStore } from '../pendingStore';
const id='066ef909-79fa-4206-b8cb-b00c4929a9b9';
describe('source inquiry private scope',()=>{
 beforeEach(()=>{(globalThis as any).__DEV__=false;});
 it('accepts an exact source UUID while rejecting malformed or unrelated resources',async()=>{
  expect(validPendingResource('source-lead.'+id)).toBe(true);
  for(const value of ['source-lead','source-lead.'+'a'.repeat(36),'source-lead.'+id+'.extra','source-lead.00000000-0000-0000-0000-000000000000','seller.'+id,'source-lead../'+id]) expect(validPendingResource(value)).toBe(false);
  for(const user of [0,-1,1.5,2147483648])await expect(pendingRequestKey('https://example.com/api',user,'source-lead.'+id)).rejects.toThrow();
 });
 it('isolates source, user, host and message keys',async()=>{
  const resource='source-lead.'+id;
  const keys=await Promise.all([pendingRequestKey('https://example.com/api',928,resource),pendingRequestKey('https://example.com/api',929,resource),pendingRequestKey('https://other.example/api',928,resource),pendingRequestKey('https://example.com/api',928,'message.'+id),pendingRequestKey('https://example.com/api',928,'source-lead.22222222-2222-4222-8222-222222222222')]);
  expect(new Set(keys).size).toBe(5);
 });
 it('persists and recovers a source pending generation and erases only its owner',async()=>{
  const values=new Map<string,string>();const port={get:async(k:string)=>values.get(k)??null,set:async(k:string,v:string)=>{values.set(k,v)},remove:async(k:string)=>{values.delete(k)}};
  const key=await pendingRequestKey('https://example.com/api',928,'source-lead.'+id), other=await pendingRequestKey('https://example.com/api',929,'source-lead.'+id);
  const index=createPrivatePendingIndex(port);const pending=createPendingStore(index.privateStore,()=> '22222222-2222-4222-8222-222222222222');
  await pending.save(key,'private inquiry'.repeat(200));await pending.save(other,'other owner');
  expect(await createPendingStore(createPrivatePendingIndex(port).privateStore,()=>id).get(key)).toBe('private inquiry'.repeat(200));
  const scope=key.slice(0,key.indexOf('.source-lead.'));expect(await index.erase(scope)).toEqual({remaining:0});
  expect(await pending.get(other)).toBe('other owner');await expect(pending.save(key,'late')).rejects.toThrow();
 });
});
