import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {followJournal,parseFollowJournal,parseFollowState,followResult,sendFollowOperation,abandonFollowOperation} from './followWeb';
const state={userId:19,targetUserId:20,targetExists:true,isFollowing:true,followingVersion:1,followingCount:1,maxFollowing:0,isPremium:false};
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
async function result(raw:string){const original=await parseFollowJournal(raw);return {receipt:{...original,state:'APPLIED',appliedVersion:1,createdAt:'2026-10-01T13:00:00.000Z'},current:state};}
describe('strict persisted follow operations',()=>{
    it('canonical digest detects tampering and every malformed identity/version',async()=>{
        const raw=await followJournal(20,true,0);expect((await parseFollowJournal(raw)).targetUserId).toBe(20);
        for(const bad of [{...JSON.parse(raw),wanted:false},{...JSON.parse(raw),extra:1},{...JSON.parse(raw),expectedVersion:2147483647}])await expect(parseFollowJournal(JSON.stringify(bad))).rejects.toThrow();
        for(const bad of [{...state,userId:21},{...state,targetUserId:21},{...state,isPremium:'true'},{...state,maxFollowing:-1}])expect(()=>parseFollowState(bad,19,20)).toThrow();
        expect(parseFollowState(state,19,20).maxFollowing).toBe(0);
    });
    it('verifies immutable history without interpreting newer state as original failure',async()=>{
        const raw=await followJournal(20,true,0),value=await result(raw);
        expect((await followResult(value,raw,19)).state).toBe('APPLIED');
        expect((await followResult({...value,current:{...state,followingVersion:2,isFollowing:false}},raw,19)).current.isFollowing).toBe(false);
        await expect(followResult({...value,current:{...state,isFollowing:false}},raw,19)).rejects.toThrow();
        await expect(followResult({...value,receipt:{...value.receipt,requestHash:'0'.repeat(64)}},raw,19)).rejects.toThrow();
    });
    it('never POSTs when persistence fails or the account departs during saving',async()=>{
        const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const raw=await followJournal(20,true,0),store={get:vi.fn(),save:vi.fn(async():Promise<void>=>{throw Error();}),clear:vi.fn()};
        await expect(sendFollowOperation('synthetic',raw,19,store,'key',()=>true)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
        store.save.mockResolvedValueOnce(undefined);await expect(sendFollowOperation('synthetic',raw,19,store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
    });
    it('abandon transmits only the original hash; cannot be confused with unfollow',async()=>{
        const raw=await followJournal(20,true,0),journal=await parseFollowJournal(raw),fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'ABANDONED',targetUserId:null,wanted:null,expectedVersion:null,appliedVersion:null,createdAt:'2026-10-01T13:00:00.000Z'},current:{...state,targetUserId:null,targetExists:false,isFollowing:false}})}));vi.stubGlobal('fetch',fetch);
        expect((await abandonFollowOperation('synthetic',raw,19,()=>true)).state).toBe('ABANDONED');
        expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body))).toEqual({requestHash:journal.requestHash});
    });
});
