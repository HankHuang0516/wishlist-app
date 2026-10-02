import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from './marketplaceApi';
import { photoRemovalJournal, parsePhotoRemovalJournal, photoRemovalResult, sendPhotoRemoval, readPhotoRemoval, abandonPhotoRemoval } from './privatePhotoRemovalWeb';
vi.mock('./marketplaceApi',()=>({api:vi.fn()}));
const mediaId='11111111-1111-4111-8111-111111111111',action='22222222-2222-4222-8222-222222222222';
beforeEach(()=>vi.mocked(api).mockReset());
async function fixture(){const raw=await photoRemovalJournal(mediaId,2,action),j=await parsePhotoRemovalJournal(raw);return{raw,row:{receipt:{clientActionId:action,requestHash:j.requestHash,mediaId,expectedVersion:2,state:'REMOVED',createdAt:'2026-10-02T00:00:00.000Z'},media:null,cleanupPending:true}};}
describe('immutable private-photo removal protocol',()=>{
  it('rejects altered/corrupt journals and incomplete or invalid versions',async()=>{
    const {raw}=await fixture();expect((await parsePhotoRemovalJournal(raw)).mediaId).toBe(mediaId);
    for(const patch of [{mediaId:'other'},{expectedVersion:-1},{expectedVersion:2.5},{requestHash:'f'.repeat(64)},{extra:true}])await expect(parsePhotoRemovalJournal(JSON.stringify({...JSON.parse(raw),...patch}))).rejects.toThrow();
    await expect(parsePhotoRemovalJournal('{bad')).rejects.toThrow();
  });
  it('accepts only matching immutable proof and separates database removal from file cleanup',async()=>{
    const {raw,row}=await fixture();expect(await photoRemovalResult(row,raw,19)).toEqual({state:'REMOVED',media:null,cleanupPending:true});
    for(const patch of [{clientActionId:crypto.randomUUID()},{requestHash:'f'.repeat(64)},{expectedVersion:3},{mediaId:crypto.randomUUID()},{state:'DONE'},{createdAt:'2026-10-02'}])await expect(photoRemovalResult({...row,receipt:{...row.receipt,...patch}},raw,19)).rejects.toThrow();
    await expect(photoRemovalResult({...row,cleanupPending:'true'},raw,19)).rejects.toThrow();await expect(photoRemovalResult({...row,privateSecret:'extra'},raw,19)).rejects.toThrow();
  });
  it('restoration performs GET only and never turns 404 into a successful removal',async()=>{
    const {raw,row}=await fixture();vi.mocked(api).mockResolvedValueOnce(row).mockRejectedValueOnce({status:404});await readPhotoRemoval('session',raw,19);await expect(readPhotoRemoval('session',raw,19)).rejects.toMatchObject({status:404});expect(vi.mocked(api).mock.calls.every(call=>call.length===2)).toBe(true);
  });
  it('requires persistence and an active account before POST; retries preserve the exact identity/version',async()=>{
    const {raw,row}=await fixture(),store={save:vi.fn(async()=>{}),get:vi.fn(),clear:vi.fn()};vi.mocked(api).mockResolvedValue(row);
    await sendPhotoRemoval('session',raw,19,store,'scope',()=>true);await sendPhotoRemoval('session',raw,19,store,'scope',()=>true);
    expect(api).toHaveBeenCalledWith('session','/listing-media/photo-removals/'+action,{method:'POST',body:JSON.stringify({mediaId,expectedVersion:2})});expect(store.save).toHaveBeenCalledTimes(2);
    vi.mocked(api).mockClear();store.save.mockRejectedValueOnce(new Error('quota'));await expect(sendPhotoRemoval('session',raw,19,store,'scope',()=>true)).rejects.toThrow();await expect(sendPhotoRemoval('session',raw,19,store,'scope',()=>false)).rejects.toThrow();expect(api).not.toHaveBeenCalled();
  });
  it('hash-only stop does not send another photo or undo a removed photo',async()=>{
    const {raw,row}=await fixture();vi.mocked(api).mockResolvedValue({...row,receipt:{...row.receipt,state:'ABANDONED',mediaId:null,expectedVersion:null},cleanupPending:false});expect((await abandonPhotoRemoval('session',raw,19,()=>true)).state).toBe('ABANDONED');expect(api).toHaveBeenCalledWith('session','/listing-media/photo-removals/'+action+'/abandon',{method:'POST',body:JSON.stringify({requestHash:row.receipt.requestHash})});
  });
  it('conflict projection is owner-bound and cannot include another photo or private extra fields',async()=>{
    const {raw,row}=await fixture(),media={id:mediaId,ownerUserId:19,listingId:null,wishItemId:null,capturePurpose:'BATCH_ITEM',sellerDraft:null,sellerDraftVersion:3};
    const result={...row,receipt:{...row.receipt,state:'CONFLICT'},media,cleanupPending:false};expect((await photoRemovalResult(result,raw,19)).media?.sellerDraftVersion).toBe(3);
    for(const patch of [{ownerUserId:20},{id:crypto.randomUUID()},{flickrPhotoId:'private'}])await expect(photoRemovalResult({...result,media:{...media,...patch}},raw,19)).rejects.toThrow();
  });
});
