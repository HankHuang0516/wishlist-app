import { describe,expect,it } from 'vitest';
import { emptyListingDraft } from './listingBatch';
import { buildManualListing,emptyManualDetails,manualPhotoIds } from './manualListing';
import { draftListingCreationJournal,listingCreationJournal,parseListingCreationJournal } from './listingCreationWeb';
import fixtures from '../../../shared/listing-draft-create-hash-fixtures.json';
const id='11111111-1111-4111-8111-111111111111',media='22222222-2222-4222-8222-222222222222';
const form=()=>({...emptyListingDraft(),title:'合成手動草稿'});
describe('native manual save false without weakening public listing validation',()=>{
  it('accepts the actual unused-media projection without inventing omitted purpose/owner fields, and rejects external media',()=>{
    const row={id:media,imageUrl:`https://example.com/api/listing-media/${media}/image`,thumbnailUrl:`https://example.com/api/listing-media/${media}/thumbnail`,width:320,height:240,byteSize:123,createdAt:'2026-10-03T00:00:00.000Z'};
    expect(manualPhotoIds([row],'https://example.com/api')).toEqual([media]);expect(()=>manualPhotoIds([{...row,thumbnailUrl:'https://external.invalid/image'}],'https://example.com/api')).toThrow();
  });
  it.each(fixtures)('matches the independently verified server draft hash %#',async({body,requestHash})=>{
    const journal=await parseListingCreationJournal(await draftListingCreationJournal(JSON.stringify(body)));expect(journal).toMatchObject({version:2,kind:'DRAFT',payload:body,requestHash});
  });
  it('permits only a name and omits incomplete optional fields rather than inventing zeros or coordinates',()=>{
    const body=buildManualListing(id,form(),[],{...emptyManualDetails(),meetup:false},false);
    expect(body).toMatchObject({title:'合成手動草稿',publish:false,consentToMap:false,mediaIds:[],deliveryMethods:[]});
    for(const key of ['price','description','brand','location','expiryDate'])expect(body).not.toHaveProperty(key);
  });
  it('keeps free gifts as zero and snaps before transport or journal persistence',async()=>{
    const body=buildManualListing(id,{...form(),price:'0'},[media],{...emptyManualDetails(),county:'臺北市',district:'中山區',latitude:'25.051234',longitude:'121.531234'},false);
    const raw=await draftListingCreationJournal(JSON.stringify(body));expect(JSON.parse(raw).payload).toMatchObject({price:0,location:{latitude:25.05,longitude:121.53}});expect(raw).not.toMatch(/25\.051234|121\.531234/);
  });
  it.each([{price:'-1'},{price:'1.001'},{price:'NaN'},{price:'10000000000'}])('rejects invalid optional prices %#',change=>expect(()=>buildManualListing(id,{...form(),...change},[],emptyManualDetails(),false)).toThrow());
  it('rejects partial optional location, impossible/expired dates and duplicate media',()=>{
    expect(()=>buildManualListing(id,form(),[],{...emptyManualDetails(),county:'臺北市'},false)).toThrow();
    for(const expiryDate of ['2030-02-30','2000-01-01'])expect(()=>buildManualListing(id,form(),[],{...emptyManualDetails(),expiryDate},false)).toThrow();
    expect(()=>buildManualListing(id,form(),[media,media],emptyManualDetails(),false)).toThrow();
  });
  it('cannot publish incomplete fields or wrap a draft in the existing v1 public journal',async()=>{
    const body=buildManualListing(id,form(),[],emptyManualDetails(),false);
    expect(()=>buildManualListing(id,form(),[],emptyManualDetails(),true)).toThrow();
    await expect(listingCreationJournal(JSON.stringify(body))).rejects.toThrow();
    const row=JSON.parse(await draftListingCreationJournal(JSON.stringify(body)));
    for(const change of [{version:1},{kind:'PUBLIC'},{payload:{...row.payload,publish:true}},{requestHash:'0'.repeat(64)},{token:'never'}])await expect(parseListingCreationJournal(JSON.stringify({...row,...change}))).rejects.toThrow();
  });
});
