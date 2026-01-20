import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_default';


import { sendEmail } from '../lib/emailService';
import crypto from 'crypto';

export const register = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password, name, birthday, email } = req.body; // birthday: YYYY-MM-DD string

        if (!phoneNumber || !password || !email) {
            return res.status(400).json({ error: 'Phone number, email, and password are required' });
        }

        // Enforce strong password
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
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
            return res.status(400).json({ error: 'User with this phone or email already exists' });
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
            user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        const user = await prisma.user.findFirst({
            where: {
                emailVerificationToken: token,
                emailVerificationExpires: {
                    gt: new Date()
                }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerificationToken: null,
                emailVerificationExpires: null
            }
        });

        const jwtToken = jwt.sign({ id: updatedUser.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token: jwtToken, user: { id: updatedUser.id, phoneNumber: updatedUser.phoneNumber, name: updatedUser.name } });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


export const login = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber || !password) {
            return res.status(400).json({ error: 'Phone number/Email and password are required' });
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
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Bypass for old users (no email) or specific override
        // logic: if user HAS email, they MUST be verified. If no email (legacy), allow.
        // Bypass for test user 0911222339
        if (user.email && !user.isEmailVerified && user.phoneNumber !== '0911222339') {
            return res.status(403).json({ error: 'Please verify your email address before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await prisma.user.findFirst({ where: { email } });

        if (!user) {
            // Don't reveal if user exists for security
            return res.json({ message: 'If this email exists, a reset link has been sent.' });
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

        res.json({ message: 'If this email exists, a reset link has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({ error: 'Phone number and OTP are required' });
        }

        const user = await prisma.user.findUnique({ where: { phoneNumber } });

        if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        res.json({ message: 'OTP verified' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await prisma.user.findFirst({ where: { email } });

        if (!user) {
            // Don't reveal if user exists for security
            return res.json({ message: 'If this email exists and is unverified, a new verification link has been sent.' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ error: 'Email is already verified. You can login directly.' });
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

        await sendEmail(email, 'Verify your Wishlist Account', `
            <h1>Email Verification</h1>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verifyLink}">${verifyLink}</a>
            <p>This link will expire in 24 hours.</p>
        `);

        res.json({ message: 'If this email exists and is unverified, a new verification link has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        const user = await prisma.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpires: {
                    gt: new Date()
                }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Enforce strong password
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null
            }
        });

        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

