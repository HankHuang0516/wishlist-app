import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ListingBatchPage from './ListingBatchPage';
import { API_URL } from '../config';
import { listingCreationJournal, parseListingCreationJournal } from '../lib/listingCreationWeb';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
const pending = vi.hoisted(() => new Map<string, string>());
vi.mock('../lib/webPendingStore', async importOriginal => ({ ...await importOriginal<typeof import('../lib/webPendingStore')>(), privatePendingStore: {
  get: vi.fn(async (key: string) => pending.get(key) ?? null),
  save: vi.fn(async (key: string, body: string) => { if (pending.has(key) && pending.get(key) !== body) throw new Error('Different pending operation'); pending.set(key, body); }),
  clear: vi.fn(async (key: string, body: string) => { if (pending.get(key) !== body) return false; pending.delete(key); return true; }),
} }));

const mediaId = '11111111-1111-4111-8111-111111111111';
const ai = { title: '二手檯燈', description: '賣家應確認功能是否正常。', brand: null, category: 'home', condition: 'USED',
  estimatedPriceLowTwd: 100, estimatedPriceHighTwd: 600, priceBasis: '依照片外觀粗估', evidence: ['可見燈罩', '可見底座'],
  uncertainties: ['未測試功能'], confidence: 0.8, source: 'MINIMAX_CODE_VISION' };
const auth = { user: { id: 19, phoneNumber: 'test' }, token: 'test-session', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };

