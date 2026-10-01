import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { getFullApiUrl } from '../config';
import WishesPage, { WishesSession } from './WishesPage';
const { api, data, store }=vi.hoisted(()=>({api:vi.fn(),data:new Map<string,string>(),store:{get:vi.fn(),save:vi.fn(),clear:vi.fn()}}));
vi.mock('../lib/marketplaceApi',async original=>({...await original<typeof import('../lib/marketplaceApi')>(),api}));
vi.mock('../lib/webPendingStore',async original=>({...await original<typeof import('../lib/webPendingStore')>(),privatePendingStore:store,pendingRequestKey:async(_api:string,id:number,feature:string)=>`${id}.${feature}`}));
const list={id:1,title:'合成清單',description:null,isPublic:false,maxItems:100,_count:{items:0}},wish={id:4,wishlistId:1,name:'合成願望',notes:'合成詳細說明',link:null,imageUrl:null,aiStatus:'COMPLETED',price:'59',currency:'TWD',aiLink:null,maxPrice:100,priceCurrency:'TWD',isHidden:false,isPurchased:false};
const clientRequestId='b5abf861-a66d-4072-876b-4f0ab3172dac',raw=JSON.stringify({kind:'ITEM',listId:1,body:JSON.stringify({clientRequestId,name:'合成願望'})});
let items:unknown[]=[];
const mount=(id:number|null=null)=>render(<MemoryRouter><WishesSession token="fixture" userId={42} initialListId={id}/></MemoryRouter>);
beforeEach(()=>{
  data.clear();items=[];api.mockReset();store.get.mockReset().mockImplementation(async(key:string)=>data.get(key)??null);store.save.mockReset().mockImplementation(async(key:string,body:string)=>{if(data.has(key)&&data.get(key)!==body)throw new Error('CAS');data.set(key,body);});store.clear.mockReset().mockImplementation(async(key:string,body:string)=>{if(data.get(key)!==body)return false;data.delete(key);return true;});
  api.mockImplementation(async(_token:string,path:string,init?:RequestInit)=>{
    if(path.includes('/receipts/'))throw new Error('not found');
    if(path==='/native-wishes/lists'&&init?.method==='POST')return{resource:list,replayed:false};
    if(path==='/native-wishes/lists')return{items:[list],nextCursor:null};
    if(path==='/native-wishes/lists/1/items'&&init?.method==='POST'){items=[wish];return{resource:wish,replayed:false};}
    if(path==='/native-wishes/lists/1')return{list,items,nextCursor:null};
    if(path==='/native-wishes/items/4'&&init?.method==='PUT')return{...wish,...JSON.parse(init.body as string)};
    throw new Error('unexpected fixture route');
  });
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const posts=()=>api.mock.calls.filter(c=>c[2]?.method==='POST');
describe('native-parity wish web workflows',()=>{
  it('requires login with an exact validated list return intent before any private read',()=>{
    const auth={user:null,token:null,isAuthenticated:false,login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn()};render(<MemoryRouter initialEntries={['/wishes?list=1']}><AuthContext.Provider value={auth}><WishesPage/></AuthContext.Provider></MemoryRouter>);
    expect(screen.getByRole('link',{name:'登入'})).toHaveAttribute('href','/login?next='+encodeURIComponent('/wishes?list=1'));expect(api).not.toHaveBeenCalled();
  });
  it('shows private list, accurate item count and legacy share/gift navigation',async()=>{
    mount();await screen.findByText('合成清單');expect(screen.getByText('私人 · 0 個願望 · 每份上限 100')).toBeInTheDocument();expect(screen.getByRole('link',{name:'原有清單分享、送禮與社交功能'})).toHaveAttribute('href','/dashboard');
    fireEvent.click(screen.getByRole('button',{name:'查看「合成清單」'}));await screen.findByRole('button',{name:'新增願望 · 拍照／上傳／手動'});expect(screen.getByRole('link',{name:'分享／送禮與標籤'})).toHaveAttribute('href','/wishlists/1');
  });
  it('does not describe a failed initial read as no lists or zero wishes',async()=>{
    api.mockRejectedValue(new Error('offline'));mount();await screen.findByRole('alert');expect(screen.queryByText(/尚無願望清單/)).not.toBeInTheDocument();expect(screen.queryByText('這個清單還沒有願望。')).not.toBeInTheDocument();
  });
  it('displays AI status/reference price, budget and native matching action without a guaranteed price claim',async()=>{
    items=[wish];mount(1);await screen.findByText('合成願望');expect(screen.getByText('AI 參考價格 TWD 59')).toBeInTheDocument();expect(screen.getByText('最高預算 TWD 100')).toBeInTheDocument();expect(screen.getByRole('link',{name:'查附近符合商品'})).toHaveAttribute('href','/explore?wish=4');
  });
  it('defaults new lists to private and saves before exactly one create on repeated clicks',async()=>{
    mount();await screen.findByText('合成清單');fireEvent.click(screen.getByRole('button',{name:'建立願望清單'}));const dialog=screen.getByRole('dialog');expect(within(dialog).getByRole('checkbox')).not.toBeChecked();fireEvent.change(within(dialog).getByLabelText('清單名稱'),{target:{value:'新合成清單'}});const submit=within(dialog).getByRole('button',{name:'儲存願望資料'});fireEvent.click(submit);fireEvent.click(submit);await waitFor(()=>expect(posts()).toHaveLength(1));expect(JSON.parse(posts()[0][2].body).isPublic).toBe(false);expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder.find((_,i)=>api.mock.calls[i][2]?.method==='POST')!);
  });
  it('keeps an exact uncertain create, disables replacements, then explicit retry uses identical bytes',async()=>{
    const base=api.getMockImplementation()!;let lost=true;api.mockImplementation(async(...args)=>{if(args[2]?.method==='POST'&&lost){lost=false;throw new Error('lost ACK');}return base(...args);});mount(1);await screen.findByRole('button',{name:'新增願望 · 拍照／上傳／手動'});fireEvent.click(screen.getByRole('button',{name:'新增願望 · 拍照／上傳／手動'}));fireEvent.change(screen.getByLabelText('願望名稱（有照片可留空）'),{target:{value:'合成願望'}});fireEvent.click(screen.getByRole('button',{name:'儲存願望資料'}));await screen.findByText(/有原建立待確認/);const original=posts()[0][2].body;expect(screen.getByLabelText('願望名稱（有照片可留空）')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'明確重試相同建立'}));await screen.findByText('合成願望');expect(posts().map(c=>c[2].body)).toEqual([original,original]);expect(data.has('42.wish-create')).toBe(false);
  });
  it('restores committed receipt with GET only and handles tombstones without resurrecting data',async()=>{
    data.set('42.wish-create',raw);const base=api.getMockImplementation()!;api.mockImplementation(async(...args)=>args[1].includes('/receipts/')?{clientRequestId,kind:'ITEM',resourceId:4,deleted:true,resource:null}:base(...args));mount();await screen.findByText('原建立資料已刪除，不會重新建立替代品。');expect(posts()).toHaveLength(0);expect(data.has('42.wish-create')).toBe(false);
  });
  it('does not clear an unrelated photo journal when another tab has a committed manual wish',async()=>{
    const mediaId='fab22941-2df0-4ca4-90c2-70c504527243', upload=JSON.stringify({version:1,clientUploadId:clientRequestId,digest:'a'.repeat(64)});
    data.set('42.wish-create',raw);data.set('42.wish-photo',upload);
    const base=api.getMockImplementation()!;
    api.mockImplementation(async(...args)=>{
      if(args[1].startsWith('/listing-media/by-upload-id/'))return{id:mediaId,imageUrl:`${getFullApiUrl()}/listing-media/${mediaId}/image`,thumbnailUrl:`${getFullApiUrl()}/listing-media/${mediaId}/thumbnail`,width:100,height:100,byteSize:100,listingId:null,wishItemId:null};
      if(args[1].includes('/receipts/'))return{clientRequestId,kind:'ITEM',resourceId:4,deleted:false,resource:wish};
      return base(...args);
    });
    mount();await screen.findByText('後台已確認建立；AI 狀態以最新資料為準。');
    await waitFor(()=>expect(data.has('42.wish-create')).toBe(false));expect(data.get('42.wish-photo')).toBe(upload);
    expect(store.clear.mock.calls.some(c=>c[0]==='42.wish-photo')).toBe(false);expect(posts()).toHaveLength(0);
  });
  it('preserves a known successful create when local cleanup fails and only retries cleanup',async()=>{
    store.clear.mockRejectedValueOnce(new Error('quota'));mount(1);await screen.findByRole('button',{name:'新增願望 · 拍照／上傳／手動'});fireEvent.click(screen.getByRole('button',{name:'新增願望 · 拍照／上傳／手動'}));fireEvent.change(screen.getByLabelText('願望名稱（有照片可留空）'),{target:{value:'合成願望'}});fireEvent.click(screen.getByRole('button',{name:'儲存願望資料'}));await screen.findByText(/原建立已確認/);expect(posts()).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'只重試本機清理'}));await screen.findByText('合成願望');expect(posts()).toHaveLength(1);
  });
  it('blocks HTTP if secure storage is unavailable and rejects damaged photo journals',async()=>{
    data.set('42.wish-photo','bad-json');mount();await screen.findByRole('alert');expect(screen.getByRole('button',{name:'建立願望清單'})).toBeDisabled();expect(posts()).toHaveLength(0);expect(data.get('42.wish-photo')).toBe('bad-json');
  });
  it('does not clear or POST a pending operation after account scope unmounts',async()=>{
    let finish!:(v:unknown)=>void;api.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=mount();await waitFor(()=>expect(finish).toBeDefined());view.unmount();await act(async()=>finish({items:[list],nextCursor:null}));expect(posts()).toHaveLength(0);expect(store.clear).not.toHaveBeenCalled();
  });
  it('requires a fresh GET after uncertain edits, not a blind toggle retry',async()=>{
    items=[wish];const base=api.getMockImplementation()!;api.mockImplementation(async(...args)=>{if(args[2]?.method==='PUT'){items=[{...wish,isHidden:true}];throw new Error('lost ACK');}return base(...args);});mount(1);await screen.findByText('合成願望');fireEvent.click(screen.getByRole('button',{name:'隱藏願望'}));await screen.findByText(/更新結果尚未確認/);expect(screen.getByRole('button',{name:'隱藏願望'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'只核對最新更新狀態'}));await screen.findByRole('button',{name:'取消隱藏'});expect(api.mock.calls.filter(c=>c[2]?.method==='PUT')).toHaveLength(1);
  });
  it('labels camera/library controls as optional and includes budget units rather than using the legacy analyze endpoint',async()=>{
    mount(1);await screen.findByRole('button',{name:'新增願望 · 拍照／上傳／手動'});fireEvent.click(screen.getByRole('button',{name:'新增願望 · 拍照／上傳／手動'}));expect(screen.getByText('快捷選用 · 照片交給 AI')).toBeInTheDocument();expect(screen.getByRole('button',{name:'拍攝願望照片'})).toBeInTheDocument();expect(screen.getByLabelText('最高預算（選填） · TWD')).toBeInTheDocument();expect(screen.getByLabelText('拍攝願望照片檔案')).toHaveAttribute('capture','environment');expect(api.mock.calls.some(c=>c[1].includes('/ai/analyze-image'))).toBe(false);
  });
});
