import express, { RequestHandler } from 'express';
import request from 'supertest';
import { once } from 'node:events';
import { accountReadBudget, websiteRateLimits } from '../middleware/websiteRateLimits';
const auth: RequestHandler = (req, res, next) => {
  if (req.headers.authorization !== 'Bearer synthetic-verified') { res.status(401).json({errorCode:'INVALID_TOKEN'}); return; }
  (req as typeof req & {user:{id:number}}).user={id:42}; next();
};
it('public saturation cannot block verified reads; forged credentials cannot borrow the budget; writes stay limited', async () => {
 const app=express();app.use(accountReadBudget(auth));app.use(...websiteRateLimits('/missing-build'));
 app.use((_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 try {
  for(let i=0;i<500;i++)expect((await request(server).get('/api/source-leads')).status).toBe(200);
  expect((await request(server).get('/partners')).status).toBe(429);
  expect((await request(server).get('/api/users/me').set('Authorization','Bearer forged')).status).toBe(401);
  const account=await request(server).get('/api/users/me').set('Authorization','Bearer synthetic-verified');
  expect(account.status).toBe(200);expect(account.headers['ratelimit-remaining']).toBe('499');
  expect((await request(server).post('/api/users/me').set('Authorization','Bearer synthetic-verified')).status).toBe(429);
  for(let i=0;i<498;i++)expect((await request(server).get('/api/users/me').set('Authorization','Bearer synthetic-verified')).status).toBe(200);
  const blocked=await request(server).get('/api/users/me').set('Authorization','Bearer synthetic-verified');
  expect(blocked.status).toBe(429);expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},20000);

it('bounds the verified user across IPs while retaining Retry-After', async () => {
 const app=express();app.set('trust proxy',1);app.use(accountReadBudget(auth));app.use((_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  for(let i=0;i<500;i++)expect((await request(server).get('/api/users/me').set('Authorization','Bearer synthetic-verified').set('X-Forwarded-For','192.0.2.1')).status).toBe(200);
  const blocked=await request(server).get('/api/users/me').set('Authorization','Bearer synthetic-verified').set('X-Forwarded-For','192.0.2.2');
  expect(blocked.status).toBe(429);expect(blocked.body.errorCode).toBe('ACCOUNT_READ_RATE_LIMIT');expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect((await request(server).get('/api/users/me').set('Authorization','Bearer forged').set('X-Forwarded-For','192.0.2.2')).status).toBe(401);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},20000);
