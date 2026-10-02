import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const source=readFileSync(new NodeURL('../../public/pwa-cache-policy.js',import.meta.url),'utf8');
type Entry={url:string;method:string};
function fixture(initial:Record<string,string[]>={}) {
  const data=new Map(Object.entries(initial).map(([name,urls])=>[name,new Map(urls.map(url=>[url,{url,method:'GET'}]))]));
  const deleted=vi.fn(async(name:string)=>data.delete(name)),open=vi.fn(async(name:string)=>{
    const rows=data.get(name)??new Map<string,Entry>();data.set(name,rows);
    return {keys:async()=>[...rows.values()],delete:async(request:Entry)=>rows.delete(request.url),match:async(request:Entry)=>rows.get(request.url)};
  });
  const listeners=new Map<string,(event:any)=>void>();
  vm.runInNewContext(source,{URL,Error,caches:{keys:async()=>[...data.keys()],delete:deleted,open},self:{location:{origin:'https://wishlist.test'},addEventListener:(name:string,listener:(event:any)=>void)=>listeners.set(name,listener)}});
  async function event(name:string,mode='navigate'){let work:Promise<unknown>|undefined;listeners.get(name)!({request:{mode},waitUntil:(value:Promise<unknown>)=>{work=value;}});if(work)await work;return !!work;}
  return {data,deleted,open,event,listeners};
}
describe('actual classic service-worker cache migration script',()=>{
  it('retires all catch-all legacy entries while preserving precache and unrelated caches',async()=>{
    const f=fixture({images:['https://wishlist.test/uploads/private.jpg','https://wishlist.test/logo.png','https://third-party.test/private.jpg'],'workbox-precache-scope':['https://wishlist.test/logo.png'],'unrelated-owner-cache':['https://wishlist.test/other']});await f.event('activate');expect([...f.data.keys()]).toEqual(['workbox-precache-scope','unrelated-owner-cache']);expect(f.deleted).toHaveBeenCalledExactlyOnceWith('images');expect(f.open).not.toHaveBeenCalled();
  });
  it('keeps exact credential-free public artwork and prunes injected private, external and query paths',async()=>{
    const safe=['https://wishlist.test/logo.png','https://wishlist.test/features/feature4.png'],unsafe=['https://wishlist.test/api/users/me/avatar','https://wishlist.test/uploads/private.jpg','https://other.test/logo.png','https://wishlist.test/features/private.png','https://wishlist.test/logo.png?token=synthetic','https://wishlist.test/logo.png#secret'];const f=fixture({'wishlist-public-artwork-v1':[...safe,...unsafe]});await f.event('activate');expect([...f.data.get('wishlist-public-artwork-v1')!.keys()]).toEqual(safe);expect(f.deleted).not.toHaveBeenCalled();
  });
  it('never creates caches or replays requests during activation of a clean install',async()=>{const f=fixture();await f.event('activate');expect(f.open).not.toHaveBeenCalled();expect(f.deleted).not.toHaveBeenCalled();expect([...f.listeners.keys()]).toEqual(['activate','fetch']);});
  it('rechecks recreated legacy cache on navigation, without responding to or altering network requests',async()=>{const f=fixture();await f.event('activate');f.data.set('images',new Map([['https://wishlist.test/private.jpg',{url:'https://wishlist.test/private.jpg',method:'GET'}]]));expect(await f.event('fetch','cors')).toBe(false);expect(f.data.has('images')).toBe(true);expect(await f.event('fetch')).toBe(true);expect(f.data.has('images')).toBe(false);});
  it('serializes overlapping activation/navigation cleanup',async()=>{const f=fixture({images:['https://wishlist.test/private.jpg']});await Promise.all([f.event('activate'),f.event('fetch'),f.event('fetch')]);expect(f.deleted).toHaveBeenCalledTimes(1);});
  it('propagates failure and retries on a later navigation rather than claiming cleanup success',async()=>{const f=fixture({images:['https://wishlist.test/private.jpg']});f.deleted.mockRejectedValueOnce(Error('synthetic cache fault'));await expect(f.event('activate')).rejects.toThrow();expect(f.data.has('images')).toBe(true);await f.event('fetch');expect(f.data.has('images')).toBe(false);});
  it('detects unsuccessful cache deletion without deleting other caches',async()=>{const f=fixture({images:['https://wishlist.test/private.jpg'],unrelated:['https://wishlist.test/other']});f.deleted.mockResolvedValueOnce(false);await expect(f.event('activate')).rejects.toThrow('Image cache cleanup unavailable');expect(f.data.has('unrelated')).toBe(true);await f.event('fetch');expect(f.data.has('images')).toBe(false);});
});
