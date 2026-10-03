#!/usr/bin/env node
// Offline preparation only. Never reads credentials or calls a network/API.
const fs=require('node:fs'),crypto=require('node:crypto');
const {prepareSourcePhotoImport}=require('../../server/dist/lib/sourcePhotoImport');
const {parseLead}=require('../../server/dist/lib/sourceLeadRules');
const {photoCompleteness}=require('../../server/dist/lib/sourcePhotoInventory');
const {sourceLeadMedia}=require('../../server/dist/lib/sourceLeadMedia');
function prepare(input,archiveBytes,now=Date.now()) {
 if(!input||Object.keys(input).some(k=>!['archiveVersion','items'].includes(k))||!Number.isSafeInteger(input.archiveVersion)||!Array.isArray(input.items)||input.items.length<1||input.items.length>20)throw new Error('EXACT_REVIEWED_BATCH_REQUIRED');
 const sha256=crypto.createHash('sha256').update(archiveBytes).digest('hex'),seenItems=new Set(),assignedPhotos=new Set(),seenMedia=new Set(),seenFlickr=new Set();
 const items=input.items.map(item=>{
  if(!item||Object.keys(item).some(k=>!['base','inventory','receipts'].includes(k))||!Array.isArray(item.receipts)||seenItems.has(item.base?.archiveItemId))throw new Error('DUPLICATE_OR_INVALID_ITEM');
  seenItems.add(item.base.archiveItemId);
  for(const p of item.inventory.photos.filter(p=>['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING'].includes(p.classification))){const key=item.inventory.sourceUrl+'|'+p.sourcePhotoId;if(assignedPhotos.has(key))throw new Error('PHOTO_ASSIGNED_TO_MULTIPLE_ITEMS');assignedPhotos.add(key);}
  for(const r of item.receipts){if(seenMedia.has(r.mediaId)||seenFlickr.has(r.photoId))throw new Error('DUPLICATE_STORAGE_BINDING');seenMedia.add(r.mediaId);seenFlickr.add(r.photoId);}
  const row=prepareSourcePhotoImport(item.base,item.inventory,item.receipts,{version:input.archiveVersion,sha256},now);
  parseLead(row,new Date(now)); // Existing fact, date, locality and privacy rules still apply.
  return row;
 });
 return {payload:{items,dryRun:true},report:{preparedAt:new Date(now).toISOString(),archiveVersion:input.archiveVersion,archiveSha256:sha256,items:items.map(row=>({archiveItemId:row.archiveItemId,...photoCompleteness(row,sourceLeadMedia(row,now),now)})),networkRequests:0,productionWrites:0}};
}
module.exports={prepare};
if(require.main===module){try{const [inputPath,archivePath,outputPath]=process.argv.slice(2);if(!inputPath||!archivePath||!outputPath||fs.existsSync(outputPath))throw new Error('NEW_OUTPUT_AND_INPUT_PATHS_REQUIRED');const result=prepare(JSON.parse(fs.readFileSync(inputPath,'utf8')),fs.readFileSync(archivePath));fs.writeFileSync(outputPath,JSON.stringify(result.payload,null,2),{flag:'wx'});console.log(JSON.stringify(result.report));}catch(e){console.error(JSON.stringify({stopped:true,errorCode:/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED',productionWrites:0}));process.exitCode=1;}}
