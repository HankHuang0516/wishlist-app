import { createHash } from 'node:crypto';
import prisma from './prisma';
import { sendEmail } from './emailService';
export class SubmissionConflict extends Error {}
export const validSubmissionId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const escapeSubmissionHtml = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function receiveSubmission(kind: 'PARTNER' | 'FEEDBACK', clientSubmissionId: string, payload: unknown, save: (tx: any) => Promise<string>, summary: string) {
 const requestHash = createHash('sha256').update(JSON.stringify({kind,payload})).digest('hex');
 const existing = await prisma.submissionReceipt.findUnique({where:{clientSubmissionId}});
 if (existing) { if(existing.requestHash !== requestHash) throw new SubmissionConflict(); return existing; }
 let receipt;
 try {
  receipt = await prisma.$transaction(async tx => {
   const recordId = await save(tx);
   return tx.submissionReceipt.create({data:{kind,clientSubmissionId,requestHash,recordId}});
  });
 } catch (error: any) {
  if(error?.code !== 'P2002') throw error;
  const duplicate = await prisma.submissionReceipt.findUnique({where:{clientSubmissionId}});
  if(!duplicate || duplicate.requestHash !== requestHash) throw new SubmissionConflict();
  return duplicate;
 }
 // A repeat never sends twice. PENDING/UNKNOWN remain visible for manual reconciliation.
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const sent = await Promise.race([sendEmail('hankhuang0516@gmail.com', kind === 'PARTNER' ? 'Wishlist.ai 合作夥伴新意向' : 'New User Feedback - Wishlist App', `<p>收件編號 ${receipt.id}</p><pre>${escapeSubmissionHtml(summary)}</pre>`), new Promise<null>(resolve => {timer=setTimeout(()=>resolve(null),8000);})]);
  receipt = await prisma.submissionReceipt.update({where:{id:receipt.id},data:{notificationStatus:sent === null ? 'UNKNOWN' : sent.success ? 'ACCEPTED' : 'FAILED',notificationProviderId:sent?.id ?? null,notificationCheckedAt:new Date()}});
 } catch { /* Durable receipt stays PENDING when provider or status persistence is uncertain. */ }
 finally {if(timer) clearTimeout(timer);}
 return receipt;
}
