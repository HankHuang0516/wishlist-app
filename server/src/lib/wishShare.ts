import { createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'crypto';
import prisma from './prisma';
import { getJwtSecret } from './jwtConfig';

// A wish its owner shares is reached by an address that only the owner can ask for. The last part of that address is
// the wish's number sealed with a key that stays on the server: it does not show the number, cannot be made or
// guessed without the key, and is the same each time, so one wish has one address. Deleting the wish ends it.
const MARK = Buffer.from('WISHSHARE:01', 'ascii');
const sealingKey = () => createHmac('sha256', getJwtSecret()).update('wishlist.ai/wish-share/v1').digest();

export function wishShareToken(itemId: number): string {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 2147483647) throw new Error('Invalid wish');
    const block = Buffer.alloc(16);
    MARK.copy(block); block.writeUInt32BE(itemId, 12);
    const cipher = createCipheriv('aes-256-ecb', sealingKey(), null); cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(block), cipher.final()]).toString('base64url');
}

/** The wish a token names, or null for anything this server did not seal. */
export function readWishShareToken(token: unknown): number | null {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
    const sealed = Buffer.from(token, 'base64url');
    if (sealed.length !== 16 || sealed.toString('base64url') !== token) return null;
    const decipher = createDecipheriv('aes-256-ecb', sealingKey(), null); decipher.setAutoPadding(false);
    const block = Buffer.concat([decipher.update(sealed), decipher.final()]);
    if (!timingSafeEqual(block.subarray(0, 12), MARK)) return null;
    const id = block.readUInt32BE(12);
    return id >= 1 && id <= 2147483647 ? id : null;
}

export const wishSharePath = (itemId: number) => '/shared-wishes/' + wishShareToken(itemId);

export type SharedWish = { name: string; maxPrice: number | null; priceCurrency: string | null };

/** What the shared page shows: the name and the budget, which is what the share text itself says. The photo, notes,
 *  links, the list, the owner and every identifier stay private. */
export async function readSharedWish(token: unknown): Promise<SharedWish | null> {
    const id = readWishShareToken(token);
    if (id === null) return null;
    const wish = await prisma.item.findUnique({ where: { id }, select: { name: true, maxPrice: true, priceCurrency: true } });
    return wish && { name: wish.name, maxPrice: wish.maxPrice, priceCurrency: wish.maxPrice === null ? null : wish.priceCurrency };
}
