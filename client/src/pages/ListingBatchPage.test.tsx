import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  beforeEach(() => {
    calls.length = 0;
    loseFirstPublicationResponse = false;
    loseUploadResponse = false;
    uploadLookups = 0;
    unusedReads = 0;
    currentUploadId = '';
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:private-test');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input), method = init?.method ?? 'GET';
      calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (path.endsWith('/listing-media/unused?purpose=BATCH_ITEM')) {
        unusedReads++;
        const items = loseUploadResponse && unusedReads >= 3 ? [{ id: mediaId, clientUploadId: currentUploadId,
          aiDraftStatus: 'SKIPPED', aiDraft: null, sellerDraft: null, sellerDraftVersion: 0 }] : [];
        return { ok: true, status: 200, json: async () => ({ items }) };
      }
      if (path.endsWith(`/listing-media/${mediaId}/thumbnail`)) return { ok: true, blob: async () => new Blob(['private']) };
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

  it('keeps upload private until seller supplies details and explicitly confirms publication', async () => {
    render(<MemoryRouter><AuthContext.Provider value={auth}><ListingBatchPage /></AuthContext.Provider></MemoryRouter>);
    const input = await screen.findByLabelText('批次選擇商品照片');
    fireEvent.change(input, { target: { files: [new File(['photo'], 'lamp.jpg', { type: 'image/jpeg' })] } });
    await screen.findByDisplayValue('二手檯燈');
    expect(screen.getByText(/AI 參考價格/)).toHaveTextContent('NT$100–600');
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
});
