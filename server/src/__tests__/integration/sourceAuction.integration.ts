import express from 'express';
import {randomUUID} from 'crypto';
import prisma from '../../lib/prisma';
import {createSourceLeadAdmin,createSourceLeadRoutes} from '../../routes/sourceLeadRoutes';
import {createLoopbackRequest} from './loopbackHttp';
import {auctionFixture} from '../fixtures/officialAuctionFixture';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if(process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL)throw Error('Isolated DB required');
const app=express();app.use(express.json());const key='synthetic-auction-admin';
app.use('/api/source-lead-admin',createSourceLeadAdmin(()=>key));app.use('/api/source-leads',createSourceLeadRoutes());
const http=createLoopbackRequest(app),ids:string[]=[];const prior=process.env.SOURCE_LEADS_PUBLIC_ENABLED;
beforeAll(()=>{process.env.SOURCE_LEADS_PUBLIC_ENABLED='1';});
afterAll(async()=>{await prisma.externalSourceLead.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();if(prior===undefined)delete process.env.SOURCE_LEADS_PUBLIC_ENABLED;else process.env.SOURCE_LEADS_PUBLIC_ENABLED=prior;});
it('real isolated DB/admin/public roundtrip preserves null original dates and expiry',async()=>{
 const body=auctionFixture(),dry=await http.post('/api/source-lead-admin/import').set('x-admin-key',key).send({items:[body],dryRun:true});expect(dry.status).toBe(200);expect(dry.body).toMatchObject({validatedCount:1,persistedCount:0,qualifiedSupplyCount:0});
 const apply=await http.post('/api/source-lead-admin/import').set('x-admin-key',key).send({items:[body],dryRun:false});expect(apply.status).toBe(200);ids.push(...apply.body.ids);
 const stored=await prisma.externalSourceLead.findUniqueOrThrow({where:{id:ids[0]}});expect(stored.postedEarliestAt).toBeNull();expect(stored.postedLatestAt).toBeNull();
 const read=await http.get('/api/source-leads/'+ids[0]+'?presentation=1&photos=2&approximate=1');expect(read.status).toBe(200);expect(read.body).toMatchObject({dateBasis:'ACTIVE_AUCTION_WINDOW',postedEarliestAt:null,postedLatestAt:null,originalPublishedAt:null,stockStatus:'UNKNOWN',qualifiedSupply:false,checkoutEnabled:false});
 const e:any=stored.evidence;e.officialAuction.activeAuctionWindow.endsAt=new Date(Date.now()-1000).toISOString();
 await prisma.externalSourceLead.update({where:{id:ids[0]},data:{evidence:e}});
 expect((await http.get('/api/source-leads/'+ids[0]+'?presentation=1')).status).toBe(404);
});
it('DB CHECK rejects legacy null original dates and mixed auction dates',async()=>{
 const b=auctionFixture();const {parseLead}=require('../../lib/sourceLeadRules');const row=parseLead(b);const {officialAuction,...legacyEvidence}=b.evidence;
 for(const data of [{...row,id:randomUUID(),archiveItemId:b.archiveItemId+'-legacy',evidence:legacyEvidence},{...row,id:randomUUID(),archiveItemId:b.archiveItemId+'-mixed',postedEarliestAt:new Date()}]){
  await expect(prisma.externalSourceLead.create({data})).rejects.toThrow();
 }
});
