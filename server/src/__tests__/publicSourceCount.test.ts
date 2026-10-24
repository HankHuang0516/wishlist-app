jest.mock('../lib/prisma', () => ({ __esModule: true, default: { externalSourceLead: { findMany: jest.fn() } } }));
import express from 'express';
import request from 'supertest';
import prisma from '../lib/prisma';
import { createSourceLeadRoutes } from '../routes/sourceLeadRoutes';
import { parseLead } from '../lib/sourceLeadRules';
const now = new Date('2026-10-24T00:00:00Z');
const facts=()=>({canonicalUrl:'https://www.facebook.com/groups/123456789/posts/123456789',title:'合成來源測試用品',summary:'合成測試來源；库存與交易待確認。',county:'臺南市',district:'永康區',publicPlaceName:'合成公共面交點',publicAddress:'臺南市永康區合成路123號',latitude:23,longitude:120.236,postedEarliestAt:'2026-10-01T01:00:00Z',postedLatestAt:'2026-10-01T02:00:00Z',checkedAt:'2026-10-24T00:00:00Z',evidence:{sourceUrl:'https://www.facebook.com/groups/123456789/posts/123456789',sourcePublic:true,publicSourceRef:'source:synthetic-public',dateRef:'source:synthetic-date',locationRef:'source:synthetic-place',coordinateRef:'source:synthetic-coordinate',locationSourceUrl:'https://public.example.invalid/place/qa',coordinateSourceUrl:'https://public.example.invalid/map/qa',publicPlace:true,locationType:'PUBLIC_MEETING_POINT',sourceMeetingPointConfirmed:true,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,sourceCheckRef:'source:synthetic-source-check',reviewRef:'review:synthetic-approved'}});
const row = () => ({...parseLead({...facts(), archiveItemId:'SYNTHETIC-COUNT-1', libraryFileId:null, archiveVersion:null, archiveSha256:null},now,true), id:'00000000-0000-4000-8000-000000000001', status:'PUBLISHED', recordOrigin:'DB_MASTER', sourceClaimState:'UNKNOWN'});
let app:express.Express;
beforeEach(() => { jest.useFakeTimers({doNotFake:['nextTick','setImmediate']}).setSystemTime(now); process.env.SOURCE_LEADS_PUBLIC_ENABLED='1'; app=express(); app.use('/api/source-leads',createSourceLeadRoutes()); });
afterEach(() => { jest.useRealTimers(); delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; jest.resetAllMocks(); });
test('counts actual public eligibility and never returns private fields or pending/sold/invalid rows', async () => {
 const good=row(); (prisma.externalSourceLead.findMany as jest.Mock).mockResolvedValue([good,{...good,status:'PRIVATE_PENDING'},{...good,status:'WITHDRAWN'},{...good,sourceClaimState:'SOLD'},{...good,contentHash:'bad'},{...good,recordOrigin:'ARCHIVE',libraryFileId:'libfile_'+'a'.repeat(32),archiveVersion:1,archiveSha256:'b'.repeat(64),checkedAt:new Date('2026-10-01T00:00:00Z')}]);
 const r=await request(app).get('/api/source-leads/summary'); expect(r.status).toBe(200); expect(r.body).toEqual({count:1,enabled:true}); expect(r.headers['cache-control']).toBe('no-store');
 expect(prisma.externalSourceLead.findMany).toHaveBeenCalledWith({where:{status:'PUBLISHED'}});
});
test('zero and disabled have explicit numeric results, with no query when disabled',async()=>{
 (prisma.externalSourceLead.findMany as jest.Mock).mockResolvedValue([]); expect((await request(app).get('/api/source-leads/summary')).body).toEqual({count:0,enabled:true});
 (prisma.externalSourceLead.findMany as jest.Mock).mockClear(); process.env.SOURCE_LEADS_PUBLIC_ENABLED='0'; expect((await request(app).get('/api/source-leads/summary')).body).toEqual({count:0,enabled:false}); expect(prisma.externalSourceLead.findMany).not.toHaveBeenCalled();
});
test('database failure is unavailable, never a successful zero',async()=>{
 (prisma.externalSourceLead.findMany as jest.Mock).mockRejectedValue(Error('synthetic read failure')); const r=await request(app).get('/api/source-leads/summary'); expect(r.status).toBe(503); expect(r.body).toEqual({errorCode:'SOURCE_LEAD_UNAVAILABLE'});
});
test('rejects filters rather than mislabelling a partial count as site-wide',async()=>{expect((await request(app).get('/api/source-leads/summary?q=one')).status).toBe(409);expect(prisma.externalSourceLead.findMany).not.toHaveBeenCalled();});

test('counts multiple items from one URL and contact-only references without inventing a map point', async () => {
 const good=row(),base=facts();
 const contact={...good,...parseLead({...base,title:'合成無地區用品',archiveItemId:'SYNTHETIC-COUNT-2',libraryFileId:null,archiveVersion:null,archiveSha256:null,county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,evidence:{sourceUrl:base.canonicalUrl,sourcePublic:true,publicSourceRef:'review:synthetic-public',dateRef:'review:synthetic-date',publicPlace:false,locationType:'SELLER_CONTACT_REQUIRED',sourceMeetingPointConfirmed:false,independentlyReviewed:true,selfWrittenSummary:true,noCopiedTextOrImages:true,noPrivateData:true,reviewRef:'review:synthetic',sourceCheckRef:'source:synthetic-check'}},now,true)};
 (prisma.externalSourceLead.findMany as jest.Mock).mockResolvedValue([good,contact]);expect((await request(app).get('/api/source-leads/summary')).body).toEqual({count:2,enabled:true});
});
