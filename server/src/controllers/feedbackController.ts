import {randomUUID} from 'node:crypto';
import {Request, Response} from 'express';
import {receiveSubmission,validSubmissionId,SubmissionConflict} from '../lib/submissionReceipt';
export const createFeedback = async(req:Request & {user?:any},res:Response) => {
 const {content,email}=req.body ?? {};
 const clientSubmissionId=req.body?.clientSubmissionId ?? randomUUID();
 if(typeof content !== 'string' || !content.trim() || content.length>5000 || !validSubmissionId(clientSubmissionId)) return res.status(400).json({error:'請提供內容與有效收件識別碼'});
 const userId=req.user?.id ?? null;
 if(!userId && (typeof email !== 'string' || email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) return res.status(400).json({error:'請提供回覆用 Email'});
 const payload={content:content.trim(),userId,contactEmail:userId ? null : email.trim().toLowerCase()};
 try {
  const receipt=await receiveSubmission('FEEDBACK',clientSubmissionId,payload,async tx=>String((await tx.feedback.create({data:payload})).id),`回饋內容：${payload.content}\n回覆窗口：${payload.contactEmail ?? '登入帳號（從管理端查閱）'}`);
  return res.status(201).json({message:'已保存，請保留收件編號。我們會由人工查閱與回覆。',inquiryId:receipt.id,notificationStatus:receipt.notificationStatus,aiAnalysis:''});
 } catch(error) {
  return res.status(error instanceof SubmissionConflict ? 409 : 503).json({error:error instanceof SubmissionConflict ? '同一識別碼內容不同' : '未能確認收件，請保留原內容與識別碼再試'});
 }
};
