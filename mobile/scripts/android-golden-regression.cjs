// Bounded native regression, only inside Simulator Manager; no manual input bridge.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');const {createHash,randomUUID}=require('node:crypto');
const {qaLabel,assignedSerial}=require('./android-qa-config.cjs');
const {assertTestDatabase}=require('../../scripts/assert-test-database.cjs');
const {startNativeQa}=require('./native-qa.cjs');
const {seedNativeMarketplace}=require('./native-qa-marketplace-fixture.cjs');
const {seedUiuxHomeQa}=require('./seed-uiux-home-qa.cjs');
const mobile=path.resolve(__dirname,'..'),[appLabel,hostLabel,phase]=process.argv.slice(2);
qaLabel(appLabel);qaLabel(hostLabel);if(process.argv.length!==5||!['buyer','seller'].includes(phase))throw Error('Exact app/host labels and bounded buyer/seller phase required');
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
const adbPath='/Users/hank/Library/Android/sdk/platform-tools/adb';let child,stopping=false,qa,broker,brokerUsed=false,installedHost=false,installedTest=false,stage='preflight';const reverses=[];
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child?.kill('SIGTERM');});
function adb(args,timeout=30000,cleanup=false){return new Promise((resolve,reject)=>{
 if(stopping&&!cleanup)return reject(Error('Interrupted'));
 const p=spawn(adbPath,['-s',serial,...args],{stdio:['ignore','pipe','pipe']});child=p;let out='';const timer=setTimeout(()=>p.kill('SIGTERM'),timeout);
 p.stdout.on('data',b=>{if(out.length<2000000)out+=b.toString();});p.stderr.on('data',()=>{});
 p.on('error',()=>{clearTimeout(timer);reject(Error('ADB unavailable'));});p.on('close',code=>{clearTimeout(timer);if(child===p)child=null;code===0?resolve(out):reject(Error('Device command failed; raw output withheld'));});
});}
async function reverse(port){const endpoint='tcp:'+port;const current=await adb(['reverse','--list']);if(current.split(/\r?\n/).some(l=>l.split(/\s+/).includes(endpoint)))throw Error('Own reverse endpoint occupied; not replacing');await adb(['reverse',endpoint,endpoint]);reverses.push(endpoint);}
async function main(){
 for(const pkg of [host.package,host.package+'.test'])if((await adb(['shell','pm','list','packages','-u',pkg])).split(/\r?\n/).includes('package:'+pkg))throw Error('Test host already installed; preserve it');
 const installed=(await adb(['shell','pm','list','packages','-u',app.package])).split(/\r?\n/).includes('package:'+app.package);
 const owner=path.join(mobile,'..','android-golden-review-'+appLabel.slice(-4)+'-current.json');
 if(installed){const old=JSON.parse(fs.readFileSync(owner));if(old.serial!==serial||old.package!==app.package||old.apkSha256!==app.apkSha256||old.productionWrites!==0)throw Error('Existing QA app not owned by this workflow');}
 else {await adb(['install',path.join(appBuild,'app.apk')],90000);fs.writeFileSync(owner,JSON.stringify({serial,package:app.package,apkSha256:app.apkSha256,productionWrites:0,purpose:'isolated Golden regression'}));}
 const apkPath=(await adb(['shell','pm','path',app.package])).trim();
 if(!/^package:\/data\/app\/[A-Za-z0-9_./+=~-]+\/base\.apk$/.test(apkPath))throw Error('Exact installed QA APK path unavailable');
 report.installedApkSha256=(await adb(['shell','sha256sum',apkPath.slice('package:'.length)])).trim().split(/\s+/)[0];
 if(report.installedApkSha256!==app.apkSha256)throw Error('Installed QA APK differs from reviewed build');
 stage='isolated-api';qa=await startNativeQa(database,300,{visualHomeFixture:true});
 const fixture=phase==='buyer'?await seedUiuxHomeQa(qa):await seedNativeMarketplace(qa,'seller','visual-mug');
 report.fixture=fixture;const actor=qa.actors[phase];
 broker=http.createServer((req,res)=>{
  const allowed=!stopping&&!brokerUsed&&req.method==='GET'&&req.url==='/fixture'&&req.socket.remoteAddress==='127.0.0.1'&&!req.headers.origin&&req.headers['x-wishlist-golden-phase']===phase&&req.headers.host==='127.0.0.1:'+broker.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.statusCode=allowed?200:403;
  if(allowed){brokerUsed=true;res.end(JSON.stringify({package:app.package,email:actor.email,password:actor.password}));}else res.end('{}');
 });await new Promise((resolve,reject)=>{broker.once('error',reject);broker.listen(0,'127.0.0.1',resolve);});
 await reverse(18889);await reverse(broker.address().port);
 stage='test-host-install';await adb(['install',path.join(hostBuild,'host.apk')]);installedHost=true;await adb(['install',path.join(hostBuild,'test.apk')]);installedTest=true;
 // Terminate only this workflow's exact proven QA package; retain all app data.
 await adb(['shell','am','force-stop',app.package]);stage='native-instrumentation';
 const output=await adb(['shell','am','instrument','-w','-e','class','com.hankhuang.wishlistgoldenqa.MarketplaceGoldenTest#approvedMarketplaceRegression','-e','phase',phase,'-e','inputPort',String(broker.address().port),host.package+'.test/androidx.test.runner.AndroidJUnitRunner'],240000);
 let safeOutput=output;
 for(const fixtureActor of Object.values(qa.actors))for(const value of [fixtureActor.email,fixtureActor.phoneNumber,fixtureActor.password])if(typeof value==='string'&&value.length>0)safeOutput=safeOutput.split(value).join('[synthetic credential redacted]');
 safeOutput=safeOutput.replace(/Bearer\s+[A-Za-z0-9._-]+/g,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[token redacted]');
 fs.writeFileSync(path.join(evidence,'instrumentation-sanitized.log'),safeOutput.slice(0,100000),{flag:'wx',mode:0o600});
 report.checkpoints=[...output.matchAll(/INSTRUMENTATION_STATUS: goldenStage=([a-z-]+)/g)].map(x=>x[1]);
 const failure=output.match(/Golden regression failed at ([a-z-]+) type ([A-Za-z]+)/);if(failure)report.failure={stage:failure[1],type:failure[2]};
 if(!/OK \(1 test\)/.test(output)||/FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed/.test(output))throw Error('Native regression assertions failed');
 if(!brokerUsed)throw Error('Native test did not consume its synthetic fixture');
 stage='database-audit';const {PrismaClient}=require('../../server/node_modules/@prisma/client');const db=new PrismaClient({datasources:{db:{url:database}}});
 try{report.databaseAudit={actorStillExists:!!await db.user.findUnique({where:{id:actor.id}})};if(!report.databaseAudit.actorStillExists)throw Error('Non-deleting phase unexpectedly erased fixture');if(phase==='buyer'){const items=await db.item.findMany({where:{wishlist:{userId:actor.id},name:'Golden Edited Mug'},select:{id:true,name:true,maxPrice:true,priceCurrency:true,isHidden:true,isPurchased:true}});report.databaseAudit.manualWishes=items;if(items.length!==1||items[0].maxPrice!==42.5||items[0].priceCurrency!=='TWD'||items[0].isHidden||items[0].isPurchased)throw Error('Native wish persistence mismatch');const originalNameRemaining=await db.item.count({where:{wishlist:{userId:actor.id},name:'Golden Manual Mug'}});const totalWishes=await db.item.count({where:{wishlist:{userId:actor.id}}});const creationReceipts=await db.wishCreateReceipt.count({where:{userId:actor.id,kind:'ITEM',resourceId:items[0].id}});report.databaseAudit.wishIdentity={originalNameRemaining,totalWishes,creationReceipts};if(originalNameRemaining!==0||totalWishes!==3||creationReceipts!==1)throw Error('Native wish identity or duplicate audit mismatch');}if(phase==='seller'){const listing=await db.listing.findUnique({where:{id:fixture.listingId},select:{status:true,version:true}});report.databaseAudit.listing=listing;if(listing?.status!=='ACTIVE'||listing.version!==3)throw Error('Native reserve/restore DB mismatch');}}
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
  for(const endpoint of reverses.reverse())try{await adb(['reverse','--remove',endpoint],10000,true);}catch{report.reverseCleanupIncomplete=true;}
  if(broker)await new Promise(resolve=>{broker.close(resolve);broker.closeAllConnections();});
  if(qa)try{report.fixtureCleanup=await qa.stop();}catch{report.fixtureCleanupFailed=true;}
  for(const [pkg,owned]of [[host.package+'.test',installedTest],[host.package,installedHost]])if(owned)try{await adb(['uninstall',pkg],20000,true);}catch{report.testHostCleanupIncomplete=true;}
  report.interrupted=stopping;if(stopping||report.captureCopyIncomplete||report.reverseCleanupIncomplete||report.fixtureCleanupFailed||report.nativeStopIncomplete||report.testHostCleanupIncomplete)report.passed=false;
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({kind:report.kind,passed:report.passed,stage,phase,evidence,checkpoints:report.checkpoints,failure:report.failure,cleanup:report.fixtureCleanup}));if(!report.passed)process.exitCode=1;
 }
})();
