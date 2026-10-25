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
for (const [name,change] of [['unpublished privacy',r=>r.published=false],['pending declaration',r=>r.pending=true],['missing chat declaration',r=>r.declaredTypes=r.declaredTypes.filter(x=>x!=='電子郵件或訊息')],['missing retained operation declaration',r=>{r.declaredTypes=r.declaredTypes.filter(x=>x!=='產品互動');r.linkedCount=r.declaredTypes.length;}],['missing push-device declaration',r=>{r.declaredTypes=r.declaredTypes.filter(x=>x!=='裝置識別碼');r.linkedCount=r.declaredTypes.length;}],['legacy anonymous labels',r=>r.linkedCount=0],['new native collection',r=>r.nativeTree='old'],['new backend collection',r=>r.serverTree='old']])
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

const {assertApprovedHistoricalRecording}=require('./app-review-preflight.cjs');
test('original19 human approval stays exact and requires honest historical footage disclosure',()=>{
 const scope={versionId:'00d4ab78-c004-4d89-a537-2399e54ae16f',buildId:'496d770a-b640-434b-a887-cdceb1233459',buildNumber:'19',nativeGitTree:'b699abd83d9c6c0ead7800bb4931a53eab87b60e',artifactSha256:'b9a86bc946ff69c0a471c561b47242aebb2b7f794bb4e200b9983e4732765baf'};
 const {receipt:base,age}=remediationFixture();
 const receipt={...base,...scope,mode:'approved-historical-recording',recordedVersion:'2.0.16',currentBuildPhysicalRecording:false,disclosureText:'This is the previously accepted2.0.16 physical footage, not a recording of19.',videoAttachment:{id:'attachment',fileName:'historical.mp4'}};
 const approval={...scope,approved:true,questionRef:'call_958c08f13f2e4d74ac306241a9540c2f'};
 const prior={versionString:'2.0.16',state:'READY_FOR_SALE',buildId:'a79db7d4-f26a-475e-9ba3-986a9e5e4e30'};
 const verify=(r=receipt,n=scope,a=approval,v=prior,notes=receipt.disclosureText)=>assertApprovedHistoricalRecording(r,n,age,a,v,notes);
 assert.doesNotThrow(()=>verify());
 assert.doesNotThrow(()=>verify(receipt,scope,approval,{...prior,state:'READY_FOR_DISTRIBUTION'}));
 assert.throws(()=>verify(receipt,scope,approval,{...prior,state:'PENDING_DEVELOPER_RELEASE'}));
 for(const [k,v] of Object.entries(scope)){assert.throws(()=>verify({...receipt,[k]:'wrong'}));assert.throws(()=>verify(receipt,{...scope,[k]:'wrong'}));assert.throws(()=>verify(receipt,scope,{...approval,[k]:'wrong'}));}
 assert.throws(()=>verify(receipt,scope,{...approval,approved:false}));
 assert.throws(()=>verify(receipt,scope,{...approval,questionRef:'unrelated'}));
 assert.throws(()=>verify({...receipt,currentBuildPhysicalRecording:true}));
 assert.throws(()=>verify({...receipt,recordedVersion:'2.0.17'}));
 assert.throws(()=>verify({...receipt,verifiedAt:'2020-01-01'}));
 assert.throws(()=>verify(receipt,scope,approval,{...prior,state:'REJECTED'}));
 assert.throws(()=>verify(receipt,scope,approval,{...prior,buildId:'unreviewed'}));
 assert.throws(()=>verify(receipt,scope,approval,prior,'A current physical recording.'));
 assert.throws(()=>verify({...receipt,checks:{...receipt.checks,mapStop:false}}));
});

