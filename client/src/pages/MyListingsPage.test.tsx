import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import MyListingsPage from './MyListingsPage';
import { marketplaceOrigin } from '../lib/managedListingWeb';
import { webcrypto } from 'node:crypto';
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:{get:async()=>null,save:vi.fn(),clear:vi.fn()}}));
const id = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const photo = '33333333-3333-4333-8333-333333333333';
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'fixture-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const row = { id, ownerUserId: 19, owner: { id: 19 }, version: 1, title: '三國演義測試漫畫', description: '僅作測試的完整商品說明',
  status: 'ACTIVE', condition: 'USED', category: 'books', price: '250', currency: 'TWD', createdAt: '2026-09-29T00:00:00Z', publishedAt: '2026-09-29T00:00:00Z', expiresAt: '2100-10-30T15:59:59Z', location: { county: '臺北市', district: '中山區' }, media: [] };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><MyListingsPage /></AuthContext.Provider></MemoryRouter>;
beforeEach(() => {vi.stubGlobal('crypto',webcrypto);vi.spyOn(window, 'confirm').mockReturnValue(true);});
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
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? ok({ ...row, title: '新版測試漫畫', price: '300', version: 2 }) : ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title });
    fireEvent.click(screen.getByRole('button', { name: '編輯資訊' }));
    expect(screen.getByLabelText('商品說明')).toHaveValue(row.description);
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '新版測試漫畫' } });
    fireEvent.change(screen.getByLabelText('售價（NT$，0 代表免費贈送）'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
    await screen.findByText('商品資訊已更新。');
    const request = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ expectedVersion: 1, title: '新版測試漫畫', description: row.description, price: 300 });
    expect(screen.getByText('NT$ 300')).toBeInTheDocument();
  });
  it('requires GET-only recovery after a lost mutation reply and never repeats a status change', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('lost reply');
      if (url.endsWith(`/listings/${id}`)) return ok({ ...row, status: 'SOLD', version: 2 });
      return ok({ items: [row], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); fireEvent.click(screen.getByRole('button', { name: '標記售出' }));
    await screen.findByRole('button', { name: '只查詢原商品最新狀態' });
    expect(screen.getByRole('button', { name: '標記售出' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '只查詢原商品最新狀態' }));
    await screen.findByText(/原操作未重送/); fireEvent.click(screen.getByRole('tab', { name: '已售出 (1)' }));
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '編輯資訊' })).not.toBeInTheDocument();
  });
  it('blocks stale version responses until authoritative state is reloaded', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? ok({ ...row, status: 'SOLD', version: 1 }) : ok({ items: [row], nextCursor: null })); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); fireEvent.click(screen.getByRole('button', { name: '標記售出' }));
    await screen.findByRole('alert'); expect(screen.getByRole('button', { name: '編輯資訊' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: '已售出 (0)' })).toBeInTheDocument();
  });
  it('treats past expiry as expired and requires a future extension before editing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ ...row, expiresAt: '2020-01-01T15:59:59Z' }], nextCursor: null })));
    render(view()); await screen.findByRole('tab', { name: '已失效 (1)' }); fireEvent.click(screen.getByRole('tab', { name: '已失效 (1)' }));
    expect(screen.queryByRole('button', { name: '編輯資訊' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '延長期限' }));
    expect(screen.getByLabelText('新的失效日期（台灣時間）')).toHaveAttribute('type', 'date');
  });
  it('includes name, price and versioned product link in the share fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [row], nextCursor: null })));
    render(view()); await screen.findByRole('heading', { name: row.title }); fireEvent.click(screen.getByRole('button', { name: '分享連結' }));
    await screen.findByText(/已複製商品分享/);
    expect(writeText).toHaveBeenCalledWith(`看看「${row.title}」｜NT$ 250：${marketplaceOrigin()}/listings/${id}?v=1`);
  });
  it('passes a real source photo and listing ID to the marketing extra option', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/marketing/availability')) return ok({ available: true });
      if (url.includes('/marketing/jobs?')) return ok({ job: null });
      return ok({ items: [{ ...row, media: [{ id: photo, thumbnailUrl: `${marketplaceOrigin()}/api/listing-media/${photo}/thumbnail`, capturePurpose: 'SELLER' }] }], nextCursor: null });
    }); vi.stubGlobal('fetch', fetch);
    render(view()); await screen.findByRole('heading', { name: row.title }); fireEvent.click(screen.getByRole('button', { name: '編輯資訊' }));
    const editor = screen.getByText('額外選項').parentElement!;
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
});
