import { validateApiUrl } from './api';

export const CATEGORIES = [
  ['electronics', '電子產品'], ['home', '居家生活'], ['fashion', '服飾配件'], ['sports', '運動戶外'],
  ['books', '書籍'], ['toys', '玩具'], ['other', '其他'],
] as const;
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export class ListingFormError extends Error {}
export type PhotoRecord = { id: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; byteSize: number };
export function parsePhotoRecord(value: unknown, apiUrl: string, local = false): PhotoRecord {
  if (!value || typeof value !== 'object') throw new ListingFormError('照片上傳回應不正確');
  const record = value as Record<string, unknown>;
  if (!uuid(record.id)) throw new ListingFormError('照片上傳回應不正確');
  const base = validateApiUrl(apiUrl, local);
  if (record.imageUrl !== `${base}/api/listing-media/${record.id}/image` || record.thumbnailUrl !== `${base}/api/listing-media/${record.id}/thumbnail` ||
      ![record.width, record.height, record.byteSize].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0) || (record.width as number) > 1600 || (record.height as number) > 1600) {
    throw new ListingFormError('照片上傳回應不正確');
  }
  // Never forward a session token to an arbitrary server-supplied image origin.
  return { id: record.id, imageUrl: record.imageUrl as string, thumbnailUrl: record.thumbnailUrl as string, width: record.width as number, height: record.height as number, byteSize: record.byteSize as number };
}
export function taiwanDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export type ListingForm = {
  title: string; description: string; brand: string; category: string; condition: 'NEW' | 'USED'; price: string;
  county: string; district: string; latitude: string; longitude: string; meetup: boolean; shipping: boolean;
  negotiable: boolean; consent: boolean; expiryDate: string;
};
export const emptyListingForm: ListingForm = { title: '', description: '', brand: '', category: 'other', condition: 'USED', price: '', county: '', district: '', latitude: '', longitude: '',
  meetup: true, shipping: false, negotiable: false, consent: false, expiryDate: '' };

export type ListingPublishField = 'title' | 'description' | 'brand' | 'price' | 'photo' | 'location' | 'delivery' | 'consent' | 'expiryDate' | 'condition' | 'category';
export type ListingPublishIssue = { field: ListingPublishField; message: string };

/** First actionable field for the seller, in the same constraints as publishing. */
export function firstListingPublishIssue(form: ListingForm, mediaIds: string[], now = new Date()): ListingPublishIssue | null {
  if (!form.title.trim() || form.title.trim().length > 100) return { field: 'title', message: '請填寫 100 字內的商品名稱。' };
  if (!form.description.trim() || form.description.trim().length > 3000) return { field: 'description', message: '請填寫 3000 字內的商品狀況與說明。' };
  if (form.brand.trim().length > 60) return { field: 'brand', message: '品牌最多 60 字。' };
  if (!form.price || !/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) > 9_999_999_999.99)
    return { field: 'price', message: '請確認售價；贈送請填 0，最多兩位小數。' };
  if (!mediaIds.length || mediaIds.length > 8 || mediaIds.some(id => !uuid(id)) || new Set(mediaIds).size !== mediaIds.length)
    return { field: 'photo', message: '請先確認商品照片已私密上傳成功。' };
  if (!['NEW', 'USED'].includes(form.condition)) return { field: 'condition', message: '請選擇新品或二手。' };
  if (!CATEGORIES.some(category => category[0] === form.category)) return { field: 'category', message: '請選擇商品分類。' };
  const latitude = Number(form.latitude), longitude = Number(form.longitude);
  if (!form.county.trim() || !form.district.trim() || form.county.trim().length > 30 || form.district.trim().length > 30 ||
      !form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < 20 || latitude > 26.6 || longitude < 117 || longitude > 123.8)
    return { field: 'location', message: '請完成商品地點：使用目前位置，或填入縣市、行政區與有效地圖座標。' };
  if (!form.meetup && !form.shipping) return { field: 'delivery', message: '請至少選擇面交或寄送一種交付方式。' };
  if (!form.consent) return { field: 'consent', message: '請勾選同意公開照片與約略位置。' };
  if (form.expiryDate) {
    const day = new Date(`${form.expiryDate}T23:59:59.999+08:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate) || !Number.isFinite(day.getTime()) || taiwanDate(day) !== form.expiryDate || day <= now)
      return { field: 'expiryDate', message: '請重新選擇尚未失效的日期，或使用預設 30 天。' };
  }
  return null;
}

export function buildListingBody(form: ListingForm, clientListingId: string, mediaIds: string[], publish: boolean, now = new Date()) {
  const title = form.title.trim();
  if (!title || title.length > 100) throw new ListingFormError('請填寫100字內商品名稱');
  if (!uuid(clientListingId) || mediaIds.length > 8 || mediaIds.some(id => !uuid(id)) || new Set(mediaIds).size !== mediaIds.length) throw new ListingFormError('照片資料不正確');
  if (form.description.trim().length > 3000 || form.brand.trim().length > 60) throw new ListingFormError('商品說明或品牌過長');
  if (!CATEGORIES.some(c => c[0] === form.category) || !['NEW', 'USED'].includes(form.condition)) throw new ListingFormError('請選擇分類與新舊狀態');
  if (form.price && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) > 9_999_999_999.99)) throw new ListingFormError('請填寫有效售價，最多兩位小數');
  if (form.expiryDate) {
    const day = new Date(form.expiryDate + 'T23:59:59.999+08:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate) || !Number.isFinite(day.getTime()) || taiwanDate(day) !== form.expiryDate || day <= now) throw new ListingFormError('請選擇尚未失效的日期');
  }
  const hasLocation = [form.county, form.district, form.latitude, form.longitude].some(Boolean);
  const latitude = Number(form.latitude); const longitude = Number(form.longitude);
  if (hasLocation && (!form.county.trim() || !form.district.trim() || form.county.trim().length > 30 || form.district.trim().length > 30 || !form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 20 || latitude > 26.6 || longitude < 117 || longitude > 123.8)) throw new ListingFormError('請完成台灣縣市、行政區與有效位置');
  if (publish && (!form.description.trim() || !form.price || !mediaIds.length || !hasLocation || (!form.meetup && !form.shipping) || !form.consent)) throw new ListingFormError('上架前請完成說明、價格、照片、地區、交付方式並同意公開');
  return { clientListingId, title, condition: form.condition, category: form.category, currency: 'TWD', publish,
    ...(form.description.trim() ? { description: form.description.trim() } : {}), ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
    ...(form.price ? { price: Number(form.price) } : {}), deliveryMethods: [...(form.meetup ? ['MEETUP'] : []), ...(form.shipping ? ['SHIPPING'] : [])],
    negotiable: form.negotiable, mediaIds, consentToMap: form.consent,
    ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
    ...(hasLocation ? { location: { county: form.county.trim(), district: form.district.trim(), latitude, longitude } } : {}),
  };
}
