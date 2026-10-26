import {Router,Response} from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import {Prisma} from '@prisma/client';
import {authenticateToken,optionalAuthenticateToken,AuthRequest} from '../middleware/auth';
import {chatIdentity,chatObject,ChatInputError} from '../lib/chatRules';
import {listingCreationGate,ListingCreationError} from '../lib/listingCreation';
import {interestInput,interestSnapshot,interestTarget,visibleInterestTargets} from '../lib/productInterest';
class InterestError extends Error{constructor(public status:number,public code:string){super();}}
const router=Router();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,handler:(_req,res)=>res.status(429).json({errorCode:'INTEREST_RATE_LIMIT'})}));
function endpoint(run:(req:AuthRequest)=>Promise<unknown>){return async(req:AuthRequest,res:Response)=>{try{return res.json(await run(req));}catch(e){const status=e instanceof InterestError||e instanceof ListingCreationError?e.status:e instanceof ChatInputError?400:503;return res.status(status).json({errorCode:e instanceof InterestError?e.code:status===400?'INTEREST_INPUT_REJECTED':'INTEREST_UNCONFIRMED'});}};}
router.get('/',optionalAuthenticateToken,endpoint(async req=>{
 if(Object.keys(req.query).join(',')!=='keys'||typeof req.query.keys!=='string')throw new ChatInputError();
 const keys=req.query.keys.split(',');if(!keys.length||keys.length>48||new Set(keys).size!==keys.length)throw new ChatInputError();const targets=keys.map(interestTarget);
 return prisma.$transaction(tx=>interestSnapshot(tx,targets,req.user?.id),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}));
router.use(authenticateToken);
const current=async(tx:Prisma.TransactionClient,userId:number,productKey:string)=>await tx.productInterest.findUnique({where:{userId_productKey:{userId,productKey}},select:{liked:true,version:true}})??{liked:false,version:0};
const receiptSelect={clientActionId:true,productKey:true,requestHash:true,state:true,appliedVersion:true,createdAt:true};
router.get('/operations/:clientActionId',endpoint(async req=>{
 if(Object.keys(req.query).join(',')!=='productKey')throw new ChatInputError();const productKey=interestTarget(req.query.productKey).productKey,clientActionId=chatIdentity(req.params.clientActionId),userId=req.user!.id;
 return prisma.$transaction(async tx=>{await listingCreationGate(tx,req,userId);const receipt=await tx.productInterestOperation.findUnique({where:{userId_clientActionId:{userId,clientActionId}},select:receiptSelect});if(receipt&&receipt.productKey!==productKey)throw new ChatInputError();return {receipt,current:await current(tx,userId,productKey)};});
}));
router.post('/operations/:clientActionId',rateLimit({windowMs:60000,limit:30,keyGenerator:(req:AuthRequest)=>'interest-'+req.user!.id,standardHeaders:true,legacyHeaders:false,handler:(_req,res)=>res.status(429).json({errorCode:'INTEREST_OPERATION_RATE_LIMIT'})}),endpoint(async req=>{
 if(Object.keys(req.query).length)throw new ChatInputError();const input=interestInput(req.body),clientActionId=chatIdentity(req.params.clientActionId),userId=req.user!.id;
 return prisma.$transaction(async tx=>{await listingCreationGate(tx,req,userId);const where={userId_clientActionId:{userId,clientActionId}},prior=await tx.productInterestOperation.findUnique({where,select:receiptSelect});
 if(prior){if(prior.requestHash!==input.requestHash||prior.productKey!==input.productKey)throw new ChatInputError();return {receipt:prior,current:await current(tx,userId,input.productKey)};}
 const target=interestTarget(input.productKey),visible=await visibleInterestTargets(tx,[target],userId),availability=visible.get(input.productKey);
 if(input.liked&&(!availability?.open||availability.ownerUserId===userId))throw new InterestError(409,'INTEREST_PRODUCT_UNAVAILABLE');
 const before=await current(tx,userId,input.productKey),applied=before.version===input.expectedVersion&&before.version<2147483647;
 if(applied)await tx.productInterest.upsert({where:{userId_productKey:{userId,productKey:input.productKey}},create:{userId,productKey:input.productKey,liked:input.liked,version:1},update:{liked:input.liked,version:{increment:1}}});
 const receipt=await tx.productInterestOperation.create({data:{userId,clientActionId,productKey:input.productKey,requestHash:input.requestHash,state:applied?'APPLIED':'CONFLICT',appliedVersion:applied?before.version+1:null},select:receiptSelect});return {receipt,current:await current(tx,userId,input.productKey)};});
}));
router.post('/operations/:clientActionId/abandon',endpoint(async req=>{
 if(Object.keys(req.query).length)throw new ChatInputError();const b=chatObject(req.body,['productKey','requestHash']);if(Object.keys(b).length!==2||typeof b.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(b.requestHash))throw new ChatInputError();const requestHash=b.requestHash,productKey=interestTarget(b.productKey).productKey,clientActionId=chatIdentity(req.params.clientActionId),userId=req.user!.id;
 return prisma.$transaction(async tx=>{await listingCreationGate(tx,req,userId);const where={userId_clientActionId:{userId,clientActionId}},prior=await tx.productInterestOperation.findUnique({where,select:receiptSelect});if(prior&&(prior.requestHash!==requestHash||prior.productKey!==productKey))throw new ChatInputError();const receipt=prior??await tx.productInterestOperation.create({data:{userId,clientActionId,productKey,requestHash,state:'ABANDONED'},select:receiptSelect});return {receipt,current:await current(tx,userId,productKey)};});
}));
export default router;
