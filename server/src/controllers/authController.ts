import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

import { getJwtSecret, signUserJwt } from '../lib/jwtConfig';
import { validNewPassword } from '../lib/accountSecurityRules';
import { getClientUrl } from '../config/constants';

// Error codes for API consumers
export const AUTH_ERROR_CODES = {
    // Validation errors (400)
    MISSING_FIELDS: 'MISSING_FIELDS',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    USER_EXISTS: 'USER_EXISTS',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    INVALID_OTP: 'INVALID_OTP',

    // Verification errors (403)
    EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
    EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',

    // Server errors (500)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
} as const;

import { sendEmail } from '../lib/emailService';
import crypto from 'crypto';

export const register = async (req: Request, res: Response) => {
    try {
        getJwtSecret(); // Fail before creating users or sending mail if unconfigured.
        const { phoneNumber, password, name, birthday, email } = req.body; // birthday: YYYY-MM-DD string

        if (!phoneNumber || !password || !email) {
            return res.status(400).json({
                error: 'Phone number, email, and password are required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: [
                    !phoneNumber && 'phoneNumber',
                    !password && 'password',
                    !email && 'email'
                ].filter(Boolean)
            });
        }

        if (typeof phoneNumber !== 'string' || !phoneNumber.trim() || phoneNumber.length > 80 ||
            typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
            (name !== undefined && name !== null && (typeof name !== 'string' || name.length > 50)) ||
            (birthday !== undefined && birthday !== null && typeof birthday !== 'string')) {
            return res.status(400).json({ error: 'Invalid registration fields', errorCode: AUTH_ERROR_CODES.MISSING_FIELDS });
        }

        // Enforce strong password
        if (!validNewPassword(password)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long and contain both letters and numbers.',
                errorCode: AUTH_ERROR_CODES.WEAK_PASSWORD,
                requirements: {
                    minLength: 8,
                    requiresLetter: true,
                    requiresNumber: true,
                    allowedSpecialChars: '@$!%*?&'
                }
            });
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { phoneNumber },
                    { email }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                error: 'User with this phone or email already exists',
                errorCode: AUTH_ERROR_CODES.USER_EXISTS,
                conflictField: existingUser.email === email ? 'email' : 'phoneNumber'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Parse birthday
        let birthdayDate: Date | undefined;
        if (birthday) {
            birthdayDate = new Date(birthday);
            if (isNaN(birthdayDate.getTime())) {
                birthdayDate = undefined; // Or throw error
            }
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const user = await prisma.user.create({
            data: {
                phoneNumber,
                email,
                password: hashedPassword,
                name,
                birthday: birthdayDate,
                isEmailVerified: false,
                emailVerificationToken: verificationToken,
                emailVerificationExpires: verificationExpires
            },
        });

        // Send verification email
        const clientUrl = getClientUrl();
        const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;

        const emailResult = await sendEmail(email, 'Verify your Wishlist Account', `
           <h1>Welcome to Wishlist!</h1>
           <p>Please click the link below to verify your email address:</p>
           <a href="${verifyLink}">${verifyLink}</a>
       `);

        // Return JWT token immediately for AI agent access (User can still verify email later)
        const token = signUserJwt(user);

        res.status(201).json({
            message: emailResult.success ? 'Registration successful. Please check your email to verify your account.' : 'Account created, but verification email delivery failed. Please request another verification email.',
            token,
            user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name },
            emailVerification: {
                required: true,
                sent: emailResult.success === true,
                sentTo: email,
                expiresIn: '24 hours',
                resendEndpoint: '/api/auth/resend-verification'
            }
        });
    } catch (error) {
        console.error('Registration unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        getJwtSecret(); // Do not mutate verification state before config validation.
        const { token } = req.body;

        if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
            return res.status(400).json({
                error: 'Verification token is required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: ['token']
            });
        }

        // First check if token exists (regardless of expiry)
        const userWithToken = await prisma.user.findFirst({
            where: { emailVerificationToken: token }
        });

        if (!userWithToken) {
            return res.status(400).json({
                error: 'Invalid verification token',
                errorCode: AUTH_ERROR_CODES.INVALID_TOKEN,
                hint: 'The token may have already been used or is invalid.'
            });
        }

        // Check if token is expired
        if (!userWithToken.emailVerificationExpires || userWithToken.emailVerificationExpires <= new Date()) {
            return res.status(400).json({
                error: 'Verification token has expired',
                errorCode: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                resendEndpoint: '/api/auth/resend-verification',
                hint: 'Please request a new verification email.'
            });
        }

        const updatedUser = await prisma.$transaction(async tx => {
            const consumed = await tx.user.updateMany({
                where: { id: userWithToken.id, emailVerificationToken: token, emailVerificationExpires: { gt: new Date() } },
                data: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
            });
            return consumed.count === 1 ? tx.user.findUnique({ where: { id: userWithToken.id } }) : null;
        });
        if (!updatedUser) return res.status(400).json({ error: 'Invalid verification token', errorCode: AUTH_ERROR_CODES.INVALID_TOKEN });

        const jwtToken = signUserJwt(updatedUser);

        res.json({
            message: 'Email verified successfully',
            token: jwtToken,
            user: { id: updatedUser.id, phoneNumber: updatedUser.phoneNumber, name: updatedUser.name }
        });

    } catch (error) {
        console.error('Authentication operation unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};


export const login = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber || !password) {
            return res.status(400).json({
                error: 'Phone number/Email and password are required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: [
                    !phoneNumber && 'phoneNumber',
                    !password && 'password'
                ].filter(Boolean)
            });
        }

        if (typeof phoneNumber !== 'string' || phoneNumber.length > 254 || !phoneNumber.trim() || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024 || password.includes('\u0000')) return res.status(400).json({ error: 'Invalid credentials', errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
        // Support login with phone number OR email
        // Determine if input is email (contains @) or phone number
        const isEmail = phoneNumber && phoneNumber.includes('@');

        let user;
        if (isEmail) {
            user = await prisma.user.findFirst({ where: { email: phoneNumber } });
        } else {
            user = await prisma.user.findUnique({ where: { phoneNumber } });
        }

        if (!user) {
            return res.status(400).json({
                error: 'Invalid credentials',
                errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials', errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
        // Check verification only after the password, without a hardcoded bypass.
        // Legacy accounts with no email retain their existing login behavior.
        if (user.email && !user.isEmailVerified) {
            return res.status(403).json({
                error: 'Please verify your email address before logging in.',
                errorCode: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
                email: user.email,
                resendEndpoint: '/api/auth/resend-verification',
                resendPayload: { email: user.email },
                hint: 'Call the resendEndpoint with the resendPayload to request a new verification email.'
            });
        }

        const current = await prisma.user.findFirst({ where: { id: user.id, password: user.password, authVersion: user.authVersion } });
        if (!current) return res.status(401).json({ error: 'Invalid credentials', errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
        const token = signUserJwt(current);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified
            }
        });
    } catch (error) {
        console.error('Login unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
            return res.status(400).json({
                error: 'Email is required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: ['email']
            });
        }

        const user = await prisma.user.findFirst({ where: { email } });

        if (!user) {
            // Don't reveal if user exists for security - but still return success-like response
            return res.json({
                message: 'If this email exists, a reset link has been sent.',
                expiresIn: '1 hour'
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpires: resetExpires
            }
        });

        // Send password reset email
        const clientUrl = getClientUrl();
        const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

        await sendEmail(email, 'Reset your Wishlist Password', `
            <h1>Password Reset Request</h1>
            <p>You requested to reset your password. Click the link below to set a new password:</p>
            <a href="${resetLink}">${resetLink}</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `);

        res.json({
            message: 'If this email exists, a reset link has been sent.',
            expiresIn: '1 hour'
        });
    } catch (error) {
        console.error('Password recovery unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (typeof phoneNumber !== 'string' || !phoneNumber || phoneNumber.length > 80 || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                error: 'Phone number and OTP are required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: [
                    !phoneNumber && 'phoneNumber',
                    !otp && 'otp'
                ].filter(Boolean)
            });
        }

        const user = await prisma.user.findUnique({ where: { phoneNumber } });

        if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires <= new Date()) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                errorCode: AUTH_ERROR_CODES.INVALID_OTP
            });
        }

        const consumed = await prisma.user.updateMany({
            where: { id: user.id, otp, otpExpires: { gt: new Date() } },
            data: { otp: null, otpExpires: null, isPhoneVerified: true },
        });
        if (consumed.count !== 1) return res.status(400).json({ error: 'Invalid or expired OTP', errorCode: AUTH_ERROR_CODES.INVALID_OTP });
        res.json({ message: 'OTP verified' });
    } catch (error) {
        console.error('OTP verification unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
            return res.status(400).json({
                error: 'Email is required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: ['email']
            });
        }

        const user = await prisma.user.findFirst({ where: { email } });

        const generic = { message: 'If this email exists and is unverified, we will attempt to send a new verification link.', expiresIn: '24 hours' };
        if (!user || user.isEmailVerified) return res.json(generic);

        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const issued = await prisma.user.updateMany({
            where: { id: user.id, email, isEmailVerified: false },
            data: {
                emailVerificationToken: verificationToken,
                emailVerificationExpires: verificationExpires
            }
        });
        if (issued.count !== 1) return res.json(generic);

        // Send verification email
        const clientUrl = getClientUrl();
        const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;

        const emailResult = await sendEmail(email, 'Verify your Wishlist Account', `
            <h1>Email Verification</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verifyLink}">${verifyLink}</a>
            <p>This link will expire in 24 hours.</p>
        `);

        if (!emailResult.success) {
            console.error('[resendVerification] Email send failed; provider details withheld');
        }

        // Same public response for unknown, verified, attempted and failed mail;
        // never expose membership or provider identifiers through this endpoint.
        res.json(generic);
    } catch (error) {
        console.error('Verification mail unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token) || !newPassword) {
            return res.status(400).json({
                error: 'Token and new password are required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: [
                    !token && 'token',
                    !newPassword && 'newPassword'
                ].filter(Boolean)
            });
        }

        // First check if token exists (regardless of expiry)
        const userWithToken = await prisma.user.findFirst({
            where: { passwordResetToken: token }
        });

        if (!userWithToken) {
            return res.status(400).json({
                error: 'Invalid reset token',
                errorCode: AUTH_ERROR_CODES.INVALID_TOKEN,
                hint: 'The token may have already been used or is invalid.',
                forgotPasswordEndpoint: '/api/auth/forgot-password'
            });
        }

        // Check if token is expired
        if (!userWithToken.passwordResetExpires || userWithToken.passwordResetExpires <= new Date()) {
            return res.status(400).json({
                error: 'Reset token has expired',
                errorCode: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                forgotPasswordEndpoint: '/api/auth/forgot-password',
                hint: 'Please request a new password reset email.'
            });
        }

        // Enforce strong password
        if (!validNewPassword(newPassword)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long and contain both letters and numbers.',
                errorCode: AUTH_ERROR_CODES.WEAK_PASSWORD,
                requirements: {
                    minLength: 8,
                    requiresLetter: true,
                    requiresNumber: true,
                    allowedSpecialChars: '@$!%*?&'
                }
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const changed = await prisma.user.updateMany({
            where: { id: userWithToken.id, passwordResetToken: token, passwordResetExpires: { gt: new Date() }, authVersion: { lt: 2147483647 } },
            data: {
                password: hashedPassword,
                authVersion: { increment: 1 },
                apiKey: null,
                otp: null,
                otpExpires: null,
                passwordResetToken: null,
                passwordResetExpires: null
            }
        });
        if (changed.count !== 1) return res.status(400).json({ error: 'Invalid reset token', errorCode: AUTH_ERROR_CODES.INVALID_TOKEN });

        res.json({
            message: 'Password reset successful. You can now login with your new password.',
            changed: true,
            requiresLogin: true,
            personalApiKeysRevoked: true,
            loginEndpoint: '/api/auth/login'
        });
    } catch (error) {
        console.error('Password reset unavailable; request and credential details withheld');
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};
