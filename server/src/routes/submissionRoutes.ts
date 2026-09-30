import {Router} from 'express';
import prisma from '../lib/prisma';
import {marketplaceAdmin} from '../middleware/marketplaceAdmin';
import {validSubmissionId} from '../lib/submissionReceipt';
const router=Router();
router.use(marketplaceAdmin(()=>process.env.ADMIN_API_KEY));
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/',async(req,res)=>{try {
 const cursor=req.query.cursor;
 if(cursor !== undefined && !validSubmissionId(cursor)) return res.status(400).json({error:'分頁識別碼不正確'});
 const items=await prisma.submissionReceipt.findMany({orderBy:[{createdAt:'desc'},{id:'desc'}],take:101,...(cursor ? {cursor:{id:String(cursor)},skip:1}: {})});
 const page=items.slice(0,100);return res.json({items:page,nextCursor:items.length>100 ? page[99].id : null});
}catch{return res.status(503).json({error:'收件清單暫時無法讀取'});}});
router.get('/:id',async(req,res)=>{try {
 if(!validSubmissionId(req.params.id))return res.status(404).json({error:'收件不存在'});
 const receipt=await prisma.submissionReceipt.findUnique({where:{id:String(req.params.id)}});
 if(!receipt)return res.status(404).json({error:'收件不存在'});
 const record=receipt.kind==='PARTNER' ? await prisma.partnerInquiry.findUnique({where:{id:receipt.recordId}}) : await prisma.feedback.findUnique({where:{id:Number(receipt.recordId)},include:{user:{select:{id:true,email:true,name:true}}}});
 return res.json({receipt,record});
}catch{return res.status(503).json({error:'收件暫時無法讀取'});}});
export default router;
