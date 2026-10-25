// Synthetic private drafts with completed REVIEW marketing jobs. No AI/provider call.
const {randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {assertTestDatabase}=require('../../scripts/assert-test-database.cjs');
const {seedUiuxHomeQa}=require('./seed-uiux-home-qa.cjs');
async function seedBatchRemovalQa(qa,database,{existingBase=null,generatedSlots=4}={}){
 assertTestDatabase(database);if(database!==process.env.DATABASE_URL||database!==process.env.TEST_DATABASE_URL||qa.apiUrl!=='http://127.0.0.1:18889')throw Error('Exact isolated removal fixture required');
 if(![1,4].includes(generatedSlots))throw Error('Fixed synthetic image count required');
 const base=existingBase??await seedUiuxHomeQa(qa),actor=qa.actors.buyer;
 async function api(route,method='GET',body,token){const r=await fetch(qa.apiUrl+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});if(![200,201].includes(r.status))throw Error('Removal fixture API failed: '+r.status);return r.json();}
 const login=await api('/auth/login','POST',{phoneNumber:actor.email,password:actor.password}),token=login.token;if(login.user?.id!==actor.id)throw Error('Synthetic removal actor mismatch');
 const {PrismaClient}=require('../../server/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url:database}}}),sourceIds=[],generatedIds=[],jobIds=[];
 const bytes=fs.readFileSync(path.join(__dirname,'../qa-fixtures/synthetic-used-blue-mug.png'));
 async function photo(){const data=new FormData();data.append('clientUploadId',randomUUID());data.append('capturePurpose','BATCH_ITEM');data.append('image',new Blob([bytes],{type:'image/png'}),'synthetic-used-blue-mug.png');return (await api('/listing-media','POST',data,token)).id;}
 try{const {freeMarketingWindow}=require('../../server/dist/lib/marketingAssistantRules'),period=freeMarketingWindow(new Date());
 for(let i=0;i<3;i++){
  const id=await photo();sourceIds.push(id);const title='合成移除驗收商品 '+(i+1),draft={title,description:'僅供隔離驗收的合成藍色馬克杯草稿。',category:'home',brand:null,condition:'USED',estimatedPriceLowTwd:10,estimatedPriceHighTwd:30,priceBasis:'合成資料，未執行 AI 服務。',evidence:['合成藍色馬克杯','可見杯身與把手，僅供測試'],uncertainties:['僅供測試'],confidence:.9,source:'MINIMAX_CODE_VISION'};
  await db.listingMedia.update({where:{id,ownerUserId:actor.id},data:{aiDraftStatus:'COMPLETED',aiDraft:draft,sellerDraftVersion:18}});
  const job=await db.marketingJob.create({data:{ownerUserId:actor.id,sourceMediaId:id,status:'REVIEW',clientRequestId:randomUUID(),requestHash:'a'.repeat(64),snapshot:{syntheticOnly:true},quotaPeriodStart:period.startsAt,quotaPeriodEnd:period.endsAt}});jobIds.push(job.id);
  for(let slot=1;slot<=generatedSlots;slot++){const generated=await photo();generatedIds.push(generated);await db.listingMedia.update({where:{id:generated,ownerUserId:actor.id},data:{capturePurpose:'AI_MARKETING',marketingJobId:job.id,marketingSlot:slot}});}
 }
 return {base,sourceIds,generatedIds,jobIds,syntheticOnly:true,actualAiProviderCalls:0,fixtureKind:'THREE_PRIVATE_DRAFTS_BLOCKED_BY_REVIEW',async cleanup(){const cleanup=new PrismaClient({datasources:{db:{url:database}}});try{await cleanup.mediaErasureTask.deleteMany({where:{mediaId:{in:[...sourceIds,...generatedIds]}}});}finally{await cleanup.$disconnect();}}};
 }finally{await db.$disconnect();}
}
module.exports={seedBatchRemovalQa};
