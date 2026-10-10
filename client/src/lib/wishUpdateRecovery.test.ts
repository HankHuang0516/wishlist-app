import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from './marketplaceApi';
import { confirmWishUpdate, parseWishUpdateOperation, readWishUpdate, type WishUpdateOperation } from './wishUpdateRecovery';
import { createWebPendingStore, pendingRequestKey } from './webPendingStore';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./marketplaceApi',async original=>({...await original<typeof import('./marketplaceApi')>(),api}));
const list={id:1,title:'原清單',description:null,isPublic:false,maxItems:100,_count:{items:60}};
const wish={id:60,wishlistId:1,name:'保留原文',notes:'原備註',link:null,imageUrl:null,aiStatus:'SKIPPED',price:null,currency:null,aiLink:null,maxPrice:0,priceCurrency:'USD',isHidden:false,isPurchased:false};
const operation:WishUpdateOperation={version:1,localOperationId:'b5abf861-a66d-4072-876b-4f0ab3172dac',kind:'ITEM',listId:1,itemId:60,title:'原名稱',method:'PUT',body:{name:'保留原文',notes:'原備註',link:null,maxPrice:0,priceCurrency:'USD'}};
beforeEach(()=>{ vi.mocked(api).mockReset(); });
describe('original wish update records and current-only reads',()=>{
 it('keeps full original edit content in the existing encrypted account and API scope',async()=>{
  const factory=new IDBFactory(),store=createWebPendingStore('wish-update-test',factory,webcrypto as unknown as Crypto);
  const key=await pendingRequestKey('https://wish.test/api',42,'wish-update'),other=await pendingRequestKey('https://wish.test/api',77,'wish-update');
  const raw=JSON.stringify(operation);await store.save(key,raw);
  expect(await store.get(key)).toBe(raw);expect(await store.get(other)).toBeNull();
  await expect(store.save(key,JSON.stringify({...operation,title:'另一筆操作'}))).rejects.toThrow();
  expect(await store.clear(key,JSON.stringify({...operation,title:'錯誤原文'}))).toBe(false);expect(await store.get(key)).toBe(raw);
  expect(await store.clear(key,raw)).toBe(true);
 });
 it.each([
  {body:{...operation.body,imageUrl:'https://example.invalid/new.jpg'}},
  {token:'private-secret'}, {itemId:null}, {listId:0}, {method:'POST'},
  {body:{isHidden:true,isPurchased:true}}, {body:{...operation.body,maxPrice:0.123}},
  {body:{...operation.body,link:'https://user:password@example.invalid/photo'}},
 ])('rejects a damaged or broadened stored operation before any read: %j',patch=>{
  expect(()=>parseWishUpdateOperation(JSON.stringify({...operation,...patch}))).toThrow();expect(api).not.toHaveBeenCalled();
 });
 it('reads the original item beyond the first page using GET only and never clears or submits a record',async()=>{
  vi.mocked(api).mockResolvedValueOnce({list,items:Array.from({length:50},(_,index)=>({...wish,id:index+1})),nextCursor:50}).mockResolvedValueOnce({list,items:[wish],nextCursor:null});
  const view=await readWishUpdate('fixture',operation);expect(view.item?.id).toBe(60);
  expect(api).toHaveBeenNthCalledWith(1,'fixture','/native-wishes/lists/1');expect(api).toHaveBeenNthCalledWith(2,'fixture','/native-wishes/lists/1?cursor=50');
 });
 it('treats 404 as current unavailability rather than a successful deletion',async()=>{
  vi.mocked(api).mockRejectedValue(new ApiFailure('unavailable',404));
  expect(await readWishUpdate('fixture',{...operation,method:'DELETE',body:null})).toEqual({list:null,item:null,unavailable:true});
 });
 it('keeps read failure separate from missing data and rejects another list projection',async()=>{
  vi.mocked(api).mockRejectedValueOnce(new ApiFailure('unavailable',503));await expect(readWishUpdate('fixture',operation)).rejects.toThrow();
  vi.mocked(api).mockResolvedValueOnce({list:{...list,id:2},items:[],nextCursor:null});await expect(readWishUpdate('fixture',operation)).rejects.toThrow();
 });
 it('rejects an ACK for altered fields, another item or another list',()=>{
  expect(()=>confirmWishUpdate(wish,operation)).not.toThrow();
  for(const changed of [{...wish,maxPrice:1},{...wish,id:61},{...wish,wishlistId:2}])expect(()=>confirmWishUpdate(changed,operation)).toThrow();
 });
});