function disabledDrafts() {
 const s=ready();
 s.productInventory=[
  {id:'one',kind:'iap',productId:'wishlist_marketing_10',state:'MISSING_METADATA'},
  {id:'two',kind:'iap',productId:'wishlist_sponsor_90',state:'MISSING_METADATA'},
  {id:'three',kind:'subscription',productId:'wishlist_premium_monthly',state:'MISSING_METADATA'},
 ];
 s.iapCount=2;s.subscriptionCount=1;
 s.businessContext={versionId:'version20',nativeTree:'native20',serverTree:'server20'};
 const disclosure='Configured draft products wishlist_marketing_10, wishlist_sponsor_90 and wishlist_premium_monthly are incomplete, unavailable for purchase and not requested for review in this submission. Checkout remains disabled; the reviewer can use the existing free allowance.';
 s.businessEvidence={...s.businessContext,appId:'6468950847',mode:'disabled-draft-products',verifiedAt:new Date(now).toISOString(),paidPurchasesAvailable:false,productsRequestedForReview:false,disclosureText:disclosure,products:structuredClone(s.productInventory)};
 s.notes+='\n'+disclosure;
 return s;
}
test('accepts only live-matched unsubmitted draft inventory with current honest disclosure and checkout disabled',()=>
 assert.doesNotThrow(()=>assertDemoReady(disabledDrafts(),now)));
for(const [name,change] of [
 ['missing receipt',s=>delete s.businessEvidence],
 ['changed version',s=>s.businessEvidence.versionId='another'],
 ['changed native tree',s=>s.businessEvidence.nativeTree='another'],
 ['changed server tree',s=>s.businessEvidence.serverTree='another'],
 ['stale review',s=>s.businessEvidence.verifiedAt='2020-01-01'],
 ['future review',s=>s.businessEvidence.verifiedAt='2030-01-01'],
 ['purchase enabled',s=>s.marketing.paidPurchasesAvailable=true],
 ['receipt enables purchase',s=>s.businessEvidence.paidPurchasesAvailable=true],
 ['IAP requested for review',s=>s.businessEvidence.productsRequestedForReview=true],
 ['missing note disclosure',s=>s.notes='Business model Q1: Free.'],
 ['new SKU',s=>s.productInventory[0].productId='unreviewed_sku'],
 ['changed product state',s=>s.productInventory[0].state='APPROVED'],
 ['missing product receipt',s=>s.businessEvidence.products.pop()],
 ['different product identity',s=>s.businessEvidence.products[0].id='another'],
 ['duplicate inventory',s=>s.productInventory[1]={...s.productInventory[0]}],
 ['wrong inventory count',s=>s.iapCount=1],
 ['missing inventory',s=>delete s.productInventory],
]) test('blocks disabled-draft business evidence: '+name,()=>{const s=disabledDrafts();change(s);assert.throws(()=>assertDemoReady(s,now));});

const {assertPreparedVersionValidation}=require('./app-review-preflight.cjs');
function preparedValidation() {
 return {report:{appId:'6468950847',versionId:'v20',summary:{errors:1,blocking:1},checks:[{id:'version.state.editable',severity:'error',field:'appVersionState',message:'version is in non-editable state "READY_FOR_REVIEW"'}]},
 version:{id:'v20',state:'READY_FOR_REVIEW'},submission:{data:{id:'submission',attributes:{state:'READY_FOR_REVIEW',platform:'IOS'},relationships:{appStoreVersionForReview:{data:{id:'v20'}},items:{data:[{type:'reviewSubmissionItems',id:'item'}]}}}}};
}
const validatePrepared=s=>assertPreparedVersionValidation(s.report,s.version,s.submission,'submission','item');
test('validates an existing exact unsubmitted ready draft without recreating it or ignoring other errors',()=>assert.deepEqual(validatePrepared(preparedValidation()),{contextualizedReadyDraftDiagnostic:true}));
test('ordinary zero-error validation still checks the actual draft and item',()=>{const s=preparedValidation();s.report.checks=[];s.report.summary={errors:0,blocking:0};s.version.state='PREPARE_FOR_SUBMISSION';assert.deepEqual(validatePrepared(s),{contextualizedReadyDraftDiagnostic:false});});
for(const [name,change] of [
 ['other app',s=>s.report.appId='other'],['other version',s=>s.report.versionId='other'],
 ['already submitted version',s=>s.version.state='WAITING_FOR_REVIEW'],['already submitted draft',s=>s.submission.data.attributes.state='WAITING_FOR_REVIEW'],
 ['canceled draft',s=>s.submission.data.attributes.state='CANCELED'],['other draft',s=>s.submission.data.id='other'],
 ['other platform',s=>s.submission.data.attributes.platform='MAC_OS'],['other draft version',s=>s.submission.data.relationships.appStoreVersionForReview.data.id='other'],
 ['other item',s=>s.submission.data.relationships.items.data[0].id='other'],['additional product item',s=>s.submission.data.relationships.items.data.push({type:'reviewSubmissionItems',id:'product'})],
 ['real metadata error',s=>s.report.checks[0].id='build.processed'],['other noneditable state',s=>s.report.checks[0].message='version is in non-editable state "IN_REVIEW"'],
 ['wrong field',s=>s.report.checks[0].field='build'],['missing errors',s=>s.report.summary.errors=0],['missing blocking',s=>s.report.summary.blocking=0],
 ['duplicate diagnostic',s=>{s.report.checks.push({...s.report.checks[0]});s.report.summary={errors:2,blocking:2};}],
 ['missing checks',s=>delete s.report.checks],['zero-error report but wrong actual item',s=>{s.report.checks=[];s.report.summary={errors:0,blocking:0};s.submission.data.relationships.items.data=[];}],
])test('prepared validation fails closed: '+name,()=>{const s=preparedValidation();change(s);assert.throws(()=>validatePrepared(s));});

