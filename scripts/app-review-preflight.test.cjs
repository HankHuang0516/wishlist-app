const {test} = require('node:test');
const assert = require('node:assert/strict');
const {assertDemoReady,assertNativeEvidence,assertPrivacyEvidence,requiredPrivacyTypes,selectedBuildId} = require('./app-review-preflight.cjs');
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

function unchangedBinary() {return {mode:'unchanged-native-binary',versionId:'version',demoUserId:946,
    buildId:'build12',buildNumber:'12',artifactSha256:'known-artifact',verifiedAt:new Date().toISOString(),
    sceneLifecycleVerified:true,nativeGitTree:'known-native-tree',appleReviewConfirmedLogin:true,
    appleScreenshotProofs:[{path:'social.png'},{path:'account.png'}]};}
test('accepts an unchanged reviewed binary for a backend-only correction without inventing fresh UI results',()=>
    assert.doesNotThrow(()=>assertNativeEvidence(unchangedBinary(),{versionId:'version',demoUserId:946},'build12','known-native-tree')));
test('requires new UI evidence when native source changes',()=>
    assert.throws(()=>assertNativeEvidence(unchangedBinary(),{versionId:'version',demoUserId:946},'build12','changed-tree')));
test('rejects evidence from a different selected build',()=>
    assert.throws(()=>assertNativeEvidence(unchangedBinary(),{versionId:'version',demoUserId:946},'build13','known-native-tree')));
test('rejects missing App Review screenshots for the existing binary baseline',()=>{
    const r=unchangedBinary();r.appleScreenshotProofs=[];
    assert.throws(()=>assertNativeEvidence(r,{versionId:'version',demoUserId:946},'build12','known-native-tree'));
});
test('verifies the selected build from the asc summary and JSON API relationship formats',()=>{
    assert.equal(selectedBuildId({id:'version',state:'REJECTED',buildId:'build12',buildVersion:'12'}),'build12');
    assert.equal(selectedBuildId({data:{relationships:{build:{data:{id:'build12'}}}}}),'build12');
});
test('refuses to submit when the selected build cannot be verified',()=>assert.throws(()=>selectedBuildId({id:'version'})));
function privacyReady(){return {appId:'6468950847',published:true,pending:false,nativeTree:'native',serverTree:'server',verifiedAt:new Date().toISOString(),declaredTypes:[...requiredPrivacyTypes],linkedCount:requiredPrivacyTypes.length,unlinkedPreview:false};}
test('accepts published App Privacy labels matching the current collection and code',()=>assert.doesNotThrow(()=>assertPrivacyEvidence(privacyReady(),'native','server')));
for (const [name,change] of [['unpublished privacy',r=>r.published=false],['pending declaration',r=>r.pending=true],['missing chat declaration',r=>r.declaredTypes=r.declaredTypes.filter(x=>x!=='電子郵件或訊息')],['missing retained operation declaration',r=>{r.declaredTypes=r.declaredTypes.filter(x=>x!=='產品互動');r.linkedCount=r.declaredTypes.length;}],['legacy anonymous labels',r=>r.linkedCount=0],['new native collection',r=>r.nativeTree='old'],['new backend collection',r=>r.serverTree='old']])
    test(`blocks ${name}`,()=>{const r=privacyReady();change(r);assert.throws(()=>assertPrivacyEvidence(r,'native','server'));});
