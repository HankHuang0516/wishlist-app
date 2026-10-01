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
  it('confirms the edited values and clears an old success notice before opening another editor',async()=>{
    items=[wish];const base=api.getMockImplementation()!;api.mockImplementation(async(...args)=>{
      if(args[1]==='/native-wishes/items/4'&&args[2]?.method==='PUT'){const result={...wish,...JSON.parse(args[2].body as string)};items=[result];return result;}
      return base(...args);
    });mount(1);await screen.findByText('合成願望');const edit=screen.getByRole('button',{name:'編輯願望'});await waitFor(()=>expect(edit).toBeEnabled());fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText('願望名稱（有照片可留空）'),{target:{value:'已更新合成願望'}});fireEvent.change(screen.getByLabelText('最高預算（選填） · TWD'),{target:{value:'725.25'}});fireEvent.click(screen.getByRole('button',{name:'儲存願望資料'}));
    await screen.findByText('後台已確認願望資料修改。');expect(screen.getByText('已更新合成願望')).toBeInTheDocument();expect(screen.getByText('最高預算 TWD 725.25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'編輯願望'}));expect(screen.queryByText('後台已確認願望資料修改。')).not.toBeInTheDocument();expect(screen.getByLabelText('願望名稱（有照片可留空）')).toHaveValue('已更新合成願望');
  });
  it.each(['name','maxPrice','notes'])('does not claim a mismatched edited wish field was saved: %s',async field=>{
    items=[wish];const base=api.getMockImplementation()!;api.mockImplementation(async(...args)=>{
      if(args[1]==='/native-wishes/items/4'&&args[2]?.method==='PUT'){const result={...wish,...JSON.parse(args[2].body as string)};return {...result,[field]:wish[field as keyof typeof wish]};}
      return base(...args);
    });mount(1);await screen.findByText('合成願望');const edit=screen.getByRole('button',{name:'編輯願望'});await waitFor(()=>expect(edit).toBeEnabled());fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText('願望名稱（有照片可留空）'),{target:{value:'新合成願望'}});fireEvent.change(screen.getByLabelText('最高預算（選填） · TWD'),{target:{value:'725.25'}});fireEvent.change(screen.getByLabelText('備註（公開清單會顯示）'),{target:{value:'新合成備註'}});fireEvent.click(screen.getByRole('button',{name:'儲存願望資料'}));
    await screen.findByText('回覆與送出的願望欄位不一致，尚未確認更新');expect(screen.queryByText('後台已確認願望資料修改。')).not.toBeInTheDocument();expect(screen.getByLabelText('願望名稱（有照片可留空）')).toBeDisabled();expect(api.mock.calls.filter(call=>call[2]?.method==='PUT')).toHaveLength(1);
  });
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

