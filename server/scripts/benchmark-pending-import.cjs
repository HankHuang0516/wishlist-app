'use strict';
// Synthetic metadata only. No HTTP, database, credentials or original images.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const compiled=process.argv[3]==='--compiled';
if(!compiled)require('ts-node').register({transpileOnly:true,project:path.resolve(__dirname,'../tsconfig.json')});
const {PendingImportStore,parseInput,normalize}=require(compiled?'../dist/lib/semiAutoImport':'../src/lib/semiAutoImport');
const count=Number(process.argv[2]);if(![1000,10000].includes(count))throw Error('COUNT_1000_OR_10000');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'wishlist-import-bench-'));fs.chmodSync(root,0o700);
const now=new Date('2026-10-09T02:00:00Z'),base={libraryFileId:'libfile_'+'a'.repeat(32),jsonVersion:28,csvVersion:25,sha256:'a'.repeat(64),csvLibraryFileId:'libfile_'+'b'.repeat(32),csvSha256:'b'.repeat(64)};
const rows=Array.from({length:count},(_,i)=>({sourceUrl:'https://example.com/posts/'+Math.floor(i/5),itemKey:String(i%5),title:'合成測試二手商品 '+i,price:i+10,currency:'TWD',county:'臺南市',district:'永康區',originalPostedAt:'2026-10-01T00:00:00Z',checkedAt:'2026-10-08T00:00:00Z',status:'ACTIVE'}));
const text=JSON.stringify(rows),start=performance.now();
const parsed=parseInput(text,'json'),parsedAt=performance.now();for(const r of parsed)normalize(r,now);const validatedAt=performance.now();
const store=new PendingImportStore(root);let job=store.create(text,'json',base,now),createdAt=performance.now();let chunkMs=[];
while(job.state==='PROCESSING'){const t=performance.now();job=store.advance(job.id,job.revision,base);chunkMs.push(performance.now()-t);}
const queuedAt=performance.now();const exported=store.export(job.id,job.revision,base),end=performance.now();
console.log(JSON.stringify({checkedAt:new Date().toISOString(),compiled,synthetic:true,count,inputBytes:Buffer.byteLength(text),parseSeconds:(parsedAt-start)/1000,validateSeconds:(validatedAt-parsedAt)/1000,createSeconds:(createdAt-validatedAt)/1000,queueSeconds:(queuedAt-createdAt)/1000,parseValidateQueueSeconds:(queuedAt-start)/1000,rowsPerSecond:count/((queuedAt-start)/1000),exportSeconds:(end-queuedAt)/1000,totalSeconds:(end-start)/1000,peakRSSMiB:process.resourceUsage().maxRSS/1024,chunkMs,accepted:job.accepted,rejected:job.rejected,exported:exported.manifest.count,canonicalWrites:0,sourceChecks:0,published:0,qualifiedSupplyAdded:0}));
fs.rmSync(root,{recursive:true,force:true});
