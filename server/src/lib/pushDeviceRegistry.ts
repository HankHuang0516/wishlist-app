import {Prisma} from '@prisma/client';
import {randomUUID} from 'crypto';

// Registration/transfer/revocation touch several aliases of one provider token.
// Serialize only their short DB transactions; never hold this across provider I/O.
export async function lockPushDeviceRegistry(tx:Prisma.TransactionClient){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(1464627283, 1)`;
}
export const MAX_PUSH_INSTALLATION_HISTORY=100;
export async function pruneExpiredPushSessions(tx:Prisma.TransactionClient,userId:number,authVersion:number){
 // An auth-version change already rejects every delayed request from the old
 // session, so its device/token/fence rows can be removed without resurrection.
 await tx.pushDevice.deleteMany({where:{userId,authVersion:{not:authVersion}}});
}
export async function revokePushBinding(tx:Prisma.TransactionClient,id:string,bindingId:string){
 // Caller owns the registry lock. Match the original binding so a late provider
 // receipt cannot revoke a newer owner or a later registration of this device.
 const device=await tx.pushDevice.findFirst({where:{id,bindingId},select:{id:true}});
 if(!device)return false;
 await tx.pushDelivery.deleteMany({where:{deviceId:id}});
 await tx.pushDevice.updateMany({where:{id,bindingId},data:{expoPushToken:null,bindingId:randomUUID()}});
 return true;
}
