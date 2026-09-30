jest.mock('../lib/emailService',()=>({sendEmail:jest.fn(async()=>({success:false}))}));
import express from 'express';import request from 'supertest';import prisma from '../lib/prisma';import partners from '../routes/partnerInquiryRoutes';import {createFeedback} from '../controllers/feedbackController';import {sendEmail} from '../lib/emailService';
const run=process.env.INTAKE_TEST_DB==='1'?describe:describe.skip;
run('isolated DB intake contracts',()=>{
 const app=express();app.use(express.json());app.use('/partner',partners);app.post('/feedback',createFeedback);
 const id='11111111-1111-4111-8111-111111111111';const body={clientSubmissionId:id,organization:'測試商家不計入合作',contactName:'測試窗口',contactEmail:'fixture@example.invalid',categories:['BOOKS'],updateMethod:'MANUAL',contactConsent:true};
 beforeAll(async()=>{if(!String(process.env.DATABASE_URL).includes('55487/wishlist_intake_test'))throw new Error('isolated DB required');});
 afterAll(async()=>{await prisma.$disconnect();});
 test('partner persisted with trace ID despite mail failure; retry one row one mail',async()=>{
 const first=await request(app).post('/partner').send(body);expect(first.status).toBe(201);expect(first.body.notificationStatus).toBe('FAILED');const repeated=await request(app).post('/partner').send(body);expect(repeated.body.inquiryId).toBe(first.body.inquiryId);expect(await prisma.partnerInquiry.count()).toBe(1);expect((sendEmail as jest.Mock).mock.calls.length).toBe(1);
 });
 test('changed duplicate rejected; original retained',async()=>{const r=await request(app).post('/partner').send({...body,message:'changed'});expect(r.status).toBe(409);expect(await prisma.partnerInquiry.count()).toBe(1);});
 test('anonymous feedback persists without AI and HTML is escaped',async()=>{const r=await request(app).post('/feedback').send({clientSubmissionId:'22222222-2222-4222-8222-222222222222',email:'fixture@example.invalid',content:'<script>test</script>'});expect(r.status).toBe(201);expect(r.body.aiAnalysis).toBe('');const record=await prisma.feedback.findFirst();expect(record?.userId).toBeNull();expect(record?.contactEmail).toBe('fixture@example.invalid');expect(r.body.inquiryId).toBeTruthy();expect((sendEmail as jest.Mock).mock.calls.slice(-1)[0][2]).toContain('&lt;script&gt;');});
});
