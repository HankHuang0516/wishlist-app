const findMany = jest.fn();
jest.mock('../lib/prisma', () => ({__esModule:true,default:{listing:{findMany}}}));
import { privateStorePreview, privateStorePreviewProducts } from '../lib/privateStorePreview';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now=new Date('2026-10-27T04:00:00Z');
const preview={userId:946,listingIds:[id],expiresAt:'2026-10-29T04:00:00Z'};
beforeEach(()=>{process.env.APP_REVIEW_DEMO_USER_ID='946';process.env.PRIVATE_STORE_PREVIEW=JSON.stringify(preview);findMany.mockReset();});
afterEach(()=>{delete process.env.APP_REVIEW_DEMO_USER_ID;delete process.env.PRIVATE_STORE_PREVIEW;});
it('keeps preview opt-in bound to the configured demo identity, not arbitrary or anonymous users',async()=>{
 expect(privateStorePreview(undefined,now)).toBeNull();expect(privateStorePreview(947,now)).toBeNull();
 expect(await privateStorePreviewProducts(947,now,true)).toBeNull();expect(findMany).not.toHaveBeenCalled();
 process.env.PRIVATE_STORE_PREVIEW=JSON.stringify({...preview,userId:947});expect(privateStorePreview(947,now)).toBeNull();
});
it.each([{...preview,expiresAt:'2026-10-26T04:00:00Z'},{...preview,listingIds:[id,id]},{...preview,listingIds:['not-a-uuid']},{...preview,expiresAt:'2027-10-27T04:00:00Z'},{...preview,unexpected:true}])('fails closed for malformed, expired or unbounded configuration %j',p=>{
 process.env.PRIVATE_STORE_PREVIEW=JSON.stringify(p);expect(privateStorePreview(946,now)).toBeNull();
});
it('reads only the owner’s allowlisted DRAFT records and preserves actual status, price, photo and approximate location',async()=>{
 findMany.mockResolvedValue([{id,ownerUserId:946,title:'橘色檯燈',description:'私人展示內容',category:'home',brand:null,price:350,currency:'TWD',condition:'USED',status:'DRAFT',createdAt:now,
 location:{county:'臺北市',district:'中山區',publicLongitude:121.53,publicLatitude:25.07},media:[{id:'photo',flickrImageUrl:'https://live.staticflickr.com/fixture/image.jpg',flickrThumbnailUrl:'https://live.staticflickr.com/fixture/thumbnail.jpg'}]}]);
 const rows=await privateStorePreviewProducts(946,now,true);
 expect(findMany.mock.calls[0][0].where).toEqual({id:{in:[id]},ownerUserId:946,status:'DRAFT'});
 expect(rows).toEqual([expect.objectContaining({id,price:350,stockStatus:'DRAFT',title:'橘色檯燈',mapLocation:{coordinates:[121.53,25.07],precision:'APPROXIMATE_2KM',visibleUntil:new Date(preview.expiresAt).toISOString()}})]);
 expect(rows![0]).not.toHaveProperty('requestHash');expect(rows![0].photos).toHaveLength(1);
});
