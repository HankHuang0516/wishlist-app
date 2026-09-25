import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListingBatchPage from '../pages/ListingBatchPage';
import { AuthContext } from '../context/AuthContext';

vi.mock('../config', () => ({ API_URL: 'https://wishlist.invalid/api' }));

const auth = { token: 'synthetic-token', user: { id: 11, name: 'Synthetic Seller' },
  login: vi.fn(), logout: vi.fn(), register: vi.fn(), updateUser: vi.fn(), isAuthenticated: true, loading: false };

function renderWithAvailability(available: boolean) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/listing-media/ai-availability'))
      return { ok: true, status: 200, json: async () => ({ available }) };
    if (url.includes('/listing-media/unused?purpose=BATCH_ITEM'))
      return { ok: true, status: 200, json: async () => ({ items: [], nextCursor: null }) };
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthContext.Provider value={auth as any}><MemoryRouter><ListingBatchPage /></MemoryRouter></AuthContext.Provider>);
  return fetchMock;
}

describe('batch listing AI gate', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('warns non-pilot sellers before capture while keeping manual upload available', async () => {
    const fetchMock = renderWithAvailability(false);
    expect(await screen.findByText(/此帳號的 AI 辨識尚未開放/)).toBeTruthy();
    expect(screen.getByLabelText('拍一件商品')).not.toHaveProperty('disabled', true);
    expect(screen.getByLabelText('批次選擇商品照片')).not.toHaveProperty('disabled', true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/listing-media/ai-availability'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }) }));
  });

  it('does not show the unavailable warning for an enabled account', async () => {
    renderWithAvailability(true);
    expect(await screen.findByText(/還沒有私人商品照片/)).toBeTruthy();
    expect(screen.queryByText(/此帳號的 AI 辨識尚未開放/)).toBeNull();
  });
});
