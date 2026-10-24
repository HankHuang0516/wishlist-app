import express from 'express';
import request from 'supertest';
import {sourceLeadLimits} from '../middleware/sourceLeadLimits';
const media='/11111111-1111-4111-8111-111111111111/media/22222222-2222-4222-8222-222222222222/thumbnail';
let running:import('http').Server;
beforeEach(async()=>{const a=express();a.use(sourceLeadLimits());a.use((_q,r)=>r.sendStatus(200));running=a.listen(0,'127.0.0.1');await new Promise<void>(resolve=>running.once('listening',resolve));});
afterEach(async()=>{await new Promise<void>((resolve,reject)=>running.close(error=>error?reject(error):resolve()));});
test('120 thumbnail reads cannot consume the public query budget; both budgets still stop abuse',async()=>{
 const a=running;for(let i=0;i<120;i++)expect((await request(a).get(media)).status).toBe(200);
 expect((await request(a).get(media)).status).toBe(429);
 expect((await request(a).get('/?cursor=next')).status).toBe(200);
 expect((await request(a).get('/summary')).status).toBe(200);
 expect((await request(a).post('/11111111-1111-4111-8111-111111111111/inquiry')).status).toBe(200);
});
test('query exhaustion still rejects requests and cannot consume the image budget or bypass inquiry protection',async()=>{
 const a=running;for(let i=0;i<120;i++)expect((await request(a).get('/')).status).toBe(200);
 expect((await request(a).get('/')).status).toBe(429);
 expect((await request(a).post(media)).status).toBe(429);
 expect((await request(a).get(media)).status).toBe(200);
});
