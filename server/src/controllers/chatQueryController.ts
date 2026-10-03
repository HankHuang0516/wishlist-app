import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import {parseConsignmentQuery,consignmentEligible,consignmentMatches,consignmentResult} from '../lib/consignmentQuery';
export async function queryMyChats(req:AuthRequest,res:Response){
 if(!req.user)return res.status(401).json({error:'請先登入'});
 let input;try{input=parseConsignmentQuery(req.body);}catch{return res.status(400).json({errorCode:'INVALID_CONSIGNMENT_QUERY',error:'只接受代售商品名稱或商品 ID 問題，不能指定帳號或類型。'});}
 try{
  const userId=req.user.id;
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SET TRANSACTION READ ONLY`;
   // No native Listing/Conversation access; source relation and current owner
   // are fixed by the server, regardless of query text or guessed object IDs.
   const rows=await tx.sourceLeadInquiry.findMany({where:{buyerUserId:userId,...(input.ids.length?{leadId:{in:input.ids}}:input.archiveId?{lead:{archiveItemId:input.archiveId}}:{})},include:{lead:true},orderBy:{id:'asc'},take:2001});
   const eligible=rows.slice(0,2000).filter(r=>consignmentEligible(r)&&consignmentMatches(r,input));
   return {items:eligible.slice(0,25).map(consignmentResult),truncated:rows.length>2000||eligible.length>25};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
  return res.json({...result,query:input.query,scope:'OWN_ARCHIVED_AGENT_PROXY_INQUIRIES',modelUsed:false,ambiguous:result.items.length>1,notice:'僅已歸檔、具代理詢問及逐次同意綁定的來源商品；自刊商品排除。沒有結構化面交紀錄時保持未知，不從聊天猜測確認。'});
 }catch{return res.status(503).json({errorCode:'CONSIGNMENT_QUERY_UNAVAILABLE',error:'查詢未完成，不能當作沒有紀錄。'});}
}
