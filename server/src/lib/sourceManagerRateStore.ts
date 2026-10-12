import {createHmac} from 'node:crypto';
import prisma from './prisma';
// Shared counters, not grants. Store neither original IP nor credential.
export class SourceManagerRateStore {
 localKeys=false;
 constructor(readonly prefix:string,readonly windowMs:number,private getKey:()=>unknown){}
 private bucket(key:string){const secret=this.getKey();if(typeof secret!=='string'||!secret)throw Error('MANAGER_RATE_UNAVAILABLE');return createHmac('sha256',secret).update('wishlist/source-manager/rate/'+this.prefix+'/'+key).digest('hex');}
 async increment(key:string){const keyHash=this.bucket(key),now=new Date();try{return await prisma.$transaction(async tx=>{
  await tx.$executeRaw`INSERT INTO "SourceManagerRateBucket" ("keyHash","hits","windowStartedAt") VALUES (${keyHash},0,${now}) ON CONFLICT ("keyHash") DO NOTHING`;
  await tx.$executeRaw`SELECT "keyHash" FROM "SourceManagerRateBucket" WHERE "keyHash"=${keyHash} FOR UPDATE`;
  const old=await tx.sourceManagerRateBucket.findUniqueOrThrow({where:{keyHash}});
  const reset=+now-+old.windowStartedAt>=this.windowMs,started=reset?now:old.windowStartedAt,totalHits=reset?1:Math.min(old.hits+1,1000000);
  await tx.sourceManagerRateBucket.update({where:{keyHash},data:{hits:totalHits,windowStartedAt:started}});return {totalHits,resetTime:new Date(+started+this.windowMs)};
 });}catch{throw Error('MANAGER_RATE_UNAVAILABLE');}}
 async decrement(key:string){try{await prisma.sourceManagerRateBucket.updateMany({where:{keyHash:this.bucket(key),hits:{gt:0}},data:{hits:{decrement:1}}});}catch{throw Error('MANAGER_RATE_UNAVAILABLE');}}
 async resetKey(key:string){try{await prisma.sourceManagerRateBucket.deleteMany({where:{keyHash:this.bucket(key)}});}catch{throw Error('MANAGER_RATE_UNAVAILABLE');}}
}
