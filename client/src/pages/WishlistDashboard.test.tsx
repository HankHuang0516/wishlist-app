import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WishlistDashboard from './WishlistDashboard';
const { identity, store } = vi.hoisted(() => ({ identity: { token: 'fixture-a', user: { id: 42, name: '合成使用者', isPremium: false } }, store: { get: vi.fn(), save: vi.fn(), clear: vi.fn() } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => identity }));
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: store, pendingRequestKey: async (_api:string,id:number,feature:string)=>`${id}.${feature}` }));
const fetcher = vi.fn();
const row = { id: 1, title: '合成舊清單', description: null, isPublic: false, items: [{ id: 4 }, { id: 5 }] };
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const mount = (path = '/dashboard') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/dashboard" element={<WishlistDashboard />} /><Route path="/users/:userId/wishlists" element={<WishlistDashboard />} /></Routes></MemoryRouter>);
beforeEach(() => {
  identity.token = 'fixture-a'; identity.user.id = 42;
  store.get.mockReset().mockResolvedValue(null); store.save.mockReset().mockResolvedValue(undefined); store.clear.mockReset().mockResolvedValue(true);
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset().mockImplementation(async (url: string) => response(url.endsWith('/users/me') ? { id: 42, isPremium: false, maxWishlistItems: 100 } : url.endsWith('/users/7') ? { name: '合成朋友' } : [row]));
  window.localStorage.setItem('user-locale', 'zh-TW');
});
afterEach(() => vi.unstubAllGlobals());
describe('legacy wishlist read truth and account scope', () => {
  it('keeps English search, sorting and clear actions usable without changing loaded data or dispatching writes', async () => {
    window.localStorage.setItem('user-locale', 'en-US');
    const rows = [{ ...row, id: 3, title: 'Zebra list', isPublic: true }, { ...row, id: 2, title: 'Apple list' }, { ...row, title: 'Middle list' }];
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) => url.endsWith('/wishlists') ? response(rows) : base(url, init));
    mount(); await screen.findByRole('link', { name: 'Zebra list' });
    const order = () => screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/wishlists/')).map(link => link.textContent);
    expect(order()).toEqual(['Zebra list', 'Apple list', 'Middle list']);
    fireEvent.change(screen.getByRole('combobox', { name: 'List order' }), { target: { value: 'oldest' } }); expect(order()).toEqual(['Middle list', 'Apple list', 'Zebra list']);
    fireEvent.change(screen.getByRole('combobox', { name: 'List order' }), { target: { value: 'name' } }); expect(order()).toEqual(['Apple list', 'Middle list', 'Zebra list']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search lists' }), { target: { value: 'absent' } }); expect(screen.getByText('No loaded lists match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear list search' })); expect(order()).toEqual(['Apple list', 'Middle list', 'Zebra list']);
    expect(screen.getByRole('link', { name: 'Apple list' })).toHaveAttribute('href', '/wishlists/2');
    expect(screen.getByText('Visible to everyone')).toBeInTheDocument(); expect(screen.getAllByText('Visible only to me')).toHaveLength(2);
    expect(fetcher.mock.calls.some(call => call[1]?.method)).toBe(false);
  });
  it('labels the English create form and keeps its original private default and original-operation recovery link', async () => {
    window.localStorage.setItem('user-locale', 'en-US'); mount(); await screen.findByText('合成舊清單');
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Create New Wishlist' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '+ Create New Wishlist' }));
    expect(screen.getByRole('textbox', { name: 'List title' })).toBeInTheDocument(); expect(screen.getByRole('textbox', { name: 'List description · optional' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Close list creation' }));
    expect(screen.getByRole('link', { name: /Photo and AI wishes/ })).toHaveAttribute('href', '/wishes');
  });
  it('renders English current-state recovery while retaining the original marker and never automatically mutating', async () => {
    window.localStorage.setItem('user-locale', 'en-US');
    const raw = JSON.stringify({ version: 1, id: 1, kind: 'PRIVACY', wanted: true, localOperationId: '11111111-1111-4111-8111-111111111111' });
    store.get.mockImplementation(async key => key === '42.legacy-list-operation' ? raw : null); mount();
    await screen.findByRole('region', { name: 'Original list operation check' });
    expect(screen.getByRole('button', { name: 'Make list public' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Read current list state' }));
    await screen.findByText(/This is not a historical receipt/); expect(store.clear).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Acknowledge current state, clear marker and resume' })).toBeEnabled();
    expect(fetcher.mock.calls.some(call => call[1]?.method)).toBe(false);
  });
  it('renders safe English labels when optional locale storage fails, without bypassing recovery storage', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw Error('synthetic locale failure'); });
    try { mount(); await screen.findByText('合成舊清單'); expect(screen.getByRole('combobox', { name: 'List order' })).toBeInTheDocument(); expect(store.get).toHaveBeenCalledWith('42.legacy-list-operation'); }
    finally { vi.restoreAllMocks(); }
  });
  it('renders the visible wishlist count in the selected English language',async()=>{
    window.localStorage.setItem('user-locale','en-US');mount();await screen.findByText('合成舊清單');expect(screen.getByText('2 wishes')).toBeInTheDocument();expect(screen.queryByText('dashboard.items')).not.toBeInTheDocument();
  });
  it('does not display zero totals or empty prompts after an HTTP failure, and supports a fresh retry', async () => {
    let fail = true; fetcher.mockImplementation(async (url: string) => response(url.endsWith('/wishlists') ? fail ? {} : [row] : { id: 42, isPremium: false, maxWishlistItems: 100 }, url.endsWith('/wishlists') && fail ? 503 : 200));
    mount(); await screen.findByRole('alert'); expect(screen.getByText('尚未確認')).toBeInTheDocument(); expect(screen.queryByText('還沒有願望清單')).not.toBeInTheDocument();
    fail = false; fireEvent.click(screen.getByRole('button', { name: '重新讀取清單' })); await screen.findByText('合成舊清單'); expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByText('2 個願望')).toBeInTheDocument();
  });
  it.each([{}, [{ ...row, title: 3 }], [row, row], [{ ...row, items: null }]])('rejects malformed or duplicate list responses rather than inventing empty data %#', async data => {
    fetcher.mockImplementation(async (url: string) => response(url.endsWith('/wishlists') ? data : {})); mount(); await screen.findByRole('alert'); expect(screen.queryByText('還沒有願望清單')).not.toBeInTheDocument();
  });
  it('shows one translated empty state, private default, clear labels and the APP photo recovery entry', async () => {
    fetcher.mockImplementation(async () => response([])); mount(); await screen.findByText('還沒有願望清單'); expect(screen.queryByText('dashboard.noWishlists')).not.toBeInTheDocument(); expect(screen.queryByText('開啟您的願望之旅')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /拍照／AI 願望/ })).toHaveAttribute('href', '/wishes'); expect(screen.getByRole('combobox', { name: '清單排序' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ 建立新願望清單' })); expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('does not offer visitors a create button in an empty public profile', async () => {
    fetcher.mockImplementation(async () => response([])); mount('/users/7/wishlists'); await screen.findByText('還沒有願望清單'); expect(screen.queryByRole('button', { name: /建立/ })).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: /拍照／AI/ })).not.toBeInTheDocument();
  });
  it('never issues a request for an invalid public owner identifier', () => { mount('/users/0/wishlists'); expect(screen.getByRole('alert')).toHaveTextContent('無效'); expect(fetcher).not.toHaveBeenCalled(); });
  it('does not apply an old account response after a keyed account switch', async () => {
    let finish!: (value: unknown) => void;
    fetcher.mockImplementation((url: string, init: RequestInit) => url.endsWith('/wishlists') && init.headers && (init.headers as Record<string,string>).Authorization === 'Bearer fixture-a' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(url.endsWith('/wishlists') ? [{ ...row, title: '新帳號清單' }] : {})));
    const view = mount(); await waitFor(() => expect(finish).toBeDefined()); identity.token = 'fixture-b'; identity.user.id = 43;
    view.rerender(<MemoryRouter><WishlistDashboard /></MemoryRouter>); await screen.findByText('新帳號清單'); await act(async () => finish(response([row]))); expect(screen.queryByText('合成舊清單')).not.toBeInTheDocument();
  });
  it('uses the same durable native list creation, private default and synchronous double-submit gate', async () => {
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url: string, init: RequestInit) => init?.method === 'POST' ? response({replayed:false,resource:{id:2,title:'新合成清單',description:null,isPublic:false,maxItems:100,_count:{items:0}}},201) : base(url,init));
    mount(); await screen.findByText('合成舊清單'); await waitFor(()=>expect(screen.getByRole('button',{name:'+ 建立新願望清單'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'+ 建立新願望清單'}));
    fireEvent.change(screen.getByLabelText('清單名稱'),{target:{value:'新合成清單'}}); const submit=screen.getByRole('button',{name:'建立清單',exact:true});fireEvent.click(submit);fireEvent.click(submit);
    await screen.findByText('新合成清單');const posts=fetcher.mock.calls.filter(c=>c[1]?.method==='POST');expect(posts).toHaveLength(1);expect(posts[0][0]).toContain('/native-wishes/lists');expect(JSON.parse(posts[0][1].body).isPublic).toBe(false);expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder.find((_,i)=>fetcher.mock.calls[i][1]?.method==='POST')!);
  });
  it('restores an uncertain create as a recovery entry without automatically posting',async()=>{
    store.get.mockResolvedValue(JSON.stringify({kind:'LIST',listId:null,body:JSON.stringify({clientRequestId:'b5abf861-a66d-4072-876b-4f0ab3172dac',title:'原合成清單',isPublic:false})}));
    mount();await screen.findByText(/原建立或本機恢復標記待確認/);expect(screen.getByRole('button',{name:'+ 建立新願望清單'})).toBeDisabled();expect(screen.getByRole('link',{name:'查核原建立，不自動重送'})).toHaveAttribute('href','/wishes');expect(fetcher.mock.calls.some(c=>c[1]?.method==='POST')).toBe(false);
  });
  it('does not POST after the original account unmounts while durable save is pending',async()=>{
    let finish!:()=>void;store.save.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));const view=mount();await screen.findByText('合成舊清單');await waitFor(()=>expect(screen.getByRole('button',{name:'+ 建立新願望清單'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'+ 建立新願望清單'}));fireEvent.change(screen.getByLabelText('清單名稱'),{target:{value:'延遲合成清單'}});fireEvent.click(screen.getByRole('button',{name:'建立清單',exact:true}));await waitFor(()=>expect(finish).toBeDefined());view.unmount();await act(async()=>finish());expect(fetcher.mock.calls.some(c=>c[1]?.method==='POST')).toBe(false);
  });
  it('persists before one privacy dispatch and checks the actual ACK before changing visibility', async () => {
    let finish!: (value: unknown) => void; const base=fetcher.getMockImplementation()!;
    let raw:string|null=null;store.save.mockImplementation(async(_key,value)=>{raw=value;});store.get.mockImplementation(async key=>key==='42.legacy-list-operation'?raw:null);
    fetcher.mockImplementation((url: string, init: RequestInit) => init?.method==='PUT' ? new Promise(resolve=>{finish=resolve;}) : base(url,init));
    mount(); const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());
    fireEvent.click(toggle);fireEvent.click(toggle);await waitFor(()=>expect(finish).toBeTypeOf('function'));
    const calls=fetcher.mock.calls.filter(call=>call[1]?.method==='PUT');expect(calls).toHaveLength(1);expect(calls[0][1]).toMatchObject({cache:'no-store',redirect:'error'});
    expect(store.save.mock.calls[0][0]).toBe('42.legacy-list-operation');expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder.find((_,i)=>fetcher.mock.calls[i][1]?.method==='PUT')!);
    expect(screen.queryByRole('button',{name:'設為私人清單'})).not.toBeInTheDocument();
    await act(async()=>finish(response({...row,userId:42,isPublic:true})));await screen.findByText('後台已確認清單操作。');
    expect(screen.getByRole('button',{name:'設為私人清單'})).toBeEnabled();expect(store.clear).toHaveBeenCalledWith('42.legacy-list-operation',expect.any(String));
  });
  it.each([{...row,id:2,userId:42,isPublic:true},{...row,userId:43,isPublic:true},{...row,userId:42,isPublic:false},{}])('keeps a mismatched privacy ACK unknown and does not change the local flag %#',async ack=>{
    const base=fetcher.getMockImplementation()!;fetcher.mockImplementation((url: string,init: RequestInit)=>init?.method==='PUT'?Promise.resolve(response(ack)):base(url,init));
    mount();const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);
    await screen.findByText(/清單操作結果尚未確認/);expect(toggle).toBeDisabled();expect(store.clear).not.toHaveBeenCalled();expect(screen.queryByText('後台已確認清單操作。')).not.toBeInTheDocument();
  });
  it('reopens a lost privacy marker without PUT and requires current-state read plus acknowledgment before resuming',async()=>{
    const raw=JSON.stringify({version:1,id:1,kind:'PRIVACY',wanted:true,localOperationId:'11111111-1111-4111-8111-111111111111'});store.get.mockImplementation(async key=>key==='42.legacy-list-operation'?raw:null);
    const base=fetcher.getMockImplementation()!;fetcher.mockImplementation((url: string,init: RequestInit)=>url.endsWith('/wishlists')?Promise.resolve(response([{...row,isPublic:true}])):base(url,init));
    mount();await screen.findByRole('region',{name:'原清單操作查核'});expect(fetcher.mock.calls.some(call=>call[1]?.method==='PUT')).toBe(false);expect(screen.getByRole('button',{name:'設為私人清單'})).toBeDisabled();
    expect(screen.queryByRole('button',{name:'已讀目前狀態，清理標記並恢復操作'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'讀取目前清單狀態'}));await screen.findByText(/這不是原操作的歷史回執/);
    fireEvent.click(screen.getByRole('button',{name:'已讀目前狀態，清理標記並恢復操作'}));await waitFor(()=>expect(screen.getByRole('button',{name:'設為私人清單'})).toBeEnabled());
    expect(store.clear).toHaveBeenCalledWith('42.legacy-list-operation',raw);expect(fetcher.mock.calls.some(call=>call[1]?.method==='PUT')).toBe(false);
  });
  it('does not offer resume when the current-state read fails',async()=>{
    const raw=JSON.stringify({version:1,id:1,kind:'DELETE',localOperationId:'11111111-1111-4111-8111-111111111111'});store.get.mockImplementation(async key=>key==='42.legacy-list-operation'?raw:null);mount();await screen.findByRole('region',{name:'原清單操作查核'});
    fetcher.mockImplementation(async()=>response({},503));fireEvent.click(screen.getByRole('button',{name:'讀取目前清單狀態'}));await screen.findByText('目前狀態仍未確認，原標記保留。');
    expect(screen.queryByRole('button',{name:'已讀目前狀態，清理標記並恢復操作'})).not.toBeInTheDocument();expect(store.clear).not.toHaveBeenCalled();
  });
  it('retains confirmed visibility if local cleanup fails and only retries cleanup',async()=>{
    store.clear.mockRejectedValueOnce(Error('storage'));const base=fetcher.getMockImplementation()!;let raw:string|null=null;
    store.save.mockImplementation(async(_key,value)=>{raw=value;});store.get.mockImplementation(async key=>key==='42.legacy-list-operation'?raw:null);
    fetcher.mockImplementation((url: string,init: RequestInit)=>init?.method==='PUT'?Promise.resolve(response({...row,userId:42,isPublic:true})):base(url,init));
    mount();const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);
    await screen.findByText(/後台已確認操作，但本機標記未清理/);expect(screen.getByRole('button',{name:'設為私人清單'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'清理已確認操作的本機標記'}));await waitFor(()=>expect(screen.getByRole('button',{name:'設為私人清單'})).toBeEnabled());expect(fetcher.mock.calls.filter(call=>call[1]?.method==='PUT')).toHaveLength(1);
  });
  it('never dispatches privacy after storage failure or account departure during durable save',async()=>{
    let finish!:()=>void;store.save.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));const view=mount();const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);
    await waitFor(()=>expect(finish).toBeTypeOf('function'));view.unmount();await act(async()=>finish());expect(fetcher.mock.calls.some(call=>call[1]?.method==='PUT')).toBe(false);expect(store.clear).not.toHaveBeenCalled();
  });
  it('does not overwrite a different tab marker or dispatch when saving fails',async()=>{
    store.save.mockRejectedValue(Error('CAS'));mount();const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());
    const other=JSON.stringify({version:1,id:2,kind:'DELETE',localOperationId:'22222222-2222-4222-8222-222222222222'});store.get.mockImplementation(async key=>key==='42.legacy-list-operation'?other:null);fireEvent.click(toggle);await screen.findByText(/無法安全恢復或保存清單操作/);expect(toggle).toBeDisabled();expect(fetcher.mock.calls.some(call=>call[1]?.method==='PUT')).toBe(false);expect(store.clear).not.toHaveBeenCalled();
  });
  it('ignores a late privacy ACK after the original account is replaced',async()=>{
    let finish!:(value:unknown)=>void;const base=fetcher.getMockImplementation()!;
    fetcher.mockImplementation((url: string,init: RequestInit)=>init?.method==='PUT'?new Promise(resolve=>{finish=resolve;}):url.endsWith('/wishlists')&&identity.user.id===43?Promise.resolve(response([{...row,title:'另一合成清單'}])):base(url,init));
    const view=mount();const toggle=await screen.findByRole('button',{name:'設為公開清單'});await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);await waitFor(()=>expect(finish).toBeTypeOf('function'));
    identity.user.id=43;identity.token='fixture-b';view.rerender(<MemoryRouter><WishlistDashboard/></MemoryRouter>);await screen.findByText('另一合成清單');await act(async()=>finish(response({...row,userId:42,isPublic:true})));
    expect(store.clear).not.toHaveBeenCalled();expect(screen.queryByText('後台已確認清單操作。')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'設為公開清單'})).toBeInTheDocument();
  });
  it('opens a named deletion dialog and cancels without deleting, returning focus',async()=>{
    mount();const trigger=await screen.findByRole('button',{name:'刪除',exact:true});await waitFor(()=>expect(trigger).toBeEnabled());trigger.focus();fireEvent.click(trigger);const dialog=await screen.findByRole('dialog',{name:/合成舊清單/});expect(dialog).toHaveFocus();fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();expect(fetcher.mock.calls.some(call=>call[1]?.method==='DELETE')).toBe(false);
  });
  it('requires an exact deletion ACK and blocks double submit and closing while pending',async()=>{
    let finish!:(value:unknown)=>void;const base=fetcher.getMockImplementation()!;fetcher.mockImplementation((url: string,init: RequestInit)=>init?.method==='DELETE'?new Promise(resolve=>{finish=resolve;}):base(url,init));
    mount();const trigger=await screen.findByRole('button',{name:'刪除',exact:true});await waitFor(()=>expect(trigger).toBeEnabled());fireEvent.click(trigger);const dialog=await screen.findByRole('dialog');const submit=within(dialog).getByRole('button',{name:'刪除',exact:true});fireEvent.click(submit);fireEvent.click(submit);await waitFor(()=>expect(finish).toBeTypeOf('function'));fireEvent.keyDown(dialog,{key:'Escape'});expect(dialog).toBeInTheDocument();
    await act(async()=>finish(response({id:1,deleted:true,message:'ignored'})));await screen.findByText('後台已確認清單操作。');expect(screen.queryByText('合成舊清單')).not.toBeInTheDocument();expect(fetcher.mock.calls.filter(call=>call[1]?.method==='DELETE')).toHaveLength(1);
  });
  it('does not delete a visible card for a message-only legacy ACK',async()=>{
    const base=fetcher.getMockImplementation()!;fetcher.mockImplementation((url: string,init: RequestInit)=>init?.method==='DELETE'?Promise.resolve(response({message:'raw secret'})):base(url,init));mount();const trigger=await screen.findByRole('button',{name:'刪除',exact:true});await waitFor(()=>expect(trigger).toBeEnabled());fireEvent.click(trigger);const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'刪除',exact:true}));await screen.findByText(/清單操作結果尚未確認/);expect(screen.getByText('合成舊清單')).toBeInTheDocument();expect(screen.queryByText('raw secret')).not.toBeInTheDocument();expect(store.clear).not.toHaveBeenCalled();
  });
  it('keeps unknown capacity instead of premium or default guesses and allows a fresh own-profile read',async()=>{
    let valid=false;const base=fetcher.getMockImplementation()!;fetcher.mockImplementation((url: string,init: RequestInit)=>url.endsWith('/users/me')?Promise.resolve(response(valid?{id:42,isPremium:false,maxWishlistItems:0}:{})):base(url,init));
    mount();await screen.findByText('合成舊清單');expect(screen.getByText(/上限 尚未確認/)).toBeInTheDocument();valid=true;fireEvent.click(screen.getByRole('button',{name:'重新讀取清單上限'}));await screen.findByText(/上限 1/);
  });
});
