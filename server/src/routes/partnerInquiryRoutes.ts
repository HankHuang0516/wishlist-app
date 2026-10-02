import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { receiveSubmission, validSubmissionId, SubmissionConflict, submissionRequestHash } from '../lib/submissionReceipt';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { parsePartnerInquiry, PartnerInquiryInputError } from '../lib/partnerInquiry';
import { isListingId } from '../lib/listingRules';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Public submission recovery is a capability read: original random ID and
// canonical hash are both required. It never returns contact or inquiry text.
router.get('/submissions/:clientSubmissionId', async (req,res) => {
 res.set('Cache-Control','private, no-store');
 const id=req.params.clientSubmissionId,hash=req.get('X-Submission-Hash');
 if(!validSubmissionId(id)||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||Object.keys(req.query).length)
  return res.status(400).json({errorCode:'INVALID_SUBMISSION_QUERY'});
 try{
  const receipt=await prisma.submissionReceipt.findUnique({where:{clientSubmissionId:id}});
  if(!receipt||receipt.kind!=='PARTNER'||receipt.requestHash!==hash||!validSubmissionId(receipt.recordId)||
   !await prisma.partnerInquiry.findUnique({where:{id:receipt.recordId},select:{id:true}}))
   return res.status(404).json({errorCode:'SUBMISSION_UNCONFIRMED'});
  if(!['PENDING','UNKNOWN','ACCEPTED','FAILED'].includes(receipt.notificationStatus))
   return res.status(503).json({errorCode:'SUBMISSION_UNCONFIRMED'});
  return res.json({received:true,clientSubmissionId:id,requestHash:hash,inquiryId:receipt.id,notificationStatus:receipt.notificationStatus});
 }catch{return res.status(503).json({errorCode:'SUBMISSION_UNCONFIRMED'});}
});
const publicLimit = rateLimit({ windowMs: 60 * 60_000, limit: 3, standardHeaders: true,
    legacyHeaders: false, message: { error: '合作意向送出過於頻繁，請稍後再試' } });
router.post('/', publicLimit, async (req, res) => {
 try {
  const {clientSubmissionId, requestHash, ...body} = req.body ?? {};
  if(!validSubmissionId(clientSubmissionId)) return res.status(400).json({error:'收件識別碼不正確'});
  const parsed = parsePartnerInquiry(body);
  if(parsed.isHoneypot) return res.status(202).json({received:false});
  const {isHoneypot:_ignored,...data}=parsed;
  if(requestHash!==undefined&&(typeof requestHash!=='string'||!/^[a-f0-9]{64}$/.test(requestHash)||requestHash!==submissionRequestHash('PARTNER',data)))
   return res.status(400).json({errorCode:'INVALID_SUBMISSION_HASH'});
  const receipt=await receiveSubmission('PARTNER',clientSubmissionId,data,async tx => {
   const record=await tx.partnerInquiry.create({data:{...data,contactConsentAt:new Date()}});return record.id;
  },`商家：${data.organization}\n聯絡：${data.contactName} (${data.contactEmail})\n${data.message ?? ''}\n此意向不構成圖文授權，請以收件編號從管理端查閱。`, data.contactEmail);
  return res.status(201).json({received:true,clientSubmissionId,requestHash:receipt.requestHash,inquiryId:receipt.id,notificationStatus:receipt.notificationStatus});
 } catch(error) {
  if(error instanceof SubmissionConflict) return res.status(409).json({error:'同一收件識別碼的內容不同，請勿覆寫先前提交'});
  if(error instanceof PartnerInquiryInputError) return res.status(400).json({error:error.message,field:error.field});
  return res.status(503).json({error:'未能確認收件，請保留原內容與識別碼再試'});
 }
});

router.get('/', marketplaceAdmin(() => process.env.ADMIN_API_KEY), async (req, res) => {
    try {
        const status = req.query.status;
        if (status !== undefined && !['NEW', 'CONTACTED', 'QUALIFIED', 'DECLINED'].includes(String(status)))
            return res.status(400).json({ error: '狀態不正確' });
        const rows = await prisma.partnerInquiry.findMany({
            where: status ? { status: status as 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DECLINED' } : undefined,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
        });
        return res.json({ items: rows });
    } catch { return res.status(503).json({ error: '合作意向暫時無法讀取' }); }
});

router.patch('/:id/status', marketplaceAdmin(() => process.env.ADMIN_API_KEY), async (req, res) => {
    try {
        if (!isListingId(req.params.id)) return res.status(404).json({ error: '合作意向不存在' });
        if (!req.body || Object.keys(req.body).sort().join(',') !== 'status' ||
            !['CONTACTED', 'QUALIFIED', 'DECLINED'].includes(req.body.status))
            return res.status(400).json({ error: '狀態不正確' });
        const changed = await prisma.partnerInquiry.updateMany({ where: { id: req.params.id },
            data: { status: req.body.status } });
        return changed.count ? res.status(204).send() : res.status(404).json({ error: '合作意向不存在' });
    } catch { return res.status(503).json({ error: '合作意向暫時無法更新' }); }
});

export default router;
