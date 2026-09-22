import jwt from 'jsonwebtoken';
import prisma from './prisma';
import { decodeUserSessionJwt } from './jwtConfig';
export async function authenticateUserSession(token: string): Promise<{ id: number }> {
    const claims = decodeUserSessionJwt(token);
    const user = await prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, authVersion: true } });
    // Missing users and stale legacy/versioned tokens cannot remain logged in.
    if (!user || user.authVersion !== claims.authVersion) throw new jwt.JsonWebTokenError('Session revoked');
    return { id: user.id };
}
