import { appReviewDemoUserId } from './appReviewAccess';
import prisma from './prisma';
import { publicListingSelect } from '../controllers/listingController';
import { classifyDiscovery } from './discoveryCatalog';
import type { DiscoveryProduct } from './discovery';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function privateStorePreview(viewerId: number | undefined, now = new Date()): string[] | null {
  const raw = process.env.PRIVATE_STORE_PREVIEW;
  if (!raw || raw.length > 3000 || viewerId !== appReviewDemoUserId()) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || Object.keys(p).sort().join(',') !== 'expiresAt,listingIds,userId' || p.userId !== viewerId ||
        !Number.isSafeInteger(p.userId) || p.userId <= 0 || !Array.isArray(p.listingIds) ||
        p.listingIds.length < 1 || p.listingIds.length > 24 ||
        p.listingIds.some((id: unknown) => typeof id !== 'string' || !uuid.test(id)) ||
        new Set(p.listingIds).size !== p.listingIds.length || typeof p.expiresAt !== 'string') return null;
    const expires = Date.parse(p.expiresAt);
    if (!Number.isFinite(expires) || expires <= now.getTime() || expires - now.getTime() > 7 * 86400000) return null;
    return p.listingIds;
  } catch { return null; }
}

// Owner-only DRAFT records. Their database state never becomes public/active.
// No request parameter, display name, API key claim or ordinary user can opt in.
export async function privateStorePreviewProducts(viewerId: number | undefined, now: Date, map: boolean): Promise<DiscoveryProduct[] | null> {
  const ids = privateStorePreview(viewerId, now);
  if (!ids) return null;
  const rows = await prisma.listing.findMany({ where: { id: { in: ids }, ownerUserId: viewerId, status: 'DRAFT' },
    select: { ...publicListingSelect, media: { orderBy: { position: 'asc' }, where: { capturePurpose: { not: 'AI_MARKETING' } },
      select: { id: true, flickrImageUrl: true, flickrThumbnailUrl: true } } } });
  return rows.map(r => {
    // The existing private Flickr provider issues opaque image URLs to the
    // owner. They are never listed by the public catalog or retained in logs.
    const photos = r.media.flatMap(m => {
      const safe = (v: string | null) => { try { const u = new URL(v ?? ''); return u.protocol === 'https:' &&
        /^(?:live|farm\d+)\.staticflickr\.com$/.test(u.hostname) && !u.username && !u.password; } catch { return false; } };
      return safe(m.flickrImageUrl) && safe(m.flickrThumbnailUrl) ? [{ id: m.id, url: m.flickrImageUrl!, thumbnailUrl: m.flickrThumbnailUrl! }] : [];
    });
    const c = classifyDiscovery(r.title, r.category);
    return { kind: 'listing', id: r.id, key: 'listing:' + r.id, title: r.title, description: r.description ?? '',
      ...c, classificationMethod: c.method, brand: r.brand, price: r.price === null ? null : Number(r.price),
      priceText: r.price?.toString() ?? '', currency: r.currency, priceUnitVerified: true,
      thumbnailUrl: photos[0]?.thumbnailUrl ?? null, photos, county: r.location?.county ?? null,
      district: r.location?.district ?? null, condition: r.condition, sourceLabel: 'Wishlist', stockStatus: r.status,
      canonicalUrl: null, detailPath: '/listings/' + r.id, date: r.createdAt.toISOString(), dateBasis: 'COLLECTED', dateEarliest: null,
      ...(map ? { mapLocation: r.location ? { coordinates: [r.location.publicLongitude, r.location.publicLatitude] as [number, number], precision: 'APPROXIMATE_2KM' as const } : null } : {}),
    };
  });
}
