import { describe,expect,it,vi } from 'vitest';
vi.mock('../config',()=>({API_URL:'/api',getFullApiUrl:()=> 'https://wishlist-app-production.up.railway.app/api'}));
import { draftListingCreationJournal,listingCreationResult,parseListingCreationJournal,strictCreatedListing } from './listingCreationWeb';
import { photoUploadJournal,parsePhotoUploadJournal,photoUploadResult } from './listingPhotoUploadWeb';
const id='11111111-1111-4111-8111-111111111111',media='22222222-2222-4222-8222-222222222222',date='2026-10-03T00:00:00.000Z',base='https://wishlist-app-production.up.railway.app';
const body={clientListingId:id,title:'正式模式合成草稿',condition:'USED',category:'other',currency:'TWD',publish:false,consentToMap:false,mediaIds:[],deliveryMethods:[],negotiable:false};
const listing=()=>({id,ownerUserId:19,owner:{id:19,name:'合成帳號'},version:1,title:body.title,description:null,brand:null,condition:'USED',category:'other',price:null,currency:'TWD',deliveryMethods:[],negotiable:false,status:'DRAFT',createdAt:date,updatedAt:date,publishedAt:null,lastVerifiedAt:null,expiresAt:null,expiryMode:'DEFAULT_30_DAYS',location:null,media:[]});
describe('production same-origin /api transport with absolute server projections',()=>{
  it('accepts the real no-photo draft acknowledgement and exact receipt in production mode',async()=>{
    expect(strictCreatedListing(listing(),19).status).toBe('DRAFT');const raw=await draftListingCreationJournal(JSON.stringify(body)),journal=await parseListingCreationJournal(raw);
    expect((await listingCreationResult({receipt:{clientListingId:id,requestHash:journal.requestHash,state:'CREATED',listingId:id,createdAt:date},listing:listing()},raw,19)).listing?.title).toBe(body.title);
  });
  it('accepts only same-origin absolute media in a created draft',()=>{
    const row={...listing(),media:[{id:media,imageUrl:`${base}/api/listing-media/${media}/image`,thumbnailUrl:`${base}/api/listing-media/${media}/thumbnail`,position:0,capturePurpose:'MANUAL_PHOTO'}]};
    expect(strictCreatedListing(row,19).media).toHaveLength(1);expect(()=>strictCreatedListing({...row,media:[{...row.media[0],imageUrl:'https://external.invalid/image'}]},19)).toThrow();
  });
  it('verifies a manual photo receipt against the absolute production proxy and rejects another origin',async()=>{
    const raw=await photoUploadJournal(new File(['synthetic'],'fixture.png',{type:'image/png'}),id,'MANUAL_PHOTO'),journal=await parsePhotoUploadJournal(raw,'MANUAL_PHOTO');
    const value={receipt:{clientUploadId:id,requestHash:journal.requestHash,state:'STORED',mediaId:media,createdAt:date},media:{id:media,ownerUserId:19,clientUploadId:id,capturePurpose:'MANUAL_PHOTO',contentHash:'a'.repeat(64),listingId:null,wishItemId:null,imageUrl:`${base}/api/listing-media/${media}/image`,thumbnailUrl:`${base}/api/listing-media/${media}/thumbnail`,width:320,height:240,byteSize:123,createdAt:date}};
    expect((await photoUploadResult(value,raw,19,'MANUAL_PHOTO')).mediaId).toBe(media);await expect(photoUploadResult({...value,media:{...value.media,thumbnailUrl:'https://external.invalid/photo'}},raw,19,'MANUAL_PHOTO')).rejects.toThrow();
  });
});
