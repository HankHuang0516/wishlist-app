const {test} = require('node:test');
const assert = require('node:assert/strict');
const {assertDemoReady} = require('./app-review-preflight.cjs');
const now = Date.parse('2026-10-02T12:00:00Z');
function ready() {
    const room = (buyerUserId, sellerUserId, status) => ({buyerUserId, sellerUserId, archived:false, blocked:false, listingAvailable:true,
        messages:[{senderUserId:buyerUserId,text:'QA buyer'},{senderUserId:sellerUserId,text:'QA reply'}],
        appointment:{status,startsAt:'2026-12-01T06:00:00.000Z'}});
    return {userId:946,expectedUserId:946,wishCount:2,
        ownListings:[{status:'ACTIVE',expiresAt:'2030-12-31T00:00:00Z',media:[{thumbnailUrl:'https://example.invalid/photo'}]}],
        rooms:[room(946,947,'CONFIRMED'),room(947,946,'PROPOSED')],
        marketing:{available:true,paidPurchasesAvailable:false,freeMonthlyLimit:3,freeUsedThisMonth:0},
        iapCount:0,subscriptionCount:0,notes:[1,2,3,4,5].map(n=>`Business model Q${n}: Free service.`).join('\n')};
}
test('accepts a demo with content for both account roles and complete business answers',()=>assert.doesNotThrow(()=>assertDemoReady(ready(),now)));
for (const [name,mutate] of [
    ['wrong login identity',s=>s.userId=928],['empty social inbox',s=>s.rooms=[]],
    ['one-sided messages',s=>s.rooms.forEach(r=>r.messages.pop())],['buyer-only account',s=>s.rooms.pop()],
    ['blocked chat',s=>s.rooms[0].blocked=true],['expired listing',s=>s.ownListings[0].expiresAt='2026-01-01'],
    ['no photos',s=>s.ownListings[0].media=[]],['no wishes',s=>s.wishCount=0],
    ['expired meetup',s=>s.rooms[0].appointment.startsAt='2026-01-01'],['no confirmed meetup',s=>s.rooms[0].appointment.status='CANCELLED'],
    ['AI unavailable',s=>s.marketing.available=false],['free allowance exhausted',s=>s.marketing.freeUsedThisMonth=3],
    ['payment enabled without updated answers',s=>s.marketing.paidPurchasesAvailable=true],
    ['new subscription',s=>s.subscriptionCount=1],['new IAP',s=>s.iapCount=1],['missing business answer',s=>s.notes=s.notes.replace('Business model Q5:', 'Removed:')],
]) test(`blocks ${name}`,()=>{const s=ready();mutate(s);assert.throws(()=>assertDemoReady(s,now));});
