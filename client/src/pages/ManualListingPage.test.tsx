import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ManualListingPage from './ManualListingPage';
import { API_URL } from '../config';
import { draftListingCreationJournal,parseListingCreationJournal } from '../lib/listingCreationWeb';
import { pendingRequestKey,privatePendingStore } from '../lib/webPendingStore';
const entries=vi.hoisted(()=>new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:{get:vi.fn(async(key:string)=>entries.get(key)??null),save:vi.fn(async(key:string,raw:string)=>{if(entries.has(key)&&entries.get(key)!==raw)throw Error('CAS');entries.set(key,raw);}),clear:vi.fn(async(key:string,raw:string)=>entries.get(key)===raw?entries.delete(key):false)}}));
const auth={user:{id:19,phoneNumber:'synthetic'},token:'synthetic-session',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const id='11111111-1111-4111-8111-111111111111',date='2026-10-03T00:00:00.000Z';
const view=(value=auth)=><MemoryRouter><AuthContext.Provider value={value}><ManualListingPage/></AuthContext.Provider></MemoryRouter>;
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
function listing(body:Record<string,unknown>,owner=19){return {id,ownerUserId:owner,owner:{id:owner,name:'合成草稿擁有者'},version:1,title:body.title,description:body.description??null,brand:body.brand??null,category:body.category,condition:body.condition,price:body.price===undefined?null:String(body.price),currency:'TWD',deliveryMethods:body.deliveryMethods,negotiable:body.negotiable,status:'DRAFT',createdAt:date,updatedAt:date,publishedAt:null,lastVerifiedAt:null,expiresAt:null,expiryMode:'DEFAULT_30_DAYS',location:null,media:[]};}
async function receipt(raw:string,owner=19,state='CREATED'){const j=await parseListingCreationJournal(raw);return {receipt:{clientListingId:j.payload.clientListingId,requestHash:j.requestHash,state,listingId:state==='CREATED'?id:null,createdAt:date},listing:state==='CREATED'?listing(j.payload,owner):null};}
const ready=()=>waitFor(()=>expect(screen.getByRole('button',{name:'儲存商品草稿（不公開）'})).toBeEnabled());
function name(){fireEvent.change(screen.getByLabelText('商品名稱'),{target:{value:'僅有名稱的合成草稿'}});}
beforeEach(()=>{entries.clear();vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);localStorage.setItem('user-locale','zh-TW');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.removeItem('user-locale');});
describe('manual listing real UI state transitions and original-operation recovery',()=>{
  it('gates private reads behind login with the manual-composer return path',()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(view({...auth,user:null,token:null,isAuthenticated:false} as unknown as typeof auth));expect(screen.getByRole('link',{name:'登入'})).toHaveAttribute('href','/login?next=%2Fsell%2Fmanual');expect(fetcher).not.toHaveBeenCalled();});
  it('saves a name-only server draft, and requires reading the result before starting a new item',async()=>{
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?ok(listing(JSON.parse(String(init.body)))):_url.includes('/creation-receipts/')?ok(await receipt([...entries.values()][0])):ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);
    render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await screen.findByText('商品草稿已儲存，尚未公開');
    const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({publish:false,consentToMap:false,mediaIds:[]});expect(JSON.parse(String(writes[0][1]?.body))).not.toHaveProperty('price');
    expect(screen.getByLabelText('商品名稱')).toBeDisabled();expect(entries.size).toBe(1);fireEvent.click(screen.getByRole('button',{name:'已讀結果，開始下一件'}));await ready();expect(entries.size).toBe(0);expect(screen.getByLabelText('商品名稱')).toHaveValue('');
  });
  it('restores a committed draft after lost ACK and remount through GET only, without creating a duplicate',async()=>{
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('ACK lost after commit');return url.includes('/creation-receipts/')?ok(await receipt([...entries.values()][0])):ok({items:[],nextCursor:null});});vi.stubGlobal('fetch',fetcher);
    const first=render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await screen.findByText(/送出結果尚未確認/);await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原商品結果'})).toBeEnabled());first.unmount();render(view());
    await screen.findByText('商品草稿已儲存，尚未公開');expect(screen.getByLabelText('商品名稱')).toHaveValue('僅有名稱的合成草稿');expect(fetcher.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);expect(entries.size).toBe(1);
  });
  it('keeps a missing receipt read-only until an explicit retry reuses exact original ID and body',async()=>{
    let committed=false;const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){if(!committed){committed=true;throw Error('did not reach server');}return ok(listing(JSON.parse(String(init.body))));}return url.includes('/creation-receipts/')?(fetcher.mock.calls.filter(([,i])=>i?.method==='POST').length>1?ok(await receipt([...entries.values()][0])):{ok:false,status:404,json:async()=>({errorCode:'LISTING_CREATE_NOT_FOUND'})}):ok({items:[],nextCursor:null});});vi.stubGlobal('fetch',fetcher);
    render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原商品結果'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'只查核原商品結果'}));await screen.findByText(/目前未查到原操作回執/);expect(fetcher.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'明確重試同一商品操作'}));await screen.findByText('商品草稿已儲存，尚未公開');const writes=fetcher.mock.calls.filter(([,i])=>i?.method==='POST');expect(writes).toHaveLength(2);expect(writes[1][1]?.body).toBe(writes[0][1]?.body);
  });
  it('cannot clear a replaced journal or proceed to a second item after CAS failure',async()=>{
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?ok(listing(JSON.parse(String(init.body)))):url.includes('/creation-receipts/')?ok(await receipt([...entries.values()][0])):ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);
    render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await screen.findByText('商品草稿已儲存，尚未公開');vi.mocked(privatePendingStore.clear).mockResolvedValueOnce(false);fireEvent.click(screen.getByRole('button',{name:'已讀結果，開始下一件'}));await screen.findByText(/本機紀錄已變更/);expect(entries.size).toBe(1);expect(screen.getByRole('button',{name:'儲存商品草稿（不公開）'})).toBeDisabled();
  });
  it('never posts when durable storage is unavailable',async()=>{
    const fetcher=vi.fn(async()=>ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);render(view());await ready();name();vi.mocked(privatePendingStore.save).mockRejectedValueOnce(Error('unavailable'));fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await screen.findByText(/安全保存失敗/);expect(fetcher.mock.calls.every((call:any[])=>call[1]?.method!=='POST')).toBe(true);expect(screen.getByLabelText('商品名稱')).toHaveValue('僅有名稱的合成草稿');
  });
  it('rereads a journal cleaned by another tab without silently creating a replacement item',async()=>{
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?ok(listing(JSON.parse(String(init.body)))):url.includes('/creation-receipts/')?ok(await receipt([...entries.values()][0])):ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await screen.findByText('商品草稿已儲存，尚未公開');entries.clear();fireEvent.click(screen.getByRole('button',{name:'已讀結果，開始下一件'}));await screen.findByText(/本機紀錄已變更/);fireEvent.click(screen.getByRole('button',{name:'重新讀取安全紀錄'}));await ready();expect(screen.getByLabelText('商品名稱')).toHaveValue('');expect(fetcher.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
  });
  it('rejects another owner receipt and does not clear the original journal',async()=>{
    const raw=await draftListingCreationJournal(JSON.stringify({clientListingId:id,title:'原帳號合成草稿',condition:'USED',category:'other',currency:'TWD',publish:false,consentToMap:false,mediaIds:[],deliveryMethods:[],negotiable:false}));entries.set(await pendingRequestKey(API_URL,19,'listing-manual-create'),raw);
    const fetcher=vi.fn(async(url:string)=>url.includes('/creation-receipts/')?ok(await receipt(raw,20)):ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);render(view());await screen.findByText(/前次商品操作尚未確認/);expect(screen.queryByText('商品草稿已儲存，尚未公開')).not.toBeInTheDocument();expect(entries.size).toBe(1);expect(screen.getByLabelText('商品名稱')).toBeDisabled();
  });
  it('ignores an old account POST completion and never reads its receipt under the replacement session',async()=>{
    let resolve!:(value:unknown)=>void;const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(r=>{resolve=r;}):ok({items:[],nextCursor:null}));vi.stubGlobal('fetch',fetcher);const page=render(view());await ready();name();fireEvent.click(screen.getByRole('button',{name:'儲存商品草稿（不公開）'}));await waitFor(()=>expect(resolve).toBeTypeOf('function'));const old=[...entries.values()][0];page.rerender(view({...auth,user:{id:20,phoneNumber:'another'},token:'synthetic-other'}));await ready();await act(async()=>resolve(ok(listing((await parseListingCreationJournal(old)).payload))));expect(fetcher.mock.calls.filter(([url])=>url.includes('/creation-receipts/'))).toEqual([]);expect(screen.getByLabelText('商品名稱')).toHaveValue('');expect(entries.size).toBe(1);
  });
  it('keeps public requirements while allowing private photos-list failure to save a text draft',async()=>{
    const fetcher=vi.fn(async()=>({ok:false,status:503,json:async()=>({errorCode:'SYNTHETIC_PHOTO_UNAVAILABLE'})}));vi.stubGlobal('fetch',fetcher);render(view());await ready();name();await screen.findByText(/私人照片暫時無法讀取/);fireEvent.click(screen.getByRole('button',{name:'確認並公開刊登'}));await screen.findByText('請填寫 3000 字內的商品狀況與說明。');expect(entries.size).toBe(0);expect(fetcher).toHaveBeenCalledOnce();
  });
});
