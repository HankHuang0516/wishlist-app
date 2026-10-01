import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from './marketplaceApi';
import { getFullApiUrl } from '../config';
import { listDraftBody, lookupWishCreate, lookupWishPhoto, parseWebWishJournal, parseWishPhoto, parseWishPhotoJournal, parseWishReceipt, prepareWishUpload, submitWishCreate, submitWishPhoto } from './wishWeb';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./marketplaceApi', async original => ({ ...await original<typeof import('./marketplaceApi')>(), api }));
const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac', mediaId='fab22941-2df0-4ca4-90c2-70c504527243';
const list = { id: 1, title: '合成清單', description: null, isPublic: false, maxItems: 100, _count: { items: 0 } };
const wish = { id: 4, wishlistId: 1, name: '合成願望', notes: null, link: null, imageUrl: null, aiStatus: 'SKIPPED', price: null, currency: null, aiLink: null, maxPrice: null, priceCurrency: null, isHidden: false, isPurchased: false };
const raw = JSON.stringify({ kind:'ITEM', listId:1, body:JSON.stringify({ clientRequestId:id, name:'合成願望' }) });
const photo = { id:mediaId,imageUrl:`${getFullApiUrl()}/listing-media/${mediaId}/image`,thumbnailUrl:`${getFullApiUrl()}/listing-media/${mediaId}/thumbnail`,width:100,height:100,byteSize:100 };
beforeEach(()=>{ api.mockReset(); vi.stubGlobal('crypto',webcrypto); });
function imageFile(content = 'synthetic-image-bytes') {
  const bytes = new TextEncoder().encode(content), file = new File([bytes], 'synthetic.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  return file;
}
const uploadStore = () => ({get:vi.fn(),save:vi.fn(),clear:vi.fn()});
async function photoJournal(file: File) { return JSON.stringify({version:1,clientUploadId:id,digest:(await prepareWishUpload(file)).digest}); }
describe('web exact wish operations',()=>{
  it('keeps original journal bytes, but validates every nullable/price/image field',()=>{
    expect(parseWebWishJournal(raw).body).toBe(JSON.parse(raw).body);
    for(const patch of [{notes:[]},{link:4},{imageUrl:[]},{maxPrice:'3'},{maxPrice:-1},{maxPrice:null,priceCurrency:'TWD'},{mediaId:'bad'},{clientRequestId:'b5abf861-a66d-5072-876b-4f0ab3172dac'}]) expect(()=>parseWebWishJournal(JSON.stringify({kind:'ITEM',listId:1,body:JSON.stringify({clientRequestId:id,name:'合成願望',...patch})}))).toThrow();
  });
  it('validates list privacy and defaults without making a public list silently',()=>{
    expect(listDraftBody(' 清單 ','',false)).toEqual({title:'清單',description:null,isPublic:false});
    for(const patch of [{description:4},{isPublic:'yes'},{title:''}])expect(()=>parseWebWishJournal(JSON.stringify({kind:'LIST',listId:null,body:JSON.stringify({clientRequestId:id,title:'清單',...patch})}))).toThrow();
  });
  it('restores only by authenticated GET and checks exact resource, kind and parent',async()=>{
    api.mockResolvedValue({clientRequestId:id,kind:'ITEM',resourceId:4,deleted:false,resource:wish});
    expect(await lookupWishCreate('fixture',raw)).toMatchObject({kind:'ITEM',id:4,deleted:false});expect(api).toHaveBeenCalledWith('fixture','/native-wishes/receipts/'+id);
    for(const patch of [{clientRequestId:mediaId},{kind:'LIST'},{resourceId:5},{deleted:'false'},{resource:{...wish,wishlistId:2}}])expect(()=>parseWishReceipt({clientRequestId:id,kind:'ITEM',resourceId:4,deleted:false,resource:wish,...patch},raw)).toThrow();
  });
  it('accepts a tombstone but never manufactures a replacement resource',()=>{
    expect(parseWishReceipt({clientRequestId:id,kind:'ITEM',resourceId:4,deleted:true,resource:null},raw)).toEqual({kind:'ITEM',id:4,resource:null,deleted:true});
    expect(()=>parseWishReceipt({clientRequestId:id,kind:'ITEM',resourceId:4,deleted:true,resource:wish},raw)).toThrow();
  });
  it('binds UUID case variants to the same receipt while preserving original request bytes',()=>{
    const upper = JSON.stringify({kind:'ITEM',listId:1,body:JSON.stringify({clientRequestId:id.toUpperCase(),name:'合成願望'})});
    expect(parseWishReceipt({clientRequestId:id,kind:'ITEM',resourceId:4,deleted:false,resource:wish},upper).id).toBe(4);
    expect(parseWebWishJournal(upper).body).toBe(JSON.parse(upper).body);
  });
  it('persists before HTTP, preserves original bytes on explicit retry and does not clear before caller acknowledges',async()=>{
    const store={get:vi.fn(),save:vi.fn(),clear:vi.fn()};api.mockResolvedValue({resource:wish,replayed:true});
    await submitWishCreate('fixture',raw,store,'scope',()=>true);await submitWishCreate('fixture',raw,store,'scope',()=>true);
    expect(store.save).toHaveBeenCalledWith('scope',raw);expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder[0]);expect(api.mock.calls.map(c=>c[2].body)).toEqual([JSON.parse(raw).body,JSON.parse(raw).body]);expect(store.clear).not.toHaveBeenCalled();
  });
  it('does not POST if persistence fails or the account leaves while save awaits',async()=>{
    const store={get:vi.fn(),save:vi.fn().mockRejectedValue(new Error('quota')),clear:vi.fn()};await expect(submitWishCreate('fixture',raw,store,'scope',()=>true)).rejects.toThrow();expect(api).not.toHaveBeenCalled();
    store.save.mockResolvedValue(undefined);await expect(submitWishCreate('fixture',raw,store,'scope',()=>false)).rejects.toThrow();expect(api).not.toHaveBeenCalled();
  });
  it('rejects mismatched create responses without clearing the journal',async()=>{
    api.mockResolvedValue({resource:{...wish,wishlistId:2},replayed:false});const store={get:vi.fn(),save:vi.fn(),clear:vi.fn()};await expect(submitWishCreate('fixture',raw,store,'scope',()=>true)).rejects.toThrow();expect(store.clear).not.toHaveBeenCalled();
  });
  it('only trusts exact API-origin private photo paths and bounded dimensions',()=>{
    expect(parseWishPhoto(photo)).toMatchObject({id:mediaId,listingId:null,wishItemId:null});
    for(const patch of [{imageUrl:'https://evil.example/photo.jpg'},{thumbnailUrl:photo.thumbnailUrl+'?token=synthetic'},{width:1601},{height:0},{byteSize:6*1024*1024},{listingId:'bad'},{wishItemId:'4'}])expect(()=>parseWishPhoto({...photo,...patch})).toThrow();
  });
  it('keeps only upload identity/digest and uses GET for photo recovery',async()=>{
    const body=JSON.stringify({version:1,clientUploadId:id,digest:'a'.repeat(64)});expect(parseWishPhotoJournal(body).clientUploadId).toBe(id);
    for(const patch of [{version:2},{digest:'bad'},{userId:42},{token:'SYNTHETIC_DO_NOT_STORE'}])expect(()=>parseWishPhotoJournal(JSON.stringify({version:1,clientUploadId:id,digest:'a'.repeat(64),...patch}))).toThrow();
    api.mockResolvedValue(photo);expect(await lookupWishPhoto('fixture',body)).toMatchObject({id:mediaId});expect(api).toHaveBeenCalledWith('fixture','/listing-media/by-upload-id/'+id);
  });
  it('persists the photo identity before one upload and uses the native MANUAL_PHOTO form',async()=>{
    const file=imageFile(), journal=await photoJournal(file), store=uploadStore(); api.mockResolvedValue(photo);
    expect(await submitWishPhoto('fixture',journal,file,store,'scope',()=>true)).toMatchObject({id:mediaId});
    expect(api).toHaveBeenCalledTimes(1); expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder[0]);
    const form=api.mock.calls[0][2].body as FormData;
    expect(form.get('clientUploadId')).toBe(id); expect(form.get('capturePurpose')).toBe('MANUAL_PHOTO'); expect(form.get('image')).toBeInstanceOf(File); expect(store.clear).not.toHaveBeenCalled();
  });
  it('recovers a lost upload acknowledgement with GET only, never another POST',async()=>{
    const file=imageFile(), journal=await photoJournal(file);api.mockRejectedValueOnce(new Error('lost acknowledgement')).mockResolvedValueOnce(photo);
    expect(await submitWishPhoto('fixture',journal,file,uploadStore(),'scope',()=>true)).toMatchObject({id:mediaId});
    expect(api.mock.calls.map(c=>c[2]?.method??'GET')).toEqual(['POST','GET']); expect(api.mock.calls[1][1]).toBe('/listing-media/by-upload-id/'+id);
  });
  it('never treats a digest conflict as permission to adopt an existing photo',async()=>{
    const file=imageFile(), journal=await photoJournal(file);api.mockRejectedValue(new ApiFailure('digest conflict',409));
    await expect(submitWishPhoto('fixture',journal,file,uploadStore(),'scope',()=>true)).rejects.toMatchObject({status:409});expect(api).toHaveBeenCalledTimes(1);
  });
  it('rejects a different file, empty photo, failed persistence and an account departure before uploading',async()=>{
    const file=imageFile(), journal=await photoJournal(file), store=uploadStore();
    await expect(submitWishPhoto('fixture',journal,imageFile('different'),store,'scope',()=>true)).rejects.toThrow();
    await expect(prepareWishUpload(imageFile(''))).rejects.toThrow();expect(store.save).not.toHaveBeenCalled();
    store.save.mockRejectedValueOnce(new Error('quota'));await expect(submitWishPhoto('fixture',journal,file,store,'scope',()=>true)).rejects.toThrow();
    store.save.mockResolvedValue(undefined);await expect(submitWishPhoto('fixture',journal,file,store,'scope',()=>false)).rejects.toThrow();expect(api).not.toHaveBeenCalled();
  });
});
