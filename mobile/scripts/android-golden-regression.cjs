// Bounded native regression, only inside Simulator Manager; no manual input bridge.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');const {createHash,randomUUID}=require('node:crypto');
const {qaLabel,assignedSerial}=require('./android-qa-config.cjs');
const {assertTestDatabase}=require('../../scripts/assert-test-database.cjs');
const {startNativeQa}=require('./native-qa.cjs');
const {seedNativeMarketplace}=require('./native-qa-marketplace-fixture.cjs');
const {seedUiuxHomeQa}=require('./seed-uiux-home-qa.cjs');
const {seedBatchRemovalQa}=require('./seed-batch-removal-qa.cjs');
const {seedDiscoveryMapQa}=require('./seed-discovery-map-qa.cjs');
const mobile=path.resolve(__dirname,'..'),[appLabel,hostLabel,phase]=process.argv.slice(2);
qaLabel(appLabel);qaLabel(hostLabel);if(process.argv.length!==5||!['buyer','seller','logout','market','chat','photo','photo-recovery','discovery','source','map','batch-remove'].includes(phase))throw Error('Exact app/host labels and bounded regression phase required');
const isPhoto=['photo','photo-recovery'].includes(phase),recovery=phase==='photo-recovery';
const requestedFontScale=process.env.WISHLIST_GOLDEN_FONT_SCALE;
if(requestedFontScale!==undefined&&requestedFontScale!=='1.5')throw Error('Only the bounded enlarged-font scenario is supported');
const serial=assignedSerial(process.env),database=process.env.TEST_DATABASE_URL;
assertTestDatabase(database);if(database!==process.env.DATABASE_URL)throw Error('QA DB bindings must agree');
const appBuild=path.join(mobile,'build','android-visual-qa-'+appLabel),hostBuild=path.join(mobile,'build','android-golden-tests-'+hostLabel);
const app=JSON.parse(fs.readFileSync(path.join(appBuild,'build.json'))),host=JSON.parse(fs.readFileSync(path.join(hostBuild,'build.json')));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(app.kind!=='isolated-android-release-equivalent-visual-qa'||app.package!=='com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.visualqa'+appLabel||app.storeDeliverable!==false||app.apiOrigin!=='http://127.0.0.1:18889'||hash(path.join(appBuild,'app.apk'))!==app.apkSha256)throw Error('QA app provenance mismatch');
if(host.kind!=='isolated-golden-instrumentation-host'||host.package!=='com.hankhuang.wishlistgoldenqa.qa'+hostLabel||host.storeDeliverable!==false)throw Error('Test host provenance mismatch');
for(const[k,v]of Object.entries(app.sourceHashes))if(hash(path.join(mobile,k))!==v)throw Error('App source changed after static bundle');
for(const[k,v]of Object.entries(host.sourceHashes))if(hash(path.join(mobile,k))!==v)throw Error('Test source changed after host build');
for(const k of ['host','test'])if(hash(path.join(hostBuild,k+'.apk'))!==host.hashes[k])throw Error('Test APK changed');
const evidence=path.join(mobile,'build','android-golden-regression-'+randomUUID());fs.mkdirSync(evidence,{mode:0o700});
const report={kind:'actual-android-golden-regression',phase,appLabel,hostLabel,serial,package:app.package,apkSha256:app.apkSha256,passed:false,checkpoints:[],screenshots:[],storeDeliverable:false};
const adbPath='/Users/hank/Library/Android/sdk/platform-tools/adb';let child,stopping=false,qa,broker,observer,brokerUsed=false,counterpartUsed=false,installedHost=false,installedTest=false,stage='preflight',ownedPhoto=null,originalFontScale=null,fontScaleChanged=false;const reverses=[],observedCalls=[];const photoRecovery={posts:0,lookups:0,checkpoint:false,dropped:false};let recoveryPath='',uploadObservation=Promise.resolve(),mapFixture=null,batchFixture=null;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child?.kill('SIGTERM');});
function adb(args,timeout=30000,cleanup=false){return new Promise((resolve,reject)=>{
 if(stopping&&!cleanup)return reject(Error('Interrupted'));
 const p=spawn(adbPath,['-s',serial,...args],{stdio:['ignore','pipe','pipe']});child=p;let out='',installDiagnostic='';const timer=setTimeout(()=>p.kill('SIGTERM'),timeout);
 p.stdout.on('data',b=>{if(out.length<2000000)out+=b.toString();});p.stderr.on('data',b=>{if(args[0]==='install'&&installDiagnostic.length<8192)installDiagnostic+=b.toString();});
 p.on('error',()=>{clearTimeout(timer);reject(Error('ADB unavailable'));});p.on('close',code=>{clearTimeout(timer);if(child===p)child=null;if(code!==0&&!report.firstDeviceFailure)report.firstDeviceFailure={stage,command:args[0],operation:args[0]==='shell'?args[1]:null,exitCode:code,...(args[0]==='install'?{installFailureCode:(out+installDiagnostic).match(/\b(?:INSTALL_FAILED|INSTALL_PARSE_FAILED)_[A-Z_]+\b/)?.[0]??null,installFailureCategory:[['PACKAGE_SERVICE_UNAVAILABLE',/can't find service.*package|failure calling service.*package/i],['TRANSPORT_FAILURE',/broken pipe|device offline|device.*not found|connection reset|transport.*closed|device.*disconnected/i],['DEVICE_SPACE',/no space left|not enough (?:storage|space)/i],['DEVICE_AUTHORIZATION',/unauthorized|not authorized/i]].find(([,pattern])=>pattern.test(out+installDiagnostic))?.[0]??null}:{})};code===0?resolve(out):reject(Error('Device command failed; raw output withheld'));});
});}
async function reverse(port,hostPort=port){const endpoint='tcp:'+port;const current=await adb(['reverse','--list']);if(current.split(/\r?\n/).some(l=>l.split(/\s+/).includes(endpoint)))throw Error('Own reverse endpoint occupied; not replacing');await adb(['reverse',endpoint,'tcp:'+hostPort]);reverses.push(endpoint);}
function shellQuote(value){return "'"+value.replaceAll("'","'\\''")+"'";}
async function photoRows(cleanup=false){
 const predicate="_data='"+ownedPhoto.canonical+"'";
 const value=await adb(['shell','content','query','--uri','content://media/external/images/media','--projection','_id','--where',shellQuote(predicate)],10000,cleanup);
 return [...value.matchAll(/Row: /g)].length;
}
async function preparePhoto(){
 stage='owned-photo-metadata';const source=path.join(mobile,'qa-fixtures/synthetic-used-blue-mug.png');
 if(hash(source)!=='4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9')throw Error('Exact reviewed synthetic photo required');
 const sharp=require('../../server/node_modules/sharp');
 const bytes=await sharp(source).jpeg({quality:92}).withMetadata({exif:{IFD0:{Artist:'Wishlist synthetic QA metadata marker'}}}).toBuffer();
 const metadata=await sharp(bytes).metadata();if(!metadata.exif?.length)throw Error('Synthetic EXIF fixture missing');
 const name='wishlist-golden-'+randomUUID()+'.jpg',local=path.join(evidence,name),remote='/sdcard/Download/'+name;
 fs.writeFileSync(local,bytes,{flag:'wx',mode:0o600});
 await adb(['shell','test','!','-e',remote]);
 ownedPhoto={name,local,remote,sha256:hash(local)};
 stage='owned-photo-upload';await adb(['push',local,remote]);
 if((await adb(['shell','sha256sum',remote])).trim().split(/\s+/)[0]!==ownedPhoto.sha256)throw Error('Owned photo fixture changed');
 // Verify the primary-storage alias directly; do not rely on readlink -f.
 const canonical='/storage/emulated/0/Download/'+name;
 if((await adb(['shell','sha256sum',canonical])).trim().split(/\s+/)[0]!==ownedPhoto.sha256)throw Error('Unexpected photo fixture location');ownedPhoto.canonical=canonical;
 stage='owned-photo-index';await adb(['shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file://'+remote]);
 for(let attempt=0;attempt<40;attempt++){if(await photoRows()===1)break;await new Promise(resolve=>setTimeout(resolve,100));}
 if(await photoRows()!==1)throw Error('Owned photo index unavailable');
 report.photoFixture={name,sha256:ownedPhoto.sha256,inputExifPresent:true,inputExifContainsOnlySyntheticMarker:true};
}
async function cleanupPhoto(){
 if(!ownedPhoto)return;
 const current=(await adb(['shell','sha256sum',ownedPhoto.remote],10000,true)).trim().split(/\s+/)[0];
 if(current!==ownedPhoto.sha256||!ownedPhoto.canonical)throw Error('Preserve changed or unverified fixture');
 const predicate="_data='"+ownedPhoto.canonical+"'";
 await adb(['shell','content','delete','--uri','content://media/external/images/media','--where',shellQuote(predicate)],10000,true);
 // MediaProvider normally removes the owned file too; guard an exact-path fallback.
 const remains=(await adb(['shell','sh','-c',shellQuote('if test -e '+ownedPhoto.remote+'; then echo PRESENT; else echo ABSENT; fi')],10000,true)).trim();
 if(remains==='PRESENT'){
  if((await adb(['shell','sha256sum',ownedPhoto.remote],10000,true)).trim().split(/\s+/)[0]!==ownedPhoto.sha256)throw Error('Changed fixture retained');
  await adb(['shell','rm','--',ownedPhoto.remote],10000,true);
 }else if(remains!=='ABSENT')throw Error('Fixture removal uncertain');
 const rows=await photoRows(true);await adb(['shell','test','!','-e',ownedPhoto.remote],10000,true);
 if(rows!==0)throw Error('Fixture index remains');report.photoFixtureCleanup={indexRowsRemaining:0,fileRemoved:true};
}
async function main(){
 const sdk=(await adb(['shell','getprop','ro.build.version.sdk'])).trim(),abis=(await adb(['shell','getprop','ro.product.cpu.abilist'])).trim();
 if(!/^[0-9]{1,3}$/.test(sdk)||!/^[a-zA-Z0-9_,.-]{1,100}$/.test(abis))throw Error('Assigned device compatibility metadata unavailable');
 report.device={apiLevel:Number(sdk),abis:abis.split(',')};
 for(const pkg of [host.package,host.package+'.test'])if((await adb(['shell','pm','list','packages','-u',pkg])).split(/\r?\n/).includes('package:'+pkg))throw Error('Test host already installed; preserve it');
 const installed=(await adb(['shell','pm','list','packages','-u',app.package])).split(/\r?\n/).includes('package:'+app.package);
 const ownerDirectory=path.join(mobile,'..','android-golden-owners',appLabel),owner=path.join(ownerDirectory,serial+'.json');
 const legacyOwner=path.join(mobile,'..','android-golden-review-'+appLabel.slice(-4)+'-current.json');
 const validateOwner=record=>{if(record.serial!==serial||record.package!==app.package||record.apkSha256!==app.apkSha256||record.productionWrites!==0)throw Error('Existing QA app not owned by this workflow');};
 let priorOwner=fs.existsSync(owner)?JSON.parse(fs.readFileSync(owner)):null;
 if(priorOwner)validateOwner(priorOwner);
 if(installed){if(!priorOwner){priorOwner=JSON.parse(fs.readFileSync(legacyOwner));validateOwner(priorOwner);}}
 else await adb(['install',path.join(appBuild,'app.apk')],90000);
 if(!fs.existsSync(owner)){fs.mkdirSync(ownerDirectory,{recursive:true,mode:0o700});fs.writeFileSync(owner,JSON.stringify(priorOwner??{serial,package:app.package,apkSha256:app.apkSha256,productionWrites:0,purpose:'isolated Golden regression'}),{flag:'wx',mode:0o600});}
 const apkPath=(await adb(['shell','pm','path',app.package])).trim();
 if(!/^package:\/data\/app\/[A-Za-z0-9_./+=~-]+\/base\.apk$/.test(apkPath))throw Error('Exact installed QA APK path unavailable');
 report.installedApkSha256=(await adb(['shell','sha256sum',apkPath.slice('package:'.length)])).trim().split(/\s+/)[0];
 if(report.installedApkSha256!==app.apkSha256)throw Error('Installed QA APK differs from reviewed build');
 stage='isolated-api';qa=await startNativeQa(database,phase==='map'?600:300,{visualHomeFixture:true,sourceLeadsPilot:phase==='source'});
 const fixture=phase==='batch-remove'?await seedBatchRemovalQa(qa,database):phase==='map'?await seedDiscoveryMapQa(qa,database):['chat','photo','photo-recovery'].includes(phase)?await seedNativeMarketplace(qa,'seller','switch',{seedChatForVisualQa:true}):phase!=='seller'?await seedUiuxHomeQa(qa):await seedNativeMarketplace(qa,'seller','visual-mug');
 if(phase==='map')mapFixture=fixture;if(phase==='batch-remove')batchFixture=fixture;
 report.fixture=fixture;const actor=qa.actors[phase==='seller'?'seller':'buyer'];
 if(recovery){const {PrismaClient}=require('../../server/node_modules/@prisma/client');const db=new PrismaClient({datasources:{db:{url:database}}});try{const room=await db.conversation.findFirst({where:{listingId:fixture.listingId,buyerUserId:actor.id,sellerUserId:qa.actors.seller.id}});if(!room)throw Error('Recovery fixture missing');recoveryPath='/api/chat/conversations/'+room.id+'/photo-messages';}finally{await db.$disconnect();}}
 if(isPhoto){stage='owned-photo-fixture';await preparePhoto();}
 async function confirmCounterpart(){
  const {PrismaClient}=require('../../server/node_modules/@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:database}}});
  try{
   const room=await db.conversation.findFirst({where:{listingId:fixture.listingId,buyerUserId:qa.actors.buyer.id,sellerUserId:qa.actors.seller.id},include:{meetup:true}});
   const a=room?.meetup;
   if(!room||!a||a.version!==1||a.status!=='PROPOSED'||!a.buyerConfirmedAt||a.sellerConfirmedAt||a.placeName!=='GoldenStationQA')throw Error('Expected only the current synthetic proposal');
   async function api(route,status,body,token){
    const response=await fetch(qa.apiUrl+'/api'+route,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.status!==status||response.headers.get('cache-control')!=='private, no-store')throw Error('Counterpart API rejected');return response.json();
   }
   const seller=qa.actors.seller,login=await api('/auth/login',200,{phoneNumber:seller.email,password:seller.password});
   if(login.user?.id!==seller.id||typeof login.token!=='string')throw Error('Counterpart identity mismatch');
   const result=await api('/chat/conversations/'+room.id+'/meetup',201,{clientActionId:randomUUID(),action:'CONFIRM',expectedVersion:1},login.token);
   if(result.appointment?.version!==1||result.appointment.status!=='CONFIRMED'||!result.appointment.buyerConfirmedAt||!result.appointment.sellerConfirmedAt)throw Error('Counterpart consent unconfirmed');
   report.counterpart={kind:'SYNTHETIC_SELLER_REAL_API_NOT_SECOND_DEVICE_UI',confirmedVersion:1,status:'CONFIRMED'};
   return {confirmed:true,version:1};
  }finally{await db.$disconnect();}
 }
 broker=http.createServer((req,res)=>{
  const local=req.socket.remoteAddress==='127.0.0.1'&&!req.headers.origin&&req.headers['x-wishlist-golden-phase']===phase&&req.headers.host==='127.0.0.1:'+broker.address().port;
  if(local&&!stopping&&phase==='map'&&brokerUsed&&!counterpartUsed&&req.method==='POST'&&req.url==='/map/second-list'){
   counterpartUsed=true;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
   void fixture.secondList().then(value=>{report.secondList=value;res.statusCode=200;res.end(JSON.stringify(value));}).catch(()=>{res.statusCode=409;res.end('{}');});return;
  }
  if(local&&!stopping&&phase==='chat'&&brokerUsed&&!counterpartUsed&&req.method==='POST'&&req.url==='/counterpart/confirm-meetup'){
   counterpartUsed=true;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
   void confirmCounterpart().then(value=>{res.statusCode=200;res.end(JSON.stringify(value));}).catch(()=>{res.statusCode=409;res.end('{}');});return;
  }
  if(local&&!stopping&&recovery&&brokerUsed&&req.method==='GET'&&req.url==='/photo/recovery-checkpoint'){
   void uploadObservation.then(()=>{const valid=!photoRecovery.checkpoint&&photoRecovery.posts===1&&photoRecovery.lookups===0&&photoRecovery.dropped&&!photoRecovery.observationInvalid&&!!photoRecovery.upload;photoRecovery.checkpoint=valid;res.writeHead(valid?200:409,{'Cache-Control':'no-store','Content-Type':'application/json'});res.end('{}');});return;
  }
  const allowed=!stopping&&!brokerUsed&&req.method==='GET'&&req.url==='/fixture'&&req.socket.remoteAddress==='127.0.0.1'&&!req.headers.origin&&req.headers['x-wishlist-golden-phase']===phase&&req.headers.host==='127.0.0.1:'+broker.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.statusCode=allowed?200:403;
  if(allowed){brokerUsed=true;res.end(JSON.stringify({package:app.package,email:actor.email,password:actor.password,...(ownedPhoto?{photoName:ownedPhoto.name}:{}),...(phase==='map'?{mapTitles:fixture.titles}:{})}));}else res.end('{}');
 });await new Promise((resolve,reject)=>{broker.once('error',reject);broker.listen(0,'127.0.0.1',resolve);});
 let apiPort=18889;
 if(phase==='logout'||recovery||phase==='map'||phase==='batch-remove'){
  observer=http.createServer((req,res)=>{
   if(req.socket.remoteAddress!=='127.0.0.1'||!req.url?.startsWith('/api/')){res.writeHead(400);res.end();return;}
   const pathname=req.url.split('?')[0];if(pathname==='/api/notifications/devices'||pathname==='/api/auth/login')observedCalls.push({method:req.method,path:pathname});
   if((phase==='map'||phase==='batch-remove')&&(pathname==='/api/discovery'||pathname.startsWith('/api/product-wishes')||pathname.startsWith('/api/listing-media/photo-removals/')))observedCalls.push({method:req.method,path:pathname,query:pathname==='/api/discovery'?req.url.split('?')[1]:undefined});
   if(recovery&&req.method==='POST'&&pathname===recoveryPath){
    photoRecovery.posts++;
    const parser=require('../../server/node_modules/busboy')({headers:req.headers,limits:{files:1,fileSize:5242880,fields:3,fieldSize:2000,parts:4}}),fields={};let photoBytes,fileCount=0;
    uploadObservation=new Promise(resolve=>{
     parser.on('field',(name,value,info)=>{if(!['clientMessageId','text'].includes(name)||info.valueTruncated||Object.hasOwn(fields,name))photoRecovery.observationInvalid=true;else fields[name]=value;});
     parser.on('file',(name,file)=>{fileCount++;const chunks=[];file.on('limit',()=>{photoRecovery.observationInvalid=true;});file.on('data',b=>chunks.push(b));file.on('end',()=>{photoBytes=Buffer.concat(chunks);});if(name!=='photo')photoRecovery.observationInvalid=true;});
     for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>{photoRecovery.observationInvalid=true;});
     parser.once('error',()=>{photoRecovery.observationInvalid=true;resolve();});
     parser.once('close',()=>{void(async()=>{try{const metadata=await require('../../server/node_modules/sharp')(photoBytes).metadata();if(fileCount!==1||metadata.format!=='jpeg'||metadata.exif||fields.text!=='GoldenAndroidPhoto'||!/^[-0-9a-f]{36}$/.test(fields.clientMessageId||''))throw Error();photoRecovery.upload={clientMessageId:fields.clientMessageId,photoHash:createHash('sha256').update(photoBytes).digest('hex'),bytes:photoBytes.length,format:metadata.format,exifPresent:!!metadata.exif};}catch{photoRecovery.observationInvalid=true;}finally{photoBytes=null;resolve();}})();});
    });req.pipe(parser);
   }
   const lookupPrefix=recoveryPath.replace(/photo-messages$/,'messages/by-client-id/');
   if(recovery&&req.method==='GET'&&pathname.startsWith(lookupPrefix)){photoRecovery.lookups++;photoRecovery.lookupId=pathname.slice(lookupPrefix.length);}
   const upstream=http.request({hostname:'127.0.0.1',port:18889,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:18889'}},reply=>{
    if((recovery&&req.method==='POST'&&pathname===recoveryPath&&!photoRecovery.dropped&&reply.statusCode===201)||(phase==='batch-remove'&&req.method==='POST'&&pathname.startsWith('/api/listing-media/photo-removals/')&&!photoRecovery.dropped&&reply.statusCode===200)){
     photoRecovery.dropped=true;photoRecovery.serverStatus=reply.statusCode;reply.resume();reply.once('end',()=>{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end('{"error":"Synthetic lost acknowledgment"}');});return;
    }
    res.writeHead(reply.statusCode||502,reply.headers);reply.pipe(res);
   });
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);
  });await new Promise((resolve,reject)=>{observer.once('error',reject);observer.listen(0,'127.0.0.1',resolve);});apiPort=observer.address().port;
 }
 await reverse(18889,apiPort);await reverse(broker.address().port);
 stage='test-host-install';await adb(['install',path.join(hostBuild,'host.apk')]);installedHost=true;await adb(['install',path.join(hostBuild,'test.apk')]);installedTest=true;
 // Terminate only this workflow's exact proven QA package; retain all app data.
 await adb(['shell','am','force-stop',app.package]);
 originalFontScale=(await adb(['shell','settings','get','system','font_scale'])).trim();
 report.fontScaleBefore=originalFontScale;
 if(!/^(null|[0-9]+(?:\.[0-9]+)?)$/.test(originalFontScale))throw Error('Font-scale metadata unavailable');
 if(requestedFontScale&&originalFontScale!==requestedFontScale){fontScaleChanged=true;await adb(['shell','settings','put','system','font_scale',requestedFontScale]);}
 report.fontScale=(await adb(['shell','settings','get','system','font_scale'])).trim();
 if(requestedFontScale&&report.fontScale!==requestedFontScale)throw Error('Enlarged-font setup failed');
 stage='native-instrumentation';
 const output=await adb(['shell','am','instrument','-w','-e','class','com.hankhuang.wishlistgoldenqa.MarketplaceGoldenTest#approvedMarketplaceRegression','-e','phase',phase,'-e','inputPort',String(broker.address().port),host.package+'.test/androidx.test.runner.AndroidJUnitRunner'],phase==='map'?480000:240000);
 let safeOutput=output;
 for(const fixtureActor of Object.values(qa.actors))for(const value of [fixtureActor.email,fixtureActor.phoneNumber,fixtureActor.password])if(typeof value==='string'&&value.length>0)safeOutput=safeOutput.split(value).join('[synthetic credential redacted]');
 safeOutput=safeOutput.replace(/Bearer\s+[A-Za-z0-9._-]+/g,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[token redacted]');
 fs.writeFileSync(path.join(evidence,'instrumentation-sanitized.log'),safeOutput.slice(0,100000),{flag:'wx',mode:0o600});
 report.checkpoints=[...output.matchAll(/INSTRUMENTATION_STATUS: goldenStage=([a-z0-9-]+)/g)].map(x=>x[1]);
 const failure=output.match(/Golden regression failed at ([a-z0-9-]+) type ([A-Za-z]+)/);if(failure)report.failure={stage:failure[1],type:failure[2]};
 if(!/OK \(1 test\)/.test(output)||/FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed/.test(output))throw Error('Native regression assertions failed');
 if(!brokerUsed)throw Error('Native test did not consume its synthetic fixture');
 stage='database-audit';const {PrismaClient}=require('../../server/node_modules/@prisma/client');const db=new PrismaClient({datasources:{db:{url:database}}});
 try{report.databaseAudit={actorStillExists:!!await db.user.findUnique({where:{id:actor.id}})};if(!report.databaseAudit.actorStillExists)throw Error('Non-deleting phase unexpectedly erased fixture');if(phase==='batch-remove'){const receipts=await db.photoRemovalReceipt.findMany({where:{userId:actor.id},select:{state:true,mediaId:true,clientActionId:true}});const remaining=await db.listingMedia.count({where:{id:{in:[...fixture.sourceIds,...fixture.generatedIds]}}}),usage=await db.removedMarketingUsage.count({where:{userId:actor.id}});report.databaseAudit.batchRemoval={receipts,remaining,usage};report.observedCalls=observedCalls;const posts=observedCalls.filter(c=>c.method==='POST'&&c.path.startsWith('/api/listing-media/photo-removals/'));if(receipts.length!==3||receipts.some(r=>r.state!=='REMOVED')||remaining!==0||usage!==3||posts.length!==3||!photoRecovery.dropped)throw Error('Native draft removal or unknown-result audit mismatch');}if(phase==='map'){const receipts=await db.productWishReceipt.findMany({where:{userId:actor.id,productKey:'listing:'+fixture.wishProductId},select:{action:true,wishlistId:true,clientRequestId:true},orderBy:{createdAt:'asc'}});const links=await db.productWishLink.count({where:{userId:actor.id,itemId:{not:null}}}),items=await db.item.count({where:{wishlist:{userId:actor.id}}});report.databaseAudit.map={receipts,links,items,distinctProducts:fixture.listingIds.length,photoCases:fixture.photoCases};report.observedCalls=observedCalls;if(receipts.map(r=>r.action).join(',')!=='ADD,REMOVE,ADD,REMOVE'||new Set(receipts.map(r=>r.clientRequestId)).size!==4||links!==0||items!==2||!report.secondList?.created||receipts[2].wishlistId!==report.secondList.wishlistId)throw Error('Native map wishlist audit mismatch');}if(phase==='buyer'){const items=await db.item.findMany({where:{wishlist:{userId:actor.id},name:'Golden Edited Mug'},select:{id:true,name:true,maxPrice:true,priceCurrency:true,isHidden:true,isPurchased:true}});report.databaseAudit.manualWishes=items;if(items.length!==1||items[0].maxPrice!==42.5||items[0].priceCurrency!=='TWD'||items[0].isHidden||items[0].isPurchased)throw Error('Native wish persistence mismatch');const originalNameRemaining=await db.item.count({where:{wishlist:{userId:actor.id},name:'Golden Manual Mug'}});const totalWishes=await db.item.count({where:{wishlist:{userId:actor.id}}});const creationReceipts=await db.wishCreateReceipt.count({where:{userId:actor.id,kind:'ITEM',resourceId:items[0].id}});report.databaseAudit.wishIdentity={originalNameRemaining,totalWishes,creationReceipts};if(originalNameRemaining!==0||totalWishes!==3||creationReceipts!==1)throw Error('Native wish identity or duplicate audit mismatch');}if(phase==='seller'){const listing=await db.listing.findUnique({where:{id:fixture.listingId},select:{status:true,version:true}});report.databaseAudit.listing=listing;if(listing?.status!=='ACTIVE'||listing.version!==3)throw Error('Native reserve/restore DB mismatch');}if(isPhoto){
 const room=await db.conversation.findFirst({where:{listingId:fixture.listingId,buyerUserId:actor.id,sellerUserId:qa.actors.seller.id}});if(!room)throw Error('Photo room missing');
 const photos=await db.message.findMany({where:{conversationId:room.id,photoHash:{not:null}}});const total=await db.message.count({where:{conversationId:room.id}}),photo=photos[0];
 if(photos.length!==1||total!==6||photo.text!=='GoldenAndroidPhoto'||photo.senderUserId!==actor.id||!photo.photoBytes)throw Error('Photo persistence mismatch');
 const sharp=require('../../server/node_modules/sharp'),meta=await sharp(photo.photoBytes).metadata();if(meta.format!=='webp'||meta.exif||photo.photoBytes.length>5242880)throw Error('Private photo normalization mismatch');
 const readStatuses={};
 for(const role of ['buyer','seller','third','anonymous']){
  let token;if(role!=='anonymous'){const a=qa.actors[role],response=await fetch(qa.apiUrl+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:a.email,password:a.password}),redirect:'error',signal:AbortSignal.timeout(10000)});if(response.status!==200)throw Error('Photo audit login rejected');const login=await response.json();if(login.user?.id!==a.id)throw Error('Photo audit identity mismatch');token=login.token;}
  const response=await fetch(qa.apiUrl+'/api/chat/conversations/'+room.id+'/messages/'+photo.id+'/photo',{headers:token?{Authorization:'Bearer '+token}:{},redirect:'error',signal:AbortSignal.timeout(10000)});readStatuses[role]=response.status;
  const expected=role==='anonymous'?401:role==='third'?404:200;if(response.status!==expected)throw Error('Private photo access mismatch');
  if(expected===200){const returned=Buffer.from(await response.arrayBuffer());if(!response.headers.get('cache-control')?.includes('no-store')||createHash('sha256').update(returned).digest('hex')!==createHash('sha256').update(photo.photoBytes).digest('hex'))throw Error('Private photo bytes/cache mismatch');}else await response.arrayBuffer();
 }
 report.databaseAudit.photo={photoMessages:photos.length,totalMessages:total,caption:photo.text,bytes:photo.photoBytes.length,width:meta.width,height:meta.height,format:meta.format,outputExifPresent:!!meta.exif,readStatuses};
 if(recovery){await uploadObservation;if(photoRecovery.posts!==1||photoRecovery.lookups!==1||!photoRecovery.checkpoint||!photoRecovery.dropped||photoRecovery.observationInvalid||photoRecovery.upload?.clientMessageId!==photo.clientMessageId||photoRecovery.lookupId!==photo.clientMessageId||photoRecovery.upload?.photoHash!==photo.photoHash)throw Error('Photo recovery identity or duplicate mismatch');report.photoRecovery=photoRecovery;}
}if(phase==='source'){
 const id=qa.sourceLeadIds?.[0];if(!id)throw Error('Source fixture identity missing');
 const inquiries=await db.sourceLeadInquiry.count({where:{leadId:id}}),row=await db.externalSourceLead.findUniqueOrThrow({where:{id}});
 const response=await fetch(qa.apiUrl+'/api/discovery?source=source',{redirect:'error',signal:AbortSignal.timeout(10000)}),page=await response.json(),product=page.items?.find(p=>p.id===id);
 if(inquiries!==0||response.status!==200||page.total!==1||row.postedEarliestAt!==null||row.postedLatestAt!==null||product?.date!==row.evidence?.observedListing?.firstObservedAt||product?.dateBasis!=='COLLECTED')throw Error('Source observation or no-send audit mismatch');
 report.databaseAudit.source={inquiryRowsCreated:inquiries,publicationDateUnknown:true,discoveryUsesVerifiedFirstObservation:true};
}if(phase==='chat'){const room=await db.conversation.findFirst({where:{listingId:fixture.listingId,buyerUserId:actor.id,sellerUserId:qa.actors.seller.id},include:{meetup:true,messages:{orderBy:{sequence:'asc'}}}});report.databaseAudit.chat={messages:room?.messages.length,newReplyCount:room?.messages.filter(m=>m.text==='Golden Native Chat Reply').length,appointment:room?.meetup?{version:room.meetup.version,status:room.meetup.status,placeName:room.meetup.placeName}:null};if(!counterpartUsed||report.counterpart?.confirmedVersion!==1||room?.messages.length!==6||room.messages.filter(m=>m.text==='Golden Native Chat Reply').length!==1||room.meetup?.status!=='CANCELLED'||room.meetup.version!==1||room.meetup.placeName!=='GoldenStationQA')throw Error('Native chat or meetup audit mismatch');}if(phase==='market'){const listingId=fixture.listingIds[0],seller=qa.actors.seller.id;const interest=await db.productInterest.findUnique({where:{userId_productKey:{userId:actor.id,productKey:'listing:'+listingId}},select:{liked:true,version:true}});const likes=await db.productInterest.count({where:{productKey:'listing:'+listingId,liked:true}});const follow=await db.follow.findUnique({where:{followerId_followingId:{followerId:actor.id,followingId:seller}}});const reports=await db.listingReport.findMany({where:{reporterUserId:actor.id,listingId},select:{status:true,reason:true,details:true}});const current=await db.listing.findUnique({where:{id:listingId},select:{status:true}});report.databaseAudit.market={interest,likes,following:!!follow,reports,listingStatus:current?.status};if(!interest?.liked||interest.version!==1||likes!==1||!follow||reports.length!==1||reports[0].status!=='OPEN'||reports[0].reason!=='OTHER'||reports[0].details!=='Golden isolated report only'||current?.status!=='ACTIVE')throw Error('Native marketplace state audit mismatch');}if(phase==='logout'){report.observedCalls=observedCalls;report.databaseAudit.pushDevices=await db.pushDevice.count({where:{userId:actor.id}});if(report.databaseAudit.pushDevices!==0||observedCalls.filter(c=>c.path==='/api/notifications/devices').length!==0||observedCalls.filter(c=>c.path==='/api/auth/login'&&c.method==='POST').length!==1)throw Error('Never-enabled logout sent a device identity or failed real login');}}
 finally{await db.$disconnect();}
 report.passed=true;stage='complete';
}
(async()=>{try{await main();}catch(e){report.failureMessage=['Native regression assertions failed','Native reserve/restore DB mismatch','Test host already installed; preserve it','Existing QA app not owned by this workflow','App source changed after static bundle'].includes(e.message)?e.message:'Regression stopped; details withheld';}
 finally{
  report.stage=stage;report.brokerConsumed=brokerUsed;
  if(installedHost){
   const local=path.join(evidence,'captures');try{await adb(['pull','/sdcard/Android/data/'+host.package+'/files/golden-'+phase,local],15000,true);report.screenshots=fs.readdirSync(local).filter(n=>n.endsWith('.png'));}catch{report.captureCopyIncomplete=true;}
   try{await adb(['shell','am','force-stop',host.package+'.test'],10000,true);await adb(['shell','am','force-stop',app.package],10000,true);}catch{report.nativeStopIncomplete=true;}
  }
  if(fontScaleChanged)try{const actual=(await adb(['shell','settings','get','system','font_scale'],10000,true)).trim();if(actual!==requestedFontScale)throw Error('Font scale changed outside this test; preserve it');await adb(['shell','settings',originalFontScale==='null'?'delete':'put','system','font_scale',...(originalFontScale==='null'?[]:[originalFontScale])],10000,true);report.fontScaleAfterRestore=(await adb(['shell','settings','get','system','font_scale'],10000,true)).trim();report.fontScaleRestored=report.fontScaleAfterRestore===originalFontScale||(originalFontScale!=='null'&&report.fontScaleAfterRestore!=='null'&&Number(report.fontScaleAfterRestore)===Number(originalFontScale));if(!report.fontScaleRestored)throw Error('Font restoration not confirmed');}catch{report.fontScaleCleanupIncomplete=true;}
  for(const endpoint of reverses.reverse())try{await adb(['reverse','--remove',endpoint],10000,true);}catch{report.reverseCleanupIncomplete=true;}
  if(broker)await new Promise(resolve=>{broker.close(resolve);broker.closeAllConnections();});
  if(observer)await new Promise(resolve=>{observer.close(resolve);observer.closeAllConnections();});
  if(ownedPhoto)try{await cleanupPhoto();}catch{report.photoFixtureCleanupIncomplete=true;}
  if(batchFixture)try{await batchFixture.cleanup();report.batchFixtureOutboxCleanup=true;}catch{report.fixtureCleanupFailed=true;}
  if(mapFixture)try{await mapFixture.cleanup();report.mapReferenceCleanup=true;}catch{report.fixtureCleanupFailed=true;}
  if(qa)try{report.fixtureCleanup=await qa.stop();}catch{report.fixtureCleanupFailed=true;}
  for(const [pkg,owned]of [[host.package+'.test',installedTest],[host.package,installedHost]])if(owned)try{await adb(['uninstall',pkg],20000,true);}catch{report.testHostCleanupIncomplete=true;}
  report.interrupted=stopping;if(stopping||report.fontScaleCleanupIncomplete||report.photoFixtureCleanupIncomplete||report.captureCopyIncomplete||report.reverseCleanupIncomplete||report.fixtureCleanupFailed||report.nativeStopIncomplete||report.testHostCleanupIncomplete)report.passed=false;
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({kind:report.kind,passed:report.passed,stage,phase,evidence,checkpoints:report.checkpoints,failure:report.failure,cleanup:report.fixtureCleanup}));if(!report.passed)process.exitCode=1;
 }
})();
