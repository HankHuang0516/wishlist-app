import jwt from 'jsonwebtoken';
jest.mock('../lib/prisma', () => ({ __esModule: true, default: { user: { findUnique: jest.fn() } } }));
import prisma from '../lib/prisma';
import { authenticateUserSession } from '../lib/userSession';
import { authenticateToken, optionalAuthenticateToken, AuthRequest } from '../middleware/auth';
import { JwtConfigurationError } from '../lib/jwtConfig';
import type { Response } from 'express';
const lookup = prisma.user.findUnique as jest.Mock;
const original = process.env.JWT_SECRET;
const secret = 'session-unit-only';
beforeEach(() => { process.env.JWT_SECRET = secret; lookup.mockReset(); });
afterAll(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
const token = (claims: object = { id: 7, authVersion: 3 }) => jwt.sign(claims, secret);
const response = () => { const res: any = {}; res.status = jest.fn(() => res); res.json = jest.fn(() => res); return res as Response; };
describe('current database-backed user session', () => {
    it('returns only a fresh identity, not token role claims', async () => {
        lookup.mockResolvedValue({ id: 7, authVersion: 3 });
        expect(await authenticateUserSession(token({ id: 7, authVersion: 3, isAdmin: true }))).toEqual({ id: 7 });
        expect(lookup).toHaveBeenCalledWith({ where: { id: 7 }, select: { id: true, authVersion: true } });
    });
    it('accepts legacy claims only for an unrevised version-zero account', async () => {
        lookup.mockResolvedValue({ id: 7, authVersion: 0 }); expect(await authenticateUserSession(token({ id: 7 }))).toEqual({ id: 7 });
        lookup.mockResolvedValue({ id: 7, authVersion: 1 }); await expect(authenticateUserSession(token({ id: 7 }))).rejects.toThrow(jwt.JsonWebTokenError);
    });
    it.each([null, { id: 7, authVersion: 4 }])('rejects erased or revoked users %p', async value => {
        lookup.mockResolvedValue(value); await expect(authenticateUserSession(token())).rejects.toThrow(jwt.JsonWebTokenError);
    });
    it('fails before a database lookup on missing secret or invalid signature', async () => {
        delete process.env.JWT_SECRET; await expect(authenticateUserSession(token())).rejects.toThrow(JwtConfigurationError);
        process.env.JWT_SECRET = secret; await expect(authenticateUserSession('invalid')).rejects.toThrow(jwt.JsonWebTokenError); expect(lookup).not.toHaveBeenCalled();
    });
    it('does not disguise database outages as valid or revoked credentials', async () => {
        const failure = new Error('synthetic database outage'); lookup.mockRejectedValue(failure);
        await expect(authenticateUserSession(token())).rejects.toBe(failure);
    });
    it('required middleware fails closed with 503 during an outage', async () => {
        lookup.mockRejectedValue(new Error('synthetic outage'));
        const req = { headers: { authorization: 'Bearer ' + token() } } as AuthRequest, res = response(), next = jest.fn();
        await authenticateToken(req, res, next); expect(res.status).toHaveBeenCalledWith(503); expect(next).not.toHaveBeenCalled(); expect(req.user).toBeUndefined();
    });
    it('optional middleware clears prior identity and degrades to anonymous during an outage', async () => {
        lookup.mockRejectedValue(new Error('synthetic outage'));
        const req = { headers: { authorization: 'Bearer ' + token() }, user: { id: 999 } } as AuthRequest, next = jest.fn();
        await optionalAuthenticateToken(req, response(), next); expect(req.user).toBeUndefined(); expect(next).toHaveBeenCalledTimes(1);
    });
});
