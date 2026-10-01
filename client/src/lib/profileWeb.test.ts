import { afterEach, describe, expect, it, vi } from 'vitest';
import { abandonProfileOperation, normalizeProfilePatch, parseOwnProfile, parseProfileJournal, profileJournal, profileResult, readProfileOperation, sendProfileOperation } from './profileWeb';
import type { PendingStore } from './webPendingStore';
const profile = {id:19,profileVersion:0,name:null,phoneNumber:'fixture',nicknames:'原暱稱',isPremium:false,isAvatarVisible:false,isPhoneVisible:false,isRealNameVisible:false,isAddressVisible:false,isEmailVisible:false,isBirthdayVisible:false};
const ok = (body: unknown) => ({ok:true,status:200,json:async()=>body});
afterEach(()=>vi.unstubAllGlobals());
describe('profile operation contract and persist-before-send',()=>{
  it('projects no secrets and rejects wrong owner, corrupt dates, booleans or revision',()=>{
    expect(parseOwnProfile({...profile,password:'secret',apiKey:'secret'},19)).not.toHaveProperty('apiKey');
    for(const value of [{...profile,id:20},{...profile,profileVersion:'0'},{...profile,birthday:'1993-02-30'},{...profile,isPhoneVisible:'false'},{...profile,avatarUrl:'https://user:secret@evil.invalid/photo'}]) expect(()=>parseOwnProfile(value,19)).toThrow();
  });
  it('normalizes birthday clearing, limits, ordering and nickname separators',()=>{
    expect(normalizeProfilePatch({realName:' 甲 ',birthday:''})).toEqual({birthday:null,realName:'甲'});
    expect(normalizeProfilePatch({nicknames:'a, b, ,c'})).toEqual({nicknames:'a,b,c'});
    for(const value of [{isPremium:true},{isPhoneVisible:'false'},{nicknames:'a,b,c,d,e,f'},{birthday:'2025-02-29'},{birthday:'2099-01-01'},{address:'x'.repeat(501)},{email:'bad'}]) expect(()=>normalizeProfilePatch(value)).toThrow();
  });
  it('journal hash detects altered drafts and versions',async()=>{
    const raw=await profileJournal({nicknames:'新暱稱'},0),row=JSON.parse(raw);
    await expect(parseProfileJournal(raw)).resolves.toMatchObject({expectedVersion:0});
    for(const changed of [{...row,expectedVersion:1},{...row,updates:{nicknames:'他人'}},{...row,token:'secret'},{...row,updates:{nicknames:' 新暱稱 '}}]) await expect(parseProfileJournal(JSON.stringify(changed))).rejects.toThrow();
  });
  it('persists before HTTP and never sends after save failure or account departure',async()=>{
    const raw=await profileJournal({nicknames:'新暱稱'},0),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const store:PendingStore={get:vi.fn(),clear:vi.fn(),save:vi.fn(async()=>{throw new Error('storage');})};
    await expect(sendProfileOperation('fixture',raw,19,store,'key',()=>true)).rejects.toThrow('storage');expect(fetch).not.toHaveBeenCalled();
    store.save=vi.fn(async()=>{});await expect(sendProfileOperation('fixture',raw,19,store,'key',()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
    await expect(abandonProfileOperation('fixture',raw,19,()=>false)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  });
  it('reopen only GETs, retries use the exact same ID/body, and wrong receipts fail closed',async()=>{
    const raw=await profileJournal({nicknames:'新暱稱'},0),journal=await parseProfileJournal(raw);
    const value={receipt:{clientActionId:journal.clientActionId,requestHash:journal.requestHash,state:'APPLIED',appliedVersion:1,createdAt:new Date().toISOString()},profile:{...profile,profileVersion:1,nicknames:'新暱稱'}};
    const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>ok(value));vi.stubGlobal('fetch',fetch);
    await readProfileOperation('fixture',raw,19);expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
    const store:PendingStore={get:vi.fn(),clear:vi.fn(),save:vi.fn(async()=>{})};
    await sendProfileOperation('fixture',raw,19,store,'key',()=>true);expect(fetch.mock.calls[1][0]).toBe(fetch.mock.calls[0][0]);
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({expectedVersion:0,updates:{nicknames:'新暱稱'}});
    await expect(profileResult({...value,receipt:{...value.receipt,requestHash:'bad'}},raw,19)).rejects.toThrow();
    await expect(profileResult({...value,profile:{...value.profile,nicknames:'不同'}},raw,19)).rejects.toThrow();
    await expect(profileResult({...value,profile:{...value.profile,profileVersion:2,nicknames:'後來'}},raw,19)).resolves.toMatchObject({state:'APPLIED',current:false});
    await expect(profileResult({...value,receipt:{...value.receipt,state:'ABANDONED',appliedVersion:null},profile},raw,19)).resolves.toMatchObject({state:'ABANDONED',current:false});
  });
});
