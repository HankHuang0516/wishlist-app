'use strict';
// Local/operator staging only; explicit private directory, no credentials/network.
const fs=require('node:fs');
const {PendingImportStore}=require('../dist/lib/semiAutoImport');
const [operation,root,...args]=process.argv.slice(2);
try {
  const store=new PendingImportStore(root);
  let result;
  if(operation==='create'&&args.length===3)result=store.create(fs.readFileSync(args[0],'utf8'),args[1],JSON.parse(fs.readFileSync(args[2],'utf8')));
  else if(operation==='advance'&&args.length===3)result=store.advance(args[0],Number(args[1]),JSON.parse(fs.readFileSync(args[2],'utf8')));
  else if(operation==='get'&&args.length===1)result=store.page(args[0]);
  else if(operation==='cancel'&&args.length===2)result=store.cancel(args[0],Number(args[1]));
  else if(operation==='lock-status'&&args.length===0)result=store.lockStatus();
  else if(operation==='recover-lock'&&args.length===1)result=store.recoverLock(args[0]);
  else if(operation==='export'&&args.length===3)result=store.export(args[0],Number(args[1]),JSON.parse(fs.readFileSync(args[2],'utf8'))).manifest;
  else throw Error('INVALID_OPERATION');
  console.log(JSON.stringify(result));
}catch(e){console.error(JSON.stringify({errorCode:e.message}));process.exitCode=1;}
