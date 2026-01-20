"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.verifyOtp = exports.forgotPassword = exports.login = exports.verifyEmail = exports.register = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_default';
const emailService_1 = require("../lib/emailService");
const crypto_1 = __importDefault(require("crypto"));
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const existingUser = yield prisma_1.default.user.findFirst({
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
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        // Parse birthday
        let birthdayDate;
        if (birthday) {
            birthdayDate = new Date(birthday);
            if (isNaN(birthdayDate.getTime())) {
                birthdayDate = undefined; // Or throw error
            }
        }
        const verificationToken = crypto_1.default.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const user = yield prisma_1.default.user.create({
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
        yield (0, emailService_1.sendEmail)(email, 'Verify your Wishlist Account', `
           <h1>Welcome to Wishlist!</h1>
           <p>Please click the link below to verify your email address:</p>
           <a href="${verifyLink}">${verifyLink}</a>
       `);
        res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.register = register;
const verifyEmail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }
        const user = yield prisma_1.default.user.findFirst({
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
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerificationToken: null,
                emailVerificationExpires: null
            }
        });
        const jwtToken = jsonwebtoken_1.default.sign({ id: updatedUser.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token: jwtToken, user: { id: updatedUser.id, phoneNumber: updatedUser.phoneNumber, name: updatedUser.name } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.verifyEmail = verifyEmail;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            user = yield prisma_1.default.user.findFirst({ where: { email: phoneNumber } });
        }
        else {
            user = yield prisma_1.default.user.findUnique({ where: { phoneNumber } });
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
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.login = login;
const forgotPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        const user = yield prisma_1.default.user.findFirst({ where: { email } });
        if (!user) {
            // Don't reveal if user exists for security
            return res.json({ message: 'If this email exists, a reset link has been sent.' });
        }
        const resetToken = crypto_1.default.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpires: resetExpires
            }
        });
        // Send password reset email
        const clientUrl = process.env.CLIENT_URL || 'https://wishlist-app-production.up.railway.app';
        const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;
        yield (0, emailService_1.sendEmail)(email, 'Reset your Wishlist Password', `
            <h1>Password Reset Request</h1>
            <p>You requested to reset your password. Click the link below to set a new password:</p>
            <a href="${resetLink}">${resetLink}</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `);
        res.json({ message: 'If this email exists, a reset link has been sent.' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.forgotPassword = forgotPassword;
const verifyOtp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phoneNumber, otp } = req.body;
        if (!phoneNumber || !otp) {
            return res.status(400).json({ error: 'Phone number and OTP are required' });
        }
        const user = yield prisma_1.default.user.findUnique({ where: { phoneNumber } });
        if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        res.json({ message: 'OTP verified' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.verifyOtp = verifyOtp;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        const user = yield prisma_1.default.user.findFirst({
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
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null
            }
        });
        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.resetPassword = resetPassword;
