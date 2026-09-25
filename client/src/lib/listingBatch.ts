export const listingCategories = [
  ['electronics', '電子產品'], ['home', '居家生活'], ['fashion', '服飾配件'],
  ['sports', '運動戶外'], ['books', '書籍'], ['toys', '玩具'], ['other', '其他'],
] as const;

export type ListingField = 'title' | 'description' | 'brand' | 'category' | 'condition' | 'price';
export type ListingDraftForm = { title: string; description: string; brand: string; category: string; condition: 'NEW' | 'USED'; price: string };
export type ListingTouched = Partial<Record<ListingField, true>>;
export type SellerDraft = { clientListingId: string; form: ListingDraftForm; touched: ListingTouched };
const sellerFields: readonly ListingField[] = ['title', 'description', 'brand', 'category', 'condition', 'price'];
export function sameSellerContent(a: Pick<SellerDraft, 'form' | 'touched'>, b: Pick<SellerDraft, 'form' | 'touched'>) {
  return sellerFields.every(field => a.form[field] === b.form[field] && !!a.touched[field] === !!b.touched[field]);
}
export type AiDraft = Pick<ListingDraftForm, 'title' | 'description' | 'category'> & {
  brand: string | null; condition: 'NEW' | 'USED' | null;
  estimatedPriceLowTwd: number | null; estimatedPriceHighTwd: number | null;
  priceBasis: string | null; evidence: string[]; uncertainties: string[];
  confidence: number; source: 'MINIMAX_CODE_VISION';
};
export type AiStatus = 'SKIPPED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export const emptyListingDraft = (): ListingDraftForm => ({ title: '', description: '', brand: '', category: 'other', condition: 'USED', price: '' });
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const uploadMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxPhotoBytes = 5 * 1024 * 1024;

export async function prepareListingUploadFile(file: File): Promise<File> {
  if (uploadMime.has(file.type) && file.size <= maxPhotoBytes) return file;
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') throw new Error('此照片格式或大小不支援；請使用 5MB 以下的 JPEG、PNG 或 WebP');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('無法讀取這張照片；請改用 JPEG、PNG 或 WebP'); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此瀏覽器無法處理照片');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.type === 'image/jpeg' && blob.size <= maxPhotoBytes)
        return new File([blob], 'listing-photo.jpg', { type: 'image/jpeg' });
    }
    throw new Error('壓縮後照片仍超過 5MB，請換一張較小的照片');
  } finally { bitmap.close(); }
}

export function mergeAiDraft(form: ListingDraftForm, touched: ListingTouched, draft: AiDraft): ListingDraftForm {
  const suggestedPrice = draft.estimatedPriceLowTwd === null || draft.estimatedPriceHighTwd === null
    ? '' : String(Math.round((draft.estimatedPriceLowTwd + draft.estimatedPriceHighTwd) / 2));
  return {
    title: touched.title ? form.title : draft.title,
    description: touched.description ? form.description : draft.description,
    brand: touched.brand ? form.brand : draft.brand ?? '',
    category: touched.category ? form.category : draft.category,
    condition: touched.condition ? form.condition : draft.condition ?? 'USED',
    price: touched.price ? form.price : suggestedPrice,
  };
}

