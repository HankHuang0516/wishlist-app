import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import MyListingsPage from './MyListingsPage';
import { marketplaceOrigin } from '../lib/managedListingWeb';
import { webcrypto } from 'node:crypto';
import { StrictMode } from 'react';
import { privatePendingStore, sha256 } from '../lib/webPendingStore';
const journals = vi.hoisted(() => new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:{
  get:vi.fn(async(key:string)=>journals.get(key)??null),
  save:vi.fn(async(key:string,raw:string)=>{if(journals.has(key)&&journals.get(key)!==raw)throw Error('CAS');journals.set(key,raw);}),
  clear:vi.fn(async(key:string,raw:string)=>journals.get(key)===raw?journals.delete(key):false),
  replaceDraft:vi.fn(async(key:string,expected:string|null,raw:string)=>{if((journals.get(key)??null)!==expected)throw Error('CAS');journals.set(key,raw);}),
  handoffListingEdit:vi.fn(async(operationKey:string,operation:string,draftKey:string,expectedDraft:string|null,raw:string)=>{
    if(journals.get(operationKey)!==operation||(journals.get(draftKey)??null)!==expectedDraft)throw Error('CAS');
    journals.set(draftKey,raw);journals.delete(operationKey);
  })
}}));
const id = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const photo = '33333333-3333-4333-8333-333333333333';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const row = { id, ownerUserId: 19, owner: { id: 19 }, version: 1, title: '三國演義測試漫畫', description: '僅作測試的完整商品說明',
  status: 'ACTIVE', condition: 'USED', category: 'books', price: '250', currency: 'TWD', createdAt: '2026-09-29T00:00:00Z', publishedAt: '2026-09-29T00:00:00Z', expiresAt: '2100-10-30T15:59:59Z', location: { county: '臺北市', district: '中山區' }, media: [] };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><MyListingsPage /></AuthContext.Provider></MemoryRouter>;
