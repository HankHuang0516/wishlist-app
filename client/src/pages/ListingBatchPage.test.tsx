import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ListingBatchPage from './ListingBatchPage';

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
  let showUploadedPrivatePhoto = false;
  let releaseOldAccountList: (() => void) | undefined;
  beforeEach(() => {
    calls.length = 0;
    loseFirstPublicationResponse = false;
    loseUploadResponse = false;
    uploadLookups = 0;
    unusedReads = 0;
    currentUploadId = '';
    holdOldAccountList = false;
    manyPrivateDrafts = 0;
    showUploadedPrivatePhoto = false;
    releaseOldAccountList = undefined;
    localStorage.clear();
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
            aiDraftStatus: 'SKIPPED', aiDraft: null, sellerDraft: null, sellerDraftVersion: 0,
          }));
          const cursor = new URL(path).searchParams.get('cursor');
          const start = cursor ? rows.findIndex(row => row.id === cursor) + 1 : 0;
          const items = rows.slice(start, start + 30);
          return { ok: true, status: 200, json: async () => ({ items,
            nextCursor: start + 30 < rows.length ? items[items.length - 1].id : null }) };
        }
        unusedReads++;
        const items = (loseUploadResponse && unusedReads >= 3 || showUploadedPrivatePhoto) ? [{ id: mediaId, clientUploadId: currentUploadId,
          aiDraftStatus: showUploadedPrivatePhoto ? 'COMPLETED' : 'SKIPPED', aiDraft: showUploadedPrivatePhoto ? ai : null,
          sellerDraft: null, sellerDraftVersion: 0 }] : [];
        return { ok: true, status: 200, json: async () => ({ items }) };
      }
      if (/\/listing-media\/[0-9a-f-]{36}\/thumbnail$/.test(path)) return { ok: true, blob: async () => new Blob(['private']) };
      if (path.endsWith('/listing-media') && method === 'POST') {
        currentUploadId = String((init?.body as FormData).get('clientUploadId'));
        if (loseUploadResponse) throw new Error('upload ACK lost');
        return { ok: true, status: 201, json: async () => ({ id: mediaId }) };
      }
      if (path.includes('/listing-media/by-upload-id/')) {
        uploadLookups++;
        if (uploadLookups === 1) return { ok: false, status: 404, json: async () => ({ error: 'not yet visible' }) };
        return { ok: true, status: 200, json: async () => ({ id: mediaId, listingId: null, wishItemId: null }) };
      }
      if (path.endsWith(`/listing-media/${mediaId}/ai-draft`) && method === 'POST') return { ok: true, status: 202, json: async () => ({ mediaId, status: 'COMPLETED', draft: ai }) };
      if (path.endsWith(`/listing-media/${mediaId}/seller-draft`) && method === 'PUT') return { ok: true, status: 200, json: async () => ({ mediaId, version: 1 }) };
      if (path.endsWith('/listings') && method === 'POST') {
        if (loseFirstPublicationResponse) { loseFirstPublicationResponse = false; throw new Error('response lost'); }
        return { ok: true, status: 201, json: async () => ({ id: '22222222-2222-4222-8222-222222222222', status: 'ACTIVE' }) };
      }
      throw new Error(`Unexpected ${method} ${path}`);
    }));
  });
  afterEach(() => vi.restoreAllMocks());

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
    const input = await screen.findByLabelText('批次選擇商品照片');
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
    fireEvent.change(screen.getByLabelText('緯度'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByText('確認並刊登'));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(true));
    const posted = calls.find(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(JSON.parse(posted!.body!)).toMatchObject({ publish: true, mediaIds: [mediaId], price: 350, consentToMap: true });
    expect(await screen.findByText('商品已刊登。其他照片仍是私人草稿。')).toBeInTheDocument();
  });

  it('labels an AI-prefilled price as unverified and removes that label after seller edits it', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await screen.findByLabelText('批次選擇商品照片');
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    const price = await screen.findByLabelText('賣家售價（TWD）');
    await waitFor(() => expect(price).toHaveValue('350'));
    expect(screen.getByText(/此售價由 AI 參考區間中間值預填/)).toBeInTheDocument();
    fireEvent.change(price, { target: { value: '420' } });
    expect(screen.queryByText(/此售價由 AI 參考區間中間值預填/)).toBeNull();
    expect(price).toHaveValue('420');
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
  });

  it('replays the identical idempotency key when publication response is lost', async () => {
    loseFirstPublicationResponse = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await screen.findByLabelText('批次選擇商品照片');
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText(/前次刊登結果尚未確認/);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeTruthy();
    fireEvent.click(screen.getByText('確認前次刊登'));
    await screen.findByText('前次刊登已確認，不會建立重複商品。');
    const posts = calls.filter(call => call.path.endsWith('/listings') && call.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toBe(posts[0].body);
    expect(localStorage.getItem('wishlist:listing-pending:19')).toBeNull();
  });

  it('never posts a listing when the browser cannot persist its publication journal', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await screen.findByLabelText('批次選擇商品照片');
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    fireEvent.change(screen.getByLabelText('縣市'), { target: { value: '臺北市' } });
    fireEvent.change(screen.getByLabelText('行政區'), { target: { value: '中山區' } });
    fireEvent.change(screen.getByLabelText('緯度'), { target: { value: '25.05' } });
    fireEvent.change(screen.getByLabelText('經度'), { target: { value: '121.53' } });
    fireEvent.click(screen.getByLabelText(/我已確認商品真實/));
    const realSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'wishlist:listing-pending:19') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return realSetItem(key, value);
    });
    fireEvent.click(screen.getByText('確認並刊登'));
    await screen.findByText(/商品尚未送出/);
    expect(calls.some(call => call.path.endsWith('/listings') && call.method === 'POST')).toBe(false);
    expect(screen.getByText('確認並刊登')).not.toBeDisabled();
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

  it('recovers a committed photo after upload ACK loss and one stale private list', async () => {
    loseUploadResponse = true;
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await screen.findByLabelText('批次選擇商品照片');
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
    const input = await screen.findByLabelText('批次選擇商品照片');
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
