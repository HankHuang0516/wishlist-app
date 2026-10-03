import {webQaBrowser,webQaEvidence} from './webQaBrowser';
import authRoutes from '../../routes/authRoutes';
import {authenticateToken} from '../../middleware/auth';
import {getMe} from '../../controllers/userController';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import {createServer,type Server} from 'http';
import fs from 'fs';
import path from 'path';
import prisma from '../../lib/prisma';
import {createSourceLeadRoutes,createSourceLeadAdmin} from '../../routes/sourceLeadRoutes';
import {prepareSourcePhotoImport} from '../../lib/sourcePhotoImport';
import {ListingFlickrStorage} from '../../lib/listingFlickrStorage';
const run=process.env.TEST_DATABASE_URL?describe:describe.skip;
run('real Web source-gallery (synthetic local DB and pixels only)',()=>{
 let server:Server,browser:any,verified=false,buyer:number;process.env.JWT_SECRET='synthetic-photo-gallery-only';const oldFlag=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
 const origin='https://wishlist-qa.invalid',root=path.resolve(__dirname,'../../../../client/dist'),admin='synthetic-photo-gallery-admin';
 beforeAll(async()=>{require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.DATABASE_URL);verified=true;process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';process.env.API_URL=origin+'/api';},10000);
 afterAll(async()=>{if(browser)await browser.close();if(server?.listening)await new Promise<void>(r=>server.close(()=>r()));jest.restoreAllMocks();if(verified){await prisma.externalSourceLead.deleteMany({where:{archiveItemId:{startsWith:'SYNTHETIC-WEB-PHOTO-'}}});if(buyer)await prisma.user.delete({where:{id:buyer}});await prisma.$disconnect();}if(oldFlag===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=oldFlag;});
 test('nine/ten originals, explicit failed-load, all switched originals, reload preserves source ID',async()=>{
  const sharp=require('sharp'),pixel=await sharp({create:{width:32,height:32,channels:3,background:'#287353'}}).jpeg().toBuffer();
  jest.spyOn(ListingFlickrStorage.prototype,'read').mockResolvedValue(pixel);
  buyer=(await prisma.user.create({data:{phoneNumber:'0911111199',password:bcrypt.hashSync('synthetic-photo-only-pass',4),name:'SYNTHETIC gallery viewer'}})).id;
  const app=express();app.use(express.json());app.use('/api/auth',authRoutes);app.get('/api/users/me',authenticateToken,getMe);app.use('/api/source-lead-admin',createSourceLeadAdmin(()=>admin));app.use('/api/source-leads',createSourceLeadRoutes());
  app.get('/api/listings/search',(_q,r)=>r.json({items:[],nextCursor:null}));app.get('/api/external-listings',(_q,r)=>r.json({items:[],nextCursor:null,enabled:false}));
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const leadIDs:string[]=[];
  for(const count of [9,10]){
   const id='SYNTHETIC-WEB-PHOTO-'+count,sourceUrl='https://www.facebook.com/groups/123456789/posts/'+id,at=new Date().toISOString();
   const base={archiveItemId:id,libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:1,archiveSha256:'a'.repeat(64),title:'來源線索：合成Web多图測試'+count,summary:'僅本地合成測試，非真實商品。',canonicalUrl:sourceUrl,county:'臺南市',district:'永康區',publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:new Date(Date.now()-86400000).toISOString(),postedLatestAt:new Date(Date.now()-86400000).toISOString(),checkedAt:at,evidence:{sourceUrl,sourcePublic:true,publicSourceRef:'self:synthetic-public',dateRef:'self:synthetic-date',locationRef:'self:synthetic-location',coordinateRef:'self:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'self:synthetic-review'}};
   const photos=Array.from({length:count},(_,i)=>'synthetic'+count+'-'+i),inventory={archiveItemId:id,sourceUrl,checkedAt:at,reviewRef:'review:synthetic-all-angles',sourceRevision:'synthetic-1',coverage:'FULL_POST' as const,photos:photos.map(sourcePhotoId=>({sourcePhotoId,classification:'SAME_ITEM' as const,archiveItemId:id}))};
   const receipts:any[]=photos.map((sourcePhotoId,i)=>({state:'UPLOADED_AND_VERIFIED',archiveItemId:id,sourcePostUrl:sourceUrl,sourcePhotoId,mediaId:`44444444-4444-4444-8444-${String(count*100+i).padStart(12,'0')}`,photoId:String(count*100+i),mappingEvidenceRef:'review:synthetic-photo',rightsBasis:'HANK_USER_DIRECTED',rightsEvidenceRef:'consent:synthetic-display',uploadReceiptRef:'source:synthetic-flickr',verifiedAt:at,flickrOriginal:{source:`https://live.staticflickr.com/1/${count*100+i}_abc_b.jpg`},thumbnailSource:`https://live.staticflickr.com/1/${count*100+i}_abc_s.jpg`}));
   const row=prepareSourcePhotoImport(base,inventory,receipts,{version:2,sha256:'b'.repeat(64)});const result=await request(server).post('/api/source-lead-admin/import').set('x-admin-key',admin).send({items:[row],dryRun:false});expect(result.status).toBe(200);leadIDs.push(result.body.ids[0]);
  }
  const {puppeteer,executablePath}=webQaBrowser();browser=await puppeteer.launch({executablePath,headless:true,args:['--no-first-run','--disable-background-networking']});
  const page=await browser.newPage();await page.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,'language',{get:()=> 'zh-TW'});Object.defineProperty(navigator,'languages',{get:()=>['zh-TW','zh']});});await page.setViewport({width:1280,height:900});await page.setRequestInterception(true);let failFirst=false;const errors:string[]=[],traffic:any[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  page.on('request',async(req:any)=>{try{const u=new URL(req.url());if(u.origin!==origin){await req.abort();return;}if(u.pathname.startsWith('/api/')){if(failFirst&&u.pathname.includes('/media/44444444-4444-4444-8444-000000001000/image')){await req.respond({status:503,contentType:'text/plain',body:'synthetic image failure'});return;}let actual=(request(server) as any)[req.method().toLowerCase()](u.pathname+u.search);const headers=req.headers();if(headers.authorization)actual=actual.set('Authorization',headers.authorization);if(headers['content-type'])actual=actual.set('Content-Type',headers['content-type']);if(req.postData())actual=actual.send(req.postData());const result=await actual;traffic.push({path:u.pathname,status:result.status,errorCode:result.body?.errorCode});const contentType=result.headers['content-type']||'application/json';await req.respond({status:result.status,contentType,body:Buffer.isBuffer(result.body)?result.body:result.text});return;}const target=path.resolve(root,u.pathname==='/'?'index.html':'.'+u.pathname),asset=target.startsWith(root)&&fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');const ext=path.extname(asset),type=ext==='.js'?'application/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'text/html';await req.respond({status:200,contentType:type,body:fs.readFileSync(asset)});}catch{try{await req.abort();}catch{}}});
  const open=async(index:number)=>{await page.goto(origin+'/explore?source='+leadIDs[index]+'&view=list',{waitUntil:'domcontentloaded'});try{await page.waitForSelector('[data-imported-photo-count]',{timeout:15000});}catch(e){console.log(JSON.stringify({syntheticDiagnostic:true,errors,traffic,body:await page.$eval('body',(el:Element)=>el.textContent)}));throw e;}};
  const inspect=async(count:number)=>{
   await page.waitForFunction((n:number)=>document.querySelector('[data-imported-photo-count]')?.getAttribute('data-imported-photo-count')===String(n),{},count);
   for(let i=1;i<=count;i++){if(count>1)await page.click(`button[aria-label="查看第${i}張來源照片"]`);await page.waitForFunction((n:number)=>Number(document.querySelector('[data-imported-photo-count]')?.getAttribute('data-loaded-photo-count'))>=n,{},i);}
   const state=await page.$eval('[data-imported-photo-count]',(el:Element)=>({source:el.getAttribute('data-source-photo-count'),collected:el.getAttribute('data-imported-photo-count'),loaded:el.getAttribute('data-loaded-photo-count'),failed:el.getAttribute('data-failed-photo-count')}));expect(state).toEqual({source:String(count),collected:String(count),loaded:String(count),failed:'0'});return state;
  };
  await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');await page.type('#identifier','0911111199');await page.type('#password','synthetic-photo-only-pass');await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
  await open(0);const nine=await inspect(9);
  failFirst=true;await open(1);await page.waitForFunction(()=>document.querySelector('[data-failed-photo-count]')?.getAttribute('data-failed-photo-count')==='1');expect(await page.$eval('[data-loaded-photo-count]',(el:Element)=>el.getAttribute('data-loaded-photo-count'))).toBe('0');
  failFirst=false;await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-imported-photo-count]');const ten=await inspect(10);expect(page.url()).toContain('source='+leadIDs[1]);expect(errors).toEqual([]);
  console.log(JSON.stringify({syntheticLocalOnly:true,nine,ten,failedLinkVerified:true,reloadSourceIdPreserved:true,productionWrites:0,realSourcePhotoDownloads:0}));
 },60000);
});