const ready = async () => waitFor(()=>expect(screen.getByRole('button',{name:'延長期限',exact:true})).toBeEnabled());
async function prepareCompetingEdit(strict = false) {
  let writes = 0;
  const proposal = { title: '我的原操作修改', description: row.description, price: 300 };
  const current = { ...row, version: 2, title: '其他裝置更新', description: '後台較新說明', price: '280' };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return proof(url, init, ++writes === 1 ? 'CONFLICT' : 'APPLIED');
    return url.endsWith(`/listings/${id}`) ? ok(writes < 2 ? current : { ...current, ...proposal, price: '300', version: 3 }) : ok({ items: [row], nextCursor: null });
  });
  vi.stubGlobal('fetch', fetcher); render(strict ? <StrictMode>{view()}</StrictMode> : view()); await ready(); await openEditor();
  fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: proposal.title } });
  fireEvent.change(screen.getByLabelText('售價（NT$，0 代表免費贈送）'), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
  await screen.findByText('版本：2');
  const draftKey = [...journals.keys()].find(key => JSON.parse(journals.get(key)!).fields)!;
  const managementKey = [...journals.keys()].find(key => JSON.parse(journals.get(key)!).clientActionId)!;
  const originalRaw = journals.get(managementKey)!;
  const competing = { ...JSON.parse(journals.get(draftKey)!), revision: crypto.randomUUID(), fields: { title: '另一分頁的草稿', description: '另一份未送出說明', price: '450' } };
  const competingRaw = JSON.stringify(competing); journals.set(draftKey, competingRaw);
  return { fetcher, proposal, draftKey, managementKey, originalRaw, competingRaw, competing };
}
async function openEditor() { fireEvent.click(screen.getByRole('button', { name: '編輯資訊' })); await waitFor(() => expect(screen.getByLabelText('商品名稱')).toBeEnabled()); }
async function proof(url:string,init:RequestInit,state='APPLIED',appliedVersion?:number){
  const body=JSON.parse(String(init.body));return ok({receipt:{clientActionId:url.split('/').at(-1),listingId:body.listingId,kind:body.kind,expectedVersion:body.expectedVersion,requestHash:await sha256(JSON.stringify(body)),state,reason:state==='CONFLICT'?'LISTING_CONFLICT':null,appliedVersion:state==='APPLIED'?appliedVersion??body.expectedVersion+1:null,createdAt:'2026-10-01T12:00:00.000Z'}});
}
beforeEach(() => {localStorage.setItem('user-locale','zh-TW');journals.clear();vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);vi.spyOn(window, 'confirm').mockReturnValue(true);});
afterEach(() => { localStorage.removeItem('user-locale'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('native-equivalent owner management', () => {
  it('provides a login return path without requesting private data before login', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(view({ ...auth, token: null, user: null, isAuthenticated: false } as typeof auth));
    expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login?next=%2Fmy-listings'); expect(fetch).not.toHaveBeenCalled();
  });
  it('loads pages and exposes every management tab without falsely calling a partial page empty', async () => {
    const fetch = vi.fn(async (url: string) => ok(url.includes('cursor=') ? { items: [{ ...row, id: second, status: 'SOLD' }], nextCursor: null } : { items: [row], nextCursor: id })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title });
    fireEvent.click(screen.getByRole('tab', { name: '已售出 (0)' }));
    expect(screen.getByText(/可繼續載入更多/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '載入更多我的商品' }));
    await screen.findByRole('tab', { name: '已售出 (1)' });
    expect(screen.getByRole('heading', { name: row.title })).toBeInTheDocument();
    expect(fetch.mock.calls[1][0]).toContain(`cursor=${id}`);
    for (const name of ['在售', '已保留', '草稿', '已售出', '已失效', '已移除']) expect(screen.getByRole('tab', { name: new RegExp(name) })).toBeInTheDocument();
  });
  it('never displays another seller projected into a private management response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ ...row, ownerUserId: 20, owner: { id: 20 } }], nextCursor: null })));
    render(view()); expect(await screen.findByRole('alert')).toHaveTextContent('資料不正確');
    expect(screen.queryByRole('heading', { name: row.title })).not.toBeInTheDocument();
  });
  it('edits labelled fields with TWD units and optimistic version checking', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST' ? proof(url,init) : url.endsWith(`/listings/${id}`)?ok({ ...row, title: '新版測試漫畫', price: '300', version: 2 }):ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); await ready();
    await openEditor();
    expect(screen.getByLabelText('商品說明')).toHaveValue(row.description);
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '新版測試漫畫' } });
    fireEvent.change(screen.getByLabelText('售價（NT$，0 代表免費贈送）'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
    await screen.findByText('原商品操作已確認完成；不會再次套用。');
    await screen.findByText('版本：2');fireEvent.click(screen.getByRole('button',{name:'已讀結果，清理本機紀錄'}));await screen.findByText(/已讀原操作結果/);
    const request = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ kind:'EDIT',listingId:id,expectedVersion: 1, changes:{title: '新版測試漫畫', description: row.description, price: 300} });
    expect(screen.getByText('NT$ 300')).toBeInTheDocument();
  });
  it('requires GET-only recovery after a lost mutation reply and never repeats a status change', async () => {
    let receipt:unknown;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {receipt=await (await proof(url,init)).json();throw new Error('lost reply');}
      if(url.includes('/management-operations/'))return ok(receipt);
      if (url.endsWith(`/listings/${id}`)) return ok({ ...row, status: 'SOLD', version: 2 });
      return ok({ items: [row], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); await ready();fireEvent.click(screen.getByRole('button', { name: '標記售出' }));
    await screen.findByRole('button', { name: '只查核原操作回執與最新商品' });
    expect(screen.getByRole('button', { name: '標記售出' })).toBeDisabled();
    await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原操作回執與最新商品'})).toBeEnabled());fireEvent.click(screen.getByRole('button', { name: '只查核原操作回執與最新商品' }));
    await screen.findByText(/原商品操作已確認完成/);await screen.findByText('版本：2'); fireEvent.click(screen.getByRole('tab', { name: '已售出 (1)' }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '編輯資訊' })).not.toBeInTheDocument();
  });
  it('blocks stale version responses until authoritative state is reloaded', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST' ? proof(url,init,'APPLIED',1) : ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); await ready();fireEvent.click(screen.getByRole('button', { name: '標記售出' }));
    await screen.findByRole('region',{name:'原商品操作與最新資料比較'});expect(screen.getByRole('button', { name: '編輯資訊' })).toBeDisabled();
    await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原操作回執與最新商品'})).toBeEnabled());
    expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);expect(journals.size).toBe(1);
    expect(screen.getByRole('tab', { name: '已售出 (0)' })).toBeInTheDocument();
  });
  it('treats past expiry as expired and requires a future extension before editing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ ...row, expiresAt: '2020-01-01T15:59:59Z' }], nextCursor: null })));
    render(view()); await screen.findByRole('tab', { name: '已失效 (1)' }); fireEvent.click(screen.getByRole('tab', { name: '已失效 (1)' }));
    expect(screen.queryByRole('button', { name: '編輯資訊' })).not.toBeInTheDocument();
    await ready();fireEvent.click(screen.getByRole('button', { name: '延長期限' }));
    expect(screen.getByLabelText('新的失效日期（台灣時間）')).toHaveAttribute('type', 'date');
  });
  it('retains a selected cross-year date and submits that date with the current version', async () => {
    const current = { ...row, expiresAt: '2100-12-01T15:59:59Z' };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => init?.method === 'POST'
      ? proof(url,init) :url.endsWith(`/listings/${id}`)?ok({ ...current, expiresAt: '2101-01-15T15:59:59Z', version: 2 }):ok({ items: [current], nextCursor: null }));
    vi.stubGlobal('fetch', fetch); render(view()); await screen.findByRole('heading', { name: row.title });
    await ready();fireEvent.click(screen.getByRole('button', { name: '延長期限' }));
    const date = screen.getByLabelText('新的失效日期（台灣時間）');
    expect(date).toHaveAttribute('min', '2100-12-02');
    fireEvent.click(screen.getByRole('button', { name: '開啟「新的失效日期（台灣時間）」日曆' }));
    fireEvent.click(screen.getByRole('button', { name: '下一個月' }));
    expect(screen.getByRole('heading', { name: '2101 年 1 月' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '選擇 2101-01-15' }));
    expect(date).toHaveValue('2101-01-15');
    fireEvent.click(screen.getByRole('button', { name: '確認延長' }));
    await screen.findByText('原商品操作已確認完成；不會再次套用。');
    expect(window.confirm).toHaveBeenCalledWith('確認延長至 2101-01-15？延長刊登不會自動更新地圖顯示。');
    const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('/listings/management-operations/');
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ kind:'EXTEND',listingId:id,expectedVersion: 1,changes:{expiryDate: '2101-01-15'} });
  });
  it('rejects empty or non-extended dates before confirmation or a write', async () => {
    const fetch = vi.fn(async () => ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title });
    await ready();fireEvent.click(screen.getByRole('button', { name: '延長期限' }));
    const date = screen.getByLabelText('新的失效日期（台灣時間）');
    for (const value of ['', '2100-10-30']) {
      fireEvent.change(date, { target: { value } }); fireEvent.click(screen.getByRole('button', { name: '確認延長' }));
      expect(screen.getByRole('alert')).toHaveTextContent('請選擇 2100-10-31 或之後的有效日期。');
    }
    expect(window.confirm).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost extension reply through GET without repeating the extension', async () => {
    let receipt:unknown;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {receipt=await(await proof(url,init)).json();return { ok: false, status: 502, json: async () => ({ error: 'Synthetic reply lost after commit' }) };}
      if(url.includes('/management-operations/'))return ok(receipt);
      if (url.endsWith(`/listings/${id}`)) return ok({ ...row, expiresAt: '2100-12-15T15:59:59Z', version: 2 });
      return ok({ items: [row], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch); render(view()); await screen.findByRole('heading', { name: row.title });
    await ready();fireEvent.click(screen.getByRole('button', { name: '延長期限' }));
    fireEvent.change(screen.getByLabelText('新的失效日期（台灣時間）'), { target: { value: '2100-12-15' } });
    fireEvent.click(screen.getByRole('button', { name: '確認延長' }));
    await screen.findByRole('button', { name: '只查核原操作回執與最新商品' });
    expect(screen.getByRole('button', { name: '確認延長' })).toBeDisabled();
    expect(screen.getByLabelText('新的失效日期（台灣時間）')).toHaveValue('2100-12-15');
    await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原操作回執與最新商品'})).toBeEnabled());fireEvent.click(screen.getByRole('button', { name: '只查核原操作回執與最新商品' }));
    await screen.findByText(/原商品操作已確認完成/);await screen.findByText('版本：2');
    expect(screen.getByText(/至 2100-12-15/)).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith(`/listings/${id}`))).toHaveLength(1);
  });
  it('includes name, price and versioned product link in the share fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [row], nextCursor: null })));
    render(view()); await screen.findByRole('heading', { name: row.title }); fireEvent.click(screen.getByRole('button', { name: '分享連結' }));
    await screen.findByText(/已複製商品分享/);
    expect(writeText).toHaveBeenCalledWith(`看看「${row.title}」｜NT$ 250：${marketplaceOrigin()}/listings/${id}?v=1`);
  });
  it('restores a lost status operation after remount using only its original GET receipt',async()=>{
    let receipt:unknown;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST'){receipt=await(await proof(url,init)).json();throw Error('lost after commit');}
      if(url.includes('/management-operations/'))return ok(receipt);
      return url.endsWith(`/listings/${id}`)?ok({...row,status:'SOLD',version:2}):ok({items:[row],nextCursor:null});
    });vi.stubGlobal('fetch',fetch);const first=render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原操作回執與最新商品'})).toBeEnabled());expect(journals.size).toBe(1);first.unmount();
    render(view());await screen.findByText('版本：2');expect(screen.getByText(/原商品操作已確認完成/)).toBeInTheDocument();expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);expect(fetch.mock.calls.filter(([url])=>url.includes('/management-operations/')&&!url.endsWith('/abandon'))).toHaveLength(2);expect(journals.size).toBe(1);
  });
  it('compares rejected edits and keeps the original values for a new explicit latest-version save',async()=>{
    let writes=0;const current={...row,title:'其他裝置較新名稱',description:'其他裝置較新說明',price:'280',version:2};
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST')return proof(url,init,++writes===1?'CONFLICT':'APPLIED');
      return url.endsWith(`/listings/${id}`)?ok(writes<2?current:{...current,version:3,title:'我的尚未套用名稱',description:row.description,price:'300'}):ok({items:[row],nextCursor:null});
    });vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('heading',{name:row.title});await ready();await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'),{target:{value:'我的尚未套用名稱'}});fireEvent.change(screen.getByLabelText('售價（NT$，0 代表免費贈送）'),{target:{value:'300'}});fireEvent.click(screen.getByRole('button',{name:'儲存修改'}));
    await screen.findByText('版本：2');const comparison=screen.getByRole('region',{name:'原商品操作與最新資料比較'});expect(comparison).toHaveTextContent('我的尚未套用名稱');expect(comparison).toHaveTextContent('其他裝置較新名稱');
    fireEvent.click(screen.getByRole('button',{name:'保留我的修改，以最新版本重新編輯'}));await screen.findByText(/已保留您的修改；尚未送出/);await waitFor(()=>expect(screen.getByLabelText('商品名稱')).toBeEnabled());expect(screen.getByLabelText('商品名稱')).toHaveValue('我的尚未套用名稱');expect(screen.getByLabelText('售價（NT$，0 代表免費贈送）')).toHaveValue('300');expect(writes).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'儲存修改'}));await screen.findByText('版本：3');const requests=fetch.mock.calls.filter(([,i])=>i?.method==='POST');expect(requests).toHaveLength(2);expect(requests[0][0]).not.toBe(requests[1][0]);expect(JSON.parse(String(requests[1][1]?.body)).expectedVersion).toBe(2);
  });
  it('retains proof and blocks writing when the same applied version has contradictory current data',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?proof(url,init):url.endsWith(`/listings/${id}`)?ok({...row,status:'ACTIVE',version:2}):ok({items:[row],nextCursor:null}));vi.stubGlobal('fetch',fetch);
    render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));await screen.findByText(/目前商品資料仍無法安全核對/);expect(screen.getByRole('button',{name:'標記售出'})).toBeDisabled();expect(journals.size).toBe(1);expect(screen.getByText(/尚未核對/)).toBeInTheDocument();
  });
  it('does not submit without durable storage, and reports that nothing was sent',async()=>{
    const fetch=vi.fn(async()=>ok({items:[row],nextCursor:null}));vi.stubGlobal('fetch',fetch);vi.mocked(privatePendingStore.save).mockRejectedValueOnce(Error('storage unavailable'));
    render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));await screen.findByText(/無法安全保存原操作；未送出/);expect(fetch).toHaveBeenCalledTimes(1);expect(journals.size).toBe(0);
  });
  it('missing receipt is read-only and explicit cancellation retains an immutable terminal result',async()=>{
    const missing={ok:false,status:404,json:async()=>({errorCode:'MANAGEMENT_NOT_FOUND'})};let receipt:unknown;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST'&&url.endsWith('/abandon')){const raw=[...journals.values()][0],j=JSON.parse(raw);return ok({receipt:{clientActionId:j.clientActionId,listingId:id,kind:'STATUS',expectedVersion:1,requestHash:j.requestHash,state:'ABANDONED',reason:null,appliedVersion:null,createdAt:'2026-10-01T12:00:00.000Z'}});}
      if(init?.method==='POST')throw Error('not known');if(url.includes('/management-operations/'))return receipt?ok(receipt):missing;
      return url.endsWith(`/listings/${id}`)?ok(row):ok({items:[row],nextCursor:null});
    });vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'只查核原操作回執與最新商品'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'只查核原操作回執與最新商品'}));await screen.findByText(/仍無法核對最新商品/);expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'取消原操作…'}));expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'確認取消此原操作'}));await screen.findByText(/原商品操作已取消/);await screen.findByText('版本：1');expect(journals.size).toBe(1);expect(screen.queryByRole('button',{name:'明確重試同一原操作'})).not.toBeInTheDocument();
  });
  it('failed CAS cleanup stays blocked rather than clearing a newer operation',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?proof(url,init):url.endsWith(`/listings/${id}`)?ok({...row,status:'SOLD',version:2}):ok({items:[row],nextCursor:null}));vi.stubGlobal('fetch',fetch);
    render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));await screen.findByText('版本：2');vi.mocked(privatePendingStore.clear).mockResolvedValueOnce(false);fireEvent.click(screen.getByRole('button',{name:'已讀結果，清理本機紀錄'}));await screen.findByText(/紀錄已被另一分頁更新或清理/);expect(journals.size).toBe(1);expect(screen.getByRole('button',{name:'已讀結果，清理本機紀錄'})).toBeDisabled();
  });
  it('restores incomplete unsent edits after remount without POST or silently rebasing them', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    const first = render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '尚未送出的草稿' } });
    fireEvent.change(screen.getByLabelText('售價（NT$，0 代表免費贈送）'), { target: { value: '1.' } });
    await screen.findByText('本機草稿已保存；尚未更新商品。'); first.unmount();
    render(view()); await ready(); await openEditor();
    expect(screen.getByLabelText('商品名稱')).toHaveValue('尚未送出的草稿');
    expect(screen.getByLabelText('售價（NT$，0 代表免費贈送）')).toHaveValue('1.');
    expect(screen.getByText('已恢復本機編輯草稿；尚未更新商品。')).toBeInTheDocument();
    expect(fetch.mock.calls.every(call => !call[1] || call[1].method !== 'POST')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
    await screen.findByText(/請確認名稱、3000 字內說明及有效售價/);
    expect(fetch.mock.calls.every(call => !call[1] || call[1].method !== 'POST')).toBe(true);
  });
  it('shows a newer backend version beside restored edits and requires explicit adoption before saving', async () => {
    let current = row;
    const fetch = vi.fn(async () => ok({ items: [current], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    const first = render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '保留我的草稿' } });
    await screen.findByText('本機草稿已保存；尚未更新商品。'); first.unmount();
    current = { ...row, version: 2, title: '後台新名稱', price: '350' };
    render(view()); await ready(); await openEditor();
    expect(screen.getByRole('region', { name: '尚未送出草稿與最新商品比較' })).toHaveTextContent('後台新名稱');
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保留草稿，以最新版本繼續編輯' }));
    await screen.findByText('本機草稿已保存；尚未更新商品。');
    expect(screen.getByLabelText('商品名稱')).toHaveValue('保留我的草稿');
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeEnabled();
    expect(JSON.parse([...journals.values()][0]).baseVersion).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('fences a different tab draft before any backend save and preserves both displayed edits and stored text', async () => {
    const fetch = vi.fn(async () => ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '此分頁修改' } });
    await screen.findByText('本機草稿已保存；尚未更新商品。');
    const key = [...journals.keys()][0], other = { ...JSON.parse(journals.get(key)!), revision: crypto.randomUUID() };
    other.fields.title = '另一分頁修改'; journals.set(key, JSON.stringify(other));
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
    await screen.findByText(/草稿已被另一分頁更新/);
    expect(screen.getByLabelText('商品名稱')).toHaveValue('此分頁修改');
    expect(JSON.parse(journals.get(key)!).fields.title).toBe('另一分頁修改'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps changed text visible and blocks saving if encrypted local storage fails', async () => {
    const fetch = vi.fn(async () => ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await ready(); await openEditor();
    vi.mocked(privatePendingStore.replaceDraft).mockRejectedValueOnce(Error('disk unavailable'));
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '仍可複製的修改' } });
    await screen.findByText(/草稿未安全保存/);
    expect(screen.getByLabelText('商品名稱')).toHaveValue('仍可複製的修改');
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeDisabled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves drafts on close and discards only with explicit confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [row], nextCursor: null })));
    render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '保留草稿測試' } });
    await screen.findByText('本機草稿已保存；尚未更新商品。');
    fireEvent.click(screen.getByRole('button', { name: '關閉編輯，保留草稿' })); await openEditor();
    expect(screen.getByLabelText('商品名稱')).toHaveValue('保留草稿測試');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '捨棄本機草稿' })); expect(journals.size).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '捨棄本機草稿' }));
    await waitFor(() => expect(screen.queryByLabelText('商品名稱')).not.toBeInTheDocument()); expect(journals.size).toBe(0);
    await openEditor(); expect(screen.getByLabelText('商品名稱')).toHaveValue(row.title);
  });
  it('retains another tabs newer draft when discard CAS fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [row], nextCursor: null })));
    render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '舊草稿' } });
    await screen.findByText('本機草稿已保存；尚未更新商品。');
    const key = [...journals.keys()][0], other = { ...JSON.parse(journals.get(key)!), revision: crypto.randomUUID() };
    other.fields.title = '新草稿'; journals.set(key, JSON.stringify(other));
    fireEvent.click(screen.getByRole('button', { name: '捨棄本機草稿' }));
    await screen.findByText(/另一分頁已更新草稿/);
    expect(JSON.parse(journals.get(key)!).fields.title).toBe('新草稿');
  });
  it('recovers an applied edit receipt after lost ACK and removes only the matching unsent local form', async () => {
    let receipt: unknown, applied = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { applied = true; receipt = await (await proof(url, init)).json(); throw Error('lost ACK'); }
      if (url.includes('/management-operations/')) return ok(receipt);
      return url.endsWith(`/listings/${id}`) ? ok({ ...row, title: '已儲存的草稿', version: 2 }) : ok({ items: [applied ? { ...row, title: '已儲存的草稿', version: 2 } : row], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch); const first = render(view()); await ready(); await openEditor();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '已儲存的草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '只查核原操作回執與最新商品' })).toBeEnabled()); expect(journals.size).toBe(2); first.unmount();
    render(view()); await screen.findByText('版本：2');
    await waitFor(() => expect(journals.size).toBe(1));
    expect([...journals.keys()][0]).toMatch(/listing-management$/);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('passes a real source photo and listing ID to the marketing extra option', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/marketing/availability')) return ok({ available: true });
      if (url.includes('/marketing/jobs?')) return ok({ job: null });
      return ok({ items: [{ ...row, media: [{ id: photo, thumbnailUrl: `${marketplaceOrigin()}/api/listing-media/${photo}/thumbnail`, capturePurpose: 'SELLER' }] }], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); await ready(); await openEditor();
    const editor = (await screen.findByText('額外選項')).parentElement!;
    expect(await within(editor).findByRole('button', { name: '開啟行銷小助手 Beta' })).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes(`sourceMediaId=${photo}`))).toBe(true);
  });
  it('ignores pending private data from a previous account after switching', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn((_url: string, init?: RequestInit) => (init?.headers as Record<string, string>).Authorization.includes('fixture-session')
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(ok({ items: [], nextCursor: null }))); vi.stubGlobal('fetch', fetch);
    const mounted = render(view()); mounted.rerender(view({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }));
    await act(async () => finish(ok({ items: [row], nextCursor: null })));
    await waitFor(() => expect(screen.queryByRole('heading', { name: row.title })).not.toBeInTheDocument());
  });
  it('cannot show or clear a previous account operation when its POST receipt arrives after switching',async()=>{
    let finish!:()=>Promise<void>;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      const owner=(init?.headers as Record<string,string>).Authorization.includes('fixture-session');
      if(owner&&init?.method==='POST')return new Promise(resolve=>{finish=async()=>resolve(await proof(url,init));});
      return ok({items:owner?[row]:[],nextCursor:null});
    });vi.stubGlobal('fetch',fetch);const mounted=render(view());await screen.findByRole('heading',{name:row.title});await ready();fireEvent.click(screen.getByRole('button',{name:'標記售出'}));
    await waitFor(()=>expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1));expect(journals.size).toBe(1);
    mounted.rerender(view({...auth,user:{id:20,phoneNumber:'other'},token:'other-session'}));await screen.findByText('這個狀態目前沒有已載入商品。');
    await act(async()=>finish());expect(screen.queryByRole('region',{name:'原商品操作與最新資料比較'})).not.toBeInTheDocument();expect(screen.queryByText(/原商品操作已確認完成/)).not.toBeInTheDocument();expect(privatePendingStore.clear).not.toHaveBeenCalled();expect(journals.size).toBe(1);
    expect(fetch.mock.calls.filter(([url])=>url.endsWith(`/listings/${id}`))).toHaveLength(0);
  });
});


