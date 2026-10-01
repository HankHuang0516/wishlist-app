import type { Response } from 'express';
import { Prisma, type FollowOperationReceipt } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { decodeUserSessionJwt } from '../lib/jwtConfig';
import { followUserId, followActionId, followInput, followHash, FollowOperationError } from '../lib/followOperation';
type Tx = Prisma.TransactionClient;
async function gate(tx: Tx, req: AuthRequest, userId: number, targetId = userId) {
    // Deterministic order prevents opposite follow operations deadlocking;
    // locking the actor serializes quota checks with all legacy/new writes.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${userId}, ${targetId}) ORDER BY "id" FOR NO KEY UPDATE`);
    const row = await tx.user.findUnique({ where: { id:userId }, select: { id:true, authVersion:true, apiKey:true, followingVersion:true, isPremium:true, maxFollowing:true } });
    if (!row) throw new FollowOperationError(401);
    const key = req.headers['x-api-key'];
    if (key) { if (typeof key !== 'string' || row.apiKey !== key) throw new FollowOperationError(401); }
    else { try { const claims=decodeUserSessionJwt(req.headers.authorization?.split(' ')[1]??''); if(claims.id!==userId||claims.authVersion!==row.authVersion)throw Error(); } catch { throw new FollowOperationError(401); } }
    return row;
}
function endpoint(action: (req:AuthRequest,userId:number)=>Promise<unknown>) {
    return async(req:AuthRequest,res:Response)=>{
        res.set('Cache-Control','private, no-store');
        if(!req.user?.id)return res.status(401).json({errorCode:'MISSING_TOKEN'});
        try{return res.json(await action(req,req.user.id));}
        catch(error){
            if(error instanceof FollowOperationError)return res.status(error.status).json({errorCode:'FOLLOW_REJECTED'});
            console.error('Follow operation unavailable; personal and database details withheld');
            return res.status(503).json({errorCode:'FOLLOW_UNAVAILABLE'});
        }
    };
}
async function current(tx:Tx,userId:number,targetUserId:number|null){
    const user=await tx.user.findUniqueOrThrow({where:{id:userId},select:{followingVersion:true,isPremium:true,maxFollowing:true}});
    const followingCount=await tx.follow.count({where:{followerId:userId}});
    const targetExists=targetUserId===null?false:!!await tx.user.findUnique({where:{id:targetUserId},select:{id:true}});
    const isFollowing=targetUserId===null?false:!!await tx.follow.findUnique({where:{followerId_followingId:{followerId:userId,followingId:targetUserId}},select:{followerId:true}});
    return {userId,targetUserId,targetExists,isFollowing,followingCount,...user};
}
async function envelope(tx:Tx,userId:number,row:FollowOperationReceipt){
    const {clientActionId,requestHash,targetUserId,wanted,expectedVersion,state,appliedVersion,createdAt}=row;
    return {receipt:{clientActionId,requestHash,targetUserId,wanted,expectedVersion,state,appliedVersion,createdAt},current:await current(tx,userId,targetUserId)};
}
export const getFollowState=endpoint(async(req,userId)=>{
    const targetId=followUserId(req.params.targetUserId);if(Object.keys(req.query).length)throw new FollowOperationError();
    return prisma.$transaction(async tx=>{await gate(tx,req,userId,targetId);return current(tx,userId,targetId);});
});
export const getFollowOperation=endpoint(async(req,userId)=>{
    const clientActionId=followActionId(req.params.clientActionId);if(Object.keys(req.query).length)throw new FollowOperationError();
    return prisma.$transaction(async tx=>{
        await gate(tx,req,userId);
        const row=await tx.followOperationReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});
        if(!row)throw new FollowOperationError(404);return envelope(tx,userId,row);
    });
});
export const submitFollowOperation=endpoint(async(req,userId)=>{
    const clientActionId=followActionId(req.params.clientActionId),input=followInput(req.body,userId),requestHash=followHash(input);
    if(Object.keys(req.query).length)throw new FollowOperationError();
    return prisma.$transaction(async tx=>{
        const user=await gate(tx,req,userId,input.targetUserId);
        const prior=await tx.followOperationReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});
        if(prior){if(prior.requestHash!==requestHash)throw new FollowOperationError(409);return envelope(tx,userId,prior);}
        const snapshot=await current(tx,userId,input.targetUserId);
        const state=user.followingVersion!==input.expectedVersion?'CONFLICT':!snapshot.targetExists?'UNAVAILABLE':input.wanted&&!snapshot.isFollowing&&!user.isPremium&&snapshot.followingCount>=user.maxFollowing?'LIMIT':'APPLIED';
        if(state==='APPLIED'){
            if(input.wanted)await tx.follow.upsert({where:{followerId_followingId:{followerId:userId,followingId:input.targetUserId}},create:{followerId:userId,followingId:input.targetUserId},update:{}});
            else await tx.follow.deleteMany({where:{followerId:userId,followingId:input.targetUserId}});
            await tx.user.update({where:{id:userId},data:{followingVersion:{increment:1}}});
        }
        return envelope(tx,userId,await tx.followOperationReceipt.create({data:{userId,clientActionId,requestHash,...input,state,appliedVersion:state==='APPLIED'?input.expectedVersion+1:null}}));
    });
});
export const abandonFollowOperation=endpoint(async(req,userId)=>{
    const clientActionId=followActionId(req.params.clientActionId);
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).join(',')!=='requestHash'||typeof req.body.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.requestHash)||Object.keys(req.query).length)throw new FollowOperationError();
    return prisma.$transaction(async tx=>{
        await gate(tx,req,userId);
        const prior=await tx.followOperationReceipt.findUnique({where:{userId_clientActionId:{userId,clientActionId}}});
        if(prior){if(prior.requestHash!==req.body.requestHash)throw new FollowOperationError(409);return envelope(tx,userId,prior);}
        return envelope(tx,userId,await tx.followOperationReceipt.create({data:{userId,clientActionId,requestHash:req.body.requestHash,state:'ABANDONED'}}));
    });
});
// Existing integrations keep their endpoints; they cannot bypass the new
// account version or atomic quota gate. Repeated desired state is idempotent.
export function legacyFollow(wanted:boolean){return endpoint(async(req,userId)=>{
    const targetId=followUserId(req.params.id);if(targetId===userId||Object.keys(req.query).length)throw new FollowOperationError();
    return prisma.$transaction(async tx=>{
        const user=await gate(tx,req,userId,targetId),snapshot=await current(tx,userId,targetId);
        if(!snapshot.targetExists)throw new FollowOperationError(404);
        if(snapshot.isFollowing!==wanted){
            if(user.followingVersion>=2147483647)throw new FollowOperationError(409);
            if(wanted&&!user.isPremium&&snapshot.followingCount>=user.maxFollowing)throw new FollowOperationError(403);
            if(wanted)await tx.follow.create({data:{followerId:userId,followingId:targetId}});
            else await tx.follow.deleteMany({where:{followerId:userId,followingId:targetId}});
            await tx.user.update({where:{id:userId},data:{followingVersion:{increment:1}}});
        }
        return {message:wanted?'Followed successfully':'Unfollowed successfully'};
    });
});}
