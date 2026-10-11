import { Prisma } from '@prisma/client';

export const listingShareSelect = {
    id: true, title: true, description: true, condition: true, price: true, version: true,
    status: true, expiresAt: true,
    media: {
        where: { OR: [{ capturePurpose: { not: 'AI_MARKETING' as const } }, { marketingSelected: true }] },
        orderBy: { position: 'asc' as const },
        select: { id: true, capturePurpose: true },
    },
} satisfies Prisma.ListingSelect;

export type ListingShareData = Prisma.ListingGetPayload<{ select: typeof listingShareSelect }>;

const START = '<!-- LISTING_SHARE_META_START -->';
const END = '<!-- LISTING_SHARE_META_END -->';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]!);
}

function meta(attribute: 'name' | 'property', key: string, value: string): string {
    return `  <meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
}

export function renderListingShareHtml(template: string, listing: ListingShareData, siteUrl: string): string {
    const start = template.indexOf(START);
    const end = template.indexOf(END, start + START.length);
    if (start < 0 || end < 0 || template.indexOf(START, start + START.length) >= 0 || template.indexOf(END, end + END.length) >= 0) {
        throw new Error('Listing share metadata markers are missing or duplicated');
    }
    const origin = new URL(siteUrl).origin;
    if (!Number.isSafeInteger(listing.version) || listing.version < 1 || listing.version > 2147483647) {
        throw new Error('Listing share version is invalid');
    }
    const url = `${origin}/listings/${listing.id}?v=${listing.version}`;
    const price = listing.price === null ? '價格洽詢' : Number(listing.price) === 0 ? '免費贈送' :
        `NT$ ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(Number(listing.price))}`;
    const title = `${listing.title}｜${price}｜Wishlist.ai`;
    const details = listing.description?.replace(/\s+/g, ' ').trim().slice(0, 160);
    const description = `${listing.condition === 'NEW' ? '新品' : '二手'}商品 · ${price}${details ? ` · ${details}` : ''}`;
    // Prefer a real seller photo even when AI marketing art is positioned first.
    const photo = listing.media.find(media => media.capturePurpose !== 'AI_MARKETING') ?? listing.media[0];
    const imageTags = photo ? [
        meta('property', 'og:image', `${origin}/api/listing-media/${photo.id}/thumbnail`),
        meta('property', 'og:image:alt', `${listing.title}${photo.capturePurpose === 'AI_MARKETING' ? '商品行銷示意圖' : '商品照片'}`),
    ] : [];
    const tags = [
        `  <title>${escapeHtml(title)}</title>`,
        meta('name', 'title', title),
        meta('name', 'description', description),
        meta('property', 'og:type', 'product'),
        meta('property', 'og:url', url),
        meta('property', 'og:title', title),
        meta('property', 'og:description', description),
        ...imageTags,
        meta('property', 'og:locale', 'zh_TW'),
        meta('property', 'og:site_name', 'Wishlist.ai'),
        meta('property', 'twitter:card', photo ? 'summary_large_image' : 'summary'),
        meta('property', 'twitter:url', url),
        meta('property', 'twitter:title', title),
        meta('property', 'twitter:description', description),
        ...(photo ? [meta('property', 'twitter:image', `${origin}/api/listing-media/${photo.id}/thumbnail`)] : []),
    ].join('\n');
    return `${template.slice(0, start)}${START}\n${tags}\n  ${template.slice(end)}`;
}
