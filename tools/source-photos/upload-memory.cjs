const crypto=require('node:crypto');
const exactURL=(observation,mapping,now)=>{
 if(mapping.reviewed!==true||!['PHYSICAL','ITEM_SPECIFICATION','ITEM_PACKAGING'].includes(mapping.role)||mapping.sourcePhotoId!==observation.sourcePhotoId||mapping.sourcePostUrl!==observation.sourcePostUrl||!/^review:[A-Za-z0-9._/-]{4,180}$/.test(mapping.mappingEvidenceRef)||!/^consent:[A-Za-z0-9._/-]{4,180}$/.test(mapping.rightsEvidenceRef)||!['HANK_USER_DIRECTED','SELLER_CONSENT'].includes(mapping.rightsBasis))throw Error('EXACT_REVIEWED_ITEM_MAPPING_REQUIRED');
 const at=Date.parse(observation.checkedAt);if(!Number.isFinite(at)||at>now||now-at>30*60000)throw Error('FRESH_NORMAL_UI_OBSERVATION_REQUIRED');
 const viewer=new URL(observation.viewerURL),url=new URL(observation.imageSrc),post=new URL(mapping.sourcePostUrl),postID=post.pathname.split('/').filter(Boolean).at(-1);
 if(post.protocol!=='https:'||post.hostname!=='www.facebook.com'||!/^\/groups\/\d+\/posts\/\d+\/?$/.test(post.pathname)||post.search||post.hash||post.username||post.password||post.port||viewer.protocol!=='https:'||viewer.hostname!=='www.facebook.com'||!/^\/photo\/?$/.test(viewer.pathname)||viewer.username||viewer.password||viewer.port||viewer.hash||viewer.searchParams.get('fbid')!==mapping.sourcePhotoId||viewer.searchParams.get('set')!=='pcb.'+postID||url.protocol!=='https:'||!/^scontent[.-][a-z0-9.-]+\.fbcdn\.net$/.test(url.hostname)||url.username||url.password||url.port)throw Error('EXACT_NORMAL_UI_ASSET_REQUIRED');
 return url;
};
async function uploadMemory(observation,mapping,{storage,fetchSource,sharp,save,now=Date.now(),validatedFlickrSource}) {
 const url=exactURL(observation,mapping,now);
 const response=await fetchSource(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.body||!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length')||0)>6*1024*1024)throw Error('SOURCE_ASSET_UNAVAILABLE');
 const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>6*1024*1024)throw Error('SOURCE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks,length),meta=await sharp(bytes,{limitInputPixels:20000000}).metadata();if(!meta.width||!meta.height)throw Error('INVALID_SOURCE_IMAGE');
 const receipt={state:'UPLOAD_STARTING_NO_RETRY',archiveItemId:mapping.archiveItemId,sourcePostUrl:mapping.sourcePostUrl,sourcePhotoId:mapping.sourcePhotoId,mediaId:crypto.randomUUID(),mappingEvidenceRef:mapping.mappingEvidenceRef,rightsBasis:mapping.rightsBasis,rightsEvidenceRef:mapping.rightsEvidenceRef,sourceBytes:length,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceWidth:meta.width,sourceHeight:meta.height,observedAt:observation.checkedAt,startedAt:new Date(now).toISOString(),imageBytesWrittenToDisk:0};
 await save(receipt); // Ledger before the first external mutation; never automatically retry uncertain upload.
 const uploaded=await storage.upload(receipt.mediaId,bytes);Object.assign(receipt,{state:'UPLOADED',...uploaded,uploadedAt:new Date().toISOString(),uploadReceiptRef:'source:flickr-photo-'+uploaded.photoId});await save(receipt);
 const sizes=await storage.rest('flickr.photos.getSizes',{photo_id:receipt.photoId}),original=sizes.sizes?.size?.find(x=>x.label==='Original');if(!original)throw Error('FLICKR_ORIGINAL_NOT_RETURNED');
 const source=validatedFlickrSource(original.source,receipt.photoId),originalBytes=await storage.read(source,receipt.photoId),thumbBytes=await storage.read(receipt.thumbnailSource,receipt.photoId),om=await sharp(originalBytes,{limitInputPixels:20000000}).metadata(),tm=await sharp(thumbBytes,{limitInputPixels:20000000}).metadata();
 if(!om.width||!om.height||!tm.width||!tm.height||om.width!==meta.width||om.height!==meta.height)throw Error('FLICKR_READBACK_DIMENSION_MISMATCH');
 Object.assign(receipt,{state:'UPLOADED_AND_VERIFIED',verifiedAt:new Date().toISOString(),flickrOriginal:{source,bytes:originalBytes.length,width:om.width,height:om.height,sha256:crypto.createHash('sha256').update(originalBytes).digest('hex')},flickrThumbnail:{bytes:thumbBytes.length,width:tm.width,height:tm.height}});await save(receipt);return receipt;
}
module.exports={uploadMemory,exactURL};
