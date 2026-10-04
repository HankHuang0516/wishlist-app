/// <reference types="node" />
import { webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { API_URL } from '../config';
import { PENDING_DELETION_KEY } from '../lib/accountDeletionWeb';
import AccountDeletionPage from './AccountDeletionPage';
const { erasePrivatePendingData,vault,bodies } = vi.hoisted(() => ({ erasePrivatePendingData: vi.fn(async () => {}),vault:{get:vi.fn(),save:vi.fn(),clear:vi.fn()},bodies:new Map<string,string>() }));
vi.mock('../lib/webPendingStore', async importOriginal => ({...await importOriginal<typeof import('../lib/webPendingStore')>(), erasePrivatePendingData,createDeletionRecoveryVault:()=>vault}));
const storedOriginal=()=>[...bodies.values()][0]??null;

const actionId = '11111111-1111-4111-8111-111111111111';
const auth = { user: { id: 19, phoneNumber: 'test' }, token: 'test-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const preview = { version: 2, previewOnly: true, accountDeleted: false, capturedAt: '2026-09-26T00:00:00.000Z',
  counts: { reportsAuthored: 6, reportOperationReceipts: 7, reportsOnOwnedListings: 8, moderationActionsOnOwnedListings: 9, moderationActionsDetachingOwnReports: 10,
    wishlists: 1, wishes: 2, wishCreateReceipts: 11, listings: 3, uploadedPhotos: 4, conversations: 12, messagesAuthored: 5, otherMessagesInSharedConversations: 13,
    meetupAppointments: 14, upcomingMeetupAppointments: 15, purchaseRecords: 16, giftClaimsInOtherWishlists: 17, originalCreditsInOtherWishlists: 18,
    itemWatches: 19, followRelationships: 20, blockRelationships: 21, feedbackRecords: 22, crawlerRecords: 23 } };
const ack = { state: 'ERASED', accountDeleted: true, clientActionId: actionId,
  erasedAt: '2026-09-26T00:00:01.000Z', photoCleanupPending: 1, legacyCleanupPending: 0 };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const mount = (value = auth) => render(<MemoryRouter><AuthContext.Provider value={value}><AccountDeletionPage /></AuthContext.Provider></MemoryRouter>);

beforeEach(() => {
  erasePrivatePendingData.mockReset().mockResolvedValue(undefined); auth.logout.mockClear();
  bodies.clear();vault.get.mockReset().mockImplementation(async(key:string)=>bodies.get(key)??null);
  vault.save.mockReset().mockImplementation(async(key:string,body:string)=>{if(bodies.has(key)&&bodies.get(key)!==body)throw Error('immutable');bodies.set(key,body);});
  vault.clear.mockReset().mockImplementation(async(key:string,body:string)=>{if(bodies.get(key)!==body)return false;bodies.delete(key);return true;});
  localStorage.clear();
  localStorage.setItem('user-locale','zh-TW');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('crypto', {subtle:webcrypto.subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto), randomUUID: () => actionId });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public browser account deletion path', () => {
  it('shows all 23 APP impact categories, including retained messages and detached purchases',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>ok(preview)));mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    const list=screen.getByLabelText('完整資料影響盤點');expect(list.querySelectorAll('dt')).toHaveLength(23);
    for(const [label,value] of [['保留對方自有訊息',13],['解除帳號關聯的購買紀錄',16],['本人檢舉收件與安全放棄回執',7],['本人分析錯誤紀錄',23]])expect([...list.querySelectorAll('dt')].find(e=>e.textContent===label)?.nextElementSibling).toHaveTextContent(String(value));
    expect(screen.getByRole('button',{name:'重新盤點'})).toBeEnabled();expect(window.confirm).not.toHaveBeenCalled();
  });
  it('recovers an initial failed impact read with one explicit GET and no deletion',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:'PRIVATE_DIAGNOSTIC'})}).mockResolvedValueOnce(ok(preview));vi.stubGlobal('fetch',fetcher);mount();
    await screen.findByRole('alert');expect(screen.queryByLabelText('完整資料影響盤點')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'永久刪除本人帳號'})).toBeDisabled();expect(document.body).not.toHaveTextContent('PRIVATE_DIAGNOSTIC');
    fireEvent.click(screen.getByRole('button',{name:'重新盤點'}));await screen.findByText(/願望清單 1、願望 2、刊登 3/);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.every(([,init])=>!init.method||init.method==='GET')).toBe(true);expect(window.confirm).not.toHaveBeenCalled();expect(bodies.size).toBe(0);
  });
  it('keeps the last preview and typed proof after a failed refresh, blocks deletion and refreshes without overlap',async()=>{
    let settle!:(v:unknown)=>void;const fetcher=vi.fn().mockResolvedValueOnce(ok(preview)).mockImplementationOnce(()=>new Promise(resolve=>{settle=resolve;})).mockResolvedValueOnce(ok({...preview,counts:{...preview.counts,wishes:9,purchaseRecords:0}}));vi.stubGlobal('fetch',fetcher);mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});
    const retry=screen.getByRole('button',{name:'重新盤點'});fireEvent.click(retry);fireEvent.click(retry);expect(retry).toBeDisabled();expect(screen.getByRole('button',{name:'永久刪除本人帳號'})).toBeDisabled();expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async()=>settle({ok:false,status:503,json:async()=>({errorCode:'UNAVAILABLE'})}));await screen.findByRole('alert');expect(screen.getByText(/目前保留上次盤點/)).toBeInTheDocument();expect(screen.getByText(/願望清單 1、願望 2、刊登 3/)).toBeInTheDocument();expect(screen.getByLabelText('刪除帳號的目前密碼')).toHaveValue('fixture-password');
    fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));expect(window.confirm).not.toHaveBeenCalled();expect(bodies.size).toBe(0);
    fireEvent.click(retry);await screen.findByText(/願望清單 1、願望 9、刊登 3/);expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'永久刪除本人帳號'})).toBeEnabled();expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls.every(([url])=>String(url).endsWith('/deletion-impact'))).toBe(true);
  });
  it('does not accept a partial or malformed additional category as a complete impact',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(ok({...preview,counts:{...preview.counts,purchaseRecords:-1}})).mockResolvedValueOnce(ok(preview));vi.stubGlobal('fetch',fetcher);mount();await screen.findByRole('alert');expect(screen.queryByLabelText('完整資料影響盤點')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'永久刪除本人帳號'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'重新盤點'}));await screen.findByLabelText('完整資料影響盤點');
  });
  it('ignores a late old-account preview and aborts it when the account changes',async()=>{
    let settle!:(v:unknown)=>void;let oldSignal!:AbortSignal;const fetcher=vi.fn((_url:string,init:RequestInit)=>init.headers && (init.headers as Record<string,string>).Authorization==='Bearer test-session'?new Promise(resolve=>{oldSignal=init.signal!;settle=resolve;}):Promise.resolve(ok({...preview,counts:{...preview.counts,wishes:8}})));vi.stubGlobal('fetch',fetcher);const view=mount();await waitFor(()=>expect(settle).toBeTypeOf('function'));
    view.rerender(<MemoryRouter><AuthContext.Provider value={{...auth,user:{id:20,phoneNumber:'other'},token:'other-session'}}><AccountDeletionPage/></AuthContext.Provider></MemoryRouter>);await screen.findByText(/願望清單 1、願望 8、刊登 3/);expect(oldSignal.aborted).toBe(true);await act(async()=>settle(ok(preview)));expect(screen.queryByText(/願望清單 1、願望 2、刊登 3/)).not.toBeInTheDocument();expect(bodies.size).toBe(0);
  });
  it('blocks all network access until the encrypted recovery read completes',async()=>{
    let release:(value:null)=>void=()=>{};vault.get.mockImplementationOnce(()=>new Promise<null>(done=>{release=done;}));const fetch=vi.fn(async()=>ok(preview));vi.stubGlobal('fetch',fetch);mount();
    expect(screen.getByRole('status')).toHaveTextContent('正在安全讀取原刪除操作');expect(screen.queryByLabelText('刪除帳號的目前密碼')).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
    await waitFor(()=>expect(vault.get).toHaveBeenCalledTimes(1));await act(async()=>release(null));await screen.findByText(/願望清單 1、願望 2、刊登 3/);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries a failed encrypted read safely and restores the original by GET only',async()=>{
    localStorage.setItem(PENDING_DELETION_KEY,JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:actionId,originalToken:'old-session'}));vault.get.mockRejectedValueOnce(Error('raw-private-key-diagnostic'));
    const fetch=vi.fn(async()=>({ok:false,status:404}));vi.stubGlobal('fetch',fetch);mount();await screen.findByRole('alert');expect(fetch).not.toHaveBeenCalled();expect(screen.queryByText(/raw-private-key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重試安全讀取刪除恢復資料'}));await screen.findByText('原刪除操作的結果仍未確認；不會自動重送刪除。');expect(storedOriginal()).toContain(actionId);expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('/deletion-operations/'+actionId);
  });
  it('freezes the form after losing publication, then explicitly reopens the winning operation without DELETE',async()=>{
    const winner=JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:'22222222-2222-4222-8222-222222222222',originalToken:'winning-session'});
    vault.save.mockImplementationOnce(async(key:string)=>{bodies.set(key,winner);throw Error('CAS lost');});const fetch=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/deletion-impact')?ok(preview):String(input).includes('/deletion-operations/')?{ok:false,status:404}:ok({id:19}));vi.stubGlobal('fetch',fetch);mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));await screen.findByText(/無法安全保存原刪除操作/);
    expect(screen.getByRole('button',{name:'永久刪除本人帳號'})).toBeDisabled();expect(screen.getByLabelText('刪除帳號的目前密碼')).toHaveAttribute('readonly');fireEvent.click(screen.getByRole('button',{name:'重試安全讀取刪除恢復資料'}));await screen.findByText('原刪除操作的結果仍未確認；不會自動重送刪除。');expect(storedOriginal()).toBe(winner);expect(screen.queryByLabelText('刪除帳號的目前密碼')).not.toBeInTheDocument();expect(fetch.mock.calls.some(([,init])=>(init as RequestInit|undefined)?.method==='DELETE')).toBe(false);
  });
  it('keeps persisted original proof but sends no DELETE after unmount during encrypted publication',async()=>{
    let release:()=>void=()=>{};vault.save.mockImplementationOnce(async(key:string,body:string)=>{await new Promise<void>(done=>{release=done;});bodies.set(key,body);});const fetch=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/deletion-impact')?ok(preview):ok({id:19}));vi.stubGlobal('fetch',fetch);const view=mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));await waitFor(()=>expect(vault.save).toHaveBeenCalledTimes(1));view.unmount();await act(async()=>release());expect(storedOriginal()).toContain(actionId);expect(fetch.mock.calls.some(([,init])=>(init as RequestInit|undefined)?.method==='DELETE')).toBe(false);expect(erasePrivatePendingData).not.toHaveBeenCalled();
  });
  it('retains a confirmed result through final journal cleanup failure and retries only cleanup',async()=>{
    localStorage.setItem(PENDING_DELETION_KEY,JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:actionId,originalToken:'old-session'}));const fetch=vi.fn(async()=>ok(ack));vi.stubGlobal('fetch',fetch);vault.clear.mockResolvedValueOnce(false);mount();await screen.findByText(/此瀏覽器的本人待確認資料已清理/);
    fireEvent.click(screen.getByRole('button',{name:'完成並登出'}));await screen.findByText('刪除結果已確認，但瀏覽器恢復資料尚未清理；請先關閉此分頁。');expect(screen.getByText('伺服器已確認帳號刪除。')).toBeInTheDocument();expect(storedOriginal()).toContain(actionId);expect(auth.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'完成並登出'}));await waitFor(()=>expect(auth.logout).toHaveBeenCalledTimes(1));expect(storedOriginal()).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);expect(vault.clear).toHaveBeenCalledTimes(2);
  });
  it('offers readable English sign-in and recovery without a mutation',async()=>{
    localStorage.setItem('user-locale','en-US');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mount({...auth,user:null,token:null,isAuthenticated:false});
    expect(screen.getByRole('heading',{name:'Delete your Weesh (Wishlist.ai) account and related data'})).toBeInTheDocument();expect(await screen.findByRole('link',{name:'Sign in to continue'})).toHaveAttribute('href','/login?next=%2Faccount-deletion');expect(screen.getByRole('link',{name:'Reset password'})).toHaveAttribute('href','/forgot-password');expect(fetch).not.toHaveBeenCalled();
  });
  it('reopens an unknown English original operation by GET only and never treats 404 as success',async()=>{
    localStorage.setItem('user-locale','en-US');localStorage.setItem(PENDING_DELETION_KEY,JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:actionId,originalToken:'old-session'}));const fetch=vi.fn(async()=>({ok:false,status:404}));vi.stubGlobal('fetch',fetch);mount();
    await screen.findByText('The original deletion result is unconfirmed. Deletion will not be resent automatically.');expect(screen.getByRole('button',{name:'Check original result only'})).toBeEnabled();expect(fetch.mock.calls).toHaveLength(1);expect(screen.queryByText('The server confirmed account deletion.')).not.toBeInTheDocument();expect(storedOriginal()).toContain(actionId);expect(erasePrivatePendingData).not.toHaveBeenCalled();
  });
  it('holds its duplicate gate and input lock through proof and persistence faults, exposing no raw storage details',async()=>{
    let resolve:(value:ReturnType<typeof ok>)=>void=()=>{};const fetch=vi.fn((input:RequestInfo|URL,_init?:RequestInit)=>String(input).endsWith('/deletion-impact')?Promise.resolve(ok(preview)):new Promise<ReturnType<typeof ok>>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetch);mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});const form=screen.getByLabelText('刪除帳號的目前密碼').closest('form')!;fireEvent.submit(form);fireEvent.submit(form);
    expect(window.confirm).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(2);expect(screen.getByLabelText('刪除帳號的目前密碼')).toBeDisabled();expect(screen.getByLabelText('輸入刪除帳號以確認')).toBeDisabled();
    vault.save.mockRejectedValueOnce(Error('raw-private-storage-value'));await act(async()=>resolve(ok({id:19})));await screen.findByText('無法安全保存原刪除操作；沒有送出刪除。請保留本頁並重試。');expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();expect(screen.queryByText(/raw-private-storage/)).not.toBeInTheDocument();expect(screen.getByLabelText('刪除帳號的目前密碼')).toHaveValue('fixture-password');expect(fetch.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(false);
  });
  it('uses English typed confirmation while preserving the exact server deletion contract',async()=>{
    localStorage.setItem('user-locale','en-US');const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>String(input).endsWith('/deletion-impact')?ok(preview):init?.method==='DELETE'?ok(ack):ok({id:19}));vi.stubGlobal('fetch',fetch);mount();
    await screen.findByText(/Wishlists 1, wishes 2, listings 3/);expect(screen.getByText('Type “DELETE ACCOUNT” to confirm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Current password for account deletion'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('Account deletion confirmation'),{target:{value:'刪除帳號'}});expect(screen.getByRole('button',{name:'Permanently delete my account'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Account deletion confirmation'),{target:{value:'DELETE ACCOUNT'}});fireEvent.click(screen.getByRole('button',{name:'Permanently delete my account'}));await screen.findByText('The server confirmed account deletion.');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Permanently delete your currently signed-in account?'));
    expect(JSON.parse(String(fetch.mock.calls.find(([,init])=>init?.method==='DELETE')![1]?.body))).toEqual({currentPassword:'fixture-password',clientActionId:actionId,confirmation:'DELETE_MY_ACCOUNT'});expect(storedOriginal()).not.toContain('fixture-password');expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });
  it('falls back to English when reading the optional locale fails, preserving deletion journal checks',async()=>{
    vi.spyOn(localStorage,'getItem').mockImplementation(key=>{if(key==='user-locale')throw Error('locale read failed');return null;});vi.stubGlobal('fetch',vi.fn());mount({...auth,user:null,token:null,isAuthenticated:false});expect(await screen.findByRole('link',{name:'Sign in to continue'})).toBeInTheDocument();
  });
  it('keeps corrupt journal recovery closed in English',async()=>{
    localStorage.setItem('user-locale','en-US');localStorage.setItem(PENDING_DELETION_KEY,'{invalid');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mount();expect(await screen.findByRole('alert')).toHaveTextContent('original deletion journal could not be read safely');expect(screen.queryByRole('button',{name:'Permanently delete my account'})).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['account-change','token-rotation','unmount'])('stops before journal publication and DELETE when departure occurs during proof: %s',async mode=>{
    let resolve:(value:ReturnType<typeof ok>)=>void=()=>{};const fetch=vi.fn((input:RequestInfo|URL,_init?:RequestInit)=>String(input).endsWith('/deletion-impact')?Promise.resolve(ok(preview)):new Promise<ReturnType<typeof ok>>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetch);const view=mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    if(mode==='unmount')view.unmount();else view.rerender(<MemoryRouter><AuthContext.Provider value={{...auth,user:{id:mode==='account-change'?20:19,phoneNumber:'fixture'},token:'new-session'}}><AccountDeletionPage/></AuthContext.Provider></MemoryRouter>);
    await act(async()=>resolve(ok({id:19})));expect(fetch.mock.calls.some(([,init])=>(init as RequestInit|undefined)?.method==='DELETE')).toBe(false);expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();expect(erasePrivatePendingData).not.toHaveBeenCalled();
    if(mode!=='unmount'){await screen.findByText(/願望清單 1、願望 2、刊登 3/);expect(screen.getByLabelText('刪除帳號的目前密碼')).toHaveValue('');expect(screen.getByLabelText('輸入刪除帳號以確認')).toHaveValue('');}
  });
  it('ignores a late DELETE reply after account change, retaining original proof without cleaning new or old scope',async()=>{
    let resolve:(value:ReturnType<typeof ok>)=>void=()=>{};const fetch=vi.fn((input:RequestInfo|URL,init?:RequestInit)=>String(input).endsWith('/deletion-impact')?Promise.resolve(ok(preview)):init?.method==='DELETE'?new Promise<ReturnType<typeof ok>>(done=>{resolve=done;}):Promise.resolve(ok({id:19})));vi.stubGlobal('fetch',fetch);const view=mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));await waitFor(()=>expect(fetch.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(true));
    view.rerender(<MemoryRouter><AuthContext.Provider value={{...auth,user:{id:20,phoneNumber:'other'},token:'other-session'}}><AccountDeletionPage/></AuthContext.Provider></MemoryRouter>);await act(async()=>resolve(ok(ack)));
    expect(await screen.findByRole('alert')).toHaveTextContent('另一帳號的未確認刪除操作');expect(screen.queryByText('伺服器已確認帳號刪除。')).not.toBeInTheDocument();expect(erasePrivatePendingData).not.toHaveBeenCalled();expect(storedOriginal()).toContain(actionId);expect(auth.logout).not.toHaveBeenCalled();
  });
  it('retains a newer journal published during current-account proof and sends nothing',async()=>{
    let resolve:(value:ReturnType<typeof ok>)=>void=()=>{};const fetch=vi.fn((input:RequestInfo|URL,_init?:RequestInit)=>String(input).endsWith('/deletion-impact')?Promise.resolve(ok(preview)):new Promise<ReturnType<typeof ok>>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetch);mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));
    const newer=JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:'22222222-2222-4222-8222-222222222222',originalToken:'original-other-tab'});localStorage.setItem(PENDING_DELETION_KEY,newer);await act(async()=>resolve(ok({id:19})));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法安全保存原刪除操作');expect(storedOriginal()).toBe(newer);expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();expect(fetch.mock.calls.some(([,init])=>(init as RequestInit|undefined)?.method==='DELETE')).toBe(false);expect(screen.getByLabelText('刪除帳號的目前密碼')).toHaveValue('fixture-password');
  });
  it('never removes a newer journal when finishing an already confirmed original result',async()=>{
    localStorage.setItem(PENDING_DELETION_KEY,JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:actionId,originalToken:'old-session'}));vi.stubGlobal('fetch',vi.fn(async()=>ok(ack)));mount();await screen.findByText(/此瀏覽器的本人待確認資料已清理/);
    const newer=JSON.stringify({version:1,apiUrl:API_URL,userId:19,clientActionId:'22222222-2222-4222-8222-222222222222',originalToken:'newer-session'});localStorage.setItem(PENDING_DELETION_KEY,newer);fireEvent.click(screen.getByRole('button',{name:'完成並登出'}));expect(await screen.findByRole('alert')).toHaveTextContent('瀏覽器恢復資料尚未清理');expect(localStorage.getItem(PENDING_DELETION_KEY)).toBe(newer);expect(auth.logout).not.toHaveBeenCalled();
  });
  it('renders bounded proof errors rather than raw diagnostics or a credential echo',async()=>{
    const fetch=vi.fn(async(input:RequestInfo|URL)=>{if(String(input).endsWith('/deletion-impact'))return ok(preview);throw Error('raw-secret-database-password');});vi.stubGlobal('fetch',fetch);mount();await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));await screen.findByText('登入帳號已改變；沒有送出刪除。');expect(screen.queryByText(/raw-secret/)).not.toBeInTheDocument();expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });
  it('retains a usable guarded form under StrictMode and honors cancellation without proof or DELETE',async()=>{
    vi.spyOn(window,'confirm').mockReturnValue(false);const fetch=vi.fn(async()=>ok(preview));vi.stubGlobal('fetch',fetch);render(<StrictMode><MemoryRouter><AuthContext.Provider value={auth}><AccountDeletionPage/></AuthContext.Provider></MemoryRouter></StrictMode>);await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'),{target:{value:'fixture-password'}});fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'),{target:{value:'刪除帳號'}});fireEvent.click(screen.getByRole('button',{name:'永久刪除本人帳號'}));expect(window.confirm).toHaveBeenCalledTimes(1);expect(fetch.mock.calls.every(([input])=>String(input).endsWith('/deletion-impact'))).toBe(true);expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });
  it('is usable without an installed app or an existing web login', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: null, token: null, isAuthenticated: false });
    expect(screen.getByRole('heading', { name: '刪除 Weesh（Wishlist.ai）帳號與相關資料' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '登入後繼續' })).toHaveAttribute('href', '/login?next=%2Faccount-deletion');
    expect(screen.getByRole('link', { name: '重設密碼' })).toHaveAttribute('href', '/forgot-password');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires an impact preview and current-account proof before sending a single deletion', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      if (path.endsWith('/deletion-impact')) return ok(preview);
      if (path.endsWith('/users/me') && method === 'GET') return ok({ id: 19 });
      if (path.endsWith('/users/me') && method === 'DELETE') return ok(ack);
      throw new Error(`Unexpected ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    const submit = await screen.findByRole('button', { name: '永久刪除本人帳號' });
    expect(submit).toBeDisabled();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(submit);
    await screen.findByText('伺服器已確認帳號刪除。');
    const deletes = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String(deletes[0][1]?.body))).toEqual({ currentPassword: 'correct-password', clientActionId: actionId, confirmation: 'DELETE_MY_ACCOUNT' });
    const stored = storedOriginal() ?? '';expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
    expect(stored).toContain(actionId);
    expect(stored).not.toContain('correct-password');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('never resends deletion after a lost response and preserves the original operation for lookup', async () => {
    let receipts = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      if (path.endsWith('/deletion-impact')) return ok(preview);
      if (path.endsWith('/users/me') && method === 'GET') return ok({ id: 19 });
      if (path.endsWith('/users/me') && method === 'DELETE') throw new Error('lost reply');
      if (path.includes('/deletion-operations/') && method === 'GET') return ++receipts === 1 ? { ok: false, status: 404 } : ok(ack);
      throw new Error(`Unexpected ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(screen.getByRole('button', { name: '永久刪除本人帳號' }));
    await screen.findByText(/尚未確認刪除結果；原操作已保存/);
    expect(storedOriginal()).toContain(actionId);
    fireEvent.click(screen.getByRole('button', { name: '只查詢原操作結果' }));
    await screen.findByText('伺服器已確認帳號刪除。');
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    expect(receipts).toBe(2);
  });

  it('refuses deletion when the authenticated account changed', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/deletion-impact') ? ok(preview) : ok({ id: 20 }));
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText(/願望清單 1、願望 2、刊登 3/);
    fireEvent.change(screen.getByLabelText('刪除帳號的目前密碼'), { target: { value: 'correct-password' } });
    fireEvent.change(screen.getByLabelText('輸入刪除帳號以確認'), { target: { value: '刪除帳號' } });
    fireEvent.click(screen.getByRole('button', { name: '永久刪除本人帳號' }));
    await screen.findByText('登入帳號已改變；沒有送出刪除。');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });

  it('recovers by GET only when a saved operation survives a page reload', async () => {
    localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify({ version: 1, apiUrl: API_URL, userId: 19, clientActionId: actionId, originalToken: 'old-session' }));
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/deletion-operations/');
      expect(init?.method).toBeUndefined();
      return ok(ack);
    });
    vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: null, token: null, isAuthenticated: false });
    await screen.findByText('伺服器已確認帳號刪除。');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer old-session' });
  });

  it('does not look up the old account when a different account is signed in', async () => {
    localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify({ version: 1, apiUrl: API_URL, userId: 19, clientActionId: actionId, originalToken: 'old-session' }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mount({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' });
    expect(await screen.findByRole('alert')).toHaveTextContent('另一帳號的未確認刪除操作');
    expect(fetch).not.toHaveBeenCalled();
    expect(erasePrivatePendingData).not.toHaveBeenCalled();
  });
  it('cleans only the original scope after a real ERASED receipt, retaining recovery proof if local cleanup fails', async () => {
    localStorage.setItem(PENDING_DELETION_KEY, JSON.stringify({ version: 1, apiUrl: API_URL, userId: 19, clientActionId: actionId, originalToken: 'old-session' }));
    erasePrivatePendingData.mockRejectedValueOnce(new Error('storage unavailable')); vi.stubGlobal('fetch', vi.fn(async () => ok(ack)));
    mount({ ...auth, user: null, token: null, isAuthenticated: false });
    await screen.findByText(/此瀏覽器的私密資料尚未完成清理/);
    expect(erasePrivatePendingData).toHaveBeenCalledWith(new URL(API_URL, window.location.origin).href, 19);
    expect(screen.getByRole('button', { name: '完成並登出' })).toBeDisabled(); expect(storedOriginal()).toContain(actionId);
    fireEvent.click(screen.getByRole('button', { name: '重試本機資料清理' }));
    await screen.findByText(/此瀏覽器的本人待確認資料已清理/); fireEvent.click(screen.getByRole('button', { name: '完成並登出' }));
    await waitFor(()=>expect(auth.logout).toHaveBeenCalledTimes(1)); expect(storedOriginal()).toBeNull();expect(localStorage.getItem(PENDING_DELETION_KEY)).toBeNull();
  });
});
