import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SettingsPage from './SettingsPage';
import { parseProfileJournal } from '../lib/profileWeb';
import { privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
const pending = vi.hoisted(() => new Map<string,string>());
vi.mock('../lib/webPendingStore',async importOriginal => ({ ...await importOriginal<typeof import('../lib/webPendingStore')>(), privatePendingStore: {
  get: vi.fn(async (key: string) => pending.get(key) ?? null), save: vi.fn(async (key: string,body: string) => { if (pending.has(key) && pending.get(key) !== body) throw new Error(); pending.set(key,body); }), clear: vi.fn(async (key:string,body:string) => { if (pending.get(key) !== body) return false; pending.delete(key); return true; })
} }));
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const profile = { id: 19, profileVersion: 0, name: '合成帳號', phoneNumber: 'fixture', nicknames: '合成暱稱', birthday: '1993-05-16', isPremium: false,
  isAvatarVisible: false, isRealNameVisible: false, isBirthdayVisible: false, isAddressVisible: false, isPhoneVisible: false, isEmailVisible: false, marketingEmailsEnabled: false };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><SettingsPage /></AuthContext.Provider></MemoryRouter>;
beforeEach(() => { pending.clear(); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('settings hub retains web-only functionality while adding app actions', () => {
  it('has one birthday field and accessible visibility labels alongside app and legacy entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ok(url.endsWith('/availability') ? { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 0, paidPurchasesAvailable: false }
      : url.endsWith('/ai-usage') ? { used: 1, limit: 3, isUnlimited: false } : profile)));
    render(view()); await screen.findByRole('heading', { name: '個人資料' });
    const contact = screen.getByText('聯絡資料與公開權限').closest('details')!;
    expect(contact).not.toHaveAttribute('open');
    expect(contact.querySelector('summary')).toHaveTextContent('手機隱藏 · 信箱隱藏');
    contact.setAttribute('open', '');
    expect(screen.getAllByLabelText('生日')).toHaveLength(1);
    for (const label of ['公開生日', '公開手機號碼', '公開真實姓名', '公開電子信箱', '公開寄送地址']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /我的商品 · 閱覽與管理/ })).toHaveAttribute('href', '/my-listings');
    expect(screen.getByRole('link', { name: /刊登好物/ })).toHaveAttribute('href', '/sell');
    expect(screen.getByRole('link', { name: /通知設定/ })).toHaveAttribute('href', '/settings/notifications');
    const advanced = screen.getByText('進階功能').closest('details')!;
    expect(advanced).not.toHaveAttribute('open'); advanced.setAttribute('open', '');
    expect(screen.getByRole('link', { name: /查看贊助與購買紀錄/ })).toHaveAttribute('href', '/purchase-history');
    expect(screen.getByRole('button', { name: /一鍵複製 AI 指令/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上傳大頭照' })).toHaveAttribute('tabindex', '0');
  });
  it('keeps a visible camera affordance and opens the photo chooser from Enter and Space, not from focus', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => ok(url.endsWith('/availability') ? { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 0, paidPurchasesAvailable: false } : profile));
    vi.stubGlobal('fetch', fetcher);
    render(view());
    const upload = await screen.findByRole('button', { name: '上傳大頭照' });
    expect(upload).toHaveClass('settings-avatar-upload');
    expect(upload.querySelector('span[aria-hidden="true"] svg')).toBeInTheDocument();
    const chooser = upload.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(chooser, 'click');
    upload.focus(); expect(click).not.toHaveBeenCalled();
    fireEvent.keyDown(upload, { key: 'Enter' });
    expect(click).toHaveBeenCalledOnce();
    fireEvent.keyDown(upload, { key: ' ' });
    expect(click).toHaveBeenCalledTimes(2);
    fireEvent.click(upload);
    expect(click).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => !(init as RequestInit | undefined)?.method)).toBe(true);
  });
  it('does not show nickname saved just because a field blurred before an HTTP acknowledgement', async () => {
    let ack!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST' ? new Promise(resolve => { ack = resolve; }) : ok(url.endsWith('/availability') ? { freeMonthlyLimit: 3, freeUsedThisMonth: 1, permanentCreditsRemaining: 0, paidPurchasesAvailable: false } : profile)));
    render(view()); const input = await screen.findByLabelText('暱稱');
    fireEvent.change(input, { target: { value: '新暱稱' } }); fireEvent.blur(input);
    expect(document.getElementById('nickname-saved')).toHaveClass('opacity-0');
    await screen.findByText('正在保存與確認…');
    await vi.waitFor(() => expect(ack).toBeTypeOf('function'));
    const journal = await parseProfileJournal([...pending.values()][0]);
    await act(async () => ack(ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{ ...profile, profileVersion:1,nicknames:'新暱稱' }})));
    await vi.waitFor(() => expect(document.getElementById('nickname-saved')).toHaveClass('opacity-100'));
  });
  it('does not render private profile responses from a previous account', async () => {
    const old: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>).Authorization === 'Bearer fixture-session') return new Promise(resolve => old.push(resolve));
      return ok({ ...profile, id: 20, name: '新合成帳號', nicknames: '新暱稱' });
    }));
    const mounted = render(view()); mounted.rerender(view({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }));
    await screen.findByDisplayValue('新暱稱');
    await act(async () => old.forEach(resolve => resolve(ok(profile))));
    expect(screen.queryByText(/^姓名: 合成帳號$/)).not.toBeInTheDocument(); expect(screen.getByDisplayValue('新暱稱')).toBeInTheDocument();
  });
  it('preserves an unsent address draft when another field receives an acknowledgement',async()=>{
    let ack!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{ack=resolve;}):ok(profile)));
    render(view());const nickname=await screen.findByLabelText('暱稱'),address=screen.getByLabelText('寄送地址');
    fireEvent.change(address,{target:{value:'未提交地址'}});fireEvent.change(nickname,{target:{value:'新暱稱'}});fireEvent.blur(nickname);
    await vi.waitFor(()=>expect(ack).toBeTypeOf('function'));
    const journal=await parseProfileJournal([...pending.values()][0]);
    await act(async()=>ack(ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,nicknames:'新暱稱',address:null}})));
    await screen.findByText('後台已確認儲存。');expect(screen.getByLabelText('寄送地址')).toHaveValue('未提交地址');
  });
  it('email remains editable while typing, and locks only after the first email is acknowledged',async()=>{
    let ack!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{ack=resolve;}):ok({...profile,email:null})));
    render(view());const email=await screen.findByLabelText('電子信箱');
    fireEvent.change(email,{target:{value:'a'}});expect(email).not.toBeDisabled();
    fireEvent.change(email,{target:{value:'synthetic@example.invalid'}});expect(email).not.toBeDisabled();fireEvent.blur(email);
    await vi.waitFor(()=>expect(ack).toBeTypeOf('function'));const journal=await parseProfileJournal([...pending.values()][0]);
    await act(async()=>ack(ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,email:'synthetic@example.invalid'}})));
    await screen.findByText('後台已確認儲存。');expect(screen.getByLabelText('電子信箱')).toBeDisabled();
  });
  it('reopen after lost ACK only reads the original receipt and never sends a second POST',async()=>{
    let receipt:unknown;
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST'){const journal=await parseProfileJournal([...pending.values()][0]);receipt={receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,nicknames:'失聯後確認'}};throw new Error('lost ACK');}
      return ok(url.includes('/profile-operations/')?receipt:profile);
    });vi.stubGlobal('fetch',fetcher);
    const mounted=render(view());const input=await screen.findByLabelText('暱稱');fireEvent.change(input,{target:{value:'失聯後確認'}});fireEvent.blur(input);
    await screen.findByText('尚未確認儲存結果；請查核原回執，或明確重試同一操作。');expect(input).toBeDisabled();
    mounted.unmount();render(view());await screen.findByText('後台已確認儲存。');
    expect(screen.getByLabelText('暱稱')).toHaveValue('失聯後確認');expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);expect(pending.size).toBe(0);
  });
  it('rejects corrupt restore data and unreadable storage without sending a mutation',async()=>{
    vi.mocked(privatePendingStore.get).mockRejectedValueOnce(new PendingStoreError());
    const fetcher=vi.fn(async()=>ok(profile));vi.stubGlobal('fetch',fetcher);render(view());
    await screen.findByText(/無法安全讀取帳號資料/);expect(fetcher.mock.calls.every(call=>(call[1] as RequestInit|undefined)?.method!=='POST')).toBe(true);
  });
  it('conflict keeps the local draft but updates the baseline revision; no automatic retry',async()=>{
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
      if(init?.method!=='POST')return ok(profile);
      const journal=await parseProfileJournal([...pending.values()][0]);return ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'CONFLICT',appliedVersion:null,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,nicknames:'其他分頁'}});
    });vi.stubGlobal('fetch',fetcher);render(view());const input=await screen.findByLabelText('暱稱');fireEvent.change(input,{target:{value:'保留草稿'}});fireEvent.blur(input);
    await screen.findByText(/資料已被其他操作更新/);await vi.waitFor(()=>expect(input).not.toBeDisabled());
    expect(input).toHaveValue('保留草稿');expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);expect(document.getElementById('nickname-saved')).toHaveClass('opacity-0');
  });
  it('StrictMode replay does not adopt the first lifecycle response when it arrives last',async()=>{
    let initial!:(value:unknown)=>void,reads=0;
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/users/me')&&++reads===1)return new Promise(resolve=>{initial=resolve;});
      return ok({...profile,profileVersion:2,nicknames:'目前資料'});
    }));
    render(<StrictMode>{view()}</StrictMode>);await screen.findByDisplayValue('目前資料');
    await act(async()=>initial(ok(profile)));expect(screen.getByLabelText('暱稱')).toHaveValue('目前資料');
  });
  it('storage write failure prevents HTTP and freezes further autosave until recovery',async()=>{
    vi.mocked(privatePendingStore.save).mockRejectedValueOnce(new PendingStoreError());
    const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>ok(profile));vi.stubGlobal('fetch',fetcher);render(view());
    const input=await screen.findByLabelText('暱稱');fireEvent.change(input,{target:{value:'不可送出'}});fireEvent.blur(input);
    await screen.findByText(/無法安全保存或恢復待確認操作/);expect(input).toBeDisabled();expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(0);
  });
  it('acknowledged cleanup failure offers cleanup only, without downgrading to resend',async()=>{
    vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(new PendingStoreError());
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
      if(init?.method!=='POST')return ok(profile);
      const journal=await parseProfileJournal([...pending.values()][0]);return ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,nicknames:'確認後清理'}});
    });vi.stubGlobal('fetch',fetcher);render(view());const input=await screen.findByLabelText('暱稱');fireEvent.change(input,{target:{value:'確認後清理'}});fireEvent.blur(input);
    await screen.findByText(/後台原操作已確認，但本機恢復標記尚未清理/);expect(screen.queryByRole('button',{name:'重試同一儲存操作'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重試清理恢復標記'}));await vi.waitFor(()=>expect(input).not.toBeDisabled());expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
  });
  it('cancellation requires an explicit second step and an authoritative terminal receipt',async()=>{
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method!=='POST')return ok(profile);
      if(!url.endsWith('/abandon'))throw new Error('no ACK');
      const journal=await parseProfileJournal([...pending.values()][0]);return ok({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'ABANDONED',appliedVersion:null,createdAt:new Date().toISOString()},profile});
    });vi.stubGlobal('fetch',fetcher);render(view());const input=await screen.findByLabelText('暱稱');fireEvent.change(input,{target:{value:'取消但保留草稿'}});fireEvent.blur(input);
    await screen.findByText(/尚未確認儲存結果/);fireEvent.click(screen.getByRole('button',{name:'安全取消原操作'}));
    expect(fetcher.mock.calls.some(call=>call[0].endsWith('/abandon'))).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'保留原操作'}));expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'安全取消原操作'}));fireEvent.click(screen.getByRole('button',{name:'確認停止原操作'}));
    await screen.findByText(/原操作已安全取消/);await vi.waitFor(()=>expect(input).not.toBeDisabled());expect(input).toHaveValue('取消但保留草稿');
    const body=JSON.parse(fetcher.mock.calls.find(call=>call[0].endsWith('/abandon'))![1]!.body as string);expect(Object.keys(body)).toEqual(['requestHash']);
  });
});

