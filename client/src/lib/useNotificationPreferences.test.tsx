import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {useNotificationPreferences} from './useNotificationPreferences';
import {privatePendingStore} from './webPendingStore';
import {parseNotificationJournal} from './notificationPreferences';
const state=vi.hoisted(()=>({journals:new Map<string,string>(),beforeMake:null as Promise<void>|null}));
vi.mock('./webPendingStore',async original=>({...await original<object>(),pendingRequestKey:vi.fn(async(_url:string,user:number)=>'owner:'+user),privatePendingStore:{
 get:vi.fn(async(key:string)=>state.journals.get(key)??null),save:vi.fn(async(key:string,raw:string)=>{if(state.journals.has(key))throw Error('Occupied');state.journals.set(key,raw);}),clear:vi.fn(async(key:string,raw:string)=>state.journals.get(key)===raw?state.journals.delete(key):false)}}));
vi.mock('./notificationPreferences',async original=>{const module=await original<typeof import('./notificationPreferences')>();return {...module,makeNotificationJournal:async(...args:Parameters<typeof module.makeNotificationJournal>)=>{if(state.beforeMake)await state.beforeMake;return module.makeNotificationJournal(...args);}};});
const current={chat:true,meetup:true,sourceReply:true,preview:false,version:0},url='https://wishlist.example.invalid/api';
beforeEach(()=>{state.journals.clear();state.beforeMake=null;vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);});afterEach(()=>vi.unstubAllGlobals());
it('cannot persist an old account notification preference after account replacement',async()=>{
 let finish!:()=>void;state.beforeMake=new Promise(resolve=>{finish=resolve;});const read=vi.fn(async()=>current);
 const view=renderHook(({user})=>useNotificationPreferences(read,url,user),{initialProps:{user:1}});await waitFor(()=>expect(view.result.current.ready).toBe(true));
 let update!:Promise<void>;act(()=>{update=view.result.current.update('preview',true);});await waitFor(()=>expect(view.result.current.busy).toBe(true));
 view.rerender({user:2});await waitFor(()=>expect(view.result.current.ready).toBe(true));await act(async()=>{finish();await update;});
 expect(privatePendingStore.save).not.toHaveBeenCalled();expect(read.mock.calls.every(([path])=>path==='/notifications/preferences')).toBe(true);expect(view.result.current.current?.preview).toBe(false);expect(view.result.current.busy).toBe(false);
});
it('recovers a lost preference acknowledgement with a GET without enabling previews again',async()=>{
 const read=vi.fn(async(path:string,options?:RequestInit):Promise<unknown>=>{if(path==='/notifications/preferences')return current;if(options?.method==='POST')throw Error('Lost acknowledgement');const raw=state.journals.get('owner:1')!,journal=await parseNotificationJournal(raw);return {receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},current:{...journal.preferences,version:1}};});
 const first=renderHook(()=>useNotificationPreferences(read,url,1));await waitFor(()=>expect(first.result.current.ready).toBe(true));await act(()=>first.result.current.update('preview',true));expect(first.result.current.pending).toBeTruthy();first.unmount();
 const restored=renderHook(()=>useNotificationPreferences(read,url,1));await waitFor(()=>expect(restored.result.current.ready).toBe(true));expect(restored.result.current.pending).toBeNull();expect(restored.result.current.current?.preview).toBe(true);expect(read.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(1);expect(state.journals.size).toBe(0);
});
