'use strict';
const fs=require('node:fs'),path=require('node:path');
function createJournal(directory,jobId){
 if(!/^[a-z0-9-]{4,80}$/.test(jobId))throw Error('INVALID_JOB_ID');
 const dir=path.resolve(directory);
 if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir||!fs.statSync(dir).isDirectory()||(fs.statSync(dir).mode&0o777)!==0o700||fs.statSync(dir).uid!==process.getuid())throw Error('PRIVATE_RECEIPT_DIRECTORY_REQUIRED');
 const receipt=path.join(dir,jobId+'.json');
 const syncDir=()=>{const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 const syncFile=file=>{const fd=fs.openSync(file,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 return {
  begin(state){fs.writeFileSync(receipt,JSON.stringify(state),{flag:'wx',mode:0o600});syncFile(receipt);syncDir();},
  save(state){const tmp=receipt+'.next';fs.writeFileSync(tmp,JSON.stringify(state),{flag:'wx',mode:0o600});syncFile(tmp);fs.renameSync(tmp,receipt);syncDir();}
 };
}
module.exports={createJournal};
