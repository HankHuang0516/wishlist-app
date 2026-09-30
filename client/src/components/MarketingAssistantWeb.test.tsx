import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingAssistantWeb from './MarketingAssistantWeb';
const source = '11111111-1111-4111-8111-111111111111', listingId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const media = [1, 2, 3, 4].map(slot => ({ id: `44444444-4444-4444-8444-44444444444${slot}`, marketingSlot: slot, marketingSelected: false }));
const job = { id: jobId, status: 'REVIEW', parentJobId: null, deliveredAt: new Date().toISOString(), copy: '測試行銷文案', generatedMedia: media };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const props = { token: 'fixture-session', sourceMediaId: source, listingId, beforeStart: vi.fn(async () => true), onApproved: vi.fn(async () => undefined) };
beforeEach(() => { props.beforeStart.mockClear(); props.onApproved.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = async () => fireEvent.click(await screen.findByRole('button', { name: '開啟行銷小助手 Beta' }));
function install(latest: unknown = { job: { id: jobId } }) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/availability')) return ok({ available: true });
    if (url.includes('?sourceMediaId')) return ok(latest);
    if (url.endsWith(`/jobs/${jobId}`)) return ok(job);
    if (init?.method === 'POST') return ok({ id: jobId, status: 'PENDING' });
    throw new Error('photo mock unavailable');
  }); vi.stubGlobal('fetch', fetch); return fetch;
}
describe('shared web marketing entry for drafts and published products', () => {
  it('offers a collapsed Beta entry and four selectable images after expanding', async () => {
    install(); render(<MarketingAssistantWeb {...props} />); await open();
    expect(await screen.findByRole('textbox', { name: '編輯行銷文案' })).toHaveValue('測試行銷文案');
    expect(screen.getAllByRole('checkbox', { name: /選用/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: '確認照片與文案' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /往前移/ })).not.toBeInTheDocument();
  });
  it('supports keyboard sorting and sends the selected cover order to the same approve API', async () => {
    const fetch = install(); render(<MarketingAssistantWeb {...props} />); await open(); await screen.findByDisplayValue(job.copy);
    fireEvent.keyDown(screen.getByRole('button', { name: '拖放圖 2，目前第 2 張' }), { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: '拖放圖 2，目前第 1 張' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認照片與文案' }));
    await vi.waitFor(() => expect(props.onApproved).toHaveBeenCalledTimes(1));
    const approve = fetch.mock.calls.find(([url, init]) => url.endsWith('/approve') && init?.method === 'POST');
    expect(JSON.parse(String(approve?.[1]?.body))).toEqual({ selectedMediaIds: [media[1].id, media[0].id, media[2].id, media[3].id], copy: job.copy });
  });
  it('supports pointer drag on touch and mouse without arrow buttons', async () => {
    install(); render(<MarketingAssistantWeb {...props} />); await open(); await screen.findByDisplayValue(job.copy);
    const list = screen.getByRole('list'); const rows = within(list).getAllByRole('listitem');
    rows.forEach((element, index) => vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: index * 60, height: 60 } as DOMRect));
    const handle = screen.getByRole('button', { name: '拖放圖 1，目前第 1 張' });
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = vi.fn(() => true); handle.releasePointerCapture = vi.fn();
    // jsdom needs a PointerEvent implementation to preserve coordinates.
    vi.stubGlobal('PointerEvent', MouseEvent);
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 30 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 210 });
    expect(screen.getByRole('button', { name: '拖放圖 1，目前第 4 張' })).toBeInTheDocument();
  });
  it('holds the submit gate even while beforeStart is pending and includes the published listing ID', async () => {
    const fetch = install({ job: null }); let finish!: (value: boolean) => void;
    const beforeStart = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<MarketingAssistantWeb {...props} beforeStart={beforeStart} />); await open();
    const button = screen.getByRole('button', { name: '生成四張行銷圖' }); fireEvent.click(button); fireEvent.click(button);
    expect(beforeStart).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
    const create = fetch.mock.calls.filter(([url, init]) => url.endsWith('/marketing/jobs') && init?.method === 'POST');
    expect(create).toHaveLength(1);
    expect(JSON.parse(String(create[0][1]?.body))).toMatchObject({ sourceMediaId: source, listingId });
  });
});
