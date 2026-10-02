/// <reference types="node" />
import { webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EmailDiagnostics from './EmailDiagnostics';
import { privatePendingStore } from '../lib/webPendingStore';
const rows = vi.hoisted(() => new Map<string,string>());
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: { get: vi.fn(), save: vi.fn(), clear: vi.fn() } }));
const onBusy = vi.fn();
const view = (userId = 42, token = 'synthetic-session') => <EmailDiagnostics token={token} userId={userId} onBusy={onBusy} />;
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const marker = (id = '11111111-1111-4111-8111-111111111111') => JSON.stringify({ version: 1, localOperationId: id, startedAt: '2026-10-02T00:00:00.000Z' });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rows.clear(); onBusy.mockClear(); vi.stubGlobal('crypto', webcrypto); localStorage.setItem('user-locale','en-US');
  vi.mocked(privatePendingStore.get).mockReset().mockImplementation(async key => rows.get(key) ?? null);
  vi.mocked(privatePendingStore.save).mockReset().mockImplementation(async (key, raw) => { if (rows.has(key) && rows.get(key) !== raw) throw Error('conflict'); rows.set(key, raw); });
  vi.mocked(privatePendingStore.clear).mockReset().mockImplementation(async (key, raw) => { if (rows.get(key) !== raw) return false; rows.delete(key); return true; });
  fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? ok({ success:true,notificationStatus:'ACCEPTED' }) : ok({ userId:42,canSend:true })); vi.stubGlobal('fetch',fetcher);
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const start = async () => { render(view()); return screen.findByRole('button',{ name:'Send test email' }); };
const posts = () => fetcher.mock.calls.filter(call => call[1]?.method === 'POST');

