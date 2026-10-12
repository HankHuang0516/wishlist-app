import {Router} from 'express';
import prisma from '../lib/prisma';
import {LeadError,exact,object,ref} from '../lib/sourceLeadRules';
import {parseSourceEvidence} from '../lib/sourceReferenceAutoDisplay';
export function createSourceReferenceEvidenceRoutes(){
 const router=Router(); // Only beneath the existing x-admin-key trusted source verifier.
 router.post('/',async(q,r)=>{try{
  const b=object(q.body);exact(b,['entries']);if(!Array.isArray(b.entries)||!b.entries.length||b.entries.length>20)throw new LeadError('ONE_TO_20_SOURCE_EVIDENCE_REQUIRED');
  const parsed=b.entries.map(parseSourceEvidence);
  const records=await prisma.$transaction(async tx=>{
   const results=[];
   for(const data of parsed){
    const existing=await tx.sourceReferenceEvidence.findUnique({where:{receiptRef:data.receiptRef}});
    if(existing){results.push({receiptRef:existing.receiptRef,verified:existing.verified,issues:existing.issues});continue;}
    const sameRef=await tx.sourceReferenceEvidence.findFirst({where:{sourceCheckRef:data.sourceCheckRef}});
    if(sameRef&&(sameRef.canonicalUrl!==data.canonicalUrl||+sameRef.checkedAt!==+data.checkedAt))throw new LeadError('SOURCE_CHECK_REFERENCE_TIME_CONFLICT');
    const stored=await tx.sourceReferenceEvidence.create({data:{receiptRef:data.receiptRef,archiveItemId:data.archiveItemId,canonicalUrl:data.canonicalUrl,checkedAt:data.checkedAt,sourceCheckRef:data.sourceCheckRef,factsHash:data.factsHash,facts:data.facts,materialSha:data.materialSha,coordinateSha:data.coordinateSha,verified:data.verified,issues:data.issues,issuer:'EXISTING_SOURCE_ADMIN'}});
    results.push({receiptRef:stored.receiptRef,verified:stored.verified,issues:stored.issues});
   }
   return results;
  });return r.json({records,publicationActions:0});
 }catch(e){return r.status(e instanceof LeadError?409:503).json({errorCode:e instanceof LeadError?e.message:'SOURCE_EVIDENCE_UNAVAILABLE'});}});
 return router;
}
export function createSourceReferenceEvidenceReadRoutes(){
 const router=Router();
 router.get('/',async(q,r)=>{try{
  if(Object.keys(q.query).some(k=>k!=='archiveItemId')||typeof q.query.archiveItemId!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/.test(q.query.archiveItemId))throw new LeadError('BOUND_SOURCE_RECORD_REQUIRED');
  const rows=await prisma.sourceReferenceEvidence.findMany({where:{archiveItemId:q.query.archiveItemId},orderBy:{createdAt:'desc'},take:20});
  return r.json({items:rows.map(v=>({receiptRef:v.receiptRef,archiveItemId:v.archiveItemId,checkedAt:v.checkedAt,verified:v.verified,issues:v.issues,facts:v.facts}))});
 }catch(e){return r.status(e instanceof LeadError?409:503).json({errorCode:e instanceof LeadError?e.message:'SOURCE_EVIDENCE_UNAVAILABLE'});}});
 return router;
}
