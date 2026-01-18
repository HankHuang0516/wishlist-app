import crypto from 'crypto';

export const generateApiKey = (): string => {
    // Generate a secure random string
    // 32 bytes = 64 hex characters
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `sk_live_${randomBytes}`;
};
