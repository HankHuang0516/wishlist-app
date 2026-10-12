import {Router,Response} from 'express';
import {Prisma} from '@prisma/client';
import prisma from '../lib/prisma';
import {LeadError,digest,exact,object,ref,leadCurrent} from '../lib/sourceLeadRules';
import {isListingId} from '../lib/listingRules';
import {parseRecordFacts,parseRecordPublication,recordSnapshot,recordStateHash,exportCsv} from '../lib/sourceLeadRecords';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const fail=(res:Response,e:unknown)=>res.status(e instanceof LeadError?409:503).json({errorCode:e instanceof LeadError?e.message:'SOURCE_RECORD_UNAVAILABLE'});
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const operation=(v:unknown)=>{if(typeof v!=='string'||!isListingId(v))throw new LeadError('OPERATION_ID_REQUIRED');return v;};
const revision=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<2147483647;
const view=(r:any)=>({...recordSnapshot(r),stateHash:recordStateHash(r),stockStatus:'UNKNOWN',qualifiedSupply:false,checkoutEnabled:false});
const replay=async(tx:any,operationId:string,requestHash:string)=>{
 const events=await tx.sourceLeadRecordEvent.findMany({where:{operationId},orderBy:{leadId:'asc'}});
 if(!events.length)return null;
 if(events.some((e:any)=>e.requestHash!==requestHash))throw new LeadError('OPERATION_BODY_CONFLICT');
 return {operationId,replayed:true,results:events.map((e:any)=>(e.afterSnapshot as any).result),qualifiedSupplyAdded:0};
};
export function createSourceLeadRecordRoutes(options:{draftOnly?:boolean}={}){
 const router=Router(); // Mounted beneath existing marketplaceAdmin/no-store/rate limit.
 router.get('/',async(req,res)=>{try{
  if(Object.keys(req.query).some(k=>!['cursor','limit','archiveItemId','status'].includes(k)))throw new LeadError('INVALID_RECORD_QUERY');
  const limit=req.query.limit===undefined?25:Number(req.query.limit);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||req.query.cursor&&!isListingId(String(req.query.cursor))||req.query.archiveItemId&&!id(req.query.archiveItemId)||req.query.status&&!['PRIVATE_PENDING','PUBLISHED','WITHDRAWN'].includes(String(req.query.status)))throw new LeadError('INVALID_RECORD_QUERY');
  const where={...(req.query.archiveItemId?{archiveItemId:String(req.query.archiveItemId)}:{}),...(req.query.status?{status:String(req.query.status)}:{})};
  if(req.query.cursor&&!await prisma.externalSourceLead.findFirst({where:{...where,id:String(req.query.cursor)}}))throw new LeadError('RECORD_CURSOR_INVALID');
  const rows=await prisma.externalSourceLead.findMany({where,orderBy:{id:'asc'},take:limit+1,...(req.query.cursor?{cursor:{id:String(req.query.cursor)},skip:1}:{})});
  return res.json({items:rows.slice(0,limit).map(view),nextCursor:rows.length>limit?rows[limit-1].id:null});
 }catch(e){return fail(res,e);}});
 router.post('/save',async(req,res)=>{try{
  const b=object(req.body);exact(b,['operationId','items']);const op=operation(b.operationId);
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>20)throw new LeadError('ONE_TO_20_RECORDS_REQUIRED');
  const inputs=b.items.map((raw:any)=>{const r=object(raw);exact(r,['archiveItemId','expectedRevision','expectedStateHash','facts']);if(!id(r.archiveItemId)||!revision(r.expectedRevision)||(r.expectedRevision===0?r.expectedStateHash!==null:!hash(r.expectedStateHash)))throw new LeadError('BOUND_RECORD_REVISION_REQUIRED');return {archiveItemId:String(r.archiveItemId),expectedRevision:Number(r.expectedRevision),expectedStateHash:r.expectedStateHash as string|null,facts:parseRecordFacts(r.facts)};});
  if(new Set(inputs.map((i:any)=>i.archiveItemId)).size!==inputs.length)throw new LeadError('DUPLICATE_RECORD_ID');
  const requestHash=digest({action:'SAVE',items:inputs});
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73009260930::bigint)`;
   if(options.draftOnly){
    const sessionId=res.locals.manager?.id;
    if(!sessionId)throw new LeadError('MANAGER_SESSION_REVOKED');
    await tx.$executeRaw`SELECT id FROM "SourceManagerSession" WHERE id=${sessionId} FOR UPDATE`;
    const live=await tx.sourceManagerSession.findUnique({where:{id:sessionId}});
    if(!live||live.revokedAt||live.expiresAt<=new Date()||live.scope!=='SOURCE_DRAFT_EDITOR')throw new LeadError('MANAGER_SESSION_REVOKED');
   }
   const oldReplay=await replay(tx,op,requestHash);if(oldReplay)return oldReplay;
   const results=[];
   for(const input of inputs){
    const old=await tx.externalSourceLead.findUnique({where:{archiveItemId:input.archiveItemId}});
    if(old?(old.recordRevision!==input.expectedRevision||recordStateHash(old)!==input.expectedStateHash||old.canonicalUrl!==input.facts.canonicalUrl):input.expectedRevision!==0)throw new LeadError('RECORD_STATE_CONFLICT');
    const sourceRef=input.facts.evidence.sourceCheckRef;
    if(sourceRef){const prior=await tx.sourceLeadRecordEvent.findFirst({where:{sourceCheckRef:sourceRef}});if(prior&&(+(prior.sourceCheckedAt??0)!==(input.facts.checkedAt?Date.parse(input.facts.checkedAt):0)||prior.sourceUrl!==input.facts.canonicalUrl))throw new LeadError('SOURCE_CHECK_REFERENCE_TIME_CONFLICT');}
    const pendingHash=digest(input.facts),nextRevision=(old?.recordRevision??0)+1;
    const withdrawal=['SOLD','WITHDRAWN'].includes(input.facts.sourceClaimState),unavailable=input.facts.sourceClaimState!=='UNKNOWN';
    const status=old?.status==='WITHDRAWN'||withdrawal?'WITHDRAWN':unavailable?'PRIVATE_PENDING':old?.status==='PUBLISHED'?'PUBLISHED':'PRIVATE_PENDING';
    const data={pendingFacts:json(input.facts),pendingHash,recordRevision:nextRevision,status,sourceClaimState:unavailable?input.facts.sourceClaimState:old?.sourceClaimState??'UNKNOWN'};
    if(old){const changed=await tx.externalSourceLead.updateMany({where:{id:old.id,recordRevision:old.recordRevision,updatedAt:old.updatedAt,status:old.status},data});if(changed.count!==1)throw new LeadError('RECORD_STATE_CONFLICT');}
    const saved=old?await tx.externalSourceLead.findUniqueOrThrow({where:{id:old.id}}):await tx.externalSourceLead.create({data:{...data,archiveItemId:input.archiveItemId,canonicalUrl:input.facts.canonicalUrl,title:input.facts.title,summary:'',evidence:{},contentHash:digest({privateRecord:input.archiveItemId}),recordOrigin:'DB_MASTER'}});
    const receipt={id:saved.id,archiveItemId:saved.archiveItemId,revision:saved.recordRevision,stateHash:recordStateHash(saved),pendingHash,status:saved.status};
    await tx.sourceLeadRecordEvent.create({data:{leadId:saved.id,operationId:op,action:'SAVE',requestHash,appliedRevision:saved.recordRevision,sourceCheckRef:input.facts.evidence.sourceCheckRef??null,sourceCheckedAt:input.facts.checkedAt?new Date(input.facts.checkedAt):null,sourceUrl:input.facts.canonicalUrl,beforeSnapshot:old?json(recordSnapshot(old)):Prisma.DbNull,afterSnapshot:json({record:recordSnapshot(saved),result:receipt,...(options.draftOnly?{actor:{sessionRef:res.locals.manager.id,scope:'SOURCE_DRAFT_EDITOR'}}:{})})}});
    results.push(receipt);
   }
   return {operationId:op,replayed:false,results,qualifiedSupplyAdded:0};
  });return res.json(result);
 }catch(e){return fail(res,e);}});
 router.post('/publish',async(req,res)=>{if(options.draftOnly)return res.status(403).json({errorCode:'MANAGER_PUBLISH_NOT_ALLOWED'});try{
  const b=object(req.body);exact(b,['operationId','items','confirmSourceReference']);const op=operation(b.operationId);
  if(b.confirmSourceReference!==true||!Array.isArray(b.items)||!b.items.length||b.items.length>20)throw new LeadError('ONE_TO_20_REVIEWED_REFERENCES_REQUIRED');
  const inputs=b.items.map((raw:any)=>{const r=object(raw);exact(r,['id','expectedRevision','expectedStateHash','pendingHash','reviewRef']);if(!isListingId(r.id)||!revision(r.expectedRevision)||!hash(r.expectedStateHash)||!hash(r.pendingHash)||!ref(r.reviewRef))throw new LeadError('BOUND_RECORD_REVIEW_REQUIRED');return r;});
  if(new Set(inputs.map((r:any)=>r.id)).size!==inputs.length)throw new LeadError('DUPLICATE_RECORD_ID');
  const requestHash=digest({action:'PUBLISH',items:inputs});
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73009260930::bigint)`;
   const oldReplay=await replay(tx,op,requestHash);if(oldReplay)return oldReplay;
   const results=[];
   for(const input of inputs){
    const old=await tx.externalSourceLead.findUnique({where:{id:input.id}});
    if(!old||old.recordRevision!==input.expectedRevision||recordStateHash(old)!==input.expectedStateHash||old.pendingHash!==input.pendingHash)throw new LeadError('RECORD_STATE_CONFLICT');
    const parsed=parseRecordPublication(old,input.reviewRef),nextRevision=old.recordRevision+1;
    const changed=await tx.externalSourceLead.updateMany({where:{id:old.id,recordRevision:old.recordRevision,updatedAt:old.updatedAt,status:old.status,pendingHash:old.pendingHash},data:{...parsed,recordOrigin:'DB_MASTER',recordRevision:nextRevision,status:'PUBLISHED',sourceClaimState:'UNKNOWN',pendingFacts:Prisma.DbNull,pendingHash:null,...(parsed.contentHash!==old.contentHash?{sellerRoute:Prisma.DbNull}:{})}});if(changed.count!==1)throw new LeadError('RECORD_STATE_CONFLICT');
    const saved=await tx.externalSourceLead.findUniqueOrThrow({where:{id:old.id}});
    const receipt={id:saved.id,archiveItemId:saved.archiveItemId,revision:saved.recordRevision,stateHash:recordStateHash(saved),contentHash:saved.contentHash,status:saved.status};
    await tx.sourceLeadRecordEvent.create({data:{leadId:saved.id,operationId:op,action:'PUBLISH',requestHash,appliedRevision:nextRevision,beforeSnapshot:json(recordSnapshot(old)),afterSnapshot:json({record:recordSnapshot(saved),result:receipt})}});
    results.push(receipt);
   }
   return {operationId:op,replayed:false,results,sourceReferencesPublished:results.length,qualifiedSupplyAdded:0};
  });return res.json(result);
 }catch(e){return fail(res,e);}});
 router.get('/operations/:operationId',async(req,res)=>{try{
  if(!isListingId(req.params.operationId)||Object.keys(req.query).length)throw new LeadError('INVALID_OPERATION_QUERY');
  const events=await prisma.sourceLeadRecordEvent.findMany({where:{operationId:String(req.params.operationId)},orderBy:{leadId:'asc'},take:21});
  if(!events.length)return res.status(404).json({state:'UNKNOWN',automaticRetry:false});
  return res.json({state:'RECORDED',action:events[0].action,results:events.map(e=>(e.afterSnapshot as any).result),automaticRetry:false});
 }catch(e){return fail(res,e);}});
 router.get('/:id/validation',async(req,res)=>{try{
  if(!isListingId(req.params.id)||Object.keys(req.query).length)throw new LeadError('INVALID_RECORD_QUERY');
  const row=await prisma.externalSourceLead.findUnique({where:{id:String(req.params.id)}});if(!row)return res.sendStatus(404);
  let ready=false,issue:string|null=null;
  try{const pending=object(row.pendingFacts);parseRecordPublication(row,object(pending.evidence).reviewRef);ready=true;}catch(e){issue=e instanceof LeadError?e.message:'PENDING_REVIEW_EVIDENCE_REQUIRED';}
  return res.json({id:row.id,stateHash:recordStateHash(row),pendingHash:row.pendingHash,publicSnapshotCurrentlyValid:leadCurrent(row),dataReady:ready,issue,reviewApproved:false,publishAllowed:false,qualifiedSupply:false});
 }catch(e){return fail(res,e);}});
 router.get('/:id',async(req,res)=>{try{
  if(!isListingId(req.params.id)||Object.keys(req.query).length)throw new LeadError('INVALID_RECORD_QUERY');
  const row=await prisma.externalSourceLead.findUnique({where:{id:String(req.params.id)}});return row?res.json(view(row)):res.sendStatus(404);
 }catch(e){return fail(res,e);}});
 router.get('/:id/history',async(req,res)=>{try{
  if(!isListingId(req.params.id)||Object.keys(req.query).some(k=>!['cursor','limit'].includes(k)))throw new LeadError('INVALID_HISTORY_QUERY');
  const limit=req.query.limit===undefined?25:Number(req.query.limit),cursor=req.query.cursor?String(req.query.cursor):null;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor&&!isListingId(cursor))throw new LeadError('INVALID_HISTORY_QUERY');
  if(cursor&&!await prisma.sourceLeadRecordEvent.findFirst({where:{id:cursor,leadId:String(req.params.id)}}))throw new LeadError('HISTORY_CURSOR_INVALID');
  const rows=await prisma.sourceLeadRecordEvent.findMany({where:{leadId:String(req.params.id)},orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  return res.json({items:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].id:null});
 }catch(e){return fail(res,e);}});
 router.get('/:id/export',async(req,res)=>{if(options.draftOnly)return res.status(403).json({errorCode:'MANAGER_EXPORT_NOT_ALLOWED'});try{
  if(!isListingId(req.params.id)||Object.keys(req.query).some(k=>k!=='format')||req.query.format&&!['json','csv'].includes(String(req.query.format)))throw new LeadError('INVALID_EXPORT_QUERY');
  const row=await prisma.externalSourceLead.findUnique({where:{id:String(req.params.id)}});if(!row)return res.sendStatus(404);
  const value=view(row),format=req.query.format??'json';res.set('Content-Disposition','attachment; filename="source-record-'+row.id+'.'+format+'"');
  if(format==='csv')return res.type('text/csv; charset=utf-8').send(exportCsv([['id','archiveItemId','revision','status','facts','stockStatus','qualifiedSupply'],[row.id,row.archiveItemId,row.recordRevision,row.status,value,'UNKNOWN',false]]));
  return res.json({schemaVersion:1,exportedAt:new Date().toISOString(),record:value,historyUrl:'/api/source-lead-admin/records/'+row.id+'/history',backupOnly:true,authoritativeStore:'DATABASE'});
 }catch(e){return fail(res,e);}});
 return router;
}