function sameRelease20() {
 const original={versionId:'00d4ab78-c004-4d89-a537-2399e54ae16f',buildId:'496d770a-b640-434b-a887-cdceb1233459',buildNumber:'19',nativeGitTree:'b699abd83d9c6c0ead7800bb4931a53eab87b60e',artifactSha256:'b9a86bc946ff69c0a471c561b47242aebb2b7f794bb4e200b9983e4732765baf'};
 const native={versionId:original.versionId,buildId:'8967dbcb-09b2-421a-8497-df5df0a30945',buildNumber:'20',nativeGitTree:'54d40389cb885b92a318ff4c05f0ef7b9a242cbc',artifactSha256:'c78f1bb7ba25c117ac18dfbc0d387d52f61951781a3c1319d22229f5af0aefa6'};
 const {receipt:base,age}=remediationFixture();
 const receipt={...base,...native,mode:'approved-historical-recording',recordedVersion:'2.0.16',currentBuildPhysicalRecording:false,authorizationBasis:'same-2.0.17-release-original19-approval',originalApprovalBuildNumber:'19',disclosureText:'This is the previously accepted2.0.16 physical footage, not a recording of20.',videoAttachment:{id:'attachment',fileName:'historical.mp4'}};
 const approval={...original,approved:true,questionRef:'call_958c08f13f2e4d74ac306241a9540c2f',humanAnswer:'同意沿用並如實揭露，完成其他檢查後送審',scope:'This release only; historical physical footage is not current-build hardware verification; all other release gates stay required'};
 return {receipt,native,approval,age,prior:{versionString:'2.0.16',state:'READY_FOR_SALE',buildId:'a79db7d4-f26a-475e-9ba3-986a9e5e4e30'}};
}
const verifySameRelease=s=>assertApprovedHistoricalRecording(s.receipt,s.native,s.age,s.approval,s.prior,s.receipt.disclosureText);
test('same2.0.17 release20 binds its actual new binary and explicit disclosure without rewriting original19 human approval',()=>assert.doesNotThrow(()=>verifySameRelease(sameRelease20())));
for(const [name,change] of [
 ['new release',s=>{s.native.versionId='other';s.receipt.versionId='other';}],
 ['future build',s=>{s.native.buildNumber='21';s.receipt.buildNumber='21';}],
 ['different20 binary',s=>s.native.artifactSha256='another'],
 ['different20 source',s=>s.receipt.nativeGitTree='another'],
 ['fabricated new20 approval',s=>Object.assign(s.approval,s.native)],
 ['missing original human answer',s=>delete s.approval.humanAnswer],
 ['changed original authorization',s=>s.approval.humanAnswer='unrelated'],
 ['missing release scope',s=>delete s.approval.scope],
 ['missing explicit inherited basis',s=>delete s.receipt.authorizationBasis],
 ['missing original approved build',s=>delete s.receipt.originalApprovalBuildNumber],
 ['false current physical claim',s=>s.receipt.currentBuildPhysicalRecording=true],
 ['wrong disclosed build',s=>s.receipt.disclosureText='This is the previously accepted2.0.16 physical footage, not a recording of19.'],
 ['current check missing',s=>s.receipt.checks.mapStop=false],
])test('same-release historical reuse blocks: '+name,()=>{const s=sameRelease20();change(s);assert.throws(()=>verifySameRelease(s));});
