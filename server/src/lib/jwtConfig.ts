import jwt from 'jsonwebtoken';

export class JwtConfigurationError extends Error {
    constructor() { super('JWT authentication is not configured'); }
}

export function getJwtSecret(): string {
    const value = process.env.JWT_SECRET;
    // Preserve the existing configured value exactly; never rotate or silently
    // trim it. An absent or publicly-known fallback must not authenticate users.
    if (!value || !value.trim() || value === 'secret_key_default') throw new JwtConfigurationError();
    return value;
}

export function decodeUserSessionJwt(token: string): { id: number; authVersion: number } {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.id !== 'number' || !Number.isSafeInteger(decoded.id) || decoded.id < 1) {
        throw new jwt.JsonWebTokenError('Invalid user identity');
    }
    const authVersion = decoded.authVersion === undefined ? 0 : decoded.authVersion;
    if (typeof authVersion !== 'number' || !Number.isInteger(authVersion) || authVersion < 0 || authVersion > 2147483647) throw new jwt.JsonWebTokenError('Invalid session version');
    return { id: decoded.id, authVersion };
}
export function verifyUserJwt(token: string): { id: number } {
    // Keep the pure verifier's old public shape; only the middleware's DB check
    // may decide whether this version is current. Never propagate role claims.
    return { id: decodeUserSessionJwt(token).id };
}
export function signUserJwt(user: { id: number; authVersion: number }): string {
    if (!Number.isSafeInteger(user.id) || user.id < 1 || !Number.isInteger(user.authVersion) || user.authVersion < 0 || user.authVersion > 2147483647) throw new jwt.JsonWebTokenError('Invalid session identity');
    return jwt.sign({ id: user.id, authVersion: user.authVersion }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '7d' });
}
