// Host-only build of a separate AndroidX regression host. No app/release signing.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync,execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {qaLabel,hostEnvironment}=require('./android-qa-config.cjs');
const mobile=path.resolve(__dirname,'..'),label=qaLabel(process.argv[2]);
if(process.argv.length!==3)throw Error('One fresh test-host label required');
if(!mobile.startsWith(path.join(os.homedir(),'.cache','hank-internal')+path.sep))throw Error('Build only in owned SSD test copy');
const output=path.join(mobile,'build','android-golden-tests-'+label);
if(fs.existsSync(output))throw Error('Retain prior host build; choose a fresh label');
const stat=fs.statfsSync(mobile);if(stat.bavail*stat.bsize<22*1024**3)throw Error('Need20GiB reserve plus2GiB job budget');
const java='/Applications/Android Studio.app/Contents/jbr/Contents/Home',sdk='/Users/hank/Library/Android/sdk';
const env=hostEnvironment(process.execPath,java,sdk,os.homedir());
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function sourceFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?['build','.gradle'].includes(e.name)?[]:sourceFiles(path.join(dir,e.name)):[path.relative(mobile,path.join(dir,e.name))]);}
const sources=[...sourceFiles(path.join(mobile,'android-golden-qa')),'scripts/build-android-golden-tests.cjs','scripts/android-golden-regression.cjs'].sort();
const fingerprint=()=>Object.fromEntries(sources.map(p=>[p,hash(path.join(mobile,p))]));
const before=fingerprint();fs.mkdirSync(output,{mode:0o700});
const result=spawnSync(path.join(mobile,'android/gradlew'),['-p',path.join(mobile,'android-golden-qa'),':runner:assembleDebug',':runner:assembleDebugAndroidTest','-PgoldenTestLabel='+label,'--console=plain','--max-workers=2'],{env,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
if(JSON.stringify(before)!==JSON.stringify(fingerprint()))throw Error('Test sources changed while compiling');
const packageName='com.hankhuang.wishlistgoldenqa.qa'+label,hashes={};
for(const [name,source]of Object.entries({host:'debug/runner-debug.apk',test:'androidTest/debug/runner-debug-androidTest.apk'})){
 const target=path.join(output,name+'.apk');fs.copyFileSync(path.join(mobile,'android-golden-qa/runner/build/outputs/apk',source),target,fs.constants.COPYFILE_EXCL);hashes[name]=hash(target);
 const badging=execFileSync(path.join(sdk,'build-tools/36.0.0/aapt2'),['dump','badging',target],{env,encoding:'utf8'});
 if(!badging.includes("package: name='"+packageName+(name==='test'?'.test':'')+"'"))throw Error('Wrong test APK identity');
 if(name==='test'){
  const manifest=execFileSync(path.join(sdk,'build-tools/36.0.0/aapt2'),['dump','xmltree',target,'--file','AndroidManifest.xml'],{env,encoding:'utf8'});
  if(!manifest.split(/\r?\n/).some(line=>line.includes('android:targetPackage')&&line.includes('"'+packageName+'"')))throw Error('Instrumentation must target only its own isolated test host');
 }
 const cert=execFileSync(path.join(sdk,'build-tools/36.0.0/apksigner'),['verify','--print-certs',target],{env,encoding:'utf8'});
 if(cert.includes('6183bfc7238a3b207f6382df0b1e908b548eede5bf3c74f7157ed625bf93e41c'))throw Error('Production signing prohibited');
}
fs.writeFileSync(path.join(output,'build.json'),JSON.stringify({kind:'isolated-golden-instrumentation-host',label,package:packageName,hashes,sourceHashes:before,storeDeliverable:false},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({kind:'golden-instrumentation-host-built',label,storeDeliverable:false}));
