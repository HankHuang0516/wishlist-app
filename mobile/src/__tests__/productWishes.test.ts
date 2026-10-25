import {expect,it,vi} from 'vitest';
import {ApiError} from '../api';
import {ProductWishController,parseProductWishState,type ProductWishPending} from '../productWishes';
const id='12345678-1234-4234-8234-123456789abc',requestId='12345678-1234-4234-8234-123456789abd',product={kind:'source' as const,id,title:'合成商品'};
const lists=[{id:12,title:'私人願望',isPublic:false,remaining:10}],saved={productKey:'source:'+id,itemId:42,wishlistId:12};
const operation:ProductWishPending={action:'ADD',kind:'source',productId:id,wishlistId:12,clientRequestId:requestId};
function journal(){let raw:string|null=null;return {get:vi.fn(async()=>raw),save:vi.fn(async(value:string)=>{if(raw&&raw!==value)throw Error();raw=value;}),clear:vi.fn(async(expected:string)=>{if(raw===expected)raw=null;}),value:()=>raw};}
const receipt=(op=operation)=>({action:op.action,clientRequestId:op.clientRequestId,productKey:op.kind+':'+op.productId,itemId:op.action==='REMOVE'?null:42,wishlistId:op.wishlistId,deleted:op.action==='REMOVE'});
it('journals before the authenticated send and confirms add/remove from real-shaped receipts and rereads',async()=>{
 const store=journal();let present=false;
 const read=vi.fn(async(_path:string,options?:{method?:string;body?:string})=>{if(options?.method==='POST'){expect(store.value()).toBe(options.body);const op=JSON.parse(options.body!) as ProductWishPending;present=op.action==='ADD';return receipt(op);}return {lists,saved:present?[saved]:[]};});
 const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(c.operation(product,12));expect(c.getSnapshot().saved).toEqual([saved]);expect(store.value()).toBeNull();
 await c.submit(c.operation(product,12,saved));expect(c.getSnapshot().saved).toEqual([]);expect(c.getSnapshot().notice).toContain('移除');
});
it('restores a lost acknowledgement using GET only, without duplicating a saved wish',async()=>{
 const store=journal();let writes=0,present=false;
 const read=vi.fn(async(path:string,options?:{method?:string})=>{if(options?.method==='POST'){writes++;present=true;throw Error('ACK lost');}return path.includes('/receipts/')?receipt():{lists,saved:present?[saved]:[]};});
 const first=new ProductWishController(read,store,()=>requestId);await first.start();await first.submit(operation);expect(first.getSnapshot().pending?.clientRequestId).toBe(requestId);expect(writes).toBe(1);first.destroy();
 const reopened=new ProductWishController(read,store,()=>requestId);await reopened.start();expect(reopened.getSnapshot().saved).toEqual([saved]);expect(reopened.getSnapshot().pending).toBeNull();expect(writes).toBe(1);expect(store.value()).toBeNull();
});
it('uses exactly the same durable UUID on an explicit retry and gates double taps synchronously',async()=>{
 const store=journal();let writes=0,finish!:(v:unknown)=>void;
 const read=vi.fn(async(_path:string,options?:{method?:string;body?:string})=>{if(options?.method==='POST'){expect(JSON.parse(options.body!).clientRequestId).toBe(requestId);writes++;if(writes===1)throw Error('network');return new Promise(resolve=>finish=resolve);}return {lists,saved:writes>1?[saved]:[]};});
 const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);await c.submit({...operation,clientRequestId:id});expect(writes).toBe(1);
 const retry=c.retry();await Promise.resolve();await Promise.resolve();await c.retry();for(let i=0;i<30&&!finish;i++)await Promise.resolve();expect(finish).toBeTypeOf('function');expect(writes).toBe(2);finish(receipt());await retry;expect(store.value()).toBeNull();
});
it('does not send if secure storage cannot commit the journal',async()=>{
 const store=journal();store.save.mockRejectedValue(Error('storage'));const read=vi.fn(async()=>({lists,saved:[]}));const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(read.mock.calls).toHaveLength(1);expect(c.getSnapshot().ready).toBe(false);
});
it('fences a late old-session journal write before HTTP and lets a fresh owner use a separate journal',async()=>{
 const store=journal();let finish!:()=>void;store.save.mockImplementation(async()=>new Promise<void>(resolve=>finish=resolve));
 const read=vi.fn(async()=>({lists,saved:[]})),old=new ProductWishController(read,store,()=>requestId);await old.start();const send=old.submit(operation);for(let i=0;i<30&&!finish;i++)await Promise.resolve();expect(finish).toBeTypeOf('function');old.destroy();
 const newRead=vi.fn(async()=>({lists:[{...lists[0],id:99,title:'另一帳號'}],saved:[]})),fresh=new ProductWishController(newRead,journal(),()=>id);await fresh.start();finish();await send;
 expect(read).toHaveBeenCalledTimes(1);expect(fresh.getSnapshot().lists[0].id).toBe(99);expect(fresh.getSnapshot().saved).toEqual([]);
});
it('rejects a mismatched acknowledgement and preserves the original pending operation',async()=>{
 const store=journal(),read=vi.fn(async(_path:string,options?:{method?:string})=>options?.method==='POST'?{...receipt(),productKey:'listing:'+id}:{lists,saved:[]});const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(c.getSnapshot().pending).toEqual(operation);expect(store.value()).not.toBeNull();expect(c.getSnapshot().saved).toEqual([]);
});
it('refreshes after a definitive permission rejection and retains unknown 503 outcomes',async()=>{
 for(const status of [403,503]){const store=journal(),read=vi.fn(async(_path:string,options?:{method?:string})=>{if(options?.method==='POST')throw new ApiError(status);return {lists,saved:[]};});const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(store.value()===null).toBe(status===403);}
});
it('does not mistake an already-deleted add receipt for a currently saved product',async()=>{
 const store=journal(),read=vi.fn(async(_path:string,options?:{method?:string})=>options?.method==='POST'?{...receipt(),deleted:true,itemId:null}:{lists,saved:[]});const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(c.getSnapshot().saved).toEqual([]);expect(c.getSnapshot().notice).toContain('不會重新建立');
});
it('keeps every list private to the returned owner and rejects saved links to unknown lists',()=>{
 expect(()=>parseProductWishState({lists,saved:[{...saved,wishlistId:99}]})).toThrow();expect(()=>parseProductWishState({lists:[...lists,...lists],saved:[]})).toThrow();
});

