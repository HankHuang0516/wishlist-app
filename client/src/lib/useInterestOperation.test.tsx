import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID,webcrypto} from 'node:crypto';
import {useInterestOperation} from './useInterestOperation';
import {InterestStore,parseInterestJournal} from './productInterest';
import {privatePendingStore} from './webPendingStore';

const state=vi.hoisted(()=>({journals:new Map<string,string>(),beforeMake:null as null|Promise<void>}));
vi.mock('./webPendingStore',async original=>({...await original<object>(),
 pendingRequestKey:vi.fn(async(_api:string,user:number)=>'owner:'+user),
 privatePendingStore:{get:vi.fn(async(key:string)=>state.journals.get(key)??null),
 save:vi.fn(async(key:string,raw:string)=>{if(state.journals.has(key))throw Error('Occupied');state.journals.set(key,raw);}),
 clear:vi.fn(async(key:string,raw:string)=>state.journals.get(key)===raw?state.journals.delete(key):false)}}));
vi.mock('./productInterest',async original=>{const module=await original<typeof import('./productInterest')>();return {...module,makeInterestJournal:async(...args:Parameters<typeof module.makeInterestJournal>)=>{if(state.beforeMake)await state.beforeMake;return module.makeInterestJournal(...args);}};});
const productKey='listing:'+randomUUID(),apiUrl='https://wishlist.example.invalid/api';
const snapshot={productKey,canLike:true,likedCount:0,inquiringCount:1,inquiryKind:'DIRECT',own:{liked:false,version:0}};
function store(){const result=new InterestStore(async()=>({capturedAt:new Date().toISOString(),windowDays:7,items:[snapshot]}));result.subscribe(productKey,()=>{});return result;}
async function applied(raw:string){const journal=await parseInterestJournal(raw);return {receipt:{clientActionId:journal.clientActionId,productKey,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},current:{liked:true,version:1}};}
beforeEach(()=>{state.journals.clear();state.beforeMake=null;vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>vi.unstubAllGlobals());

it('restores an unconfirmed like using GET only and preserves it on an unavailable receipt',async()=>{
 const source=store();await source.refresh();
 const read=vi.fn(async(_path:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('Lost acknowledgement');throw Error('Receipt unavailable');});
 const first=renderHook(()=>useInterestOperation(read,apiUrl,1,source));await waitFor(()=>expect(first.result.current.ready).toBe(true));
 await act(()=>first.result.current.toggle(productKey));const raw=state.journals.get('owner:1');expect(raw).toBeTruthy();first.unmount();
 const next=renderHook(()=>useInterestOperation(read,apiUrl,1,source));await waitFor(()=>expect(next.result.current.ready).toBe(true));
 expect(next.result.current.pending).toBe(raw);expect(read.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
 read.mockImplementation(async()=>applied(raw!));await act(()=>next.result.current.recover('read'));
 expect(next.result.current.pending).toBeNull();expect(state.journals.size).toBe(0);source.destroy();
});

it('does not save or send an old account action when journal creation finishes after account replacement',async()=>{
 const source=store();await source.refresh();const read=vi.fn();let finish!:()=>void;
 state.beforeMake=new Promise(resolve=>{finish=resolve;});
 const view=renderHook(({userId})=>useInterestOperation(read,apiUrl,userId,source),{initialProps:{userId:1}});
 await waitFor(()=>expect(view.result.current.ready).toBe(true));let operation!:Promise<void>;
 act(()=>{operation=view.result.current.toggle(productKey);});await waitFor(()=>expect(view.result.current.busy).toBe(true));
 view.rerender({userId:2});await waitFor(()=>expect(view.result.current.ready).toBe(true));await act(async()=>{finish();await operation;});
 expect(privatePendingStore.save).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(view.result.current.busy).toBe(false);expect(state.journals.size).toBe(0);source.destroy();
});

it('ignores a previous account acknowledgement while retaining that account’s recovery marker',async()=>{
 const source=store();await source.refresh();let finish!:(value:unknown)=>void;
 const read=vi.fn(async()=>new Promise(resolve=>{finish=resolve;}));
 const view=renderHook(({userId})=>useInterestOperation(read,apiUrl,userId,source),{initialProps:{userId:1}});await waitFor(()=>expect(view.result.current.ready).toBe(true));
 let operation!:Promise<void>;act(()=>{operation=view.result.current.toggle(productKey);});await waitFor(()=>expect(finish).toBeTypeOf('function'));
 const raw=state.journals.get('owner:1')!;view.rerender({userId:2});await waitFor(()=>expect(view.result.current.ready).toBe(true));
 await act(async()=>{finish(await applied(raw));await operation;});expect(state.journals.get('owner:1')).toBe(raw);expect(state.journals.has('owner:2')).toBe(false);expect(view.result.current.pending).toBeNull();expect(view.result.current.busy).toBe(false);source.destroy();
});