describe('wish photo removal recovery UI', () => {
  const mediaId = 'fab22941-2df0-4ca4-90c2-70c504527243';
  const photoBody = JSON.stringify({ version: 1, clientUploadId: clientRequestId, digest: 'a'.repeat(64) });
  const removalBody = JSON.stringify({ version: 1, mediaId, photoBody });
  const receipt = { clientUploadId: clientRequestId, mediaId, removed: true, removedAt: '2026-10-01T01:00:00.000Z', cleanupPending: true };
  const photo = { id: mediaId, imageUrl: `${getFullApiUrl()}/listing-media/${mediaId}/image`, thumbnailUrl: `${getFullApiUrl()}/listing-media/${mediaId}/thumbnail`, width: 100, height: 100, byteSize: 100, listingId: null, wishItemId: null };
  function fixtureRemoval() { data.set('42.wish-photo', photoBody); data.set('42.wish-photo-remove', removalBody); }
  function routes(removal: () => unknown) {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => {
      if (args[1].includes('/photo-removals/')) return removal();
      if (args[1].startsWith('/listing-media/by-upload-id/')) return photo;
      return base(...args);
    });
  }
  it('recovers a committed removal with GET only, clears exact journals and honestly labels physical cleanup pending', async () => {
    fixtureRemoval(); routes(() => receipt); mount();
    await screen.findByText('後台已移除照片引用，實體檔案仍待清理；不會重建原照片。');
    await waitFor(() => expect(data.has('42.wish-photo-remove')).toBe(false));
    expect(data.has('42.wish-photo')).toBe(false); expect(posts()).toHaveLength(0);
    expect(api.mock.calls.some(call => call[2]?.method === 'DELETE')).toBe(false);
    expect(api.mock.calls.some(call => call[1].startsWith('/listing-media/by-upload-id/'))).toBe(false);
  });
  it('preserves missing-receipt and missing-photo operations, freezing new creates instead of claiming deletion', async () => {
    fixtureRemoval(); routes(() => { throw new Error('404'); });
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => { if (args[1].startsWith('/listing-media/by-upload-id/')) throw new Error('404'); return base(...args); });
    mount(); await screen.findByRole('button', { name: '明確重試原照片移除' });
    await waitFor(() => expect(screen.getByRole('button', { name: '只查核原照片移除回執' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '建立願望清單' })).toBeDisabled();
    expect(screen.getByText(/原照片移除仍待確認；查不到照片不等於已移除/)).toBeInTheDocument();
    expect(data.get('42.wish-photo-remove')).toBe(removalBody); expect(posts()).toHaveLength(0);
  });
  it('keeps a known removal when local cleanup fails, then retries local cleanup without another HTTP mutation', async () => {
    fixtureRemoval(); routes(() => receipt); store.clear.mockRejectedValueOnce(new Error('quota'));
    mount(); await screen.findByRole('button', { name: '只重試照片本機清理' });
    expect(screen.queryByRole('button', { name: '明確重試原照片移除' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '只重試照片本機清理' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '只重試照片本機清理' }));
    await waitFor(() => expect(data.has('42.wish-photo-remove')).toBe(false));
    expect(api.mock.calls.filter(call => call[1].includes('/photo-removals/'))).toHaveLength(1);
    expect(posts()).toHaveLength(0);
  });
  it('explicitly retries exactly the original removal, and double-clicking sends only one POST', async () => {
    fixtureRemoval(); routes(() => { throw new Error('unknown'); });
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (...args) => args[1].includes('/photo-removals/') && args[2]?.method === 'POST' ? receipt : base(...args));
    mount(); await waitFor(() => expect(screen.getByRole('button', { name: '明確重試原照片移除' })).toBeEnabled());
    const retry = screen.getByRole('button', { name: '明確重試原照片移除' }); fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(data.has('42.wish-photo-remove')).toBe(false));
    expect(posts()).toHaveLength(1); expect(posts()[0][1]).toBe('/native-wishes/photo-removals/' + clientRequestId);
    expect(posts()[0][2].body).toBe(JSON.stringify({ mediaId }));
  });
  it('never discards a different photo journal saved by another tab', async () => {
    fixtureRemoval(); const newer = JSON.stringify({ version: 1, clientUploadId: mediaId, digest: 'b'.repeat(64) });
    routes(() => { data.set('42.wish-photo', newer); return receipt; }); mount(1);
    await waitFor(() => expect(data.has('42.wish-photo-remove')).toBe(false));
    expect(data.get('42.wish-photo')).toBe(newer);
    expect(store.clear.mock.calls.some(call => call[0] === '42.wish-photo')).toBe(false);
    expect(api.mock.calls.some(call => call[1] === '/listing-media/by-upload-id/' + mediaId)).toBe(true);
    expect(posts()).toHaveLength(0);
  });
  it('rejects corrupted removal journals before any private HTTP or mutation', async () => {
    data.set('42.wish-photo-remove', 'bad'); mount(); await screen.findByRole('alert');
    expect(api).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '建立願望清單' })).toBeDisabled();
    expect(data.get('42.wish-photo-remove')).toBe('bad');
  });
  it('does not clear late receipts after leaving the account', async () => {
    fixtureRemoval(); let finish!: (value: unknown) => void;
    routes(() => new Promise(resolve => { finish = resolve; })); const view = mount();
    await waitFor(() => expect(finish).toBeDefined()); view.unmount(); await act(async () => finish(receipt));
    expect(store.clear).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0); expect(data.get('42.wish-photo-remove')).toBe(removalBody);
  });
  it('labels completed physical cleanup only when the durable receipt says no cleanup remains', async () => {
    fixtureRemoval(); routes(() => ({ ...receipt, cleanupPending: false })); mount();
    await screen.findByText('後台已確認照片移除與實體檔案清理。'); expect(posts()).toHaveLength(0);
  });
  it('requires explicit photo confirmation, permits cancellation, and persists before only one removal', async () => {
    data.set('42.wish-photo', photoBody); routes(() => receipt); mount(1);
    await waitFor(() => expect(screen.getByRole('button', { name: '新增願望 · 拍照／上傳／手動' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '新增願望 · 拍照／上傳／手動' }));
    fireEvent.click(screen.getByRole('button', { name: '移除未使用照片' }));
    expect(posts()).toHaveLength(0); expect(screen.getByText(/確定移除這張未使用照片/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保留這張照片' })); expect(posts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '移除未使用照片' }));
    const confirm = screen.getByRole('button', { name: '確認移除未使用照片' }); fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(data.has('42.wish-photo-remove')).toBe(false));
    expect(posts()).toHaveLength(1);
    expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder.find((_, i) => api.mock.calls[i][2]?.method === 'POST')!);
    expect(screen.getByLabelText('AI 商品圖片網址（HTTPS）')).toBeEnabled();
  });
});
