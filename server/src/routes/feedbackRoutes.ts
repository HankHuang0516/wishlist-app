import express from 'express';
import { optionalAuthenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { createFeedback, getFeedbackReceipt } from '../controllers/feedbackController';
import { authenticateEmailDiagnostics, getEmailDiagnosticsCapability, requireEmailDiagnosticsAdmission, sendEmailDiagnostic } from '../controllers/emailDiagnosticsController';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Allow anonymous feedback, but track user if logged in
router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/submissions/:clientSubmissionId', optionalAuthenticateToken, getFeedbackReceipt);
router.post('/', optionalAuthenticateToken, createFeedback);

// Operator admission is server-owned; public feedback above stays unchanged.
const diagnosticLimit = rateLimit({ windowMs: 60000, limit: 1, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => String((req as AuthRequest).user!.id),
    message: { errorCode: 'EMAIL_DIAGNOSTICS_RATE_LIMIT' } });
router.get('/test', authenticateEmailDiagnostics, getEmailDiagnosticsCapability);
router.post('/test', authenticateEmailDiagnostics, requireEmailDiagnosticsAdmission, diagnosticLimit, sendEmailDiagnostic);

export default router;