it('uses server admission and hides the tool for a non-admitted user without a POST', async () => {
  fetcher.mockResolvedValueOnce(ok({ userId:42,canSend:false })); render(view()); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button',{name:'Send test email'})).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
});
it('bounds invalid capability identity and restores with explicit GET only', async () => {
  fetcher.mockResolvedValueOnce(ok({ userId:43,canSend:true })); render(view()); await screen.findByText('Diagnostic permission is unconfirmed. Nothing was sent.');
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByRole('button',{name:'Send test email'}); expect(posts()).toHaveLength(0);
});
it('persists before POST, synchronously fences duplicates and never claims inbox delivery', async () => {
  let finish!: (value: unknown) => void; fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? new Promise(resolve => { finish=resolve; }) : ok({ userId:42,canSend:true }));
  const button = await start(); fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(posts()).toHaveLength(1));
  expect(rows.size).toBe(1); expect([...rows.values()][0]).not.toMatch(/synthetic-session|token|password|email/i); expect(onBusy).toHaveBeenCalledWith(true);
  await act(async () => finish(ok({ success:true,notificationStatus:'ACCEPTED' }))); await screen.findByText('The mail service accepted the test request. Inbox delivery is unconfirmed.');
  expect(rows.size).toBe(0); expect(posts()).toHaveLength(1); expect(onBusy).toHaveBeenLastCalledWith(false);
});
it('stops before dispatch on failed persistence, preserves a competing marker and rereads safely', async () => {
  vi.mocked(privatePendingStore.save).mockImplementationOnce(async key => { rows.set(key,marker()); throw Error('private-disk-credential'); });
  fireEvent.click(await start()); await screen.findByText(/local operation could not be saved/); expect(posts()).toHaveLength(0);
  expect(screen.queryByText('private-disk-credential')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByText(/Sending is unconfirmed/); expect(rows.size).toBe(1); expect(posts()).toHaveLength(0);
});
it('keeps an unknown ACK across reopening without another POST or a false receipt check', async () => {
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? ok({ success:true,id:'old-provider-data',log:'private' }) : ok({ userId:42,canSend:true }));
  const mounted = render(view()); fireEvent.click(await screen.findByRole('button',{name:'Send test email'})); await screen.findByText(/Sending is unconfirmed/); const raw=[...rows.values()][0];
  mounted.unmount(); render(view()); await screen.findByText(/local marker is not a server receipt/i); expect([...rows.values()][0]).toBe(raw); expect(posts()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByText(/Sending is unconfirmed/); expect(posts()).toHaveLength(1);
});
it('cleans only a known rejection and requires a new explicit action for any future send', async () => {
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? { ok:false,status:403,json:async()=>({errorCode:'EMAIL_DIAGNOSTICS_DENIED'}) } : ok({ userId:42,canSend:true }));
  fireEvent.click(await start()); await screen.findByText('The server rejected this operation. No mail was sent.'); expect(rows.size).toBe(0); expect(posts()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByRole('button',{name:'Send test email'}); expect(posts()).toHaveLength(1);
});
it('remains cleanup-only after a verified reply and failed local cleanup', async () => {
  vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(Error('private-cleanup-error'));
  fireEvent.click(await start()); await screen.findByText('The reply was verified. The local reminder needs cleanup. Retry cleanup only.');
  expect(screen.queryByText(/Sending is unconfirmed/)).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button',{name:'Clear local reminder only'})); await screen.findByText(/mail service accepted the test request/); expect(rows.size).toBe(0); expect(posts()).toHaveLength(1);
});
it('does not dispatch after departure while persisting the original marker', async () => {
  let persist!: () => void; vi.mocked(privatePendingStore.save).mockImplementationOnce((key,raw) => new Promise(resolve => { persist=()=>{rows.set(key,raw);resolve();}; }));
  const mounted=render(view()); fireEvent.click(await screen.findByRole('button',{name:'Send test email'})); await waitFor(() => expect(persist).toBeTypeOf('function')); mounted.unmount(); await act(async () => persist()); expect(posts()).toHaveLength(0); expect(rows.size).toBe(1);
});
it('does not dispatch after leaving during the fresh permission read and retains the marker', async () => {
  let finish!: (value: unknown) => void; let reads=0;
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method==='GET' && ++reads===2 ? new Promise(resolve=>{finish=resolve;}) : ok({userId:42,canSend:true}));
  const mounted=render(view()); fireEvent.click(await screen.findByRole('button',{name:'Send test email'})); await waitFor(()=>expect(finish).toBeTypeOf('function')); mounted.unmount(); await act(async()=>finish(ok({userId:42,canSend:true}))); expect(posts()).toHaveLength(0); expect(rows.size).toBe(1);
});
it('retains a late accepted marker after departure instead of clearing another session’s evidence', async () => {
  let finish!: (value: unknown) => void;
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => init?.method==='POST' ? new Promise(resolve=>{finish=resolve;}) : ok({userId:42,canSend:true}));
  const mounted=render(view()); fireEvent.click(await screen.findByRole('button',{name:'Send test email'})); await waitFor(()=>expect(posts()).toHaveLength(1)); mounted.unmount(); await act(async()=>finish(ok({success:true,notificationStatus:'ACCEPTED'}))); expect(rows.size).toBe(1); expect(privatePendingStore.clear).not.toHaveBeenCalled();
});
it('requires explicit manual verification before clearing an unknown reminder and never resends during cleanup', async () => {
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => { if(init?.method==='POST')throw Error('private-network-error'); return ok({userId:42,canSend:true}); });
  fireEvent.click(await start()); await screen.findByText(/Sending is unconfirmed/); expect(screen.getByRole('button',{name:'Clear local reminder only'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'I checked the mail service and understand cleanup does not cancel the original request'})); fireEvent.click(screen.getByRole('button',{name:'Clear local reminder only'})); await waitFor(()=>expect(rows.size).toBe(0)); expect(posts()).toHaveLength(1);
});
it('rejects a newer journal before POST and rereads its local identity without clearing it', async () => {
  const next=marker('22222222-2222-4222-8222-222222222222'); let reads=0;
  fetcher.mockImplementation(async () => { if(++reads===2){const key=[...rows.keys()][0]; rows.set(key,next);} return ok({userId:42,canSend:true}); });
  fireEvent.click(await start()); await screen.findByText('Another local operation remains. Read it again.'); expect(posts()).toHaveLength(0); expect(privatePendingStore.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByText(/22222222-2222-4222-8222-222222222222/); expect([...rows.values()][0]).toBe(next);
});
it('cleans a saved marker without POST when fresh permission reading fails', async () => {
  let reads=0; fetcher.mockImplementation(async()=>{ if(++reads===2)throw Error('private-permission-error'); return ok({userId:42,canSend:true}); });
  fireEvent.click(await start()); await screen.findByText('Diagnostic permission is unconfirmed. Nothing was sent.'); expect(rows.size).toBe(0); expect(posts()).toHaveLength(0);
});
it('preserves a newer marker after the original accepted reply and rereads it instead of clearing another operation', async () => {
  const next=marker('22222222-2222-4222-8222-222222222222');
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => { if(init?.method==='POST'){rows.set([...rows.keys()][0],next);return ok({success:true,notificationStatus:'ACCEPTED'});} return ok({userId:42,canSend:true}); });
  fireEvent.click(await start()); await screen.findByText('Another local operation remains. Read it again.'); expect([...rows.values()][0]).toBe(next); expect(privatePendingStore.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByText(/22222222-2222-4222-8222-222222222222/); expect(posts()).toHaveLength(1);
});
it('freezes a corrupt original marker before reading permission or sending and allows explicit safe rereading', async () => {
  vi.mocked(privatePendingStore.get).mockResolvedValueOnce('{bad'); render(view()); await screen.findByText(/local operation could not be saved or read safely/); expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Retry reading diagnostic permission and reminder'})); await screen.findByRole('button',{name:'Send test email'}); expect(posts()).toHaveLength(0);
});
it('fences a late permission result when the account changes', async () => {
  let finish!: (value:unknown)=>void;
  fetcher.mockImplementation(async (_url:string,init?:RequestInit)=>init?.headers && (init.headers as Record<string,string>).Authorization==='Bearer synthetic-session' ? new Promise(resolve=>{finish=resolve;}) : ok({userId:43,canSend:false}));
  const mounted=render(view()); await waitFor(()=>expect(finish).toBeTypeOf('function')); mounted.rerender(view(43,'other-synthetic-session'));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2)); await act(async()=>finish(ok({userId:42,canSend:true}))); expect(screen.queryByRole('button',{name:'Send test email'})).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
});
it('restores Chinese pending controls without a capability POST or raw error content', async () => {
  localStorage.setItem('user-locale','zh-TW'); vi.mocked(privatePendingStore.get).mockResolvedValue(marker()); render(view()); await screen.findByText('寄送結果未確認；重開不會自動重送。'); expect(fetcher).not.toHaveBeenCalled(); expect(screen.getByRole('button',{name:'只清理本機提醒'})).toBeDisabled();
});
