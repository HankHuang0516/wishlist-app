#!/usr/bin/env node
// Bounded approved correction: exactly the missing six photos of the existing three books.
const fs=require('node:fs'),path=require('node:path');
const {uploadMemory,exactURL}=require('./upload-memory.cjs');
const {ListingFlickrStorage,validatedFlickrSource}=require('../../server/dist/lib/listingFlickrStorage');
const sharp=require('../../server/node_modules/sharp');
const APPROVED=new Map([
 ['1587500909841251','3595555557280525'],['1587500913174584','3595555557280525'],
 ['1586582799933062','3594378424064905'],['1586582796599729','3594378424064905'],
 ['1585482113376464','3592975287538552'],['1585482116709797','3592975287538552']
]);
async function run(inputPath,ledgerPath){
 if(!inputPath||!ledgerPath||fs.existsSync(ledgerPath))throw Error('EXACT_INPUT_NEW_LEDGER_REQUIRED');
 const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 if(!Array.isArray(input.photos)||input.photos.length!==6||new Set(input.photos.map(p=>p.sourcePhotoId)).size!==6||input.rightsBasis!=='HANK_USER_DIRECTED'||!/^consent:[A-Za-z0-9._/-]{4,180}$/.test(input.rightsEvidenceRef))throw Error('APPROVED_SIX_PHOTOS_REQUIRED');
 const photos=input.photos.map(p=>{
  const postId=APPROVED.get(p.sourcePhotoId),post='https://www.facebook.com/groups/138730922963023/posts/'+postId;
  if(!postId||p.sourcePostUrl!==post||p.archiveItemId!=='FB138730922963023-'+postId+'-01')throw Error('OUTSIDE_APPROVED_CORRECTION');
  const mapping={archiveItemId:p.archiveItemId,sourcePhotoId:p.sourcePhotoId,sourcePostUrl:post,role:'PHYSICAL',reviewed:p.reviewed,rightsBasis:input.rightsBasis,rightsEvidenceRef:input.rightsEvidenceRef,mappingEvidenceRef:p.mappingEvidenceRef};
  const observation={sourcePhotoId:p.sourcePhotoId,sourcePostUrl:post,viewerURL:p.viewerURL,imageSrc:p.imageSrc,checkedAt:p.checkedAt};exactURL(observation,mapping,Date.now());return {mapping,observation};
 });
 // All locators validated before ledger or any external upload. No image temp files.
 const ledger={scope:'approved-six-existing-book-photo-correction',startedAt:new Date().toISOString(),imageBytesWrittenToDisk:0,records:[]};
 fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2),{flag:'wx'});
 const save=async receipt=>{const index=ledger.records.findIndex(r=>r.mediaId===receipt.mediaId);if(index<0)ledger.records.push(receipt);else ledger.records[index]=receipt;fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));};
 const storage=new ListingFlickrStorage();
 for(const {mapping,observation} of photos){const receipt=await uploadMemory(observation,mapping,{storage,fetchSource:fetch,sharp,save,validatedFlickrSource});console.log(JSON.stringify({archiveItemId:receipt.archiveItemId,sourcePhotoId:receipt.sourcePhotoId,state:receipt.state,photoId:receipt.photoId,verifiedAt:receipt.verifiedAt,imageBytesWrittenToDisk:0}));}
 ledger.finishedAt=new Date().toISOString();fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));
 console.log(JSON.stringify({verifiedCount:ledger.records.length,finishedAt:ledger.finishedAt,imageBytesWrittenToDisk:0,canonicalWrites:0,productionImportWrites:0}));
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({stopped:true,errorType:e.name,errorCode:/^[A-Z_]+$/.test(e.message)?e.message:'UPLOAD_OR_READBACK_FAILED',noAutomaticRetry:true,imageBytesWrittenToDisk:0}));process.exitCode=1;});
module.exports={run};
