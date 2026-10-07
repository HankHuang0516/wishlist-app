'use strict';
const fs=require('node:fs'),http=require('node:http');
const {runJob}=require('./source-sync-once-core.cjs');
const jobs=require('./source-sync-approved-jobs.cjs');
const {createJournal}=require('./source-sync-journal.cjs');
async function main() {
  const args=process.argv.slice(2);
  if(args.length!==3 || !Object.hasOwn(jobs,args[0]))throw Error('JOB_NOT_APPROVED');
  const policy=jobs[args[0]];
  const {parseLead}=require('../dist/lib/sourceLeadRules.js');
  const key=process.env.ADMIN_API_KEY,port=process.env.PORT;
  if(typeof key!=='string'||!key||key.length>4096)throw Error('ADMIN_CREDENTIAL_UNAVAILABLE');
  if(!/^\d{1,5}$/.test(port??'')||+port<1||+port>65535)throw Error('LOCAL_SERVICE_PORT_REQUIRED');
  // Fixed existing uploads volume; its dot-directory is denied by the legacy upload router.
  const dir='/app/server/public/uploads/.source-sync-receipts';
  const journal=createJournal(dir,policy.jobId);
  const transport=body=>new Promise((resolve,reject)=>{
    const data=JSON.stringify(body);
    // Fixed loopback endpoint; no external hosts, redirects, proxies or shell.
    const req=http.request({hostname:'127.0.0.1',port:Number(port),path:'/api/source-lead-admin/import',method:'POST',headers:{'x-admin-key':key,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
      let bytes=0,chunks=[];res.on('data',chunk=>{bytes+=chunk.length;if(bytes>256*1024){res.destroy();reject(Error('HTTP_FAILED'));}else chunks.push(chunk);});res.on('error',()=>reject(Error('HTTP_FAILED')));res.on('end',()=>{if(res.statusCode!==200)return reject(Error('HTTP_FAILED'));try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('HTTP_FAILED'));}});
    });req.setTimeout(30000,()=>req.destroy());req.on('error',()=>reject(Error('HTTP_FAILED')));req.end(data);
  });
  const result=await runJob({policy,archiveBytes:fs.readFileSync(args[1]),payloadBytes:fs.readFileSync(args[2]),parseLead,journal,transport,wait:()=>new Promise(r=>setTimeout(r,2200))});
  console.log(JSON.stringify(result));if(result.state==='STOPPED')process.exitCode=1;
}
main().catch(()=>{console.log(JSON.stringify({state:'STOPPED',errorCode:'SYNC_SETUP_FAILED'}));process.exitCode=1;});
