import {Router,Request,Response,NextFunction} from 'express';
import express from 'express';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import {adminHeaderAdmission} from '../lib/adminAdmission';
import {getClientUrl} from '../config/constants';
import {createSourceLeadRecordRoutes} from './sourceLeadRecordRoutes';
const NAME='__Host-wl-source-manager';
export const MANAGER_LIFETIME_MS=90*24*60*60*1000;
const scope='SOURCE_DRAFT_EDITOR';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const mac=(key:string,purpose:string,nonce:string)=>createHmac('sha256',key).update('wishlist/source-manager/v1/'+purpose+'/'+nonce).digest('base64url');
const equal=(a:unknown,b:string)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
function cookie(req:Request){const parts=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(NAME+'='));return parts.length===1?parts[0].slice(NAME.length+1):null;}
const options={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
export function createSourceManagerRoutes(getKey:()=>unknown=()=>process.env.ADMIN_API_KEY,getOrigin:()=>string=()=>new URL(getClientUrl()).origin){
 const router=Router();
 router.use((_q,r,n)=>{r.set('Cache-Control','private, no-store');r.set('Pragma','no-cache');n();});
 // Mounted before global CORS/body parsing. Exact origin is mandatory for writes,
 // including login; no supplied header or query can choose the trusted origin.
 router.use((q,r,n)=>{let origin:string;try{origin=getOrigin();const u=new URL(origin);if(u.origin!==origin||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw Error();}catch{return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});}
  if(Object.keys(q.query).some(k=>/key|password|credential|token/i.test(k)))return r.status(400).json({errorCode:'MANAGER_URL_CREDENTIAL_REJECTED'});
  if(q.headers['sec-fetch-site']==='cross-site'||q.headers.origin!==undefined&&q.headers.origin!==origin||!['GET','HEAD'].includes(q.method)&&q.headers.origin!==origin)return r.status(403).json({errorCode:'MANAGER_ORIGIN_DENIED'});
  if(q.method==='OPTIONS')return r.sendStatus(403);n();
 });
 router.use(express.json({limit:'32kb'}));
 router.use((err:any,_q:Request,r:Response,_n:NextFunction)=>r.status(400).json({errorCode:err?.type==='entity.too.large'?'MANAGER_BODY_TOO_LARGE':'MANAGER_BODY_INVALID'}));
 router.post('/session',rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false}),async(q,r)=>{
  try{const key=getKey();if(!q.is('application/json')||!q.body||Object.keys(q.body).join(',')!=='managementPassword')return r.status(400).json({errorCode:'MANAGER_LOGIN_INVALID'});
   const admission=adminHeaderAdmission(key,q.body.managementPassword);
   // Discard the credential immediately; neither response nor stored row contains it.
   delete q.body.managementPassword;
   if(admission!=='AUTHORIZED')return r.status(admission==='DISABLED'?503:401).json({errorCode:'MANAGER_LOGIN_DENIED'});
   const nonce=randomBytes(32).toString('base64url'),value=nonce+'.'+mac(key as string,'cookie',nonce),expiresAt=new Date(Date.now()+MANAGER_LIFETIME_MS);
   await prisma.sourceManagerSession.create({data:{tokenHash:hash(value),scope,expiresAt}});
   r.cookie(NAME,value,{...options,maxAge:MANAGER_LIFETIME_MS});
   return r.json({scope,expiresAt,csrfToken:mac(key as string,'csrf',nonce),publishAllowed:false});
  }catch{return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});}
 });
 router.use(async(q,r,n)=>{
  try{const key=getKey(),value=cookie(q);if(typeof key!=='string'||!key)return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});
   if(!value||!/^[-_A-Za-z0-9]{43}\.[-_A-Za-z0-9]{43}$/.test(value))return r.status(401).json({errorCode:'MANAGER_SESSION_REQUIRED'});
   const [nonce,proof]=value.split('.');
   // The existing current key authenticates this opaque token. Key rotation
   // invalidates old cookies; no key/fingerprint is stored in the session table.
   if(!equal(proof,mac(key,'cookie',nonce)))return r.status(401).json({errorCode:'MANAGER_SESSION_INVALID'});
   const s=await prisma.sourceManagerSession.findUnique({where:{tokenHash:hash(value)}});
   if(!s||s.revokedAt||s.expiresAt<=new Date()||s.scope!==scope)return r.status(401).json({errorCode:'MANAGER_SESSION_INVALID'});
   if(!['GET','HEAD'].includes(q.method)&&(!q.is('application/json')||!equal(q.headers['x-csrf-token'],mac(key,'csrf',nonce))))return r.status(403).json({errorCode:'MANAGER_CSRF_DENIED'});
   r.locals.manager={id:s.id,expiresAt:s.expiresAt,csrfToken:mac(key,'csrf',nonce)};n();
  }catch{return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});}
 });
 router.use(rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false}));
 router.get('/session',(_q,r)=>r.json({...r.locals.manager,scope,publishAllowed:false}));
 router.post('/logout',async(_q,r)=>{try{await prisma.sourceManagerSession.update({where:{id:r.locals.manager.id},data:{revokedAt:new Date()}});r.clearCookie(NAME,options);return r.sendStatus(204);}catch{return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});}});
 router.post('/revoke-all',async(_q,r)=>{try{await prisma.sourceManagerSession.updateMany({where:{scope,revokedAt:null},data:{revokedAt:new Date()}});r.clearCookie(NAME,options);return r.sendStatus(204);}catch{return r.status(503).json({errorCode:'MANAGER_UNAVAILABLE'});}});
 router.use('/records',createSourceLeadRecordRoutes({draftOnly:true}));
 return router;
}
