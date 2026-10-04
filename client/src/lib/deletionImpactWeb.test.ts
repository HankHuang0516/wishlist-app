import { describe,expect,it } from 'vitest';
import { parseDeletionImpact } from './deletionImpactWeb';
const counts={ reportsAuthored:0,reportOperationReceipts:1,reportsOnOwnedListings:2,moderationActionsOnOwnedListings:3,moderationActionsDetachingOwnReports:4,
  wishlists:5,wishes:6,wishCreateReceipts:7,listings:8,uploadedPhotos:9,conversations:10,messagesAuthored:11,otherMessagesInSharedConversations:12,
  meetupAppointments:13,upcomingMeetupAppointments:14,purchaseRecords:15,giftClaimsInOtherWishlists:16,originalCreditsInOtherWishlists:17,itemWatches:18,
  followRelationships:19,blockRelationships:20,feedbackRecords:21,crawlerRecords:22 };
const preview={version:2,previewOnly:true,accountDeleted:false,capturedAt:'2026-10-04T01:00:00.000Z',counts};
describe('complete APP v2 impact contract',()=>{
  it('preserves all independent overlapping, retained and detached counts, including real zero',()=>{
    expect(parseDeletionImpact(preview)).toEqual({capturedAt:preview.capturedAt,counts});expect(parseDeletionImpact(preview).counts.reportsAuthored).toBe(0);
  });
  it.each(['missing','additional','string','negative','overflow'])('rejects %s count data before enabling deletion',kind=>{
    const altered:Record<string,unknown>={...counts};if(kind==='missing')delete altered.purchaseRecords;if(kind==='additional')altered.unrecognised=0;if(kind==='string')altered.purchaseRecords='15';if(kind==='negative')altered.purchaseRecords=-1;if(kind==='overflow')altered.purchaseRecords=2147483648;
    expect(()=>parseDeletionImpact({...preview,counts:altered})).toThrow();
  });
  it.each([{...preview,version:1},{...preview,previewOnly:false},{...preview,accountDeleted:true},{...preview,capturedAt:'2026-10-04'},{...preview,capturedAt:'not a date'}])('rejects a non-preview or untrusted timestamp',invalid=>{
    expect(()=>parseDeletionImpact(invalid)).toThrow();
  });
});