describe('web private batch listing flow', () => {
  const calls: { path: string; method: string; body?: string }[] = [];
  let loseFirstPublicationResponse = false;
  let loseUploadResponse = false;
  let uploadLookups = 0;
  let unusedReads = 0;
  let currentUploadId = '';
  let holdOldAccountList = false;
  let manyPrivateDrafts = 0;
  let completedPrivateDrafts = false;
  let aiGetStatus: 'PENDING' | 'COMPLETED' = 'COMPLETED';
  let rejectPublicationAt = 0;
  let losePublicationAt = 0;
  let holdUploadAck = false;
  let releaseUploadAck: (() => void) | undefined;
  let showUploadedPrivatePhoto = false;
  let showPendingPrivatePhoto = false;
  let holdSellerSave = false;
  let releaseSellerSave: (() => void) | undefined;
  let releaseOldAccountList: (() => void) | undefined;
  let holdPublicationAck = false;
  let releasePublicationAck: (() => void) | undefined;
  const receipts = new Map<string, { receipt: Record<string, unknown>; listing: Record<string, unknown> | null }>();
  beforeEach(() => {
    calls.length = 0;
    loseFirstPublicationResponse = false;
    loseUploadResponse = false;
    uploadLookups = 0;
    unusedReads = 0;
    currentUploadId = '';
    holdOldAccountList = false;
    manyPrivateDrafts = 0;
    completedPrivateDrafts = false;
    aiGetStatus = 'COMPLETED';
    rejectPublicationAt = 0;
    losePublicationAt = 0;
    holdUploadAck = false;
    releaseUploadAck = undefined;
    showUploadedPrivatePhoto = false;
    showPendingPrivatePhoto = false;
    holdSellerSave = false;
    releaseSellerSave = undefined;
    releaseOldAccountList = undefined;
    holdPublicationAck = false; releasePublicationAck = undefined;
    localStorage.clear();
    pending.clear(); receipts.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:private-test');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (path.includes('/listing-media/unused?purpose=BATCH_ITEM')) {
        if (holdOldAccountList && (init?.headers as Record<string, string>)?.Authorization === 'Bearer test-session') {
          await new Promise<void>(resolve => { releaseOldAccountList = resolve; });
          return { ok: true, status: 200, json: async () => ({ items: [{ id: mediaId, aiDraftStatus: 'COMPLETED', aiDraft: { ...ai, title: '舊帳號私有商品' }, sellerDraft: null, sellerDraftVersion: 0 }] }) };
        }
        if (manyPrivateDrafts) {
          const rows = Array.from({ length: manyPrivateDrafts }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            aiDraftStatus: 'SKIPPED', aiDraft: null, sellerDraft: completedPrivateDrafts ? {
              clientListingId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              touched: {}, form: { title: `測試商品 ${index + 1}`, description: '賣家已核對照片及實際商品狀況。', brand: '', category: 'home', condition: 'USED', price: '350' },
            } : null, sellerDraftVersion: 0,
          }));
          const cursor = new URL(path).searchParams.get('cursor');
          const start = cursor ? rows.findIndex(row => row.id === cursor) + 1 : 0;
          const items = rows.slice(start, start + 30);
          return { ok: true, status: 200, json: async () => ({ items,
            nextCursor: start + 30 < rows.length ? items[items.length - 1].id : null }) };
        }
        unusedReads++;
        const items = showPendingPrivatePhoto ? [{ id: mediaId, clientUploadId: currentUploadId,
          aiDraftStatus: 'PENDING', aiDraft: null, sellerDraftVersion: 0,
          sellerDraft: { clientListingId: '33333333-3333-4333-8333-333333333333', touched: {},
            form: { title: '賣家確認的檯燈', description: '賣家已檢查外觀。', brand: '', category: 'home', condition: 'USED', price: '350' } } }] :
          (loseUploadResponse && unusedReads >= 3 || showUploadedPrivatePhoto) ? [{ id: mediaId, clientUploadId: currentUploadId,
            aiDraftStatus: showUploadedPrivatePhoto ? 'COMPLETED' : 'SKIPPED', aiDraft: showUploadedPrivatePhoto ? ai : null,
            sellerDraft: null, sellerDraftVersion: 0 }] : [];
        return { ok: true, status: 200, json: async () => ({ items }) };
      }
      if (/\/listing-media\/[0-9a-f-]{36}\/thumbnail$/.test(path)) return { ok: true, blob: async () => new Blob(['private']) };
      if (path.endsWith('/listing-media') && method === 'POST') {
        currentUploadId = String((init?.body as FormData).get('clientUploadId'));
        if (holdUploadAck) await new Promise<void>(resolve => { releaseUploadAck = resolve; });
        if (loseUploadResponse) throw new Error('upload ACK lost');
        showUploadedPrivatePhoto = true;
        return { ok: true, status: 201, json: async () => ({ id: mediaId }) };
      }
      if (path.includes('/listing-media/by-upload-id/')) {
        uploadLookups++;
        if (uploadLookups === 1) return { ok: false, status: 404, json: async () => ({ error: 'not yet visible' }) };
        return { ok: true, status: 200, json: async () => ({ id: mediaId, listingId: null, wishItemId: null }) };
      }
      if (path.endsWith(`/listing-media/${mediaId}/ai-draft`) && method === 'POST') return { ok: true, status: 202, json: async () => ({ mediaId, status: 'COMPLETED', draft: ai }) };
      if (path.endsWith(`/listing-media/${mediaId}/ai-draft`) && method === 'GET') return { ok: true, status: 200, json: async () => ({ mediaId, status: aiGetStatus, draft: aiGetStatus === 'COMPLETED' ? ai : null }) };
      if (/\/listing-media\/[0-9a-f-]{36}\/seller-draft$/.test(path) && method === 'PUT') {
        if (holdSellerSave) await new Promise<void>(resolve => { releaseSellerSave = resolve; });
        return { ok: true, status: 200, json: async () => ({ mediaId: path.split('/').at(-2), version: JSON.parse(String(init?.body)).expectedVersion + 1 }) };
      }
      if (path.endsWith('/listings') && method === 'POST') {
        if (calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST').length === rejectPublicationAt)
          return { ok: false, status: 422, json: async () => ({ error: '商品資料需要重新確認' }) };
        const body = JSON.parse(String(init?.body)), raw = await listingCreationJournal(String(init?.body)), journal = await parseListingCreationJournal(raw);
        const base = API_URL.replace(/\/api\/?$/, ''), timestamp = '2026-10-01T00:00:00.000Z';
        const listing = { id: body.clientListingId, ownerUserId: 19, owner: { id: 19, name: '合成賣家' }, title: body.title,
          description: body.description, condition: body.condition, category: body.category, brand: body.brand ?? null, price: String(body.price), currency: 'TWD',
          deliveryMethods: body.deliveryMethods, negotiable: body.negotiable, status: 'ACTIVE', version: 1, expiryMode: body.expiryDate ? 'CUSTOM_DATE' : 'DEFAULT_30_DAYS',
          createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp, lastVerifiedAt: timestamp, expiresAt: '2030-01-31T15:59:59.999Z',
          location: { county: body.location.county, district: body.location.district, publicLatitude: body.location.latitude, publicLongitude: body.location.longitude, precisionMeters: 2200 },
          media: body.mediaIds.map((id: string, position: number) => ({ id, imageUrl: `${base}/api/listing-media/${id}/image`, thumbnailUrl: `${base}/api/listing-media/${id}/thumbnail`, position, capturePurpose: 'BATCH_ITEM' })) };
        receipts.set(body.clientListingId, { receipt: { clientListingId: body.clientListingId, requestHash: journal.requestHash, state: 'CREATED', listingId: listing.id, createdAt: timestamp }, listing });
        if (holdPublicationAck) await new Promise<void>(resolve => { releasePublicationAck = resolve; });
        if (calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST').length === losePublicationAt) throw new Error('response lost');
        if (loseFirstPublicationResponse) { loseFirstPublicationResponse = false; throw new Error('response lost'); }
        return { ok: true, status: 201, json: async () => listing };
      }
      if (path.includes('/listings/creation-receipts/')) {
        const id = path.split('/creation-receipts/')[1].split('/')[0];
        if (method === 'POST' && path.endsWith('/abandon') && !receipts.has(id)) receipts.set(id, { receipt: { clientListingId: id, requestHash: JSON.parse(String(init?.body)).requestHash, state: 'ABANDONED', listingId: null, createdAt: '2026-10-01T00:00:00.000Z' }, listing: null });
        return receipts.has(id) ? { ok: true, status: 200, json: async () => receipts.get(id) } : { ok: false, status: 404, json: async () => ({ error: 'Receipt not found', errorCode: 'LISTING_CREATE_NOT_FOUND' }) };
      }
      throw new Error(`Unexpected ${method} ${path}`);
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  function fillSharedDetails() {
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度（度）'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度（度）'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
  }
  const view = (value = auth) => <MemoryRouter><AuthContext.Provider value={value}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>;
  async function publishOne() {
    await screen.findByDisplayValue('二手檯燈'); fillSharedDetails();
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/)); fireEvent.click(screen.getByText('確認並刊登'));
  }
  async function uploadInput() {
    const input = await screen.findByLabelText('批次選擇商品照片');
    await waitFor(() => expect(input).not.toBeDisabled());
    return input;
  }

  it('focuses and highlights the exact missing field when review cannot be checked', async () => {
    showUploadedPrivatePhoto = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('二手檯燈');
    const review = screen.getByLabelText(/我已逐欄確認第 1 件/);
    fireEvent.click(review);
    expect(review).not.toBeChecked();
    expect(screen.getByLabelText('縣市')).toHaveFocus();
    expect(screen.getByLabelText('縣市')).toHaveAttribute('aria-invalid', 'true');
    fillSharedDetails();
    fireEvent.change(screen.getByLabelText('賣家售價（TWD）'), { target: { value: '' } });
    fireEvent.click(review);
    expect(screen.getByLabelText('賣家售價（TWD）')).toHaveFocus();
    expect(screen.getByLabelText('賣家售價（TWD）')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByLabelText('賣家售價（TWD）')).toHaveAccessibleDescription(/請填寫有效售價/);
    expect(screen.getByLabelText('縣市')).not.toHaveAttribute('aria-invalid');
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);
  });

  it('requires review even when all content and public consent are filled', async () => {
    showUploadedPrivatePhoto = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('二手檯燈');
    fillSharedDetails();
    fireEvent.click(screen.getByText('確認並刊登'));
    expect(screen.getByLabelText(/我已逐欄確認第 1 件/)).toHaveFocus();
    expect(await screen.findByText('請先逐欄確認這件商品的照片、內容及售價。')).toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);
  });

  it('invalidates review after individual edits or shared expiry and consent changes', async () => {
    showUploadedPrivatePhoto = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('二手檯燈');
    fillSharedDetails();
    const review = screen.getByLabelText(/我已逐欄確認第 1 件/);
    fireEvent.click(review);
    expect(review).toBeChecked();
    fireEvent.change(screen.getByLabelText('商品名稱'), { target: { value: '已確認正常的檯燈' } });
    expect(review).not.toBeChecked();
    fireEvent.click(review);
    fireEvent.change(screen.getByLabelText(/自訂失效日期/), { target: { value: '2030-01-31' } });
    expect(review).not.toBeChecked();
    expect(screen.getByLabelText(/我已確認商品真實/)).not.toBeChecked();
    fireEvent.click(review);
    expect(screen.getByLabelText(/我已確認商品真實/)).toHaveFocus();
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(review);
    expect(review).toBeChecked();
    fireEvent.change(screen.getByLabelText(/自訂失效日期/), { target: { value: '' } });
    expect(review).not.toBeChecked();
    expect(screen.getByLabelText(/自訂失效日期/)).toHaveValue('');
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);
  });

  it('keeps review on identical polls but resets it on a new AI suggestion', async () => {
    showPendingPrivatePhoto = true;
    aiGetStatus = 'PENDING';
    let tick: (() => void) | undefined;
    const original = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === 3000) { tick = handler as () => void; return 1; }
      return original(handler, timeout, ...args);
    });
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('賣家確認的檯燈');
    fillSharedDetails();
    const review = screen.getByLabelText(/我已逐欄確認第 1 件/);
    fireEvent.click(review);
    await act(async () => tick!());
    expect(review).toBeChecked();
    aiGetStatus = 'COMPLETED';
    await act(async () => tick!());
    expect(review).not.toBeChecked();
    expect(screen.getByDisplayValue('二手檯燈')).toBeInTheDocument();
  });

  it('publishes only checked items with one batch confirmation and distinct original IDs', async () => {
    manyPrivateDrafts = 3; completedPrivateDrafts = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('測試商品 1');
    fillSharedDetails();
    const reviews = screen.getAllByLabelText(/我已逐欄確認第/);
    fireEvent.click(reviews[0]); fireEvent.click(reviews[2]);
    fireEvent.click(screen.getByText('刊登已逐件確認的商品（2）'));
    await screen.findByText('已確認刊登 2 件商品。未勾選的照片仍是私人草稿。');
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts.map(post => JSON.parse(post.body!).title)).toEqual(['測試商品 3', '測試商品 1']);
    expect(new Set(posts.map(post => JSON.parse(post.body!).clientListingId)).size).toBe(2);
    expect(screen.getByDisplayValue('測試商品 2')).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('前往我的商品查看與管理')).toHaveAttribute('href', '/my-listings');
  });

  it('stops after a failed middle item and never sends the later reviewed item', async () => {
    manyPrivateDrafts = 3; completedPrivateDrafts = true; rejectPublicationAt = 2;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('測試商品 1');
    fillSharedDetails();
    for (const review of screen.getAllByLabelText(/我已逐欄確認第/)) fireEvent.click(review);
    fireEvent.click(screen.getByText('刊登已逐件確認的商品（3）'));
    await screen.findByText(/已確認刊登 1 件；本件未完成/);
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(2);
    expect(screen.getByDisplayValue('測試商品 1')).toBeInTheDocument();
    expect(screen.getByText(/刊登結果待確認：商品資料需要重新確認/)).toBeInTheDocument();
    expect(pending.size).toBe(1);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
  });

  it('stops the remaining batch when a middle publication has an unknown outcome', async () => {
    manyPrivateDrafts = 3; completedPrivateDrafts = true; losePublicationAt = 2;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('測試商品 1');
    fillSharedDetails();
    for (const review of screen.getAllByLabelText(/我已逐欄確認第/)) fireEvent.click(review);
    fireEvent.click(screen.getByText('刊登已逐件確認的商品（3）'));
    await screen.findByText('前次刊登結果尚未確認');
    await screen.findByText(/已確認刊登 1 件；本件未完成/);
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(JSON.stringify((await parseListingCreationJournal([...pending.values()][0])).payload)).toBe(posts[1].body);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
    expect(screen.getByLabelText('縣市')).toBeDisabled();
    expect(screen.getByDisplayValue('測試商品 1')).toBeDisabled();
    expect(screen.getByText(/刊登已逐件確認的商品/)).toBeDisabled();
    expect(screen.getByText(/已確認刊登 1 件；本件未完成/)).toHaveTextContent('後續 1 件尚未送出');
  });

  it('stops uploading the next photo after the account changes while the first ACK is pending', async () => {
    holdUploadAck = true;
    const view = render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' }), new File(['cup'], 'cup.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(releaseUploadAck).toBeDefined());
    view.rerender(<MemoryRouter><AuthContext.Provider value={{ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByText('還沒有私人商品照片，現在就拍第一件吧。');
    await act(async () => releaseUploadAck!());
    expect(calls.filter(call => call.path.endsWith('/listing-media') && call.method === 'POST')).toHaveLength(1);
    expect(calls.some(call => call.path.endsWith('/ai-draft') && call.method === 'POST')).toBe(false);
    expect(localStorage.getItem('wishlist:listing-upload-pending:19')).toContain(currentUploadId);
    expect(localStorage.getItem('wishlist:listing-upload-pending:20')).toBeNull();
    expect(screen.queryByDisplayValue('二手檯燈')).toBeNull();
  });

  it('locks shared settings and rejects rapid duplicate publication while saving', async () => {
    showUploadedPrivatePhoto = true; holdSellerSave = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('二手檯燈');
    fillSharedDetails();
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/));
    const publish = screen.getByText('確認並刊登');
    fireEvent.click(publish); fireEvent.click(publish);
    await waitFor(() => expect(releaseSellerSave).toBeDefined());
    expect(screen.getByLabelText('縣市')).toBeDisabled();
    expect(screen.getByLabelText(/自訂失效日期/)).toBeDisabled();
    expect(screen.getByLabelText(/我已逐欄確認第 1 件/)).toBeDisabled();
    await act(async () => releaseSellerSave!());
    await screen.findByText('商品刊登已確認。其他照片仍是私人草稿。');
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it('allows the next field to be edited while background save is pending and retains the newer draft', async () => {
    showUploadedPrivatePhoto = true; holdSellerSave = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('二手檯燈');
    const title = screen.getByLabelText('商品名稱');
    const description = screen.getByLabelText('商品說明');
    fireEvent.change(title, { target: { value: '手動核對後的檯燈' } });
    fireEvent.blur(title, { relatedTarget: description });
    await waitFor(() => expect(releaseSellerSave).toBeDefined());
    expect(description).not.toBeDisabled();
    fireEvent.change(description, { target: { value: '儲存期間仍可輸入的最新商品說明。' } });
    fireEvent.blur(description, { relatedTarget: screen.getByLabelText('賣家售價（TWD）') });
    expect(calls.filter(call => call.path.endsWith('/seller-draft') && call.method === 'PUT')).toHaveLength(1);
    await act(async () => releaseSellerSave!());
    expect(description).toHaveValue('儲存期間仍可輸入的最新商品說明。');
    expect(screen.getByText('儲存私人草稿')).toBeEnabled();
    holdSellerSave = false;
    fireEvent.click(screen.getByText('儲存私人草稿'));
    await screen.findByText('已儲存');
    const saves = calls.filter(call => call.path.endsWith('/seller-draft') && call.method === 'PUT');
    expect(saves).toHaveLength(2);
    expect(JSON.parse(saves[1].body!)).toMatchObject({ expectedVersion: 1, draft: { form: { description: '儲存期間仍可輸入的最新商品說明。' } } });
  });

  it('restores every returned private draft even when another device exceeded one capture batch', async () => {
    manyPrivateDrafts = 13;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('等待辨識或手動填寫')).toHaveLength(13));
    expect(screen.getByText(/目前有 13 件私人草稿/)).toBeInTheDocument();
    expect(screen.getByLabelText('拍一件商品')).toBeDisabled();
    expect(screen.getByLabelText('批次選擇商品照片')).toBeDisabled();
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);
  });

  it('loads older private drafts beyond the server first page without silently hiding them', async () => {
    manyPrivateDrafts = 32;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('等待辨識或手動填寫')).toHaveLength(32));
    expect(calls.filter(call => call.path.includes('/listing-media/unused?purpose=BATCH_ITEM'))).toHaveLength(2);
    expect(screen.getByText(/目前有 32 件私人草稿/)).toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);
  });

  it('keeps upload private until seller supplies details and explicitly confirms publication', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    expect(screen.getByText(/AI 參考價格/)).toHaveTextContent('NT$100–600');
    expect(screen.getByText(/此售價由 AI 參考區間中間值預填/)).toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);

    fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText('請完成台灣縣市、行政區與有效位置');
    expect(calls.some(call => call.path.endsWith('/listings'))).toBe(false);

    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度（度）'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度（度）'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/));
    fireEvent.click(screen.getByText('確認並刊登'));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(true));
    const posted = calls.find(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(JSON.parse(posted!.body!)).toMatchObject({ publish: true, mediaIds: [mediaId], price: 350, consentToMap: true });
    expect(await screen.findByText('商品刊登已確認。其他照片仍是私人草稿。')).toBeInTheDocument();
  });

  it('labels an AI-prefilled price as unverified and removes that label after seller edits it', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    const price = await screen.findByLabelText('賣家售價（TWD）');
    await waitFor(() => expect(price).toHaveValue('350'));
    expect(screen.getByText(/此售價由 AI 參考區間中間值預填/)).toBeInTheDocument();
    fireEvent.change(price, { target: { value: '420' } });
    expect(screen.queryByText(/此售價由 AI 參考區間中間值預填/)).toBeNull();
    expect(price).toHaveValue('420');
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
  });

  it('keeps the exact seller-reviewed details visible while a late AI poll arrives during publication', async () => {
    showPendingPrivatePhoto = true;
    holdSellerSave = true;
    let aiTick: (() => void) | undefined;
    const realSetInterval = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === 3000) { aiTick = handler as () => void; return 1; }
      return realSetInterval(handler, timeout, ...args);
    });
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByDisplayValue('賣家確認的檯燈');
    await waitFor(() => expect(aiTick).toBeDefined());
    fireEvent.change(screen.getByLabelText('品牌（選填）'), { target: { value: '自有品牌' } });
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度（度）'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度（度）'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/));
    fireEvent.click(screen.getByText('確認並刊登'));
    await waitFor(() => expect(releaseSellerSave).toBeDefined());
    await act(async () => { aiTick!(); });
    expect(screen.getByDisplayValue('賣家確認的檯燈')).toBeInTheDocument();
    await act(async () => { releaseSellerSave!(); });
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(true));
    const posted = calls.find(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(JSON.parse(posted!.body!)).toMatchObject({ title: '賣家確認的檯燈', brand: '自有品牌' });
    await screen.findByText('商品刊登已確認。其他照片仍是私人草稿。');
  });

  it('uses a GET-only immutable receipt when publication response is lost', async () => {
    loseFirstPublicationResponse = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度（度）'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度（度）'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/));
    fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText(/前次刊登結果尚未確認/);
    await screen.findByText(/刊登結果待確認：response lost/);
    expect(pending.size).toBe(1);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
    fireEvent.click(screen.getByText('查核原刊登結果'));
    await screen.findByText(/原刊登已確認；目前狀態：在售/);
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(calls.filter(call => call.path.includes('/creation-receipts/') && call.method === 'GET')).toHaveLength(1);
    expect(pending.size).toBe(0);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
  });

  it('never posts a listing when the browser cannot persist its publication journal', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度（度）'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度（度）'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/));
    vi.mocked(privatePendingStore.save).mockRejectedValueOnce(new Error('Storage unavailable'));
    fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText(/商品尚未送出/);
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
    expect(screen.getByText('確認並刊登')).toBeDisabled();
    fireEvent.click(screen.getByText('重試讀取安全紀錄'));
    await waitFor(() => expect(screen.getByText('確認並刊登')).not.toBeDisabled());
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
  });

  it('does not enable upload or publication when an existing journal cannot be read', async () => {
    const realGetItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, 'getItem').mockImplementation(key => {
      if (key === 'wishlist:listing-pending:19') throw new DOMException('Storage unavailable', 'SecurityError');
      return realGetItem(key);
    });
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByText(/無法讀取安全刊登紀錄/);
    expect(screen.getByLabelText('批次選擇商品照片')).toBeDisabled();
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
  });

  it('reopens a committed unknown ACK with GET only and safely clears the original encrypted journal', async () => {
    showUploadedPrivatePhoto = true; loseFirstPublicationResponse = true;
    const first = render(view()); await publishOne(); await screen.findByText(/刊登結果待確認：response lost/);
    expect(pending.size).toBe(1); first.unmount();
    render(view()); await screen.findByText(/原刊登已確認；目前狀態：在售/);
    await waitFor(() => expect(pending.size).toBe(0));
    expect(screen.getByText('前往我的商品查看與管理')).toHaveAttribute('href', '/my-listings');
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(1);
    expect(calls.filter(call => call.path.includes('/creation-receipts/') && call.method === 'GET')).toHaveLength(1);
  });

  it('does not label later sold or physically erased goods as currently public on recovery', async () => {
    showUploadedPrivatePhoto = true; loseFirstPublicationResponse = true;
    render(view()); await publishOne(); await screen.findByText(/刊登結果待確認：response lost/);
    const receipt = [...receipts.values()][0]; receipt.listing!.status = 'SOLD'; receipt.listing!.version = 5;
    fireEvent.click(screen.getByText('查核原刊登結果'));
    await screen.findByText(/原刊登已確認；目前狀態：已售出/);
    expect(screen.queryByText(/已公開/)).toBeNull();
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(1);
  });

  it('keeps a missing receipt frozen until an explicit identical retry succeeds', async () => {
    showUploadedPrivatePhoto = true; rejectPublicationAt = 1;
    render(view()); await publishOne(); await screen.findByText(/刊登結果待確認：商品資料需要重新確認/);
    fireEvent.click(screen.getByText('查核原刊登結果'));
    await screen.findByText(/這不代表延遲刊登不會完成/);
    expect(screen.getByLabelText('縣市')).toBeDisabled();
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(1);
    rejectPublicationAt = 0; fireEvent.click(screen.getByText('重試同一刊登'));
    await screen.findByText(/原刊登已確認；目前狀態：在售/);
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(2); expect(posts[1].body).toBe(posts[0].body); expect(pending.size).toBe(0);
  });

  it('requires two-step terminal cancellation before a new reviewed operation can use a new ID', async () => {
    showUploadedPrivatePhoto = true; rejectPublicationAt = 1;
    render(view()); await publishOne(); await screen.findByText(/刊登結果待確認：商品資料需要重新確認/);
    fireEvent.click(screen.getByText('安全取消原操作'));
    expect(calls.some(call => call.path.endsWith('/abandon'))).toBe(false);
    fireEvent.click(screen.getByText('確認安全取消'));
    await screen.findByText(/後台已安全取消原刊登/); await waitFor(() => expect(pending.size).toBe(0));
    expect(screen.getByLabelText(/我已逐欄確認第 1 件/)).not.toBeChecked();
    const cancel = calls.find(call => call.path.endsWith('/abandon'))!;
    expect(Object.keys(JSON.parse(cancel.body!))).toEqual(['requestHash']); expect(calls.some(call => call.method === 'DELETE')).toBe(false);
    rejectPublicationAt = 0; fireEvent.click(screen.getByLabelText(/我已逐欄確認第 1 件/)); fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText('商品刊登已確認。其他照片仍是私人草稿。');
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(2); expect(JSON.parse(posts[1].body!).clientListingId).not.toBe(JSON.parse(posts[0].body!).clientListingId);
  });

  it('uses cleanup-only after a confirmed ACK whose browser CAS cleanup failed', async () => {
    showUploadedPrivatePhoto = true; vi.mocked(privatePendingStore.clear).mockResolvedValueOnce(false);
    render(view()); await publishOne(); await screen.findByText(/瀏覽器紀錄未能安全清理/);
    expect(screen.queryByText('重試同一刊登')).toBeNull(); expect(pending.size).toBe(1);
    const before = calls.filter(call => call.path.includes('/listings')).length;
    fireEvent.click(screen.getByText('重試安全清理紀錄'));
    await waitFor(() => expect(pending.size).toBe(0));
    expect(calls.filter(call => call.path.includes('/listings'))).toHaveLength(before);
  });

  it('quarantines a corrupted encrypted journal without falling back to plaintext or posting', async () => {
    pending.set(await pendingRequestKey(API_URL, 19, 'listing'), '{corrupt');
    render(view()); await screen.findByText(/無法讀取安全刊登紀錄/);
    expect(screen.getByLabelText('批次選擇商品照片')).toBeDisabled();
    expect(calls.some(call => call.path.includes('/listings'))).toBe(false); expect(pending.size).toBe(1);
  });

  it('quarantines an unscoped legacy record and never adopts, resends, cancels or erases it', async () => {
    const old = JSON.stringify({ clientListingId: '33333333-3333-4333-8333-333333333333', title: '二手檯燈', description: '完整合成私人草稿。', condition: 'USED', category: 'home', currency: 'TWD', price: 350,
      negotiable: false, publish: true, consentToMap: true, deliveryMethods: ['MEETUP'], mediaIds: [mediaId], location: { county: '臺北市', district: '中山區', latitude: 25.05, longitude: 121.53 } });
    localStorage.setItem('wishlist:listing-pending:19', old); render(view());
    await screen.findByText(/恢復仍待確認/);
    expect(screen.getByLabelText('批次選擇商品照片')).toBeDisabled();
    expect(calls.filter(call => call.path.includes('/creation-receipts/')).map(call => call.method)).toEqual(['GET']);
    expect(pending.size).toBe(0); expect(localStorage.getItem('wishlist:listing-pending:19')).toBe(old);
  });

  it('checks a known legacy receipt read-only while preserving its unscoped original record', async () => {
    showUploadedPrivatePhoto = true; loseFirstPublicationResponse = true;
    const first = render(view()); await publishOne(); await screen.findByText(/刊登結果待確認：response lost/);
    const old = calls.find(call => call.path.endsWith('/listings') && call.method === 'POST')!.body!;
    first.unmount(); pending.clear(); localStorage.setItem('wishlist:listing-pending:19', old);
    render(view()); await screen.findByText('舊版刊登紀錄已核對');
    expect(calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST')).toHaveLength(1);
    expect(pending.size).toBe(0); expect(localStorage.getItem('wishlist:listing-pending:19')).toBe(old);
  });

  it('does not clear the old owner journal or populate a new account after a late POST ACK', async () => {
    showUploadedPrivatePhoto = true; holdPublicationAck = true;
    const mounted = render(view()); await publishOne(); await waitFor(() => expect(releasePublicationAck).toBeDefined());
    const oldKey = await pendingRequestKey(API_URL, 19, 'listing'); expect(pending.has(oldKey)).toBe(true);
    showUploadedPrivatePhoto = false; mounted.rerender(view({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }));
    await screen.findByText(/還沒有私人商品照片/); await act(async () => releasePublicationAck!());
    expect(screen.queryByText(/原刊登已確認/)).toBeNull(); expect(screen.queryByText(/刊登結果待確認/)).toBeNull();
    expect(pending.has(oldKey)).toBe(true); expect(pending.has(await pendingRequestKey(API_URL, 20, 'listing'))).toBe(false);
    expect(calls.filter(call => call.path.includes('/creation-receipts/'))).toHaveLength(0);
  });

  it('recovers a committed photo after upload ACK loss and one stale private list', async () => {
    loseUploadResponse = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText(/有 1 張照片的上傳結果待確認/);
    expect(input).toBeDisabled();
    expect(calls.filter(call => call.path.endsWith('/listing-media') && call.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByText('重新確認上傳'));
    await waitFor(() => expect(screen.queryByText(/上傳結果待確認/)).toBeNull());
    expect(await screen.findByText('等待辨識或手動填寫')).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(calls.filter(call => call.path.endsWith('/listing-media') && call.method === 'POST')).toHaveLength(1);
    expect(localStorage.getItem('wishlist:listing-upload-pending:19')).toBeNull();
  });

  it('keeps a confirmed private photo visible and stops the batch when clearing its browser journal fails', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await uploadInput();
    await waitFor(() => expect(input).not.toBeDisabled());
    showUploadedPrivatePhoto = true;
    const realRemoveItem = localStorage.removeItem.bind(localStorage);
    const realGetItem = localStorage.getItem.bind(localStorage);
    let denyJournalRead = false;
    vi.spyOn(localStorage, 'getItem').mockImplementation(key => {
      if (key === 'wishlist:listing-upload-pending:19' && denyJournalRead)
        throw new DOMException('Storage unavailable', 'SecurityError');
      return realGetItem(key);
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(key => {
      if (key === 'wishlist:listing-upload-pending:19') {
        denyJournalRead = true;
        throw new DOMException('Storage unavailable', 'SecurityError');
      }
      return realRemoveItem(key);
    });
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' }),
      new File(['second'], 'cup.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    expect(await screen.findByText(/已由後台確認私密保存/)).toBeInTheDocument();
    expect(screen.getByText(/有 1 張照片的上傳結果待確認/)).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(calls.filter(call => call.path.endsWith('/listing-media') && call.method === 'POST')).toHaveLength(1);
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
    vi.mocked(localStorage.removeItem).mockRestore();
    vi.mocked(localStorage.getItem).mockRestore();
    fireEvent.click(screen.getByText('重新確認上傳'));
    await waitFor(() => expect(screen.queryByText(/上傳結果待確認/)).toBeNull());
    expect(input).not.toBeDisabled();
    expect(screen.getByDisplayValue('二手檯燈')).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith(`/listing-media/${mediaId}/ai-draft`) && call.method === 'POST')).toHaveLength(1);
    expect(calls.filter(call => call.path.endsWith('/listing-media') && call.method === 'POST')).toHaveLength(1);
    expect(localStorage.getItem('wishlist:listing-upload-pending:19')).toBeNull();
  });

  it('does not display a late old-account private draft after switching accounts', async () => {
    holdOldAccountList = true;
    const view = render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await waitFor(() => expect(releaseOldAccountList).toBeDefined());
    view.rerender(<MemoryRouter><AuthContext.Provider value={{ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-session' }}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    await screen.findByText('還沒有私人商品照片，現在就拍第一件吧。');
    await act(async () => { releaseOldAccountList!(); });
    expect(screen.queryByText('舊帳號私有商品')).toBeNull();
  });
});
