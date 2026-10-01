import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  vi.stubGlobal('fetch', fetcher); fetcher.mockReset().mockImplementation(async (url: string) => response(url.endsWith('/users/me') ? { maxWishlistItems: 100 } : url.endsWith('/users/7') ? { name: '合成朋友' } : [row]));
  window.localStorage.setItem('user-locale', 'zh-TW');
});
afterEach(() => vi.unstubAllGlobals());
describe('legacy wishlist read truth and account scope', () => {
  it('does not display zero totals or empty prompts after an HTTP failure, and supports a fresh retry', async () => {
    let fail = true; fetcher.mockImplementation(async (url: string) => response(url.endsWith('/wishlists') ? fail ? {} : [row] : { maxWishlistItems: 100 }, url.endsWith('/wishlists') && fail ? 503 : 200));
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
});
