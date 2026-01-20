import { Router } from 'express';
import { register, login, forgotPassword, verifyOtp, resetPassword, verifyEmail, resendVerificationEmail } from '../controllers/authController';
import { registerLimiter, loginLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/verify-email', verifyEmail);
router.post('/reset-password', resetPassword);
router.post('/resend-verification', resendVerificationEmail);

export default router;
