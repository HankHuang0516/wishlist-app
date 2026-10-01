import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingAssistantWeb from './MarketingAssistantWeb';
import { webcrypto } from 'node:crypto';
import { sha256 } from '../lib/webPendingStore';
import { marketingQueueJournal,parseMarketingQueueJournal } from '../lib/marketingQueueWeb';
import { marketingApprovalJournal,parseMarketingApprovalJournal } from '../lib/marketingApprovalWeb';
const queueStore=vi.hoisted(()=>({get:vi.fn(async(_key:string)=>null as string|null),save:vi.fn(async(_key:string,_raw:string)=>{}),clear:vi.fn(async(_key:string,_raw:string)=>true)}));
vi.mock('../lib/webPendingStore',async original=>({...await original<object>(),privatePendingStore:queueStore}));
const source = '11111111-1111-4111-8111-111111111111', listingId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const media = [1, 2, 3, 4].map(slot => ({ id: `44444444-4444-4444-8444-44444444444${slot}`, marketingSlot: slot, marketingSelected: false }));
const job = { id: jobId, sourceMediaId:source,listingId,status: 'REVIEW', parentJobId: null, deliveredAt: new Date().toISOString(), copy: '合成二手商品行銷文案，售價 NT$350。僅供隔離驗收，非真實商品。', generatedMedia: media,previousMedia:[],selectedMediaIds:[] };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const releaseApproval = vi.fn();
const props = { token: 'fixture-session',userId:42,getExpectedVersion:()=>1, sourceMediaId: source, listingId, beforeStart: vi.fn(async () => true), beforeApprove: vi.fn(async () => releaseApproval), onApproved: vi.fn(async () => undefined) };
beforeEach(() => {vi.stubGlobal('crypto',webcrypto);queueStore.get.mockReset().mockResolvedValue(null);queueStore.save.mockReset().mockResolvedValue(undefined);queueStore.clear.mockReset().mockResolvedValue(true); props.beforeStart.mockClear(); props.beforeApprove.mockClear(); props.onApproved.mockClear(); releaseApproval.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = async () => fireEvent.click(await screen.findByRole('button', { name: '開啟行銷小助手 Beta' }));
const approvalBody=()=>({kind:'APPROVE' as const,jobId,sourceMediaId:source,listingId,expectedVersion:1,selectedMediaIds:media.map(m=>m.id),copy:job.copy});
async function proof(clientActionId:string,body=approvalBody()) {return {receipt:{clientActionId,jobId:body.jobId,sourceMediaId:body.sourceMediaId,listingId:body.listingId,requestHash:await sha256(JSON.stringify(body)),state:'APPLIED',reason:null,appliedVersion:body.expectedVersion+1,selectedMediaIds:body.selectedMediaIds,copy:body.copy,createdAt:new Date().toISOString()}};}
const successNotice='已核對原確認回執（當時版本 2）；沒有再次套用。商品目前內容可能已有後續更新。';
function install(latest: unknown = { job: { id: jobId } }) {
  let applied:ReturnType<typeof approvalBody>|null=null;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/availability')) return ok({ available: true });
    if (url.includes('?sourceMediaId')) return ok(latest);
    if (url.endsWith(`/jobs/${jobId}`)) return ok(applied?{...job,status:'COMPLETED',copy:applied.copy,selectedMediaIds:applied.selectedMediaIds}:job);
    if (init?.method==='POST'&&url.includes('/approvals/')){applied=JSON.parse(String(init.body));return ok(await proof(url.split('/').at(-1)!,applied!));}
    if (init?.method === 'POST'&&url.includes('/requests/')){const body=JSON.parse(String(init.body)),clientRequestId=url.split('/').at(-1);return ok({receipt:{clientRequestId,sourceMediaId:source,requestHash:await sha256(JSON.stringify(body)),state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}});}
    if (init?.method === 'POST') return ok({ id: jobId, status: 'PENDING' });
    throw new Error('photo mock unavailable');
  }); vi.stubGlobal('fetch', fetch); return fetch;
}
describe('shared web marketing entry for drafts and published products', () => {
  it('waits for each pending poll before scheduling another and aborts on leaving',async()=>{
    let finish!:(value:unknown)=>void,jobReads=0;
    const scheduled:Array<()=>void>=[],realTimeout=window.setTimeout.bind(window);
    vi.spyOn(window,'setTimeout').mockImplementation((handler,delay,...args)=>{
      if(delay===3000){scheduled.push(()=>{if(typeof handler==='function')handler(...args);});return 9000+scheduled.length;}
      return realTimeout(handler,delay,...args);
    });
    const intervals=vi.spyOn(window,'setInterval'),clear=vi.spyOn(window,'clearTimeout');
    const pending={...job,status:'PENDING',copy:null,deliveredAt:null,generatedMedia:[]};
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/availability'))return ok({available:true});
      if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});
      if(url.endsWith('/jobs/'+jobId)){
        if(++jobReads===1)return ok(pending);
        return new Promise(resolve=>{finish=resolve;});
      }
      throw Error('unexpected');
    });vi.stubGlobal('fetch',fetch);
    const view=render(<MarketingAssistantWeb {...props}/>);
    await open();expect(scheduled).toHaveLength(1);
    await act(async()=>scheduled[0]());
    const polls=()=>fetch.mock.calls.filter(([url])=>url.endsWith('/jobs/'+jobId)).slice(1);
    expect(polls()).toHaveLength(1);
    expect(scheduled).toHaveLength(1);
    expect(intervals.mock.calls.some(([,delay])=>delay===3000)).toBe(false);
    await act(async()=>finish(ok(pending)));
    expect(scheduled).toHaveLength(2);expect(polls()).toHaveLength(1);
    await act(async()=>scheduled[1]());expect(polls()).toHaveLength(2);
    const signal=polls()[1][1]?.signal;expect(signal?.aborted).toBe(false);
    view.unmount();expect(signal?.aborted).toBe(true);expect(clear).toHaveBeenCalledWith(9002);
    await act(async()=>finish(ok(pending)));
    expect(scheduled).toHaveLength(2);expect(polls()).toHaveLength(2);
  });
  it('restores committed creation after reload with GET only, retaining exactly one request',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('write forbidden');if(url.includes('/requests/'))return ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:journal.requestHash,state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}});if(url.endsWith('/jobs/'+jobId))return ok(job);throw Error('private photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('已核對原行銷工作；沒有另建工作或再扣次數。');expect(queueStore.clear).toHaveBeenCalledWith(expect.stringContaining('marketing.'+source),raw);expect(fetch.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);expect(fetch.mock.calls.filter(([url])=>url.includes('/requests/'))).toHaveLength(1);expect(props.beforeStart).not.toHaveBeenCalled();
  });
  it('keeps unknown request frozen and explicitly retries the same ID and original body',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.includes('/requests/')&&init?.method==='POST')return ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:journal.requestHash,state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}});if(url.includes('/requests/'))throw Error('read unavailable');if(url.endsWith('/jobs/'+jobId))return ok(job);throw Error('unexpected');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原行銷排隊結果仍待查核；不會自動重送。');expect(screen.getByRole('button',{name:'生成四張行銷圖'})).toBeDisabled();
    const retry=screen.getByRole('button',{name:'以相同識別碼重試原排隊'});fireEvent.click(retry);fireEvent.click(retry);await screen.findByText('已核對原行銷工作；沒有另建工作或再扣次數。');
    const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toContain(journal.clientRequestId);expect(JSON.parse(String(writes[0][1]?.body))).toEqual(journal.body);
  });
  it('does not generate when encrypted storage is unavailable, and exposes retryable read error',async()=>{
    queueStore.get.mockRejectedValue(Error('storage'));const fetch=install({job:null});render(<MarketingAssistantWeb {...props}/>);await open();await screen.findByText('無法安全讀取行銷工作或本機紀錄；請重新查核，不會建立新工作。');expect(screen.getByRole('button',{name:'生成四張行銷圖'})).toBeDisabled();expect(fetch).not.toHaveBeenCalled();
  });
  it('known result with local cleanup failure offers cleanup only, no new request',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValue(raw);queueStore.clear.mockRejectedValueOnce(Error('clear')).mockResolvedValue(true);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method)throw Error('write forbidden');if(url.includes('/requests/'))return ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:journal.requestHash,state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}});if(url.endsWith('/jobs/'+jobId))return ok(job);throw Error('unexpected');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原結果已確認，但本機紀錄尚未清理；只重試清理，不會重送。');expect(screen.queryByRole('button',{name:'以相同識別碼重試原排隊'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'只重試清理原行銷紀錄'}));await screen.findByText('已核對原行銷工作；沒有另建工作或再扣次數。');expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
  });
  it('does not clear or accept a mismatched original receipt',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValue(raw);vi.stubGlobal('fetch',vi.fn(async()=>ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:'f'.repeat(64),state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}})));
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原行銷排隊結果仍待查核；不會自動重送。');expect(queueStore.clear).not.toHaveBeenCalled();expect(screen.queryByRole('textbox',{name:'編輯行銷文案'})).not.toBeInTheDocument();
  });
  it('requires second confirmation to fence an uncreated original request',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.endsWith('/abandon'))return ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:journal.requestHash,state:'ABANDONED',jobId:null,createdAt:new Date().toISOString()},job:null});throw Error('no receipt yet');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原行銷排隊結果仍待查核；不會自動重送。');fireEvent.click(screen.getByRole('button',{name:'取消未建立的原排隊'}));expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'確認取消未建立工作'}));await screen.findByText('原排隊操作已取消；未建立新工作。');expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  });
  it('ignores late original receipt after account replacement and never clears the old journal',async()=>{
    const raw=await marketingQueueJournal({kind:'CREATE',sourceMediaId:source,listingId,expectedVersion:1}),journal=await parseMarketingQueueJournal(raw);queueStore.get.mockResolvedValueOnce(raw).mockResolvedValue(null);let finish!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.includes('/requests/'))return new Promise(resolve=>{finish=resolve;});if(url.endsWith('/availability'))return ok({available:true});if(url.includes('?sourceMediaId'))return ok({job:null});throw Error('unexpected');}));
    const view=render(<MarketingAssistantWeb {...props}/>);await screen.findByRole('region',{name:'原行銷排隊操作待確認'});view.rerender(<MarketingAssistantWeb {...props} userId={43} token="other-fixture"/>);await screen.findByRole('button',{name:'開啟行銷小助手 Beta'});
    await act(async()=>finish(ok({receipt:{clientRequestId:journal.clientRequestId,sourceMediaId:source,requestHash:journal.requestHash,state:'QUEUED',jobId,createdAt:new Date().toISOString()},job:{id:jobId,status:'REVIEW',sourceMediaId:source,listingId,parentJobId:null}})));expect(queueStore.clear).not.toHaveBeenCalled();expect(screen.queryByText(job.copy)).not.toBeInTheDocument();
  });
  it('offers a collapsed Beta entry and four selectable images after expanding', async () => {
    install(); render(<MarketingAssistantWeb {...props} />); await open();
    expect(await screen.findByRole('textbox', { name: '編輯行銷文案' })).toHaveValue(job.copy);
    expect(screen.getAllByRole('checkbox', { name: /選用/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: '確認照片與文案' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /往前移/ })).not.toBeInTheDocument();
  });
  it('supports keyboard sorting and sends the selected cover order with the original action/context/version', async () => {
    const fetch = install(); render(<MarketingAssistantWeb {...props} />); await open(); await screen.findByDisplayValue(job.copy);
    fireEvent.keyDown(screen.getByRole('button', { name: '拖放圖 2，目前第 2 張' }), { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: '拖放圖 2，目前第 1 張' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認照片與文案' }));
    await vi.waitFor(() => expect(props.onApproved).toHaveBeenCalledTimes(1));
    const approve = fetch.mock.calls.find(([url, init]) => url.includes('/approvals/') && init?.method === 'POST');
    expect(JSON.parse(String(approve?.[1]?.body))).toEqual({ ...approvalBody(), selectedMediaIds: [media[1].id, media[0].id, media[2].id, media[3].id] });
    const recorded=await parseMarketingApprovalJournal(String(queueStore.save.mock.calls[0]?.[1]));expect(approve?.[0]).toContain(recorded.clientActionId);expect(recorded.body.selectedMediaIds).toEqual([media[1].id,media[0].id,media[2].id,media[3].id]);
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
    await vi.waitFor(()=>expect(fetch.mock.calls.filter(([url,init])=>url.includes('/marketing/requests/')&&init?.method==='POST')).toHaveLength(1));
    const create = fetch.mock.calls.filter(([url, init]) => url.includes('/marketing/requests/') && init?.method === 'POST');
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
    expect(fetch.mock.calls.filter(([url,init])=>url.includes('/approvals/')&&init?.method==='POST')).toHaveLength(1);
    await act(async()=>finish()); expect(releaseApproval).toHaveBeenCalledOnce(); await screen.findByText(successNotice);
  });
  it('preserves acknowledged success if the host refresh fails and retries only GET and refresh',async()=>{
    let applied=false;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/availability'))return ok({available:true});
      if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});
      if(url.includes('/approvals/')&&init?.method==='POST'){applied=true;return ok(await proof(url.split('/').at(-1)!,JSON.parse(String(init.body))));}
      if(url.endsWith(`/jobs/${jobId}`))return ok({...job,status:applied?'COMPLETED':'REVIEW',selectedMediaIds:media.map(m=>m.id)});
      throw Error('photo unavailable');
    }); vi.stubGlobal('fetch',fetch);
    const refresh=vi.fn().mockRejectedValueOnce(Error('read failed')).mockResolvedValue(undefined);
    render(<MarketingAssistantWeb {...props} onApproved={refresh}/>); await open();await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));await screen.findByText('原確認回執已核對，商品畫面仍需讀取；不會再次套用。');
    expect(releaseApproval).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'以相同識別碼重試原確認'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'只重新讀取商品並清理原確認紀錄'}));
    await screen.findByText(successNotice);
    expect(fetch.mock.calls.filter(([url,init])=>url.includes('/approvals/')&&init?.method==='POST')).toHaveLength(1); expect(refresh).toHaveBeenCalledTimes(2); expect(releaseApproval).toHaveBeenCalledTimes(2);
  });
  it.each(['same','wrong-copy','wrong-order','pending'])('unknown approve ACK uses only readback: %s proof',async(mode)=>{
    let sent=false,originalProof:Awaited<ReturnType<typeof proof>>|null=null;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.endsWith('/availability'))return ok({available:true});if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});
      if(url.includes('/approvals/')&&init?.method==='POST'){sent=true;originalProof=await proof(url.split('/').at(-1)!,JSON.parse(String(init.body)));throw Error('committed lost ACK');}
      if(url.includes('/approvals/')){if(mode==='pending')throw Error('not found');return ok({receipt:{...originalProof!.receipt,copy:mode==='wrong-copy'?'另一份文案':job.copy,selectedMediaIds:mode==='wrong-order'?[...media].reverse().map(m=>m.id):media.map(m=>m.id)}});}
      if(url.endsWith(`/jobs/${jobId}`))return ok({...job,status:sent?'COMPLETED':'REVIEW',selectedMediaIds:media.map(m=>m.id)});
      throw Error('photo unavailable');
    });vi.stubGlobal('fetch',fetch);render(<MarketingAssistantWeb {...props}/>);await open();await screen.findByDisplayValue(job.copy);
    fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));await screen.findByText('套用回覆尚未確認，不代表失敗；原選圖與文案已保留，重開只查核，不會重送。');
    expect(screen.getByRole('button',{name:'確認照片與文案'})).toBeDisabled();expect(screen.getByRole('textbox',{name:'編輯行銷文案'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'查核原行銷套用結果'}));
    await screen.findByText(mode==='same'?successNotice:'原套用結果仍待確認；保留原選圖與文案，不會再次套用。');
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
  it('restores an applied approval after reload with GET only and its immutable historical order',async()=>{
    const original={...approvalBody(),selectedMediaIds:[media[2].id,media[0].id,media[3].id,media[1].id]},raw=await marketingApprovalJournal(original),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('no writes');if(url.includes('/approvals/'))return ok(await proof(j.clientActionId,original));if(url.endsWith('/jobs/'+jobId))return ok({...job,status:'COMPLETED',selectedMediaIds:original.selectedMediaIds,generatedMedia:media.map(m=>({...m,marketingSelected:false}))});throw Error('photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText(successNotice);expect(props.onApproved).toHaveBeenCalledOnce();expect(queueStore.clear).toHaveBeenCalledWith(expect.stringContaining('marketing.'+source),raw);
    expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);expect(fetch.mock.calls.filter(([url])=>url.includes('/approvals/'))).toHaveLength(1);
    expect(await screen.findByRole('button',{name:'拖放圖 3，目前第 1 張'})).toBeDisabled();expect(screen.getByText('此工作當時的排序僅供閱覽；商品目前可能已由後續調整更新。')).toBeInTheDocument();
  });
  it('leaves a known receipt pending if storage cleanup fails, with readonly cleanup only',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);queueStore.clear.mockRejectedValueOnce(Error('clear')).mockResolvedValue(true);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('no writes');if(url.includes('/approvals/'))return ok(await proof(j.clientActionId));if(url.endsWith('/jobs/'+jobId))return ok({...job,status:'COMPLETED',selectedMediaIds:media.map(m=>m.id)});throw Error('photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原確認回執已核對，商品畫面仍需讀取；不會再次套用。');expect(screen.queryByRole('button',{name:'以相同識別碼重試原確認'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'只重新讀取商品並清理原確認紀錄'}));await screen.findByText(successNotice);expect(fetch.mock.calls.filter(([url])=>url.includes('/approvals/'))).toHaveLength(1);expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);expect(queueStore.clear).toHaveBeenCalledTimes(2);
  });
  it('does not clear a journal replaced by another tab, even when original approval succeeded',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValueOnce(raw).mockResolvedValue('different original operation');queueStore.clear.mockResolvedValue(false);
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.includes('/approvals/'))return ok(await proof(j.clientActionId));if(url.endsWith('/jobs/'+jobId))return ok({...job,status:'COMPLETED',selectedMediaIds:media.map(m=>m.id)});throw Error('photo not mocked');}));
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原確認回執已核對，商品畫面仍需讀取；不會再次套用。');expect(screen.getByRole('region',{name:'原行銷確認操作待查核'})).toBeInTheDocument();expect(screen.queryByText(successNotice)).not.toBeInTheDocument();expect(queueStore.clear).toHaveBeenCalledWith(expect.any(String),raw);
  });
  it('preserves unknown approval and explicitly retries the same ID/body exactly once',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.includes('/approvals/')){if(init?.method==='POST')return ok(await proof(j.clientActionId,JSON.parse(String(init.body))));throw Error('not found');}if(url.endsWith('/jobs/'+jobId))return ok({...job,status:'COMPLETED',selectedMediaIds:media.map(m=>m.id)});throw Error('photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原套用結果仍待確認；保留原選圖與文案，不會再次套用。');expect(screen.getByText('原文案：'+job.copy)).toBeInTheDocument();expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
    const retry=screen.getByRole('button',{name:'以相同識別碼重試原確認'});fireEvent.click(retry);fireEvent.click(retry);await screen.findByText(successNotice);
    const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toContain('/approvals/'+j.clientActionId);expect(JSON.parse(String(writes[0][1]?.body))).toEqual(j.body);
  });
  it.each(['CONFLICT','ABANDONED'])('keeps %s original visible until explicit readonly reconciliation',async state=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('no writes');if(url.includes('/approvals/'))return ok({receipt:{...(await proof(j.clientActionId)).receipt,state,reason:state==='CONFLICT'?'LISTING_CONFLICT':null,appliedVersion:null,selectedMediaIds:null,copy:null}});if(url.includes('?sourceMediaId'))return ok({job:{id:jobId}});if(url.endsWith('/jobs/'+jobId))return ok(job);throw Error('photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByRole('button',{name:'讀取後台並結束原確認操作'});expect(queueStore.clear).not.toHaveBeenCalled();expect(props.onApproved).not.toHaveBeenCalled();expect(screen.getByText('原文案：'+job.copy)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'以相同識別碼重試原確認'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'讀取後台並結束原確認操作'}));await screen.findByText('已讀取後台並結束原確認操作；沒有套用或刪除照片。');expect(queueStore.clear).toHaveBeenCalledOnce();expect(props.onApproved).toHaveBeenCalledOnce();expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);expect(screen.getByRole('textbox',{name:'編輯行銷文案'})).toBeEnabled();
  });
  it('requires a second confirmation to cancel; never deletes photos or automatically accepts cancellation',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.endsWith('/abandon'))return ok({receipt:{...(await proof(j.clientActionId)).receipt,state:'ABANDONED',appliedVersion:null,selectedMediaIds:null,copy:null}});throw Error('unknown');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);await screen.findByText('原套用結果仍待確認；保留原選圖與文案，不會再次套用。');fireEvent.click(screen.getByRole('button',{name:'取消未套用的原確認'}));expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'確認取消未套用操作'}));await screen.findByRole('button',{name:'讀取後台並結束原確認操作'});const writes=fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(JSON.parse(String(writes[0][1]?.body))).toEqual({jobId,sourceMediaId:source,listingId,requestHash:j.requestHash});expect(queueStore.clear).not.toHaveBeenCalled();expect(props.onApproved).not.toHaveBeenCalled();expect(fetch.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(false);
  });
  it('does not send approval if encrypted original recording fails',async()=>{
    const fetch=install();queueStore.save.mockRejectedValue(Error('storage'));render(<MarketingAssistantWeb {...props}/>);await open();await screen.findByDisplayValue(job.copy);fireEvent.click(screen.getByRole('button',{name:'確認照片與文案'}));await screen.findByText('無法安全保存原確認內容；不會在未記錄時套用，請檢查文案與商品儲存。');expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);expect(props.onApproved).not.toHaveBeenCalled();expect(releaseApproval).toHaveBeenCalledOnce();
  });
  it('ignores a late approval receipt after account replacement without clearing original private content',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValueOnce(raw).mockResolvedValue(null);let finish!:(value:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.includes('/approvals/'))return new Promise(resolve=>{finish=resolve;});if(url.endsWith('/availability'))return ok({available:true});if(url.includes('?sourceMediaId'))return ok({job:null});throw Error('unexpected');}));
    const view=render(<MarketingAssistantWeb {...props}/>);await screen.findByRole('region',{name:'原行銷確認操作待查核'});view.rerender(<MarketingAssistantWeb {...props} userId={43} token="other-synthetic"/>);await screen.findByRole('button',{name:'開啟行銷小助手 Beta'});await act(async()=>finish(ok(await proof(j.clientActionId))));expect(queueStore.clear).not.toHaveBeenCalled();expect(props.onApproved).not.toHaveBeenCalled();expect(props.beforeApprove).not.toHaveBeenCalled();expect(screen.queryByText('原文案：'+job.copy)).not.toBeInTheDocument();
  });
  it('disables recovery actions while reload read and host guard are pending',async()=>{
    const raw=await marketingApprovalJournal(approvalBody()),j=await parseMarketingApprovalJournal(raw);queueStore.get.mockResolvedValue(raw);let finish!:(value:unknown)=>void;
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.includes('/approvals/'))return new Promise(resolve=>{finish=resolve;});if(url.endsWith('/jobs/'+jobId))return ok({...job,status:'COMPLETED',selectedMediaIds:media.map(m=>m.id)});throw Error('photo not mocked');});vi.stubGlobal('fetch',fetch);
    render(<MarketingAssistantWeb {...props}/>);const retry=await screen.findByRole('button',{name:'以相同識別碼重試原確認'});expect(retry).toBeDisabled();fireEvent.click(retry);expect(fetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);await act(async()=>finish(ok(await proof(j.clientActionId))));await screen.findByText(successNotice);expect(props.beforeApprove).toHaveBeenCalledOnce();
  });
});
