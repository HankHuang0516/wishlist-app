import { marketplaceOrigin } from '../../lib/marketplaceUrl';
export const uuid = () => crypto.randomUUID();
export const makeWish = (id = 1) => ({ id, name: '三國演義漫畫', maxPrice: 300, priceCurrency: 'TWD', wishlist: { id: 2, title: '合成測試願望', isPublic: false } });
export function makeListing(title = '二手 三國演義 漫畫') {
  const id = uuid(), photo = uuid(), origin = marketplaceOrigin();
  return { id, title, description: '合成測試商品，不是可購買的真實刊登。', brand: null, category: 'books', condition: 'USED',
    price: '250.00', currency: 'TWD', deliveryMethods: ['MEETUP'], negotiable: false, status: 'ACTIVE', expiresAt: '2100-01-01T00:00:00Z', mapVisibleUntil: new Date(Date.now() + 3_600_000).toISOString(),
    owner: { id: 3, name: '合成測試賣家' }, location: { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 },
    media: [{ id: photo, imageUrl: `${origin}/api/listing-media/${photo}/image`, thumbnailUrl: `${origin}/api/listing-media/${photo}/thumbnail` }] };
}
export const makeMatch = (wishItemId = 1, listing = makeListing(), score = 80) => ({ wishItemId, listing, score, budget: 'WITHIN', distanceKm: null,
  reasons: [{ code: 'NAME', text: '名稱符合' }, { code: 'BUDGET', text: '在預算內' }] });
export const makeMatchPage = (items: ReturnType<typeof makeMatch>[] = [], nextCursor: string | null = null) => ({ items, nextCursor,
  scannedCandidates: items.length, ordering: 'RECENT_CANDIDATES_PAGE_SCORE', notice: '文字配對不保證同一型號，請核對照片。' });
export const responseOk = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
export function makeExternalListing() {
  const now = Date.now();
  return { id: uuid(), title: '外部合成測試檯燈', description: '僅作來源資料契約驗收。', condition: 'USED', priceTwd: '590', county: '新北市', district: '板橋區',
    imageUrl: 'https://images.example.com/items/1.jpg', thumbnailUrl: 'https://images.example.com/items/1-320.jpg', canonicalUrl: 'https://partner.example.com/items/1',
    observedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(),
    source: { host: 'partner.example.com', imageHost: 'images.example.com', kind: 'PARTNER_FEED' },
    location: { latitude: 25.01186, longitude: 121.45797, precision: 'DISTRICT_CENTER', source: 'https://data.gov.tw/dataset/25489' },
    locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false, aiDerivedPublicFields: false, aiSupplement: null };
}