describe('complete owner paging and English recovery', () => {
  it('ignores a superseded editor restoration failure in StrictMode', async () => {
    // Resolve scope keys in effect order. Real WebCrypto completion order can
    // otherwise attach the deliberately stale failure to the current effect.
    vi.spyOn(await import('../lib/webPendingStore'), 'pendingRequestKey').mockImplementation(async (_origin, userId, scope) => `fixture.${userId}.${scope}`);
    vi.stubGlobal('fetch',vi.fn(async()=>ok({items:[row],nextCursor:null})));
    render(<StrictMode>{view()}</StrictMode>);await ready();
    let reject!:(error:Error)=>void;
    const old=new Promise<string|null>((_resolve,no)=>{reject=no;});
    vi.mocked(privatePendingStore.get).mockImplementationOnce(()=>old);
    const reads = vi.mocked(privatePendingStore.get).mock.calls.length;
    fireEvent.click(screen.getByRole('button',{name:'編輯資訊'}));await waitFor(()=>expect(screen.getByLabelText('商品名稱')).toBeEnabled());
    expect(privatePendingStore.get).toHaveBeenCalledTimes(reads + 2);
    await act(async()=>{reject(Error('superseded restoration'));await old.catch(()=>null);});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByLabelText('商品名稱')).toHaveValue(row.title);expect(screen.getByRole('button',{name:'儲存修改'})).toBeEnabled();
  });
  it('loads 107 records across all six tabs without claiming partial counts are totals', async () => {
    localStorage.setItem('user-locale','en-US');
    const states=['ACTIVE','RESERVED','DRAFT','SOLD','EXPIRED','REMOVED'];
    const items=Array.from({length:107},(_,i)=>({...row,id:'50000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'Fixture listing '+i,status:states[i%6]}));
    const fetch=vi.fn(async(url:string)=>{const cursor=new URL(url).searchParams.get('cursor'),start=cursor?items.findIndex(item=>item.id===cursor)+1:0,page=items.slice(start,start+50);return ok({items:page,nextCursor:start+50<items.length?page.at(-1)!.id:null});});
    vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('tab',{name:'For sale (9)'});
    expect(screen.getByText(/50 loaded across all statuses/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Load more listings'}));await screen.findByText(/100 loaded across all statuses/);
    fireEvent.click(screen.getByRole('button',{name:'Load more listings'}));await screen.findByRole('tab',{name:'For sale (18)'});
    const names=['For sale','Reserved','Drafts','Sold','Expired','Removed'];
    for(let i=0;i<names.length;i++){const count=i===5?17:18;const tab=screen.getByRole('tab',{name:names[i]+' ('+count+')'});fireEvent.click(tab);expect(screen.getAllByRole('article')).toHaveLength(count);}
    expect(screen.queryByRole('button',{name:'Load more listings'})).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('retains loaded rows and their cursor after an invalid boundary, then reloads from the start', async () => {
    localStorage.setItem('user-locale','en-US');let reset=false;
    const fetch=vi.fn(async(url:string)=>url.includes('cursor=')?{ok:false,status:400,json:async()=>({error:'private implementation details'})}:ok({items:[reset?{...row,title:'Reloaded listing'}:row],nextCursor:reset?null:id}));
    vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('heading',{name:row.title});
    fireEvent.click(screen.getByRole('button',{name:'Load more listings'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('cursor is no longer valid');expect(screen.getByRole('heading',{name:row.title})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Load more listings'})).toBeEnabled();expect(screen.queryByText('private implementation details')).not.toBeInTheDocument();
    reset=true;fireEvent.click(screen.getByRole('button',{name:'Reload'}));await screen.findByRole('heading',{name:'Reloaded listing'});
    expect(screen.queryByRole('button',{name:'Load more listings'})).not.toBeInTheDocument();expect(fetch.mock.calls.at(-1)![0]).not.toContain('cursor=');
  });
  it('rejects a cursor cycle beyond the immediately previous cursor without discarding successful pages', async () => {
    const third='66666666-6666-4666-8666-666666666666';
    const fetch=vi.fn(async(url:string)=>ok(url.includes('cursor='+second)?{items:[{...row,id:third,title:'Third'},row],nextCursor:id}:url.includes('cursor=')?{items:[{...row,id:second,title:'Second'}],nextCursor:second}:{items:[row],nextCursor:id}));
    vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('heading',{name:row.title});
    fireEvent.click(screen.getByRole('button',{name:'載入更多我的商品'}));await screen.findByRole('heading',{name:'Second'});
    fireEvent.click(screen.getByRole('button',{name:'載入更多我的商品'}));expect(await screen.findByRole('alert')).toHaveTextContent('分頁未前進');
    expect(screen.getAllByRole('article')).toHaveLength(2);expect(screen.queryByRole('heading',{name:'Third'})).not.toBeInTheDocument();
  });
  it('deduplicates overlapping pages and preserves the higher verified listing version', async () => {
    const fetch=vi.fn(async(url:string)=>ok(url.includes('cursor=')?{items:[{...row,title:'Stale overlap',version:1},{...row,id:second,title:'Second'}],nextCursor:null}:{items:[{...row,title:'Verified version',version:3}],nextCursor:id}));
    vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('heading',{name:'Verified version'});
    fireEvent.click(screen.getByRole('button',{name:'載入更多我的商品'}));await screen.findByRole('heading',{name:'Second'});
    expect(screen.getAllByRole('article')).toHaveLength(2);expect(screen.getByRole('heading',{name:'Verified version'})).toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Stale overlap'})).not.toBeInTheDocument();
  });
  it('ignores a superseded StrictMode request instead of accepting its rows or unlocking an active request', async () => {
    let release!:(value:unknown)=>void;const old=new Promise<unknown>(resolve=>{release=resolve;});
    const fetch=vi.fn().mockImplementationOnce(()=>old).mockResolvedValue(ok({items:[{...row,title:'Current mount',version:2}],nextCursor:null}));
    vi.stubGlobal('fetch',fetch);render(<StrictMode>{view()}</StrictMode>);await screen.findByRole('heading',{name:'Current mount'});await ready();
    await act(async()=>{release(ok({items:[{...row,title:'Superseded private response'}],nextCursor:id}));await old;});
    expect(screen.queryByRole('heading',{name:'Superseded private response'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'載入更多我的商品'})).not.toBeInTheDocument();expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('supports English edit, lost reply, remount receipt verification and exact local cleanup without a second POST', async () => {
    localStorage.setItem('user-locale','en-US');let receipt:unknown;
    const current={...row,title:'English edited title',price:'0',version:2};
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(init?.method==='POST'){receipt=await(await proof(url,init)).json();throw Error('lost reply');}
      if(url.includes('/management-operations/'))return ok(receipt);
      if(url.endsWith('/listings/'+id))return ok(current);
      return ok({items:[receipt?current:row],nextCursor:null});
    });vi.stubGlobal('fetch',fetch);const first=render(view());await screen.findByRole('heading',{name:row.title});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Edit details'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Edit details'}));await waitFor(()=>expect(screen.getByLabelText('Listing title')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Listing title'),{target:{value:current.title}});fireEvent.change(screen.getByLabelText('Price (TWD; 0 means free giveaway)'),{target:{value:'0'}});
    fireEvent.click(screen.getByRole('button',{name:'Save changes'}));await screen.findByRole('button',{name:'Read original receipt and latest listing'});
    await waitFor(()=>expect(screen.getByRole('button',{name:'Read original receipt and latest listing'})).toBeEnabled());first.unmount();render(view());
    await screen.findByText('The original listing operation is confirmed complete. It will not be applied again.');await screen.findByText('Version: 2');
    const region=screen.getByRole('region',{name:'Compare original operation with latest listing'});expect(within(region).getByText('Your original operation (saved)')).toBeInTheDocument();expect(within(region).getByText('Status: For sale')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Acknowledge result and clear local journal'}));await screen.findByText(/original result was acknowledged/);
    expect(journals.size).toBe(0);const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({kind:'EDIT',listingId:id,expectedVersion:1,changes:{title:current.title,description:row.description,price:0}});
    expect(screen.getByText('Free giveaway')).toBeInTheDocument();
  });
  it('selects and confirms an English expiry date with Taiwan semantics and the original version', async () => {
    localStorage.setItem('user-locale','en-US');const current={...row,expiresAt:'2100-10-31T15:59:59.999Z',version:2};
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?proof(url,init):url.endsWith('/listings/'+id)?ok(current):ok({items:[row],nextCursor:null}));
    vi.stubGlobal('fetch',fetch);render(view());await waitFor(()=>expect(screen.getByRole('button',{name:'Extend expiry'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Extend expiry'}));
    fireEvent.click(screen.getByRole('button',{name:'Open calendar for New expiry date (Taiwan time)'}));expect(screen.getByRole('heading',{name:'October 2100'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Select 2100-10-31'}));fireEvent.click(screen.getByRole('button',{name:'Confirm extension'}));
    await screen.findByText('Version: 2');expect(window.confirm).toHaveBeenCalledWith('Extend expiry to 2100-10-31? Extending a listing does not renew map display.');
    const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({kind:'EXTEND',expectedVersion:1,changes:{expiryDate:'2100-10-31'}});
  });
  it('retains English unsaved text and blocks submission when local persistence fails', async () => {
    localStorage.setItem('user-locale','en-US');const fetch=vi.fn(async()=>ok({items:[row],nextCursor:null}));vi.stubGlobal('fetch',fetch);render(view());
    await waitFor(()=>expect(screen.getByRole('button',{name:'Edit details'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Edit details'}));await waitFor(()=>expect(screen.getByLabelText('Listing title')).toBeEnabled());
    vi.mocked(privatePendingStore.replaceDraft).mockRejectedValueOnce(Error('private disk details'));
    fireEvent.change(screen.getByLabelText('Listing title'),{target:{value:'Retain this text'}});expect(await screen.findByRole('alert')).toHaveTextContent('Copy it before closing');
    expect(screen.getByLabelText('Listing title')).toHaveValue('Retain this text');expect(screen.getByRole('button',{name:'Save changes'})).toBeDisabled();expect(fetch.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);expect(screen.queryByText('private disk details')).not.toBeInTheDocument();
  });
});

it('checks in only after explicit permission, stops manually, and never renews on reload',async()=>{
 let current={...row,mapVisibleUntil:null as string|null};const receipts=new Map<string,unknown>();
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST') {const body=JSON.parse(String(init.body));expect(body.expectedVersion).toBe(current.version);expect(body.kind).toBe('MAP');expect(body.changes.consentToMap).toBe(body.changes.display);current={...current,version:current.version+1,mapVisibleUntil:body.changes.display?new Date(Date.now()+3600000).toISOString():null};const p=await (await proof(url,init)).json();p.receipt.createdAt=new Date().toISOString();p.receipt.mapVisibleUntil=current.mapVisibleUntil;receipts.set(url,p);return ok(p);}
  if(url.includes('/management-operations/'))return ok(receipts.get(url));
  if(url.endsWith('/listings/'+id))return ok(current);
  return ok({items:[current],nextCursor:null});
 });vi.stubGlobal('fetch',fetcher);render(view());await ready();
 expect(fetcher.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'手動顯示地圖一小時'}));const dialog=screen.getByRole('dialog',{name:'確認商品地圖顯示'});expect(dialog).toHaveTextContent('不顯示使用者即時位置');fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'手動顯示地圖一小時'}));fireEvent.click(screen.getByRole('button',{name:'確認這次顯示一小時'}));await screen.findByText('原商品操作已確認完成；不會再次套用。');await screen.findByText('版本：2');
 const deadline=current.mapVisibleUntil;fireEvent.click(screen.getByRole('button',{name:'已讀結果，清理本機紀錄'}));await ready();fireEvent.click(screen.getByRole('button',{name:'重新載入',exact:true}));await ready();expect(current.mapVisibleUntil).toBe(deadline);expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'停止地圖顯示',exact:true}));fireEvent.click(screen.getByRole('button',{name:'確認停止地圖顯示'}));await screen.findByText('原操作已停止地圖顯示。');expect(current.mapVisibleUntil).toBeNull();expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(2);
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(0);
});
it('retains an unconfirmed map action and reloads only by GET without replay',async()=>{
 let current={...row,mapVisibleUntil:null as string|null};let receipt:unknown;
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){current={...current,version:2,mapVisibleUntil:new Date(Date.now()+3600000).toISOString()};const p=await (await proof(url,init)).json();p.receipt.createdAt=new Date().toISOString();p.receipt.mapVisibleUntil=current.mapVisibleUntil;receipt=p;throw Error('ACK lost');}
  if(url.includes('/management-operations/'))return ok(receipt);
  if(url.endsWith('/listings/'+id))return ok(current);
  return ok({items:[current],nextCursor:null});
 });vi.stubGlobal('fetch',fetcher);const first=render(view());await ready();fireEvent.click(screen.getByRole('button',{name:'手動顯示地圖一小時'}));fireEvent.click(screen.getByRole('button',{name:'確認這次顯示一小時'}));await screen.findByText('有原商品操作待查核；重開只讀取回執，不會自動重送。');
 const originalDeadline=current.mapVisibleUntil;current={...current,version:3,mapVisibleUntil:null};first.unmount();render(view());await screen.findByText('版本：3 · 原操作完成後又有更新');await screen.findByText(/原操作顯示期限：/);expect(JSON.stringify(receipt)).toContain(originalDeadline);expect(screen.getByRole('region',{name:'原商品操作與最新資料比較'})).toHaveTextContent('目前不在地圖顯示');expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
it('uses English keyboard-accessible map confirmation without submitting on Escape',async()=>{
 localStorage.setItem('user-locale','en');const fetcher=vi.fn(async()=>ok({items:[{...row,mapVisibleUntil:null}],nextCursor:null}));vi.stubGlobal('fetch',fetcher);render(view());await waitFor(()=>expect(screen.getByRole('button',{name:'Check in on the map for one hour'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Check in on the map for one hour'}));const dialog=screen.getByRole('dialog',{name:'Confirm product map display'});expect(dialog).toHaveFocus();expect(dialog).toHaveTextContent('never renews automatically');fireEvent.keyDown(dialog,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(fetcher.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
});

describe('conflicting edit draft handoff', () => {
  it.each(['unavailable', 'malformed'])('keeps prepared original fields selectable and blocks writes on %s draft restoration', async failure => {
    const state = await prepareCompetingEdit();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    const transfer = vi.mocked(privatePendingStore.handoffListingEdit).getMockImplementation()!;
    const get = vi.mocked(privatePendingStore.get).getMockImplementation()!; let transferred = false;
    vi.mocked(privatePendingStore.handoffListingEdit).mockImplementationOnce(async (...args) => { await transfer(...args); transferred = true; });
    vi.mocked(privatePendingStore.get).mockImplementation(async key => { if (transferred && key === state.draftKey) { if (failure === 'malformed') return '{'; throw Error('controlled unavailable storage'); } return get(key); });
    fireEvent.click(await screen.findByRole('button', { name: '保留原操作修改，取代這份本機草稿' }));
    await screen.findByText('無法安全讀取商品編輯草稿；原資料保留，請關閉後重試。');
    expect(screen.getByLabelText('商品名稱')).toHaveValue(state.proposal.title);
    expect(screen.getByLabelText('商品名稱')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('商品名稱')).toBeEnabled();
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeDisabled();
    expect(JSON.parse(journals.get(state.draftKey)!).fields.title).toBe(state.proposal.title);
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    vi.mocked(privatePendingStore.get).mockImplementation(get);
  });
  it('keeps both encrypted records when atomic preparation fails', async () => {
    const state = await prepareCompetingEdit();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    vi.mocked(privatePendingStore.handoffListingEdit).mockRejectedValueOnce(Error('controlled atomic failure'));
    fireEvent.click(await screen.findByRole('button', { name: '保留原操作修改，取代這份本機草稿' }));
    await screen.findByText('無法安全保存原操作修改；未清理原紀錄或取代草稿，請重新讀取比較。');
    expect(journals.get(state.managementKey)).toBe(state.originalRaw); expect(journals.get(state.draftKey)).toBe(state.competingRaw);
    expect(screen.queryByLabelText('商品名稱')).not.toBeInTheDocument();
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('keeps the selected original fields read-only if the prepared draft changes before editor restoration', async () => {
    const state = await prepareCompetingEdit();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    const transfer = vi.mocked(privatePendingStore.handoffListingEdit).getMockImplementation()!;
    vi.mocked(privatePendingStore.handoffListingEdit).mockImplementationOnce(async (...args) => { await transfer(...args); journals.set(state.draftKey, state.competingRaw); });
    vi.mocked(privatePendingStore.replaceDraft).mockClear();
    fireEvent.click(await screen.findByRole('button', { name: '保留原操作修改，取代這份本機草稿' }));
    await screen.findByText('已準備的草稿又被更新或移除；原修改仍顯示，請先複製文字，再關閉後重新比較。');
    expect(screen.getByLabelText('商品名稱')).toHaveValue(state.proposal.title);
    expect(screen.getByLabelText('商品名稱')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeDisabled();
    expect(journals.get(state.draftKey)).toBe(state.competingRaw);
    expect(privatePendingStore.replaceDraft).not.toHaveBeenCalled();
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('translates comparison choices while preserving both original Chinese proposals and sending nothing', async () => {
    const state = await prepareCompetingEdit(); localStorage.setItem('user-locale', 'en');
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    const region = await screen.findByRole('region', { name: 'Compare original changes with another local draft' });
    expect(region).toHaveTextContent('另一分頁的草稿');
    expect(screen.getByRole('region', { name: 'Compare original operation with latest listing' })).toHaveTextContent(state.proposal.title);
    fireEvent.click(screen.getByRole('button', { name: 'Keep both records for now' }));
    expect(journals.get(state.managementKey)).toBe(state.originalRaw); expect(journals.get(state.draftKey)).toBe(state.competingRaw);
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('retains the original operation and another tab draft until the user resolves the comparison', async () => {
    const state = await prepareCompetingEdit();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    const comparison = await screen.findByRole('region', { name: '原操作修改與另一份本機草稿比較' });
    expect(comparison).toHaveTextContent('另一分頁的草稿');
    expect(screen.getByRole('region', { name: '原商品操作與最新資料比較' })).toHaveTextContent(state.proposal.title);
    expect(screen.queryByRole('button', { name: '儲存修改' })).not.toBeInTheDocument();
    expect(journals.get(state.managementKey)).toBe(state.originalRaw);
    expect(journals.get(state.draftKey)).toBe(state.competingRaw);
    fireEvent.click(screen.getByRole('button', { name: '先保留兩份紀錄' }));
    expect(journals.get(state.managementKey)).toBe(state.originalRaw);
    expect(journals.get(state.draftKey)).toBe(state.competingRaw);
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('durably saves the selected original fields before journal cleanup and a new explicit backend save', async () => {
    const state = await prepareCompetingEdit(true);
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    fireEvent.click(await screen.findByRole('button', { name: '保留原操作修改，取代這份本機草稿' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '儲存修改' })).toBeEnabled());
    expect(journals.has(state.managementKey)).toBe(false);
    const draft = JSON.parse(journals.get(state.draftKey)!);
    expect(draft.baseVersion).toBe(2);
    expect(draft.fields).toEqual({ title: state.proposal.title, description: state.proposal.description, price: '300' });
    expect(screen.getByLabelText('商品名稱')).toHaveValue(state.proposal.title);
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' })); await screen.findByText('版本：3');
    const writes = state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[1][0]).not.toBe(writes[0][0]);
    expect(JSON.parse(String(writes[1][1]?.body))).toEqual({ kind: 'EDIT', listingId: id, expectedVersion: 2, changes: state.proposal });
  });
  it('rejects a changed competing draft after review and keeps the exact original operation', async () => {
    const state = await prepareCompetingEdit();
    fireEvent.click(screen.getByRole('button', { name: '保留我的修改，以最新版本重新編輯' }));
    await screen.findByRole('region', { name: '原操作修改與另一份本機草稿比較' });
    const newerRaw = JSON.stringify({ ...state.competing, revision: crypto.randomUUID(), fields: { ...state.competing.fields, title: '另一分頁再次更新' } });
    journals.set(state.draftKey, newerRaw);
    fireEvent.click(screen.getByRole('button', { name: '保留原操作修改，取代這份本機草稿' }));
    await screen.findByText('本機草稿與原操作不同；請比較後選擇，兩份紀錄目前都保留。');
    expect(journals.get(state.managementKey)).toBe(state.originalRaw);
    expect(journals.get(state.draftKey)).toBe(newerRaw);
    expect(screen.getByRole('region', { name: '原商品操作與最新資料比較' })).toHaveTextContent(state.proposal.title);
    expect(screen.queryByRole('button', { name: '儲存修改' })).not.toBeInTheDocument();
    expect(state.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
});

describe('original App status details within tab groups', () => {
  it('keeps pending confirmation distinct from editable drafts while retaining both in Drafts', async () => {
    const fetcher=vi.fn(async()=>ok({items:[{...row,status:'DRAFT',title:'原手動草稿',publishedAt:null},{...row,id:second,status:'PENDING_CONFIRMATION',title:'原待確認商品',publishedAt:null}],nextCursor:null}));
    vi.stubGlobal('fetch',fetcher);render(view());await screen.findByRole('tab',{name:'草稿 (2)'});
    fireEvent.click(screen.getByRole('tab',{name:'草稿 (2)'}));
    const pending=screen.getByRole('article',{name:'原待確認商品'}),draft=screen.getByRole('article',{name:'原手動草稿'});
    expect(within(pending).getByText('待確認 · 二手')).toBeInTheDocument();
    expect(within(pending).queryByRole('button',{name:'編輯資訊'})).not.toBeInTheDocument();
    expect(within(draft).getByText('草稿 · 二手')).toBeInTheDocument();
    expect(within(draft).getByRole('button',{name:'編輯資訊'})).toBeInTheDocument();
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('labels a passed deadline separately from an explicit expired state and keeps the expiry gate', async () => {
    localStorage.setItem('user-locale','en-US');
    const fetcher=vi.fn(async()=>ok({items:[{...row,expiresAt:'2000-01-01T15:59:59Z',title:'Deadline passed'},{...row,id:second,status:'EXPIRED',title:'Stored expired'}],nextCursor:null}));
    vi.stubGlobal('fetch',fetcher);render(view());await screen.findByRole('tab',{name:'Expired (2)'});
    fireEvent.click(screen.getByRole('tab',{name:'Expired (2)'}));
    const overdue=screen.getByRole('article',{name:'Deadline passed'}),expired=screen.getByRole('article',{name:'Stored expired'});
    expect(within(overdue).getByText('Expired · deadline passed · Used')).toBeInTheDocument();
    expect(within(expired).getByText('Expired · Used')).toBeInTheDocument();
    for (const article of [overdue,expired]) {
      expect(within(article).queryByRole('button',{name:'Edit details'})).not.toBeInTheDocument();
      expect(within(article).queryByRole('button',{name:'Mark sold'})).not.toBeInTheDocument();
      expect(within(article).getByRole('button',{name:'Extend expiry'})).toBeInTheDocument();
    }
    expect(fetcher.mock.calls).toHaveLength(1);
  });
});
