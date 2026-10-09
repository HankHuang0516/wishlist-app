'use strict';
// Preparation only for the EXISTING single writer. Explicit local snapshots,
// no Library mutation, HTTP, credentials, database, media or publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {prepareMotherIncrement,readPairFresh}=require('../dist/lib/canonicalImportPair');
const [pendingFile,manifestFile,snapshotDescriptorFile,decisionsFile,destination]=process.argv.slice(2);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function privateDirectory(dir){const resolved=path.resolve(dir),s=fs.lstatSync(resolved);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(resolved)!==resolved||(s.mode&511)!==448||s.uid!==process.getuid())throw Error('PRIVATE_PREPARATION_DIRECTORY_REQUIRED');return resolved;}
function saveExact(file,bytes){if(fs.existsSync(file)){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&511)!==384||s.uid!==process.getuid()||fs.readFileSync(file,'utf8')!==bytes)throw Error('PREPARATION_FILE_CONFLICT');return;}const fd=fs.openSync(file,'wx',384);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
(async()=>{if(process.argv.length!==7)throw Error('FIVE_ARGUMENTS_REQUIRED');
 const pending=fs.readFileSync(pendingFile,'utf8'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),decisions=JSON.parse(fs.readFileSync(decisionsFile,'utf8'));
 const descriptor=()=>JSON.parse(fs.readFileSync(snapshotDescriptorFile,'utf8'));
 const reader={metadata:async id=>{const d=descriptor(),r=Object.values(d).find(r=>r.libraryFileId===id);if(!r)throw Error('SNAPSHOT_ID_MISSING');return {libraryFileId:r.libraryFileId,version:r.version};},bytes:async(id,version)=>{const d=descriptor(),r=Object.values(d).find(r=>r.libraryFileId===id&&r.version===version);if(!r)throw Error('SNAPSHOT_VERSION_MISSING');return fs.readFileSync(r.path,'utf8');}};
 const pair=await readPairFresh(manifest.base,reader),increment=prepareMotherIncrement(pending,manifest,pair,decisions),root=privateDirectory(destination),dir=path.join(root,increment.operationId);
 if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:448});privateDirectory(dir);
 const receipt={...increment.receipt,snapshotOnly:true,liveLibraryBytesVerified:false,preparedAt:new Date().toISOString()};
 // Reproducible core receipt excludes wall time. No automatic remote write or
 // completion claim; manifest appears only after both payloads and increment.
 const files={'mother-candidate.json':increment.json,'mother-candidate.csv':increment.csv,'reviewed-increment.json':JSON.stringify(increment,null,2)+'\n','verification-receipt.json':JSON.stringify({...receipt,preparedAt:null},null,2)+'\n'};
 for(const [name,bytes] of Object.entries(files))saveExact(path.join(dir,name),bytes);
 const ready={operationId:increment.operationId,files:Object.entries(files).map(([name,b])=>({name,bytes:Buffer.byteLength(b),sha256:hash(b)})),base:increment.base,snapshotOnly:true,canonicalWrites:0,productionWrites:0};
 saveExact(path.join(dir,'ready.json'),JSON.stringify(ready,null,2)+'\n');const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 console.log(JSON.stringify({state:'LOCAL_REVIEW_PACKAGE_READY',operationId:increment.operationId,directory:dir,changedCount:increment.changes.length,snapshotOnly:true,liveLibraryBytesVerified:false,canonicalWrites:0,productionWrites:0,sourceChecks:0}));
})().catch(e=>{console.error(JSON.stringify({state:'STOPPED',errorCode:e.message}));process.exitCode=1;});
