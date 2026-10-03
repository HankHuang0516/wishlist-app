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

const {assertReviewRemediationEvidence} = require('./app-review-preflight.cjs');
function remediationFixture() {
 const native={buildId:'build14',buildNumber:'14',nativeGitTree:'current-tree',artifactSha256:'a'.repeat(64),mode:'fresh-native-ui'};
 const receipt={appId:'6468950847',buildId:native.buildId,nativeGitTree:native.nativeGitTree,artifactSha256:native.artifactSha256,deviceKind:'physical',verifiedAt:new Date().toISOString(),videoPath:'/private/synthetic-recording.mp4',videoSha256:'b'.repeat(64),notesVideoUrl:'https://example.invalid/physical-proof.mp4',checks:Object.fromEntries(['termsBeforeLogin','termsBeforeRegister','chatReportReceipt','blockPreventsNewMessages','mapDecline','manualMapCheckIn','mapStop','noAutomaticMapRenewal'].map(c=>[c,true]))};
 return {native,receipt,age:{ageRatingOverrideV2:'EIGHTEEN_PLUS'}};
}
test('requires physical recording, the new selected binary and the Apple age override',()=>{
 const {native,receipt,age}=remediationFixture(); assert.doesNotThrow(()=>assertReviewRemediationEvidence(receipt,native,age));
 for(const change of [{deviceKind:'simulator'},{videoSha256:null},{buildId:'build12'},{nativeGitTree:'old-tree'},{notesVideoUrl:null},{verifiedAt:'2020-01-01'}])assert.throws(()=>assertReviewRemediationEvidence({...receipt,...change},native,age));
 for(const check of Object.keys(receipt.checks))assert.throws(()=>assertReviewRemediationEvidence({...receipt,checks:{...receipt.checks,[check]:false}},native,age));
 assert.throws(()=>assertReviewRemediationEvidence(receipt,{...native,mode:'unchanged-native-binary'},age));
 assert.throws(()=>assertReviewRemediationEvidence(receipt,{...native,buildNumber:'12'},age));
 assert.throws(()=>assertReviewRemediationEvidence(receipt,native,{ageRatingOverrideV2:'NONE'}));
});

const {assertRecordingDelivery}=require('./app-review-preflight.cjs');
test('checks the actual completed review attachment, exact inspected video and notes before resubmission',()=>{
 const {receipt,native,age}=remediationFixture();delete receipt.notesVideoUrl;
 receipt.videoAttachment={id:'attachment',fileName:'physical-device-proof.mp4',reviewDetailId:'detail'};
 const attachment={id:'attachment',relationships:{appStoreReviewDetail:{data:{id:'detail'}}},attributes:{fileName:'physical-device-proof.mp4',sourceFileChecksum:'c'.repeat(32),assetDeliveryState:{state:'COMPLETE'}}};
 assert.doesNotThrow(()=>assertReviewRemediationEvidence(receipt,native,age));
 assert.doesNotThrow(()=>assertRecordingDelivery(receipt,'Recording: physical-device-proof.mp4',attachment,'detail','c'.repeat(32)));
 for(const attributes of [{assetDeliveryState:{state:'UPLOADING'}},{sourceFileChecksum:'d'.repeat(32)},{fileName:'other.mp4'}])assert.throws(()=>assertRecordingDelivery(receipt,'physical-device-proof.mp4',{...attachment,attributes:{...attachment.attributes,...attributes}},'detail','c'.repeat(32)));
 assert.throws(()=>assertRecordingDelivery(receipt,'No recording',attachment,'detail','c'.repeat(32)));
 assert.throws(()=>assertRecordingDelivery(receipt,'physical-device-proof.mp4',attachment,'wrong-detail','c'.repeat(32)));
});
