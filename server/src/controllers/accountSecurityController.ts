import { Response } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { AccountSecurityError, boundedPassword, strongNewPassword, nextAuthVersion, securityBody } from '../lib/accountSecurityRules';
async function changeSecurity(req: AuthRequest, res: Response, passwordChange: boolean) {
    res.setHeader('Cache-Control', 'private, no-store');
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    try {
        const body = securityBody(req.body, passwordChange ? ['currentPassword', 'newPassword'] : ['currentPassword']);
        const current = boundedPassword(body.currentPassword);
        const replacement = passwordChange ? strongNewPassword(body.newPassword) : null;
        // Hash outside the lock; current credentials must be rechecked under it.
        const hash = replacement === null ? null : await bcrypt.hash(replacement, 10);
        await prisma.$transaction(async tx => {
            await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
            const user = await tx.user.findUnique({ where: { id: userId }, select: { password: true, authVersion: true } });
            if (!user || !await bcrypt.compare(current, user.password)) throw new AccountSecurityError(401);
            await tx.user.update({ where: { id: userId }, data: { authVersion: nextAuthVersion(user.authVersion), ...(hash === null ? {} : { password: hash, apiKey: null, passwordResetToken: null, passwordResetExpires: null, otp: null, otpExpires: null }) } });
        });
        return res.json({ changed: true, requiresLogin: true, ...(passwordChange ? { personalApiKeysRevoked: true } : {}) });
    } catch (error) {
        if (error instanceof AccountSecurityError) return res.status(error.status).json({ error: 'Account operation rejected', errorCode: error.status === 401 ? 'INVALID_CREDENTIALS' : 'INVALID_INPUT' });
        console.error('Account security unavailable; credentials and database details withheld');
        return res.status(500).json({ error: 'Account operation unavailable' });
    }
}
export const updatePassword = (req: AuthRequest, res: Response) => changeSecurity(req, res, true);
export const revokeSessions = (req: AuthRequest, res: Response) => changeSecurity(req, res, false);
