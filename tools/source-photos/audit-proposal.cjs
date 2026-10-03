// Read-only review of the native inventory proposal. Never edits canonical files or infers storage URLs.
const fs=require('node:fs');
const PHYSICAL=new Set(['physical_product','product_detail','detail','product_primary','alternate_angle','product_context','cover']);
const SPEC=new Set(['product_specific_catalogue','product_specific_marketing','spec_reference']);
const PACKAGE=new Set(['product_packaging','packaging','box_only']);
function audit(proposal){
 if(proposal?.schema_version!=='proposed-source-media-audit/1.0'||!Array.isArray(proposal.items)||!Array.isArray(proposal.posts))throw Error('EXPECTED_NATIVE_AUDIT_REQUIRED');
 const seen=new Set(),owners=new Map(),rows=[];
 for(const item of proposal.items){
  if(typeof item.id!=='string'||seen.has(item.id))throw Error('UNIQUE_STABLE_ITEM_IDS_REQUIRED');seen.add(item.id);
  const blockers=[],post=proposal.posts.find(p=>p.source_post_url===item.source_post_url),photos=Array.isArray(item.source_photos)?item.source_photos:[],media=[];
  if(item.enumeration_complete!==true||post?.enumeration_complete!==true)blockers.push('SOURCE_ENUMERATION_UNVERIFIED');
  if(!Number.isSafeInteger(item.physical_product_photo_count)||item.physical_product_photo_count<0||!Number.isSafeInteger(item.source_listing_media_count)||item.source_listing_media_count<0)blockers.push('AUTHORITATIVE_COUNT_UNKNOWN');
  if(item.same_physical_instance_count!==undefined&&item.same_physical_instance_count!==1)blockers.push('SINGLE_PHYSICAL_ITEM_UNVERIFIED');
  const ids=new Set();
  for(const p of photos){
   const id=p.source_photo_id,role=p.role;
   if(typeof id!=='string'||!id||ids.has(id)){blockers.push('INVALID_OR_DUPLICATE_SOURCE_PHOTO_ID');continue;}ids.add(id);
   // Unknown/product/variant/collage roles are deliberately not guessed from names or counts.
   const classification=PHYSICAL.has(role)?'SAME_ITEM':SPEC.has(role)?'ITEM_SPECIFICATION':PACKAGE.has(role)?'ITEM_PACKAGING':null;
   if(!classification){blockers.push('EXPLICIT_PHOTO_ROLE_REQUIRED:'+String(role));continue;}
   const key=item.source_post_url+'|'+id,old=owners.get(key);if(old&&old!==item.id){blockers.push('SHARED_PHOTO_ITEM_IDENTITY_CONFLICT');const previous=rows.find(r=>r.archiveItemId===old);if(previous)previous.blockers.push('SHARED_PHOTO_ITEM_IDENTITY_CONFLICT');}else owners.set(key,item.id);
   media.push({sourcePhotoId:id,classification,archiveItemId:item.id});
  }
  if(media.filter(p=>p.classification==='SAME_ITEM').length!==item.physical_product_photo_count)blockers.push('PHYSICAL_ROLE_COUNT_MISMATCH');
  if(media.length!==item.source_listing_media_count)blockers.push('SOURCE_ROLE_COUNT_MISMATCH');
  if(!media.length)blockers.push('NO_CONFIRMED_ITEM_IMAGES');
  if(media.length>32)blockers.push('SOURCE_PHOTO_LIMIT_EXCEEDED');
  rows.push({archiveItemId:item.id,sourceUrl:item.source_post_url,physicalSourceCount:item.physical_product_photo_count??null,sourceListingMediaCount:item.source_listing_media_count??null,proposedExactMedia:media,blockers});
 }
 for(const row of rows){row.blockers=[...new Set(row.blockers)];row.readyForMappingReview=row.blockers.length===0;row.readyForProductionImport=false;}
 return {checkedAt:new Date().toISOString(),scope:'native proposal only, not production gallery inventory',items:rows,reviewReadyCount:rows.filter(r=>r.readyForMappingReview).length,blockedCount:rows.filter(r=>r.blockers.length).length,productionWrites:0,sourcePhotoDownloads:0};
}
module.exports={audit};
if(require.main===module){try{const report=audit(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(report,null,2));}catch(e){console.error(JSON.stringify({stopped:true,errorCode:/^[A-Z_]+$/.test(e.message)?e.message:'AUDIT_FAILED',productionWrites:0}));process.exitCode=1;}}
