import type { Prisma } from '@prisma/client';

// Select only fields required by social cards, never whole User rows or
// credential/preference columns. Display names and nicknames are public;
// avatar visibility controls the photo, not nickname visibility.
export const socialCardSelect = {
    id: true, name: true, nicknames: true, phoneNumber: true, isPhoneVisible: true,
    avatarUrl: true, isAvatarVisible: true, birthday: true, isBirthdayVisible: true,
} satisfies Prisma.UserSelect;
export type SocialCardRow = Prisma.UserGetPayload<{ select: typeof socialCardSelect }>;
export function socialCard(user: SocialCardRow) {
    return {
        id: user.id, name: user.name, nicknames: user.nicknames,
        phoneNumber: user.isPhoneVisible ? user.phoneNumber : null,
        avatarUrl: user.isAvatarVisible ? user.avatarUrl : null,
        birthday: user.isBirthdayVisible ? user.birthday : null,
    };
}
export function socialSearchQuery(raw: unknown) {
    if (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/.test(raw) || Buffer.from(raw).toString('utf8') !== raw) return null;
    const query = raw.trim();
    return query && query.length <= 100 ? query : null;
}
export function socialSearchWhere(query: string, viewerId: number): Prisma.UserWhereInput {
    return { id: { not: viewerId }, OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { nicknames: { contains: query, mode: 'insensitive' } },
        { phoneNumber: { contains: query }, isPhoneVisible: true },
        { realName: { contains: query, mode: 'insensitive' }, isRealNameVisible: true },
        // Even exact email matching must respect the user's visibility choice.
        ...(query.includes('@') ? [{ email: { equals: query, mode: 'insensitive' as const }, isEmailVisible: true }] : []),
    ] };
}
