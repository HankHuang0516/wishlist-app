import {render,screen,fireEvent,act,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {useFollowOperation} from './useFollowOperation';
import {parseFollowJournal} from './followWeb';
import {privatePendingStore,PendingStoreError} from './webPendingStore';
import FollowRecovery from '../components/FollowRecovery';
const journals=vi.hoisted(()=>new Map<string,string>());
vi.mock('./webPendingStore',async original=>({...await original<object>(),privatePendingStore:{get:vi.fn(async(key:string)=>journals.get(key)??null),save:vi.fn(async(key:string,raw:string)=>{if(journals.has(key)&&journals.get(key)!==raw)throw new PendingStoreError();journals.set(key,raw);}),clear:vi.fn(async(key:string,raw:string)=>journals.get(key)===raw?journals.delete(key):false)}}));
const state={userId:19,targetUserId:20,targetExists:true,isFollowing:false,followingVersion:0,followingCount:0,maxFollowing:100,isPremium:false};
const ok=(value:unknown)=>({ok:true,status:200,json:async()=>value});
let callback=vi.fn();
function Harness({userId=19,token='synthetic'}={}){const operation=useFollowOperation(token,userId,callback);return <><button disabled={operation.locked} onClick={()=>void operation.change(20,true)}>追蹤測試對象</button><FollowRecovery operation={operation}/></>;}
const ready=async()=>waitFor(()=>expect(screen.getByRole('button',{name:'追蹤測試對象'})).toBeEnabled());
async function receipt(raw:string,status='APPLIED'){const original=await parseFollowJournal(raw);return {receipt:{clientActionId:original.clientActionId,requestHash:original.requestHash,targetUserId:original.targetUserId,wanted:original.wanted,expectedVersion:original.expectedVersion,state:status,appliedVersion:status==='APPLIED'?1:null,createdAt:'2026-10-01T13:00:00.000Z'},current:{...state,isFollowing:status==='APPLIED',followingVersion:1,followingCount:status==='APPLIED'?1:0}};}
beforeEach(()=>{journals.clear();callback=vi.fn();vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);localStorage.setItem('user-locale','zh-TW');});afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it('lost commit ACK reloads only its GET receipt, retaining the original marker until acknowledged',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('lost');if(url.includes('follow-state'))return ok(state);return ok(await receipt([...journals.values()][0]));});vi.stubGlobal('fetch',fetch);
    const first=render(<Harness/>);await ready();fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await screen.findByText(/原追蹤結果尚未確認/);const original=[...journals.values()][0];first.unmount();
    render(<Harness/>);await screen.findByText('後台回執已確認原追蹤變更完成。');expect([...journals.values()]).toEqual([original]);expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(screen.getByRole('button',{name:'追蹤測試對象'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'已讀回執，清理本機標記'}));await ready();expect(journals.size).toBe(0);
});
it('unavailable encrypted storage prevents any mutation and offers recovery',async()=>{
    vi.mocked(privatePendingStore.save).mockRejectedValueOnce(new PendingStoreError());const fetch=vi.fn(async()=>ok(state));vi.stubGlobal('fetch',fetch);render(<Harness/>);await ready();
    fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await screen.findByText(/無法安全保存或恢復追蹤紀錄/);expect(fetch.mock.calls).toHaveLength(1);expect(screen.getByRole('button',{name:'重試恢復追蹤紀錄'})).toBeInTheDocument();
});
it('confirmed history remains confirmed when cleanup fails and retry only clears locally',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==='POST'?ok(await receipt([...journals.values()][0])):ok(state));vi.stubGlobal('fetch',fetch);render(<Harness/>);await ready();fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await screen.findByText('後台回執已確認原追蹤變更完成。');
    vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(Error('unavailable'));fireEvent.click(screen.getByRole('button',{name:'已讀回執，清理本機標記'}));await screen.findByText(/原回執已確認，本機標記清理失敗/);
    expect(screen.getByText('後台回執已確認原追蹤變更完成。')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'已讀回執，清理本機標記'}));await ready();expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
});
it('explicit two-step stop sends hash only and never an unfollow',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(url.endsWith('/abandon')){const raw=[...journals.values()][0],original=await parseFollowJournal(raw);expect(JSON.parse(String(init?.body))).toEqual({requestHash:original.requestHash});return ok({receipt:{clientActionId:original.clientActionId,requestHash:original.requestHash,state:'ABANDONED',targetUserId:null,wanted:null,expectedVersion:null,appliedVersion:null,createdAt:'2026-10-01T13:00:00.000Z'},current:{...state,targetUserId:null,targetExists:false}});}if(init?.method==='POST')throw Error('unknown');return ok(state);});vi.stubGlobal('fetch',fetch);render(<Harness/>);await ready();fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await screen.findByText(/原追蹤結果尚未確認/);
    fireEvent.click(screen.getByRole('button',{name:'安全停止原追蹤操作'}));expect(fetch.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'確認停止原追蹤操作'}));await screen.findByText(/原操作已安全停止/);expect(callback).not.toHaveBeenCalled();expect(fetch.mock.calls.filter(([,i])=>i?.method==='DELETE')).toHaveLength(0);
});
it('late previous-account ACK preserves its journal and cannot change the replacement account',async()=>{
    let resolve!:(value:unknown)=>void;const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(r=>{resolve=r;}):ok(state));vi.stubGlobal('fetch',fetch);const view=render(<Harness/>);await ready();fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await waitFor(()=>expect(resolve).toBeTypeOf('function'));
    const raw=[...journals.values()][0];view.rerender(<Harness userId={21} token="other"/>);await act(async()=>resolve(ok(await receipt(raw))));expect(callback).not.toHaveBeenCalled();expect([...journals.values()]).toEqual([raw]);expect(screen.queryByText('後台回執已確認原追蹤變更完成。')).not.toBeInTheDocument();
});
it('a mismatched receipt never clears or acknowledges the original journal',async()=>{
    const fetch=vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error();if(url.includes('follow-state'))return ok(state);const value=await receipt([...journals.values()][0]);value.receipt.requestHash='0'.repeat(64);return ok(value);});vi.stubGlobal('fetch',fetch);const first=render(<Harness/>);await ready();fireEvent.click(screen.getByRole('button',{name:'追蹤測試對象'}));await screen.findByText(/原追蹤結果尚未確認/);first.unmount();render(<Harness/>);await screen.findByText(/原追蹤結果尚未確認/);expect(journals.size).toBe(1);expect(callback).not.toHaveBeenCalled();
});
