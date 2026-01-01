import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_default';

export const register = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password, name, birthday } = req.body; // birthday: YYYY-MM-DD string

        if (!phoneNumber || !password) {
            return res.status(400).json({ error: 'Phone number and password are required' });
        }

        // Enforce strong password
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
        }

        const existingUser = await prisma.user.findUnique({ where: { phoneNumber } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
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

        const user = await prisma.user.create({
            data: {
                phoneNumber,
                password: hashedPassword,
                name,
                birthday: birthdayDate
            },
        });

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ token, user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, password } = req.body;

        const user = await prisma.user.findUnique({ where: { phoneNumber } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
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
        const { phoneNumber } = req.body;
        const user = await prisma.user.findUnique({ where: { phoneNumber } });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await prisma.user.update({
            where: { id: user.id },
            data: { otp, otpExpires }
        });

        // Mock SMS sending
        console.log(`[MOCK SMS] Sending OTP ${otp} to ${phoneNumber}`);

        res.json({ message: 'OTP sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;
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

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp, newPassword } = req.body;
        const user = await prisma.user.findUnique({ where: { phoneNumber } });

        if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
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
                otp: null,
                otpExpires: null
            }
        });

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