describe('avatar upload recovery distinguishes current state from an original receipt',()=>{
  const photo=()=>new File(['synthetic image'],'avatar.png',{type:'image/png'});
  const choose=async()=>{ const button=await screen.findByRole('button',{name:'上傳大頭照'}); await waitFor(()=>expect(button).toHaveAttribute('aria-disabled','false')); return button.querySelector('input[type="file"]')!; };
  it('persists before upload and restores an unknown reply without a second POST',async()=>{
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==='POST'){expect(pending.size).toBe(1);throw new Error('lost ACK');}return ok({...profile,avatarUrl:'/uploads/new.png'});});
    vi.stubGlobal('fetch',fetcher);const mounted=render(view());fireEvent.change(await choose(),{target:{files:[photo()]}});
    await screen.findByText(/後台可能已保存/);expect(screen.getByRole('button',{name:'上傳大頭照'})).toHaveAttribute('aria-disabled','true');
    mounted.unmount();render(view());await screen.findByText(/上次大頭照上傳結果尚未確認/);
    expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'查核目前大頭照'}));await screen.findByText(/此查核無法證明原上傳是否完成/);
    expect(screen.getByAltText('大頭照')).toHaveAttribute('src',expect.stringContaining('/uploads/new.png'));expect(pending.size).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'清除本機上傳提醒'}));expect(pending.size).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'保留提醒'}));expect(pending.size).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'清除本機上傳提醒'}));fireEvent.click(screen.getByRole('button',{name:'確認只清除提醒'}));
    await screen.findByText(/這不會取消原請求/);expect(pending.size).toBe(0);expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
  });
  it('unreadable persistence prevents upload',async()=>{
    const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>ok(profile));vi.stubGlobal('fetch',fetcher);render(view());const input=await choose();
    vi.mocked(privatePendingStore.save).mockRejectedValueOnce(new PendingStoreError());fireEvent.change(input,{target:{files:[photo()]}});
    await screen.findByText(/尚未上傳/);expect(fetcher.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);
  });
  it('invalid acknowledgement URL stays unknown and is never rendered',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>ok(init?.method==='POST'?{avatarUrl:'javascript:alert(1)'}:profile)));
    render(view());fireEvent.change(await choose(),{target:{files:[photo()]}});await screen.findByText(/後台可能已保存/);expect(screen.queryByAltText('大頭照')).not.toBeInTheDocument();expect(pending.size).toBe(1);
  });
  it('a late old-account upload reply cannot update the new account or erase old evidence',async()=>{
    let ack!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{ack=resolve;}):ok({...profile,id:(init?.headers as Record<string,string>).Authorization==='Bearer other-session'?20:19})));
    const mounted=render(view());fireEvent.change(await choose(),{target:{files:[photo()]}});await waitFor(()=>expect(ack).toBeTypeOf('function'));
    mounted.rerender(view({...auth,user:{id:20,phoneNumber:'other'},token:'other-session'}));await choose();
    await act(async()=>ack(ok({avatarUrl:'/uploads/old-account.png'})));expect(screen.queryByAltText('大頭照')).not.toBeInTheDocument();expect(pending.size).toBe(1);
  });
  it('failed current-state GET cannot enable clearing or another upload',async()=>{
    let failRead=false;
    vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw new Error('no ACK');if(failRead&&url.endsWith('/users/me'))throw new Error('503');return ok(profile);}));
    render(view());fireEvent.change(await choose(),{target:{files:[photo()]}});await screen.findByText(/後台可能已保存/);failRead=true;
    fireEvent.click(screen.getByRole('button',{name:'查核目前大頭照'}));await screen.findByText(/無法查核目前大頭照/);expect(screen.queryByRole('button',{name:'清除本機上傳提醒'})).not.toBeInTheDocument();expect(pending.size).toBe(1);
  });
  it('cleanup failure retains a reminder and clearing never retransmits',async()=>{
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>ok(init?.method==='POST'?{avatarUrl:'/uploads/accepted.png'}:profile));vi.stubGlobal('fetch',fetcher);render(view());
    const input=await choose();vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(new PendingStoreError());fireEvent.change(input,{target:{files:[photo()]}});await screen.findByText(/上傳已回覆成功，但本機提醒未清理/);
    fireEvent.click(screen.getByRole('button',{name:'查核目前大頭照'}));await screen.findByText(/此查核無法證明原上傳/);fireEvent.click(screen.getByRole('button',{name:'清除本機上傳提醒'}));fireEvent.click(screen.getByRole('button',{name:'確認只清除提醒'}));await screen.findByText(/這不會取消原請求/);expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
  });
  it('same-turn double selection sends only once',async()=>{
    let ack!:(value:unknown)=>void;const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{ack=resolve;}):ok(profile));vi.stubGlobal('fetch',fetcher);render(view());const input=await choose();
    fireEvent.change(input,{target:{files:[photo()]}});fireEvent.change(input,{target:{files:[photo()]}});await waitFor(()=>expect(ack).toBeTypeOf('function'));expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);await act(async()=>ack(ok({avatarUrl:'/uploads/accepted.png'})));await screen.findByText('後台已回覆大頭照上傳成功。');expect(pending.size).toBe(0);
  });
  it('a newer tab marker is not cleared by the old acknowledgement',async()=>{
    let ack!:(value:unknown)=>void;vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{ack=resolve;}):ok(profile)));render(view());fireEvent.change(await choose(),{target:{files:[photo()]}});await waitFor(()=>expect(ack).toBeTypeOf('function'));
    const key=[...pending.keys()][0], newer=JSON.stringify({version:1,id:crypto.randomUUID()});pending.set(key,newer);await act(async()=>ack(ok({avatarUrl:'/uploads/accepted.png'})));await screen.findByText(/本機提醒仍存在/);expect(pending.get(key)).toBe(newer);
  });
});
