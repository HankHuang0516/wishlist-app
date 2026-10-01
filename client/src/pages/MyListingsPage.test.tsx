import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import MyListingsPage from './MyListingsPage';
import { marketplaceOrigin } from '../lib/managedListingWeb';
import { webcrypto } from 'node:crypto';
import { privatePendingStore, sha256 } from '../lib/webPendingStore';
const journals = vi.hoisted(() => new Map<string,string>());
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:{
  get:vi.fn(async(key:string)=>journals.get(key)??null),
  save:vi.fn(async(key:string,raw:string)=>{if(journals.has(key)&&journals.get(key)!==raw)throw Error('CAS');journals.set(key,raw);}),
  clear:vi.fn(async(key:string,raw:string)=>journals.get(key)===raw?journals.delete(key):false),
  replaceDraft:vi.fn(async(key:string,expected:string|null,raw:string)=>{if((journals.get(key)??null)!==expected)throw Error('CAS');journals.set(key,raw);})
}}));
const id = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const photo = '33333333-3333-4333-8333-333333333333';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const row = { id, ownerUserId: 19, owner: { id: 19 }, version: 1, title: '三國演義測試漫畫', description: '僅作測試的完整商品說明',
  status: 'ACTIVE', condition: 'USED', category: 'books', price: '250', currency: 'TWD', createdAt: '2026-09-29T00:00:00Z', publishedAt: '2026-09-29T00:00:00Z', expiresAt: '2100-10-30T15:59:59Z', location: { county: '臺北市', district: '中山區' }, media: [] };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><MyListingsPage /></AuthContext.Provider></MemoryRouter>;
const ready = async () => waitFor(()=>expect(screen.getByRole('button',{name:'延長期限',exact:true})).toBeEnabled());
async function openEditor() { fireEvent.click(screen.getByRole('button', { name: '編輯資訊' })); await waitFor(() => expect(screen.getByLabelText('商品名稱')).toBeEnabled()); }
async function proof(url:string,init:RequestInit,state='APPLIED',appliedVersion?:number){
  const body=JSON.parse(String(init.body));return ok({receipt:{clientActionId:url.split('/').at(-1),listingId:body.listingId,kind:body.kind,expectedVersion:body.expectedVersion,requestHash:await sha256(JSON.stringify(body)),state,reason:state==='CONFLICT'?'LISTING_CONFLICT':null,appliedVersion:state==='APPLIED'?appliedVersion??body.expectedVersion+1:null,createdAt:'2026-10-01T12:00:00.000Z'}});
}
beforeEach(() => {journals.clear();vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);vi.spyOn(window, 'confirm').mockReturnValue(true);});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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
    fireEvent.change(date, { target: { value: '2101-01-15' } });
    expect(date).toHaveValue('2101-01-15');
    fireEvent.click(screen.getByRole('button', { name: '確認延長' }));
    await screen.findByText('原商品操作已確認完成；不會再次套用。');
    expect(window.confirm).toHaveBeenCalledWith('確認延長至 2101-01-15？');
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
