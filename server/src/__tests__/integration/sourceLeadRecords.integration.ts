import express from 'express';
import {createLoopbackRequest} from './loopbackHttp';
import prisma from '../../lib/prisma';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {randomUUID} from 'crypto';
describe('same DB record save -> review -> publication (isolated only)',()=>{
 const admin='synthetic-db-record-admin',prefix='SYNTHETIC-DB-MASTER-';let app:any;const previous=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 const bridge=express();bridge.use((req,res,next)=>app(req,res,next));const http=createLoopbackRequest(bridge);
 const facts=(id:string)=>({canonicalUrl:'https://www.facebook.com/groups/123456789/posts/'+id,title:'合成DB來源用品',summary:'合成測試來源，不是真實商品。',county:'臺南市',district:'永康區',publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:new Date().toISOString(),evidence:{sourceUrl:'https://www.facebook.com/groups/123456789/posts/'+id,sourcePublic:true,publicSourceRef:'source:synthetic-public',dateRef:'source:synthetic-date',locationRef:'source:synthetic-location',coordinateRef:'source:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'review:synthetic-legacy-review',sourceCheckRef:'source:synthetic-'+id}});
 const post=(path:string,body:any)=>http.post('/admin/records/'+path).set('x-admin-key',admin).send(body);
 const get=(id:string)=>http.get('/admin/records/'+id).set('x-admin-key',admin);
 const save=(id:string,f:any,old?:any,op=randomUUID())=>post('save',{operationId:op,items:[{archiveItemId:id,expectedRevision:old?.recordRevision??0,expectedStateHash:old?.stateHash??null,facts:f}]});
 const publish=(r:any,op=randomUUID())=>post('publish',{operationId:op,confirmSourceReference:true,items:[{id:r.id,expectedRevision:r.recordRevision,expectedStateHash:r.stateHash,pendingHash:r.pendingHash,reviewRef:'review:synthetic-db-publication'}]});
 beforeAll(()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Equal isolated DB required');process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
 beforeEach(()=>{app=express();app.use(express.json());app.use('/admin',createSourceLeadAdmin(()=>admin));app.use('/leads',createSourceLeadRoutes());});
 afterEach(async()=>{const rows=await prisma.externalSourceLead.findMany({where:{archiveItemId:{startsWith:prefix}},select:{id:true}});await prisma.sourceLeadRecordEvent.deleteMany({where:{leadId:{in:rows.map(r=>r.id)}}});await prisma.externalSourceLead.deleteMany({where:{archiveItemId:{startsWith:prefix}}});});
 afterAll(async()=>{if(previous===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=previous;await prisma.$disconnect();});
 test('private incomplete draft is queryable only by existing admin; publish rejects it',async()=>{const id=prefix+randomUUID();expect((await http.get('/admin/records')).status).toBe(401);const s=await save(id,{canonicalUrl:facts(id).canonicalUrl,title:'合成待審'});expect(s.status).toBe(200);const r=(await get(s.body.results[0].id)).body;expect(r.status).toBe('PRIVATE_PENDING');expect(r.libraryFileId).toBeUndefined();expect(r.legacyArchive.libraryFileId).toBeNull();expect(r.checkedAt).toBeNull();expect((await http.get('/leads/'+r.id)).status).toBe(404);expect((await publish(r)).status).toBe(409);expect(await prisma.listing.count({where:{title:'合成待審'}})).toBe(0);});
 test('same-ID save,publish,readback,history and on-demand export require no archive transport',async()=>{
  const id=prefix+randomUUID(),f=facts(id),op=randomUUID(),body={operationId:op,items:[{archiveItemId:id,expectedRevision:0,expectedStateHash:null,facts:f}]};
  const s=await post('save',body);expect(s.status).toBe(200);expect((await post('save',body)).body.replayed).toBe(true);expect((await post('save',{...body,items:[{...body.items[0],facts:{...f,title:'不同'}}]})).body.errorCode).toBe('OPERATION_BODY_CONFLICT');
  const r=(await get(s.body.results[0].id)).body,pop=randomUUID();const p=await publish(r,pop);expect(p.status).toBe(200);expect(p.body.qualifiedSupplyAdded).toBe(0);expect((await publish(r,pop)).body.replayed).toBe(true);
  const current=(await get(r.id)).body;expect(current.id).toBe(r.id);expect(current.recordOrigin).toBe('DB_MASTER');expect(current.pendingHash).toBeNull();
  const pub=await http.get('/leads/'+r.id);expect(pub.status).toBe(200);expect(pub.body.stockStatus).toBe('UNKNOWN');expect(pub.body.qualifiedSupply).toBe(false);expect(pub.body).not.toHaveProperty('pendingFacts');expect((await http.get('/leads?bbox=117,20,123.8,26.6')).body.items.some((i:any)=>i.id===r.id)).toBe(true);
  const history=await http.get('/admin/records/'+r.id+'/history?limit=1').set('x-admin-key',admin);expect(history.body.items).toHaveLength(1);expect(history.body.nextCursor).toBeTruthy();expect((await http.get('/admin/records/'+r.id+'/history?cursor='+history.body.nextCursor).set('x-admin-key',admin)).body.items).toHaveLength(1);
  const exported=await http.get('/admin/records/'+r.id+'/export?format=json').set('x-admin-key',admin);expect(exported.body.backupOnly).toBe(true);expect(exported.body.record.id).toBe(r.id);expect(exported.body.authoritativeStore).toBe('DATABASE');
  expect((await http.post('/admin/import').set('x-admin-key',admin).send({items:[{...f,archiveItemId:id,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:1,archiveSha256:'a'.repeat(64)}],dryRun:false})).body.errorCode).toBe('DB_RECORD_USE_RECORDS_ROUTE');
 });
 test('current DB state conflict and source-reference retiming reject; an older source check still publishes (no passive expiry)',async()=>{const id=prefix+randomUUID(),f=facts(id),s=await save(id,f),r=(await get(s.body.results[0].id)).body;expect((await save(id,f,{...r,recordRevision:99})).body.errorCode).toBe('RECORD_STATE_CONFLICT');expect((await save(id,{...f,checkedAt:new Date(Date.now()-7*86400000).toISOString()},r)).body.errorCode).toBe('SOURCE_CHECK_REFERENCE_TIME_CONFLICT');const stale={...f,checkedAt:new Date(Date.now()-7*86400000).toISOString(),evidence:{...f.evidence,sourceCheckRef:'source:synthetic-new-stale'}};const ss=await save(id,stale,r);expect(ss.status).toBe(200);const rr=(await get(r.id)).body;expect((await publish(rr)).status).toBe(200);expect((await http.get('/leads/'+r.id)).status).toBe(200);});
 test('existing expired published UUID and historical archive preserved; sold signal cannot resurrect',async()=>{
  const id=prefix+randomUUID(),f=facts(id);const {sourceCheckRef,...legacyEvidence}=f.evidence;
  const imp=await http.post('/admin/import').set('x-admin-key',admin).send({items:[{...f,evidence:legacyEvidence,archiveItemId:id,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:16,archiveSha256:'a'.repeat(64)}],dryRun:false});expect(imp.status).toBe(200);const uuid=imp.body.ids[0];await prisma.externalSourceLead.update({where:{id:uuid},data:{checkedAt:new Date(Date.now()-7*86400000)}});expect((await http.get('/leads/'+uuid)).status).toBe(404);
  const before=(await get(uuid)).body;expect((await save(id,f,before)).status).toBe(200);const pending=(await get(uuid)).body;expect((await publish(pending)).status).toBe(200);const live=(await get(uuid)).body;expect(live.legacyArchive.version).toBe(16);expect(live.legacyArchive.historicalOnly).toBe(true);expect((await http.get('/leads/'+uuid)).status).toBe(200);
  const sold={...f,sourceClaimState:'SOLD',stateEvidenceRef:'source:synthetic-sold'};expect((await save(id,sold,live)).status).toBe(200);const hidden=(await get(uuid)).body;expect(hidden.status).toBe('WITHDRAWN');expect((await http.get('/leads/'+uuid)).status).toBe(404);expect((await publish(hidden)).status).toBe(409);
 });
 test('a DB draft without a seller meeting point publishes only as a labelled county illustration',async()=>{
  const {countyIllustration,COUNTY_ILLUSTRATION_SOURCE}=require('../../lib/sourceCountyIllustration');
  const id=prefix+randomUUID(),url='https://www.facebook.com/groups/123456789/posts/'+id,p=countyIllustration('臺中市'),at=new Date(Date.now()-3600000).toISOString();
  const f={canonicalUrl:url,title:'合成概略位置商品',summary:'合成測試，賣家未指定面交點，請私訊賣家洽詢自取。',county:'臺中市',district:'行政區未明示',publicPlaceName:'臺中市概略示意位置',publicAddress:'臺中市（概略位置，非取貨點）',latitude:p.latitude,longitude:p.longitude,postedEarliestAt:at,postedLatestAt:at,checkedAt:new Date().toISOString(),
   evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'source:synthetic-public',dateRef:'source:synthetic-date',locationRef:'source:synthetic-county',coordinateRef:'source:post-dataset-25489',locationSourceUrl:url,coordinateSourceUrl:COUNTY_ILLUSTRATION_SOURCE,publicPlace:false,locationType:'COUNTY_ILLUSTRATION',sourceMeetingPointConfirmed:false,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,sourceCheckRef:'source:synthetic-check-'+id,
    countyIllustration:{county:'臺中市',sourceUrl:url,sourceCountyRef:'source:synthetic-county-'+id,representativeKey:p.key,approvalRef:'review:synthetic-approval',districtStatus:'UNKNOWN'}}};
  const s=await save(id,f);expect(s.status).toBe(200);const r=(await get(s.body.results[0].id)).body;
  expect((await publish(r)).status).toBe(200);
  expect((await http.get('/leads/'+r.id)).status).toBe(404);
  const pub=await http.get('/leads/'+r.id+'?approximate=1');expect(pub.status).toBe(200);expect(pub.body.locationPrecision).toBe('COUNTY_ILLUSTRATION');expect(pub.body.district).toBe('行政區未明示');expect(pub.body.notice).toContain('非取貨點');
 });
 test('a DB record without any area publishes off-map and only for opt-in clients',async()=>{
  const id=prefix+randomUUID(),url='https://www.facebook.com/groups/123456789/posts/'+id,at=new Date(Date.now()-3600000).toISOString();
  const f={canonicalUrl:url,title:'合成無地區商品',summary:'合成測試，賣家未提供地區，面交地點需聯絡賣家。',county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,postedEarliestAt:at,postedLatestAt:at,checkedAt:new Date().toISOString(),
   evidence:{sourceUrl:url,sourcePublic:true,publicSourceRef:'source:synthetic-public',dateRef:'source:synthetic-date',publicPlace:false,locationType:'SELLER_CONTACT_REQUIRED',sourceMeetingPointConfirmed:false,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,sourceCheckRef:'source:synthetic-check-'+id}};
  expect((await save(id,{...f,county:'臺南市'})).body.errorCode).toBe('BOUND_CONTACT_LOCATION_REQUIRED');
  const s=await save(id,f);expect(s.status).toBe(200);const r=(await get(s.body.results[0].id)).body;
  expect((await publish(r)).status).toBe(200);
  expect((await http.get('/leads/'+r.id+'?approximate=1')).status).toBe(404);
  const one=await http.get('/leads/'+r.id+'?approximate=1&unlocated=1');expect(one.status).toBe(200);expect(one.body.locationPrecision).toBe('CONTACT_FOR_LOCATION');expect(one.body.latitude).toBeNull();expect(one.body.notice).toContain('需聯絡賣家');
  const ids=async(qs:string)=>(await http.get('/leads?'+qs)).body.items.map((i:any)=>i.id);
  expect(await ids('bbox=117,20,123.8,26.6&q=合成無地區')).not.toContain(r.id);
  expect(await ids('bbox=120,22,120.1,22.1&q=合成無地區&unlocated=1')).toContain(r.id);
  expect((await http.get('/leads?unlocated=yes')).status).toBe(409);
 });
 test('DB record photos: Flickr upload receipt -> per-item assignment -> public gallery, replay-safe',async()=>{
  const sharp=require('sharp'),jpeg=await sharp({create:{width:8,height:8,channels:3,background:'#c33'}}).jpeg().toBuffer();
  const env={...process.env};Object.assign(process.env,{ADMIN_API_KEY:'synthetic-receipt-key',FLICKR_API_KEY:'k',FLICKR_API_SECRET:'s',FLICKR_OAUTH_TOKEN:'t',FLICKR_OAUTH_TOKEN_SECRET:'ts'});
  let next=777000;const real=global.fetch;
  const fake=jest.spyOn(global,'fetch').mockImplementation(async(input:any,init?:any)=>{const u=String(input);
   if(u.startsWith('https://up.flickr.com/'))return new Response('<rsp stat="ok"><photoid>'+(++next)+'</photoid></rsp>');
   if(u.startsWith('https://www.flickr.com/services/rest/')){const id=new URL(u).searchParams.get('photo_id');return Response.json({stat:'ok',sizes:{size:[{label:'Large 1600',source:'https://live.staticflickr.com/65535/'+id+'_abcd1234_h.jpg'},{label:'Small 320',source:'https://live.staticflickr.com/65535/'+id+'_abcd1234_n.jpg'}]}});}
   if(u.startsWith('https://live.staticflickr.com/'))return new Response(jpeg,{headers:{'content-type':'image/jpeg','content-length':String(jpeg.length)}});
   return real(input,init);});
  try{
   const id=prefix+randomUUID(),f=facts(id),s=await save(id,f),r=(await get(s.body.results[0].id)).body;expect((await publish(r)).status).toBe(200);
   const upload=(photo:string)=>http.post('/admin/records/'+r.id+'/photo-uploads?sourcePhotoId='+photo).set('x-admin-key',admin).set('Content-Type','image/jpeg').send(jpeg);
   const a=await upload('901');expect(a.status).toBe(200);expect(a.body.imageSource).toMatch(/^https:\/\/live\.staticflickr\.com\//);
   expect((await http.post('/admin/records/'+r.id+'/photo-uploads?sourcePhotoId=902').set('Content-Type','image/jpeg').send(jpeg)).status).toBe(401);
   const live=(await get(r.id)).body,op=randomUUID();
   const assignment={checkedAt:f.checkedAt,sourceRevision:'synthetic-photo-viewer',reviewRef:'review:synthetic-photo-assignment',rightsEvidenceRef:'consent:synthetic-hank-photo-backup',coverage:'FULL_POST',photos:[{sourcePhotoId:'900',classification:'OTHER_VARIANT'},{sourcePhotoId:'901',classification:'SAME_ITEM',archiveItemId:id}]};
   const body={operationId:op,expectedRevision:live.recordRevision,expectedStateHash:live.stateHash,assignment,uploads:[a.body]};
   expect((await post(r.id+'/photos',{...body,uploads:[{...a.body,photoId:'1'}]})).body.errorCode).toBe('PHOTO_RECEIPT_INVALID');
   const bound=await post(r.id+'/photos',body);expect(bound.status).toBe(200);expect(bound.body.results[0].photos).toBe(1);expect((await post(r.id+'/photos',body)).body.replayed).toBe(true);
   expect((await post(r.id+'/photos',{...body,operationId:randomUUID()})).body.errorCode).toBe('RECORD_STATE_CONFLICT');
   const pub=await http.get('/leads/'+r.id+'?presentation=1&photos=2');expect(pub.status).toBe(200);expect(pub.body.media).toHaveLength(1);expect(pub.body.photoCompleteness).toMatchObject({status:'IMPORTED_COMPLETE',sourceCount:1,importedCount:1});
   const img=await http.get('/leads/'+r.id+'/media/'+pub.body.media[0].id+'/image');expect(img.status).toBe(200);expect(img.headers['content-type']).toBe('image/jpeg');
   // A later re-check republish keeps the photos without re-uploading.
   const again=(await get(r.id)).body,checked=new Date(Date.now()-60000).toISOString(),f2={...f,checkedAt:checked,evidence:{...f.evidence,sourceCheckRef:'source:synthetic-photo-recheck'}};
   const s2=await save(id,f2,again);expect(s2.status).toBe(200);expect((await publish((await get(r.id)).body)).status).toBe(200);
   expect((await http.get('/leads/'+r.id+'?presentation=1&photos=2')).body.media).toHaveLength(1);
  }finally{fake.mockRestore();process.env=env;}
 });
 test('first-batch cap is20 and a bad batch is atomic',async()=>{const rows=Array.from({length:21},()=>{const id=prefix+randomUUID();return {archiveItemId:id,expectedRevision:0,expectedStateHash:null,facts:facts(id)};});expect((await post('save',{operationId:randomUUID(),items:rows})).body.errorCode).toBe('ONE_TO_20_RECORDS_REQUIRED');const bad=[rows[0],{...rows[1],facts:{...rows[1].facts,summary:'private@example.com'}}];expect((await post('save',{operationId:randomUUID(),items:bad})).status).toBe(409);expect(await prisma.externalSourceLead.count({where:{archiveItemId:{startsWith:prefix}}})).toBe(0);});
});