export function parseAiState(value: unknown, mediaId: string): { status: AiStatus; draft: AiDraft | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 回應格式不正確');
  const row = value as Record<string, unknown>;
  if (row.mediaId !== mediaId || !['SKIPPED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(String(row.status))) throw new Error('AI 回應格式不正確');
  if (row.status !== 'COMPLETED') return { status: row.status as AiStatus, draft: null };
  const draft = row.draft as AiDraft | null;
  if (!draft || typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 100 ||
      typeof draft.description !== 'string' || !draft.description.trim() || draft.description.length > 1500 ||
      !listingCategories.some(([key]) => key === draft.category) || draft.source !== 'MINIMAX_CODE_VISION' ||
      typeof draft.confidence !== 'number' || draft.confidence < 0.7 || draft.confidence > 1 ||
      !Array.isArray(draft.evidence) || draft.evidence.length < 2 || draft.evidence.length > 6 ||
      !draft.evidence.every(value => typeof value === 'string' && !!value.trim() && value.length <= 160) ||
      !Array.isArray(draft.uncertainties) || draft.uncertainties.length > 6 ||
      !draft.uncertainties.every(value => typeof value === 'string' && !!value.trim() && value.length <= 160) ||
      !(draft.brand === null || typeof draft.brand === 'string' && !!draft.brand.trim() && draft.brand.length <= 60) ||
      ![null, 'NEW', 'USED'].includes(draft.condition) ||
      !(draft.estimatedPriceLowTwd === null && draft.estimatedPriceHighTwd === null && draft.priceBasis === null ||
        Number.isSafeInteger(draft.estimatedPriceLowTwd) && Number.isSafeInteger(draft.estimatedPriceHighTwd) &&
        draft.estimatedPriceLowTwd! >= 0 && draft.estimatedPriceHighTwd! >= draft.estimatedPriceLowTwd! &&
        draft.estimatedPriceHighTwd! <= 1_000_000 && typeof draft.priceBasis === 'string' && !!draft.priceBasis.trim() &&
        draft.priceBasis.length <= 240)) throw new Error('AI 草稿內容不正確');
  return { status: 'COMPLETED', draft };
}

export function parseSellerDraft(value: unknown): SellerDraft | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('私人草稿格式不正確');
  const row = value as Record<string, unknown>;
  if (!isUuid(row.clientListingId) || !row.form || typeof row.form !== 'object' || !row.touched || typeof row.touched !== 'object') throw new Error('私人草稿格式不正確');
  const form = row.form as ListingDraftForm;
  const touched = row.touched as ListingTouched;
  if (typeof form.title !== 'string' || typeof form.description !== 'string' || typeof form.brand !== 'string' || typeof form.price !== 'string' ||
      !listingCategories.some(([key]) => key === form.category) || !['NEW', 'USED'].includes(form.condition) ||
      Object.entries(touched).some(([key, flag]) => !['title', 'description', 'brand', 'category', 'condition', 'price'].includes(key) || flag !== true)) throw new Error('私人草稿格式不正確');
  return { clientListingId: row.clientListingId, form, touched };
}

export type PublishDetails = { county: string; district: string; latitude: string; longitude: string;
  meetup: boolean; shipping: boolean; negotiable: boolean; expiryDate: string; consent: boolean };
export function buildPublishedListing(draft: SellerDraft, mediaId: string, details: PublishDetails) {
  const form = draft.form;
  if (!isUuid(mediaId) || !isUuid(draft.clientListingId)) throw new Error('照片或草稿識別碼不正確');
  if (!form.title.trim() || form.title.length > 100 || !form.description.trim() || form.description.length > 3000 ||
      form.brand.length > 60 || !listingCategories.some(([key]) => key === form.category) || !['NEW', 'USED'].includes(form.condition)) throw new Error('請檢查商品名稱、說明、品牌與分類');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) > 9_999_999_999.99) throw new Error('請填寫有效售價');
  const latitude = Number(details.latitude), longitude = Number(details.longitude);
  if (!details.county.trim() || !details.district.trim() || details.county.length > 30 || details.district.length > 30 ||
      !details.latitude.trim() || !details.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < 20 || latitude > 26.6 || longitude < 117 || longitude > 123.8) throw new Error('請完成台灣縣市、行政區與有效位置');
  if (!details.meetup && !details.shipping) throw new Error('請選擇至少一種交付方式');
  if (!details.consent) throw new Error('請確認同意公開商品至地圖');
  if (details.expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(details.expiryDate)) throw new Error('請選擇未來的失效日期');
    const end = new Date(`${details.expiryDate}T23:59:59.999+08:00`);
    if (!Number.isFinite(end.getTime())) throw new Error('請選擇未來的失效日期');
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(end);
    const localDate = `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
    if (localDate !== details.expiryDate || end <= new Date()) throw new Error('請選擇未來的失效日期');
  }
  // The server also snaps to the same ~2 km grid. Snap before transport so
  // neither the publication request nor its idempotency journal has exact GPS.
  const publicLatitude = Number(Math.min(26.59, Math.floor(latitude / 0.02) * 0.02 + 0.01).toFixed(2));
  const publicLongitude = Number(Math.min(123.79, Math.floor(longitude / 0.02) * 0.02 + 0.01).toFixed(2));
  return { clientListingId: draft.clientListingId, title: form.title.trim(), description: form.description.trim(), brand: form.brand.trim() || undefined,
    category: form.category, condition: form.condition, price: Number(form.price), currency: 'TWD', publish: true,
    mediaIds: [mediaId], deliveryMethods: [...(details.meetup ? ['MEETUP'] : []), ...(details.shipping ? ['SHIPPING'] : [])],
    negotiable: details.negotiable, consentToMap: true, location: { county: details.county.trim(), district: details.district.trim(), latitude: publicLatitude, longitude: publicLongitude },
    ...(details.expiryDate ? { expiryDate: details.expiryDate } : {}) };
}
