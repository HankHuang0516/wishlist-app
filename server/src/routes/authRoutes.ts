import { Router, Request, Response, NextFunction } from 'express';
import { register, login, forgotPassword, verifyOtp, resetPassword, verifyEmail, resendVerificationEmail } from '../controllers/authController';
import { registerLimiter, loginLimiter, securityLimiter } from '../middleware/rateLimiter';
import { securityBody } from '../lib/accountSecurityRules';

const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
const bodyGuard = (...fields: string[]) => (req: Request, res: Response, next: NextFunction) => {
    try { securityBody(req.body, fields); next(); }
    catch { res.status(400).json({ error: 'Invalid authentication payload', errorCode: 'MISSING_FIELDS' }); }
};

router.post('/register', registerLimiter, bodyGuard('phoneNumber', 'password', 'name', 'birthday', 'email'), register);
router.post('/login', loginLimiter, bodyGuard('phoneNumber', 'password'), login);
router.post('/forgot-password', securityLimiter, bodyGuard('email'), forgotPassword);
router.post('/verify-otp', securityLimiter, bodyGuard('phoneNumber', 'otp'), verifyOtp);
router.post('/verify-email', securityLimiter, bodyGuard('token'), verifyEmail);
router.post('/reset-password', securityLimiter, bodyGuard('token', 'newPassword'), resetPassword);
router.post('/resend-verification', securityLimiter, bodyGuard('email'), resendVerificationEmail);

export default router;
