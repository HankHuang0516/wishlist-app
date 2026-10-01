import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingAssistantWeb from './MarketingAssistantWeb';
const source = '11111111-1111-4111-8111-111111111111', listingId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const media = [1, 2, 3, 4].map(slot => ({ id: `44444444-4444-4444-8444-44444444444${slot}`, marketingSlot: slot, marketingSelected: false }));
const job = { id: jobId, status: 'REVIEW', parentJobId: null, deliveredAt: new Date().toISOString(), copy: '測試行銷文案', generatedMedia: media };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const releaseApproval = vi.fn();
const props = { token: 'fixture-session', sourceMediaId: source, listingId, beforeStart: vi.fn(async () => true), beforeApprove: vi.fn(async () => releaseApproval), onApproved: vi.fn(async () => undefined) };
beforeEach(() => { props.beforeStart.mockClear(); props.beforeApprove.mockClear(); props.onApproved.mockClear(); releaseApproval.mockClear(); });
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
  it('does not approve when the host has unsaved edits or an unresolved draft operation', async () => {
    const fetch=install(); render(<MarketingAssistantWeb {...props} beforeApprove={async()=>null} />); await open(); await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));
    await screen.findByText('請先完成或查核商品儲存；未儲存的修改不會被行銷結果覆蓋。');
    expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false); expect(props.onApproved).not.toHaveBeenCalled();
  });
  it('holds an approval guard through refresh and releases exactly once despite double clicking',async()=>{
    const fetch=install(); let finish!:()=>void;
    const refresh=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    render(<MarketingAssistantWeb {...props} onApproved={refresh} />); await open(); await screen.findByDisplayValue(job.copy);
    const approve=screen.getByRole('button',{name:'確認照片與文案'}); fireEvent.click(approve); fireEvent.click(approve);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledOnce()); expect(releaseApproval).not.toHaveBeenCalled(); expect(approve).toBeDisabled();
    expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/approve')&&init?.method==='POST')).toHaveLength(1);
    await act(async()=>finish()); expect(releaseApproval).toHaveBeenCalledOnce(); await screen.findByText('已更新商品照片與文案；實拍原圖保留。');
  });
  it('preserves acknowledged success if the host refresh fails and retries only GET and refresh',async()=>{
    let applied=false;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/availability'))return ok({available:true});
      if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});
      if(url.endsWith('/approve')){applied=true;return ok({listingId,selectedMediaIds:media.map(m=>m.id)});}
      if(url.endsWith(`/jobs/${jobId}`))return ok({...job,status:applied?'COMPLETED':'REVIEW',selectedMediaIds:media.map(m=>m.id)});
      throw Error('photo unavailable');
    }); vi.stubGlobal('fetch',fetch);
    const refresh=vi.fn().mockRejectedValueOnce(Error('read failed')).mockResolvedValue(undefined);
    render(<MarketingAssistantWeb {...props} onApproved={refresh}/>); await open();await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));await screen.findByText('後台已確認套用，畫面尚未重新讀取；請只重新核對，不要再套用。');
    expect(releaseApproval).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'查核原行銷套用結果'}));
    await screen.findByText('已重新核對已套用的行銷結果；沒有再次套用。');
    expect(fetch.mock.calls.filter(([url,init])=>url.endsWith('/approve')&&init?.method==='POST')).toHaveLength(1); expect(refresh).toHaveBeenCalledTimes(2); expect(releaseApproval).toHaveBeenCalledTimes(2);
  });
  it.each(['same','wrong-copy','wrong-order','pending'])('unknown approve ACK uses only readback: %s proof',async(mode)=>{
    let sent=false;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/availability'))return ok({available:true});if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});
      if(url.endsWith('/approve')){sent=true;throw Error('committed lost ACK');}
      if(url.endsWith(`/jobs/${jobId}`))return ok({...job,status:sent&&mode!=='pending'?'COMPLETED':'REVIEW',copy:sent&&mode==='wrong-copy'?'另一份文案':job.copy,selectedMediaIds:sent&&mode==='wrong-order'?[...media].reverse().map(m=>m.id):media.map(m=>m.id)});
      throw Error('photo unavailable');
    });vi.stubGlobal('fetch',fetch);render(<MarketingAssistantWeb {...props}/>);await open();await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));await screen.findByText('套用結果尚未確認，不代表失敗；請重新載入核對原工作與商品，不要連續重送。');
    expect(screen.getByRole('button',{name:'確認照片與文案'})).toBeDisabled();expect(screen.getByRole('textbox',{name:'編輯行銷文案'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'查核原行銷套用結果'}));
    await screen.findByText(mode==='same'?'已重新核對已套用的行銷結果；沒有再次套用。':'原套用結果仍待確認；保留原選圖與文案，不會再次套用。');
    expect(props.onApproved).toHaveBeenCalledTimes(mode==='same'?1:0); expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  });
  it('does not send after unmount while acquiring the approval guard and releases it',async()=>{
    const fetch=install();let finish!:(release:()=>void)=>void;
    const guard=vi.fn(()=>new Promise<()=>void>(resolve=>{finish=resolve;}));
    const view=render(<MarketingAssistantWeb {...props} beforeApprove={guard}/>);await open();await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));view.unmount();await act(async()=>finish(releaseApproval));
    expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);expect(releaseApproval).toHaveBeenCalledOnce();expect(props.onApproved).not.toHaveBeenCalled();
  });
  it('shows an approved selection as read-only while retaining the unused free revision option',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.endsWith('/availability'))return ok({available:true});if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});if(url.endsWith(`/jobs/${jobId}`))return ok({...job,status:'COMPLETED',selectedMediaIds:media.map(m=>m.id)});throw Error('photo unavailable');}));
    render(<MarketingAssistantWeb {...props}/>);await open();await screen.findByDisplayValue(job.copy);
    for(const check of screen.getAllByRole('checkbox',{name:/選用/}))expect(check).toBeDisabled();expect(screen.getByRole('button',{name:'拖放圖 1，目前第 1 張'})).toBeDisabled();expect(screen.getByRole('button',{name:'免費調整一次'})).toBeEnabled();
  });
});
