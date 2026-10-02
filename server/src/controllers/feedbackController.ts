import {randomUUID} from 'node:crypto';
import {isReplyMailbox} from '../lib/emailAddress';
import {Request, Response} from 'express';
import {receiveSubmission,validSubmissionId,SubmissionConflict,submissionRequestHash} from '../lib/submissionReceipt';
import prisma from '../lib/prisma';
const noStore=(res:Response)=>res.set('Cache-Control','private, no-store');
const envelope=(receipt:{id:string;clientSubmissionId:string;requestHash:string;notificationStatus:string})=>({received:true,clientSubmissionId:receipt.clientSubmissionId,requestHash:receipt.requestHash,inquiryId:receipt.id,notificationStatus:receipt.notificationStatus});
export const getFeedbackReceipt=async(req:Request & {user?:any},res:Response)=>{
 noStore(res);
 const id=req.params.clientSubmissionId,hash=req.get('X-Submission-Hash');
 if(!validSubmissionId(id)||!hash||!/^[a-f0-9]{64}$/.test(hash))return res.status(400).json({errorCode:'INVALID_SUBMISSION_QUERY'});
 try{
  const receipt=await prisma.submissionReceipt.findUnique({where:{clientSubmissionId:id}});
  if(!receipt||receipt.kind!=='FEEDBACK'||receipt.requestHash!==hash||!/^\d+$/.test(receipt.recordId)||!Number.isSafeInteger(Number(receipt.recordId))||Number(receipt.recordId)<1)return res.status(404).json({errorCode:'SUBMISSION_UNCONFIRMED'});
  const record=await prisma.feedback.findUnique({where:{id:Number(receipt.recordId)},select:{userId:true}});
  // No content, email, owner ID, provider ID or raw diagnostics in a receipt.
  if(!record||record.userId!==(req.user?.id??null))return res.status(404).json({errorCode:'SUBMISSION_UNCONFIRMED'});
  return res.json(envelope(receipt));
 }catch{return res.status(503).json({errorCode:'SUBMISSION_UNCONFIRMED'});}
};
export const createFeedback = async(req:Request & {user?:any},res:Response) => {
 noStore(res);
 const {content,email}=req.body ?? {};
 const clientSubmissionId=req.body?.clientSubmissionId ?? randomUUID();
 if(typeof content !== 'string' || !content.trim() || content.length>5000 || !validSubmissionId(clientSubmissionId)) return res.status(400).json({error:'請提供內容與有效收件識別碼'});
 const userId=req.user?.id ?? null;
 if(!userId && !isReplyMailbox(email)) return res.status(400).json({error:'請提供回覆用 Email'});
 const payload={content:content.trim(),userId,contactEmail:userId ? null : email.trim().toLowerCase()};
 const requestHash=submissionRequestHash('FEEDBACK',payload);
 if(req.body?.requestHash!==undefined&&req.body.requestHash!==requestHash)return res.status(400).json({errorCode:'SUBMISSION_HASH_MISMATCH'});
 try {
  const receipt=await receiveSubmission('FEEDBACK',clientSubmissionId,payload,async tx=>String((await tx.feedback.create({data:payload})).id),`回饋內容：${payload.content}\n回覆窗口：${payload.contactEmail ?? '登入帳號（從管理端查閱）'}`, payload.contactEmail ?? undefined);
  return res.status(201).json({...envelope(receipt),message:'已保存，請保留收件編號。我們會由人工查閱與回覆。',aiAnalysis:''});
 } catch(error) {
  return res.status(error instanceof SubmissionConflict ? 409 : 503).json({error:error instanceof SubmissionConflict ? '同一識別碼內容不同' : '未能確認收件，請保留原內容與識別碼再試'});
 }
};
