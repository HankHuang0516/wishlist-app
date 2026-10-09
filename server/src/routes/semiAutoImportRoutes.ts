import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { ImportError, PendingImportStore } from '../lib/semiAutoImport';

// Authenticate and bound request frequency BEFORE parsing a large admin upload.
// This does not enlarge the ordinary public API's 1 MiB request limit.
export const pendingImportBodyAdmission=(getCredential:()=>unknown=()=>process.env.ADMIN_API_KEY)=>[
    marketplaceAdmin(getCredential),rateLimit({windowMs:60000,limit:30}),express.json({limit:'16mb'})
];

// Uses the existing administrator permission. No credentials in URL, no DB writes,
// no source fetches and no implicit publication or canonical archive replacement.
export function createSemiAutoImportRoutes(getCredential:()=>unknown=()=>process.env.ADMIN_API_KEY,
    root=path.resolve(process.cwd(),'public/uploads/.source-sync-receipts/.pending-import')) {
    const router=Router();
    router.use(marketplaceAdmin(getCredential));
    router.use((_q,r,n)=>{r.set('Cache-Control','private, no-store');n();});
    const pendingStore=new PendingImportStore(root);
    const store=()=>{if(!fs.existsSync(root)){const parent=path.dirname(root),s=fs.lstatSync(parent);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(parent)!==parent||(s.mode&0o777)!==0o700||s.uid!==(process.getuid?.() ?? -1))throw new ImportError('PRIVATE_STORE_REQUIRED');fs.mkdirSync(root,{mode:0o700});}return pendingStore;};
    const fail=(res:import('express').Response,e:unknown)=>{const code=e instanceof ImportError?e.message:'PENDING_IMPORT_UNAVAILABLE';return res.status(code.includes('CONFLICT')||code==='WRITER_BUSY'?409:e instanceof ImportError?400:503).json({errorCode:code});};
    router.post('/',(req,res)=>{try{const b=req.body;if(!b||Object.keys(b).some(k=>!['text','format','base'].includes(k)))throw new ImportError('INVALID_REQUEST');return res.status(201).json(store().create(b.text,b.format,b.base));}catch(e){return fail(res,e);}});
    router.get('/:id',(req,res)=>{try{return res.json(store().page(String(req.params.id),req.query.cursor===undefined?0:Number(req.query.cursor),req.query.limit===undefined?100:Number(req.query.limit)));}catch(e){return fail(res,e);}});
    router.post('/:id/advance',(req,res)=>{try{const b=req.body;if(!b||Object.keys(b).some(k=>!['revision','base','batchSize'].includes(k)))throw new ImportError('INVALID_REQUEST');return res.json(store().advance(String(req.params.id),b.revision,b.base,b.batchSize));}catch(e){return fail(res,e);}});
    router.post('/:id/cancel',(req,res)=>{try{const b=req.body;if(!b||Object.keys(b).join(',')!=='revision')throw new ImportError('INVALID_REQUEST');return res.json(store().cancel(String(req.params.id),b.revision));}catch(e){return fail(res,e);}});
    router.post('/:id/review',(req,res)=>{try{const b=req.body;if(!b||Object.keys(b).some(k=>!['revision','base','decisions'].includes(k)))throw new ImportError('INVALID_REQUEST');return res.json(store().review(String(req.params.id),b.revision,b.base,b.decisions));}catch(e){return fail(res,e);}});
    router.post('/:id/export',(req,res)=>{try{const b=req.body;if(!b||Object.keys(b).some(k=>!['revision','base'].includes(k)))throw new ImportError('INVALID_REQUEST');return res.json(store().export(String(req.params.id),b.revision,b.base));}catch(e){return fail(res,e);}});
    return router;
}
