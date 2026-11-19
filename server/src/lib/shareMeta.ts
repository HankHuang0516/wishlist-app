import type { DiscoveryProduct } from './discovery';
import type { SharedWish } from './wishShare';

// A shared address shows its own name, price and picture in the preview LINE and other apps draw before anyone opens
// it. Those apps read only the first HTML, so the page's general description (between the two markers in index.html)
// is replaced there. A listing's own page does the same in listingShareMeta.ts.
const START = '<!-- LISTING_SHARE_META_START -->';
const END = '<!-- LISTING_SHARE_META_END -->';

export type ShareMeta = { url: string; title: string; description: string; type: 'product' | 'website'; image?: { url: string; alt: string } };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const meta = (attribute: 'name' | 'property', key: string, value: string) => `  <meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
const oneLine = (value: string, length: number) => value.replace(/\s+/g, ' ').trim().slice(0, length);
const amount = (value: number) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value);

export function renderShareMetaHtml(template: string, share: ShareMeta): string {
    const start = template.indexOf(START), end = template.indexOf(END, start + START.length);
    if (start < 0 || end < 0 || template.indexOf(START, start + START.length) >= 0 || template.indexOf(END, end + END.length) >= 0) {
        throw new Error('Share metadata markers are missing or duplicated');
    }
    const tags = [
        `  <title>${escapeHtml(share.title)}</title>`,
        meta('name', 'title', share.title),
        meta('name', 'description', share.description),
        meta('property', 'og:type', share.type),
        meta('property', 'og:url', share.url),
        meta('property', 'og:title', share.title),
        meta('property', 'og:description', share.description),
        ...(share.image ? [meta('property', 'og:image', share.image.url), meta('property', 'og:image:alt', share.image.alt)] : []),
        meta('property', 'og:locale', 'zh_TW'),
        meta('property', 'og:site_name', 'Wishlist.ai'),
        meta('property', 'twitter:card', share.image ? 'summary_large_image' : 'summary'),
        meta('property', 'twitter:url', share.url),
        meta('property', 'twitter:title', share.title),
        meta('property', 'twitter:description', share.description),
        ...(share.image ? [meta('property', 'twitter:image', share.image.url)] : []),
    ].join('\n');
    return `${template.slice(0, start)}${START}\n${tags}\n  ${template.slice(end)}`;
}

export const productPriceLabel = (product: Pick<DiscoveryProduct, 'price' | 'currency' | 'priceText'>) =>
    product.price !== null && product.currency === 'TWD' ? `NT$ ${amount(product.price)}` : oneLine(product.priceText, 40) || '價格待詢問';

/** A public-source or partner product's own page: /products/<kind>/<id>. */
export function productShareMeta(product: DiscoveryProduct, siteUrl: string): ShareMeta {
    const origin = new URL(siteUrl).origin, price = productPriceLabel(product), details = oneLine(product.description, 160);
    let image: ShareMeta['image'];
    try { if (product.thumbnailUrl) image = { url: new URL(product.thumbnailUrl, origin).toString(), alt: `${product.title}商品照片` }; } catch { /* No picture in the preview. */ }
    return {
        type: 'product', url: `${origin}/products/${product.kind}/${product.id}`,
        title: `${product.title}｜${price}｜Wishlist.ai`,
        description: `公開來源商品 · ${price} · 庫存待確認${details ? ` · ${details}` : ''}`,
        ...(image ? { image } : {}),
    };
}

/** A wish its owner shared. The preview says what the page says: the name and the budget, nothing else. */
export function sharedWishMeta(wish: SharedWish, token: string, siteUrl: string): ShareMeta {
    const origin = new URL(siteUrl).origin;
    const budget = wish.maxPrice === null ? '' : `，預算 ${wish.priceCurrency ?? ''} ${amount(wish.maxPrice)}`.replace(/\s+/g, ' ');
    return {
        type: 'website', url: `${origin}/shared-wishes/${token}`,
        title: `願望：${oneLine(wish.name, 80)}｜Wishlist.ai`,
        description: `有人許了這個願望${budget}。如果你剛好看到，告訴對方吧！`,
    };
}
