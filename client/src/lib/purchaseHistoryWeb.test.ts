import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../config';
import { HistoryReadError, historyImage, historyLink, parseAccountHistory, parseClaimHistory, readHistory } from './purchaseHistoryWeb';
const at='2020-01-02T03:04:05.000Z';
const tx={id:1,type:'CUSTOM',amount:123.4567,currency:'USD',status:'FAILED',createdAt:at};
const item={id:2,name:'Synthetic gift',price:'0',currency:'TWD',link:null,imageUrl:null,updatedAt:at,unavailable:false,wishlist:{title:'List',user:{id:3,name:null,nicknames:'Synthetic nickname',avatarUrl:null}}};
afterEach(()=>vi.unstubAllGlobals());
describe('current history render projections and private transport',()=>{
 it('retains precision, zero, negative refunds and custom statuses without creating a success interpretation',()=>{
  expect(parseAccountHistory([tx,{...tx,id:2,amount:0},{...tx,id:3,amount:-1.125,status:'REFUNDED'}])).toEqual([tx,{...tx,id:2,amount:0},{...tx,id:3,amount:-1.125,status:'REFUNDED'}]);
  expect(parseClaimHistory([item])[0]).toMatchObject({price:'0',unavailable:false});
  expect(parseClaimHistory([{...item,name:'Synthetic\nmultiline gift'}])[0]).toMatchObject({name:'Synthetic\nmultiline gift'});
 });
 it('rejects a broken row, duplicate identity, impossible date or nonfinite amount rather than treating it as empty',()=>{
  for(const raw of [null,{},[tx,tx],[{...tx,id:0}],[{...tx,amount:Infinity}],[{...tx,createdAt:'2020-02-31T00:00:00.000Z'}],[{...tx,createdAt:'not-a-date'}],[{...tx,status:[]}]]) expect(()=>parseAccountHistory(raw)).toThrow(HistoryReadError);
  for(const raw of [[item,item],[{...item,price:0}],[{...item,wishlist:{title:'List',user:{id:0}}}],[{...item,updatedAt:'bad'}],[{...item,name:'\u0000'}],[{...item,unavailable:undefined}]]) expect(()=>parseClaimHistory(raw)).toThrow(HistoryReadError);
 });
 it('renders only minimal inaccessible claims and rejects any accompanying private content',()=>{
  const unavailable={id:2,updatedAt:at,unavailable:true}; expect(parseClaimHistory([unavailable])).toEqual([unavailable]);
  expect(()=>parseClaimHistory([{...unavailable,name:'private-title'}])).toThrow(HistoryReadError);
 });
 it('does not truncate105 rows and projects away raw diagnostics rather than leaking them to views',()=>{
  expect(parseAccountHistory(Array.from({length:105},(_,i)=>({...tx,id:i+1})))).toHaveLength(105);
  expect(parseClaimHistory([{...item,notes:'private',aiError:'private-provider',proxy_end_user_id:'private-proxy'}])).toEqual([item]);
 });
 it('allows only credential-free HTTP links and bounded legacy upload photos',()=>{
  expect(historyLink('https://example.invalid/item')).toBe('https://example.invalid/item'); expect(historyLink('http://127.0.0.1:5218/item')).toBe('http://127.0.0.1:5218/item');
  for(const value of ['javascript:alert(1)','data:text/html,bad','https://user:password@example.invalid/','//example.invalid','https://example.invalid/a\n','file:///tmp/private']) expect(historyLink(value)).toBeUndefined();
  expect(historyImage('/uploads/synthetic.jpg')).toMatch(/\/uploads\/synthetic.jpg$/); expect(historyImage('/uploads/../private')).toBeUndefined(); expect(historyImage('/unknown/file')).toBeUndefined();
 });
 it('makes only the original private GET, without query authority or credential-bearing body',async()=>{
  const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>({ok:true,json:async()=>[tx]}));vi.stubGlobal('fetch',fetcher);const abort=new AbortController();
  expect(await readHistory('account','synthetic-token',abort.signal,parseAccountHistory)).toEqual([tx]);
  expect(fetcher).toHaveBeenCalledWith(API_URL+'/users/me/transaction-history',expect.objectContaining({headers:{Authorization:'Bearer synthetic-token'},cache:'no-store',redirect:'error',signal:expect.any(AbortSignal)}));
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body'); expect(fetcher.mock.calls[0][1]).not.toHaveProperty('method');
 });
 it.each([401,403,500])('does not parse error bodies or report empty history for HTTP%d',async status=>{
  const json=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status,json})));await expect(readHistory('claims','synthetic',new AbortController().signal,parseClaimHistory)).rejects.toMatchObject({authentication:status===401||status===403});expect(json).not.toHaveBeenCalled();
 });
 it('rejects a late JSON body after cancellation',async()=>{
  const abort=new AbortController();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>{abort.abort();return [tx];}})));
  await expect(readHistory('account','synthetic',abort.signal,parseAccountHistory)).rejects.toBeInstanceOf(HistoryReadError);
 });
});
