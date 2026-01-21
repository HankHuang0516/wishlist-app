import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_default';

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

        // Enforce strong password
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
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
        const clientUrl = process.env.CLIENT_URL || 'https://wishlist-app-production.up.railway.app';
        const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;

        await sendEmail(email, 'Verify your Wishlist Account', `
           <h1>Welcome to Wishlist!</h1>
           <p>Please click the link below to verify your email address:</p>
           <a href="${verifyLink}">${verifyLink}</a>
       `);

        // Return JWT token immediately for AI agent access (User can still verify email later)
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Registration successful. Please check your email to verify your account.',
            token,
            user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name },
            emailVerification: {
                required: true,
                sentTo: email,
                expiresIn: '24 hours',
                resendEndpoint: '/api/auth/resend-verification'
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        if (!token) {
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
        if (userWithToken.emailVerificationExpires && userWithToken.emailVerificationExpires < new Date()) {
            return res.status(400).json({
                error: 'Verification token has expired',
                errorCode: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                resendEndpoint: '/api/auth/resend-verification',
                hint: 'Please request a new verification email.'
            });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userWithToken.id },
            data: {
                isEmailVerified: true,
                emailVerificationToken: null,
                emailVerificationExpires: null
            }
        });

        const jwtToken = jwt.sign({ id: updatedUser.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Email verified successfully',
            token: jwtToken,
            user: { id: updatedUser.id, phoneNumber: updatedUser.phoneNumber, name: updatedUser.name }
        });

    } catch (error) {
        console.error(error);
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

        // Bypass for old users (no email) or specific override
        // logic: if user HAS email, they MUST be verified. If no email (legacy), allow.
        // Bypass for test user 0911222339
        if (user.email && !user.isEmailVerified && user.phoneNumber !== '0911222339') {
            return res.status(403).json({
                error: 'Please verify your email address before logging in.',
                errorCode: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
                email: user.email,
                resendEndpoint: '/api/auth/resend-verification',
                resendPayload: { email: user.email },
                hint: 'Call the resendEndpoint with the resendPayload to request a new verification email.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                error: 'Invalid credentials',
                errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS
            });
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

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
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
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
        const clientUrl = process.env.CLIENT_URL || 'https://wishlist-app-production.up.railway.app';
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
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
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

        if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                errorCode: AUTH_ERROR_CODES.INVALID_OTP
            });
        }

        res.json({ message: 'OTP verified' });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                errorCode: AUTH_ERROR_CODES.MISSING_FIELDS,
                missingFields: ['email']
            });
        }

        const user = await prisma.user.findFirst({ where: { email } });

        if (!user) {
            // Don't reveal if user exists for security
            return res.json({
                message: 'If this email exists and is unverified, a new verification link has been sent.',
                expiresIn: '24 hours'
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({
                error: 'Email is already verified. You can login directly.',
                errorCode: AUTH_ERROR_CODES.EMAIL_ALREADY_VERIFIED,
                loginEndpoint: '/api/auth/login'
            });
        }

        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerificationToken: verificationToken,
                emailVerificationExpires: verificationExpires
            }
        });

        // Send verification email
        const clientUrl = process.env.CLIENT_URL || 'https://wishlist-app-production.up.railway.app';
        const verifyLink = `${clientUrl}/verify-email?token=${verificationToken}`;

        const emailResult = await sendEmail(email, 'Verify your Wishlist Account', `
            <h1>Email Verification</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verifyLink}">${verifyLink}</a>
            <p>This link will expire in 24 hours.</p>
        `);

        if (!emailResult.success) {
            console.error('[resendVerification] Email send failed:', emailResult.error);
            return res.status(500).json({
                error: 'Failed to send verification email. Please try again later.',
                errorCode: AUTH_ERROR_CODES.EMAIL_SEND_FAILED
            });
        }

        res.json({
            message: 'Verification email sent successfully.',
            sentTo: email,
            expiresIn: '24 hours',
            messageId: emailResult.id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
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
        if (userWithToken.passwordResetExpires && userWithToken.passwordResetExpires < new Date()) {
            return res.status(400).json({
                error: 'Reset token has expired',
                errorCode: AUTH_ERROR_CODES.TOKEN_EXPIRED,
                forgotPasswordEndpoint: '/api/auth/forgot-password',
                hint: 'Please request a new password reset email.'
            });
        }

        // Enforce strong password
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
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

        await prisma.user.update({
            where: { id: userWithToken.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null
            }
        });

        res.json({
            message: 'Password reset successful. You can now login with your new password.',
            loginEndpoint: '/api/auth/login'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Internal server error',
            errorCode: AUTH_ERROR_CODES.INTERNAL_ERROR
        });
    }
};

