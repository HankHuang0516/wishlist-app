import jwt from 'jsonwebtoken';
import { getJwtSecret, JwtConfigurationError, verifyUserJwt, decodeUserSessionJwt, signUserJwt } from '../lib/jwtConfig';

const old = process.env.JWT_SECRET;
const secret = 'test-only-no-real-credential';
beforeEach(() => { process.env.JWT_SECRET = secret; });
afterAll(() => { if (old === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = old; });

describe('configured JWT fail-closed verification', () => {
    it.each([undefined, '', '  ', 'secret_key_default'])('rejects unconfigured or public default %p', value => {
        if (value === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = value;
        expect(() => getJwtSecret()).toThrow(JwtConfigurationError);
        expect(() => verifyUserJwt(jwt.sign({ id: 1 }, secret))).toThrow(JwtConfigurationError);
    });
    it('preserves the configured original value without silently trimming or rotating it', () => {
        process.env.JWT_SECRET = ' ' + secret + ' ';
        expect(getJwtSecret()).toBe(' ' + secret + ' ');
    });
    it('accepts an integer identity but discards role and arbitrary privilege claims', () => {
        expect(verifyUserJwt(jwt.sign({ id: 2, isAdmin: true, merchant: { id: 1 } }, secret))).toEqual({ id: 2 });
    });
    it.each([null, '2', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects malformed identity %p', id => {
        expect(() => verifyUserJwt(jwt.sign({ id }, secret))).toThrow(jwt.JsonWebTokenError);
    });
    it('rejects string claims, unsupported algorithms, invalid signatures and expired tokens', () => {
        expect(() => verifyUserJwt(jwt.sign('raw-string', secret))).toThrow(jwt.JsonWebTokenError);
        expect(() => verifyUserJwt(jwt.sign({ id: 2 }, secret, { algorithm: 'HS384' }))).toThrow(jwt.JsonWebTokenError);
        expect(() => verifyUserJwt(jwt.sign({ id: 2 }, 'another-test-secret'))).toThrow(jwt.JsonWebTokenError);
        expect(() => verifyUserJwt(jwt.sign({ id: 2 }, secret, { expiresIn: -1 }))).toThrow(jwt.TokenExpiredError);
    });
    it('supports legacy version zero and signs only bounded server-side session claims', () => {
        expect(decodeUserSessionJwt(jwt.sign({ id: 2 }, secret))).toEqual({ id: 2, authVersion: 0 });
        expect(decodeUserSessionJwt(signUserJwt({ id: 2, authVersion: 3 }))).toEqual({ id: 2, authVersion: 3 });
        expect(verifyUserJwt(signUserJwt({ id: 2, authVersion: 3 }))).toEqual({ id: 2 });
    });
    it.each([null, '0', -1, 1.5, 2147483648])('rejects invalid session version %p', authVersion => {
        expect(() => decodeUserSessionJwt(jwt.sign({ id: 2, authVersion }, secret))).toThrow(jwt.JsonWebTokenError);
    });
    it('refuses to mint invalid identities or overflowing revocation versions', () => {
        for (const user of [{ id: 0, authVersion: 0 }, { id: 1, authVersion: -1 }, { id: 1, authVersion: 2147483648 }]) expect(() => signUserJwt(user)).toThrow(jwt.JsonWebTokenError);
    });
});
