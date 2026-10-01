import { Response } from 'express';
import { Prisma } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { ownProfileSelect } from '../lib/ownProfile';
import { decodeUserSessionJwt } from '../lib/jwtConfig';
import { profileActionId, profileData, profileHash, profilePatch, profileVersion, ProfileUpdateError } from '../lib/profileUpdate';

type Tx = Prisma.TransactionClient;
async function gate(tx: Tx, req: AuthRequest, userId: number) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`);
    const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, authVersion: true, apiKey: true, email: true, profileVersion: true } });
    if (!row) throw new ProfileUpdateError(401);
    const key = req.headers['x-api-key'];
    if (key) { if (typeof key !== 'string' || row.apiKey !== key) throw new ProfileUpdateError(401); }
    else {
        try {
            const claims = decodeUserSessionJwt(req.headers.authorization?.split(' ')[1] ?? '');
            if (claims.id !== userId || claims.authVersion !== row.authVersion) throw new Error();
        } catch { throw new ProfileUpdateError(401); }
    }
    return row;
}
function endpoint(action: (req: AuthRequest, userId: number) => Promise<unknown>) {
    return async (req: AuthRequest, res: Response) => {
        res.setHeader('Cache-Control', 'private, no-store');
        if (!req.user?.id) return res.status(401).json({ errorCode: 'MISSING_TOKEN' });
        try { return res.json(await action(req, req.user.id)); }
        catch (error) {
            if (error instanceof ProfileUpdateError) return res.status(error.status).json({ error: '資料未更新，請核對輸入或重新查核', errorCode: 'PROFILE_REJECTED' });
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ errorCode: 'PROFILE_EMAIL_UNAVAILABLE' });
            console.error('Profile operation unavailable; personal values and database details withheld');
            return res.status(500).json({ errorCode: 'PROFILE_UNAVAILABLE' });
        }
    };
}
async function envelope(tx: Tx, userId: number, receipt: { clientActionId: string; requestHash: string; state: string; appliedVersion: number | null; createdAt: Date }) {
    return { receipt: { clientActionId: receipt.clientActionId, requestHash: receipt.requestHash, state: receipt.state, appliedVersion: receipt.appliedVersion, createdAt: receipt.createdAt }, profile: await tx.user.findUniqueOrThrow({ where: { id: userId }, select: ownProfileSelect }) };
}
export const getProfileOperation = endpoint(async (req, userId) => {
    const clientActionId = profileActionId(req.params.clientActionId);
    if (Object.keys(req.query).length) throw new ProfileUpdateError();
    return prisma.$transaction(async tx => {
        await gate(tx, req, userId);
        const row = await tx.profileUpdateReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } } });
        if (!row) throw new ProfileUpdateError(404);
        return envelope(tx, userId, row);
    });
});
export const submitProfileOperation = endpoint(async (req, userId) => {
    const clientActionId = profileActionId(req.params.clientActionId);
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).sort().join(',') !== 'expectedVersion,updates' || Object.keys(req.query).length) throw new ProfileUpdateError();
    const expectedVersion = profileVersion(req.body.expectedVersion), updates = profilePatch(req.body.updates), requestHash = profileHash(expectedVersion, updates);
    return prisma.$transaction(async tx => {
        const user = await gate(tx, req, userId);
        const prior = await tx.profileUpdateReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } } });
        if (prior) { if (prior.requestHash !== requestHash) throw new ProfileUpdateError(409); return envelope(tx, userId, prior); }
        const conflict = user.profileVersion !== expectedVersion || Object.prototype.hasOwnProperty.call(updates, 'email') && !!user.email && user.email !== updates.email;
        if (!conflict) await tx.user.update({ where: { id: userId }, data: profileData(updates) });
        const row = await tx.profileUpdateReceipt.create({ data: { userId, clientActionId, requestHash, state: conflict ? 'CONFLICT' : 'APPLIED', appliedVersion: conflict ? null : expectedVersion + 1 } });
        return envelope(tx, userId, row);
    });
});
export const abandonProfileOperation = endpoint(async (req, userId) => {
    const clientActionId = profileActionId(req.params.clientActionId);
    if (!req.body || Object.keys(req.body).join(',') !== 'requestHash' || typeof req.body.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.requestHash) || Object.keys(req.query).length) throw new ProfileUpdateError();
    return prisma.$transaction(async tx => {
        await gate(tx, req, userId);
        const prior = await tx.profileUpdateReceipt.findUnique({ where: { userId_clientActionId: { userId, clientActionId } } });
        if (prior) { if (prior.requestHash !== req.body.requestHash) throw new ProfileUpdateError(409); return envelope(tx, userId, prior); }
        return envelope(tx, userId, await tx.profileUpdateReceipt.create({ data: { userId, clientActionId, requestHash: req.body.requestHash, state: 'ABANDONED' } }));
    });
});
// Retain the original PUT route for integrations, with identical validation and
// revision increments so an older client cannot bypass web optimistic checks.
export const updateLegacyProfile = endpoint(async (req, userId) => {
    const updates = profilePatch(req.body);
    return prisma.$transaction(async tx => {
        const user = await gate(tx, req, userId);
        if (user.profileVersion >= 2147483647 || Object.prototype.hasOwnProperty.call(updates, 'email') && !!user.email && user.email !== updates.email) throw new ProfileUpdateError(409);
        return tx.user.update({ where: { id: userId }, data: profileData(updates), select: ownProfileSelect });
    });
});
