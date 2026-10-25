import type {Prisma} from '@prisma/client';

// Removing private pixels/drafts must not restore an already consumed generation.
// The small usage row has no photo, prompt, copy or FK to the erased job.
export async function marketingUsedInPeriod(tx:Prisma.TransactionClient,userId:number,startsAt:Date){
 const live=await tx.marketingJob.count({where:{ownerUserId:userId,parentJobId:null,quotaPeriodStart:startsAt,status:{in:['PENDING','PROCESSING','REVIEW','COMPLETED']}}});
 const removed=await tx.removedMarketingUsage.count({where:{userId,quotaPeriodStart:startsAt}});
 return live+removed;
}
