import {Router} from 'express';
import prisma from '../lib/prisma';
import {LeadError,exact,object,digest} from '../lib/sourceLeadRules';
import {isListingId} from '../lib/listingRules';
import {parseSourceEvidence,REFERENCE_VERIFIER_SCOPE} from '../lib/sourceReferenceAutoDisplay';
async function storeEvidence(tx:any,data:ReturnType<typeof parseSourceEvidence>,issuer:string){
 let stored=await tx.sourceReferenceEvidence.findUnique({where:{receiptRef:data.receiptRef}});
 if(!stored){
  const same=await tx.sourceReferenceEvidence.findFirst({where:{sourceCheckRef:data.sourceCheckRef}});
  if(same&&(same.canonicalUrl!==data.canonicalUrl||+same.checkedAt!==+data.checkedAt))throw new LeadError('SOURCE_CHECK_REFERENCE_TIME_CONFLICT');
  stored=await tx.sourceReferenceEvidence.create({data:{receiptRef:data.receiptRef,archiveItemId:data.archiveItemId,canonicalUrl:data.canonicalUrl,checkedAt:data.checkedAt,sourceCheckRef:data.sourceCheckRef,factsHash:data.factsHash,facts:data.facts,materialSha:data.materialSha,coordinateSha:data.coordinateSha,coordinateReadUrl:data.coordinateReadUrl,coordinateReadReceiptRef:data.coordinateReadReceiptRef,...(data.coordinateFindings?{coordinateFindings:data.coordinateFindings}:{}),verified:data.verified,issues:data.issues,issuer}});
 }
 const record=await tx.externalSourceLead.findUnique({where:{archiveItemId:data.archiveItemId},select:{id:true}});
 return {receiptRef:stored.receiptRef,archiveItemId:stored.archiveItemId,recordId:record?.id??null,verified:stored.verified,issues:stored.issues,issuer:stored.issuer,coordinateFindings:stored.coordinateFindings};
}
const entries=(body:any)=>{if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>20)throw new LeadError('ONE_TO_20_SOURCE_EVIDENCE_REQUIRED');const parsed=body.entries.map(parseSourceEvidence);if(new Set(parsed.map((e:any)=>e.archiveItemId)).size!==parsed.length)throw new LeadError('DUPLICATE_RECORD_ID');return parsed;};
const failure=(r:any,e:unknown)=>r.status(e instanceof LeadError?(e.message==='MANAGER_SESSION_REVOKED'?401:409):503).json({errorCode:e instanceof LeadError?e.message:'SOURCE_EVIDENCE_UNAVAILABLE'});
export function createSourceReferenceEvidenceRoutes(){
 const router=Router(); // Existing full-admin header boundary is unchanged.
 router.post('/',async(q,r)=>{try{const b=object(q.body);exact(b,['entries']);const parsed=entries(b);
  const records=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(73009260930::bigint)`;const rows=[];for(const d of parsed)rows.push(await storeEvidence(tx,d,'EXISTING_SOURCE_ADMIN'));return rows;});
  return r.json({records,publicationActions:0});
 }catch(e){return failure(r,e);}});return router;
}
export function createSourceReferenceRegistryRoutes(){
 const router=Router();
 const authorized=(r:any)=>r.locals.manager?.scope===REFERENCE_VERIFIER_SCOPE;
 router.post('/',async(q,r)=>{if(!authorized(r))return r.status(403).json({errorCode:'MANAGER_EVIDENCE_REGISTRATION_NOT_ALLOWED'});
  try{const b=object(q.body);exact(b,['operationId','entries']);if(!isListingId(b.operationId))throw new LeadError('OPERATION_ID_REQUIRED');const parsed=entries(b),op=String(b.operationId),requestHash=digest({action:'REGISTER_SOURCE_EVIDENCE',entries:b.entries});
   const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73009260930::bigint)`;
    const sessionId=r.locals.manager.id;
    await tx.$executeRaw`SELECT id FROM "SourceManagerSession" WHERE id=${sessionId} FOR UPDATE`;
    const live=await tx.sourceManagerSession.findUnique({where:{id:sessionId}});
    if(!live||live.revokedAt||live.expiresAt<=new Date()||live.scope!==REFERENCE_VERIFIER_SCOPE||r.locals.managerAuthorityCurrent?.()!==true)throw new LeadError('MANAGER_SESSION_REVOKED');
    const prior=await tx.sourceReferenceRegistration.findUnique({where:{operationId:op}});
    if(prior){if(prior.requestHash!==requestHash)throw new LeadError('OPERATION_BODY_CONFLICT');return {operationId:op,state:'RECORDED',replayed:true,records:prior.results,publicationActions:0};}
    const records=[];for(const d of parsed)records.push(await storeEvidence(tx,d,'SOURCE_SESSION_VERIFIER'));
    await tx.sourceReferenceRegistration.create({data:{operationId:op,requestHash,actorSessionId:sessionId,actorScope:live.scope,results:records}});
    return {operationId:op,state:'RECORDED',replayed:false,records,publicationActions:0};
   });return r.json({...result,captureFidelity:'RESPONSIBILITY_OF_AUTHORIZED_VERIFIER',serverIndependentlyBrowsedSource:false});
  }catch(e){return failure(r,e);}
 });
 router.get('/operations/:operationId',async(q,r)=>{if(!authorized(r))return r.status(403).json({errorCode:'MANAGER_EVIDENCE_REGISTRATION_NOT_ALLOWED'});
  try{if(!isListingId(q.params.operationId)||Object.keys(q.query).length)throw new LeadError('INVALID_OPERATION_QUERY');const audit=await prisma.sourceReferenceRegistration.findUnique({where:{operationId:String(q.params.operationId)}});
   return audit?r.json({operationId:audit.operationId,state:'RECORDED',records:audit.results,createdAt:audit.createdAt,actorScope:audit.actorScope,automaticRetry:false,publicationActions:0}):r.status(404).json({state:'UNKNOWN',automaticRetry:false});
  }catch(e){return failure(r,e);}
 });return router;
}
export function createSourceReferenceEvidenceReadRoutes(){
 const router=Router();
 router.get('/',async(q,r)=>{try{
  if(Object.keys(q.query).some(k=>k!=='archiveItemId')||typeof q.query.archiveItemId!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/.test(q.query.archiveItemId))throw new LeadError('BOUND_SOURCE_RECORD_REQUIRED');
  const rows=await prisma.sourceReferenceEvidence.findMany({where:{archiveItemId:q.query.archiveItemId},orderBy:{createdAt:'desc'},take:20});
  return r.json({items:rows.map(v=>({receiptRef:v.receiptRef,archiveItemId:v.archiveItemId,checkedAt:v.checkedAt,verified:v.verified,issues:v.issues,issuer:v.issuer,coordinateReadUrl:v.coordinateReadUrl,coordinateReadReceiptRef:v.coordinateReadReceiptRef,coordinateFindings:v.coordinateFindings,facts:v.facts}))});
 }catch(e){return failure(r,e);}});return router;
}