it('respects Retry-After without automatic sends and retries the same operation only after an explicit later action',async()=>{
 vi.useFakeTimers();try{const store=journal();let writes=0;const read=vi.fn(async(_path:string,o?:{method?:string})=>{if(o?.method==='POST'){writes++;if(writes===1)throw new ApiError(429,'RATE_LIMIT',5);return receipt();}return {lists,saved:[]};});const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(c.getSnapshot().retryAt).toBe(Date.now()+5000);await c.retry();expect(writes).toBe(1);await vi.advanceTimersByTimeAsync(5000);expect(writes).toBe(1);await c.retry();expect(writes).toBe(2);}finally{vi.useRealTimers();}
});
it('does not let a late prior lifecycle replace a restarted session snapshot',async()=>{
 const store=journal();let finish!:(v:unknown)=>void;const read=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>finish=resolve)).mockResolvedValue({lists:[{...lists[0],title:'目前清單'}],saved:[]});const c=new ProductWishController(read,store,()=>requestId);const old=c.start();for(let i=0;i<20&&!finish;i++)await Promise.resolve();expect(finish).toBeTypeOf('function');c.destroy();await c.start();finish({lists:[{...lists[0],title:'過時清單'}],saved:[]});await old;expect(c.getSnapshot().lists[0].title).toBe('目前清單');
});
it('does not enable new hearts when the confirmed write succeeds but the current-list reread fails',async()=>{
 const store=journal();let written=false;const read=vi.fn(async(_path:string,o?:{method?:string})=>{if(o?.method==='POST'){written=true;return receipt();}if(written)throw Error('read failure');return {lists,saved:[]};});const c=new ProductWishController(read,store,()=>requestId);await c.start();await c.submit(operation);expect(store.value()).toBeNull();expect(c.getSnapshot().ready).toBe(false);expect(c.getSnapshot().pending).toBeNull();
});
