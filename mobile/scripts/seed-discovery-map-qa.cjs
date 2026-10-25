// Isolated synthetic density/missing-photo/original-price data. Never uses a
// production database, external account or AI provider, and is not inventory.
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {assertTestDatabase}=require('../../scripts/assert-test-database.cjs');
const {seedUiuxHomeQa}=require('./seed-uiux-home-qa.cjs');

async function seedDiscoveryMapQa(qa,database){
 assertTestDatabase(database);
 if(database!==process.env.TEST_DATABASE_URL||database!==process.env.DATABASE_URL||qa.apiUrl!=='http://127.0.0.1:18889'||!Number.isSafeInteger(qa.actors?.buyer?.id)||!Number.isSafeInteger(qa.actors?.seller?.id))throw Error('Exact isolated map fixture scope required');
 const base=await seedUiuxHomeQa(qa),{PrismaClient}=require('../../server/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url:database}}});
 const owner=qa.actors.seller,buyer=qa.actors.buyer,listingIds=[],titles=[],retailIds=[];
 let sellerToken;
 async function api(route,method='GET',body,token=sellerToken){
  const r=await fetch(qa.apiUrl+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(![200,201].includes(r.status))throw Error('Isolated map fixture API rejected: '+r.status);
  return r.json();
 }
 try{
  const actual=await db.user.findMany({where:{id:{in:[owner.id,buyer.id]}},select:{id:true,email:true,phoneNumber:true}});
  if(actual.length!==2||!actual.some(u=>u.id===owner.id&&u.email===owner.email)||!actual.some(u=>u.id===buyer.id&&u.email===buyer.email))throw Error('Synthetic map actors do not match isolated DB');
  sellerToken=(await api('/auth/login','POST',{phoneNumber:owner.email,password:owner.password},null)).token;
  if(typeof sellerToken!=='string')throw Error('Synthetic seller login failed');
  const photo=fs.readFileSync(path.join(__dirname,'../qa-fixtures/synthetic-used-blue-mug.png'));
  const now=new Date(),later=new Date(+now+86400000);
  for(let i=0;i<36;i++){
   const group=Math.floor(i/9),name=['Samsung Galaxy Buds3','陶瓷馬克杯','童書繪本','棉質襯衫'][group],title=`地圖驗收 ${String(i+1).padStart(2,'0')} ${name}`;
   const listing=await db.listing.create({data:{ownerUserId:owner.id,clientListingId:randomUUID(),requestHash:'synthetic-map-density-'+i,title,description:'僅供隔離資料庫驗收的合成商品，不是真實販售。缺圖案例模擬既有商品照片失效，不代表可無照片上架。',category:['electronics','home','books','clothing'][group],condition:'USED',price:i===0?2500:500+i,currency:'TWD',deliveryMethods:['MEETUP'],status:'ACTIVE',publishedAt:new Date(+now+i),expiresAt:later,mapVisibleUntil:new Date(+now+3600000),location:{create:{county:'臺南市',district:'永康區',publicLatitude:23.01+Math.floor(i/12)*.02,publicLongitude:120.23+(i%12)*.02,precisionMeters:2200}}}});
   listingIds.push(listing.id);titles.push(title);
   if(group===1){
    const form=new FormData();form.append('clientUploadId',randomUUID());form.append('image',new Blob([photo],{type:'image/png'}),'synthetic-used-blue-mug.png');
    const media=await api('/listing-media','POST',form);
    // This is fixture association, not an alternate production publication route.
    await db.listingMedia.update({where:{id:media.id,ownerUserId:owner.id},data:{listingId:listing.id,position:0}});
   }
  }
  const {loadDiscovery}=require('../../server/dist/lib/discovery'),retail=require('../../server/dist/lib/retailPrices');
  const product=(await loadDiscovery()).find(p=>p.id===listingIds[0]);if(!product)throw Error('Map price fixture not publicly readable');
  const id=randomUUID();retailIds.push(id);
  await db.retailPriceObservation.create({data:retail.retailObservation({requestId:id,productKey:product.key,bindingHash:retail.retailBinding(product),status:'VERIFIED',originalPrice:'4990',currency:'TWD',priceType:'MANUFACTURER_MSRP',sourceUrl:'https://images.samsung.com/is/content/samsung/assets/tw/downloads/2025-ses-apr-event-guidelines.pdf',sourceTitle:'合成驗收原價來源 · Samsung',sourceProductTitle:'Samsung Galaxy Buds3',sourcePeriod:'2025-04',evidenceQuote:'Galaxy Buds3 建議售價 NT$4,990',checkedAt:now.toISOString()},product)});
  return {base,listingIds,titles,retailIds,retailProductTitle:titles[0],wishProductTitle:titles[35],wishProductId:listingIds[35],fixtureKind:'SYNTHETIC_DENSITY_AND_MISSING_PHOTO_NOT_LIVE_INVENTORY',photoCases:{provided:9,unavailable:27},
   async secondList(){const login=await api('/auth/login','POST',{phoneNumber:buyer.email,password:buyer.password},null),result=await api('/native-wishes/lists','POST',{clientRequestId:randomUUID(),title:'第二份地圖願望',isPublic:false},login.token);if(!Number.isSafeInteger(result.resource?.id))throw Error('Second synthetic wishlist missing');return {created:true,wishlistId:result.resource.id};},
   async cleanup(){const cleanup=new PrismaClient({datasources:{db:{url:database}}});try{await cleanup.retailPriceObservation.deleteMany({where:{id:{in:retailIds}}});}finally{await cleanup.$disconnect();}}};
 }catch(error){await db.retailPriceObservation.deleteMany({where:{id:{in:retailIds}}});throw error;}finally{await db.$disconnect();}
}
module.exports={seedDiscoveryMapQa};
