import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicListingPage from './PublicListingPage';
import { API_URL } from '../config';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/listings/:id" element={<PublicListingPage />} />
</Routes></MemoryRouter>);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public listing share destination', () => {
  it('shows the public listing to a visitor without login or private fields', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id, title: '二手檯燈',
      description: '九成新', price: '590', status: 'ACTIVE', condition: 'USED',
      expiresAt: '2099-10-25T00:00:00.000Z', owner: { name: '賣家' },
      location: { county: '臺北市', district: '中山區' }, media: [], privatePhone: 'DO_NOT_SHOW' }) }));
    vi.stubGlobal('fetch', fetch);
    mount(`/listings/${id}`);
    expect(await screen.findByRole('heading', { name: '二手檯燈' })).toBeInTheDocument();
    expect(screen.getByText('NT$ 590')).toBeInTheDocument();
    expect(screen.getByText(/臺北市中山區/)).toBeInTheDocument();
    expect(screen.queryByText('DO_NOT_SHOW')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/listings/${id}`, expect.objectContaining({ cache: 'no-store' }));
  });
  it('hides removed goods from visitors and does not fetch invalid IDs', async () => {
    const fetch = vi.fn(async () => ({ status: 404, ok: false }));
    vi.stubGlobal('fetch', fetch);
    mount(`/listings/${id}`);
    expect(await screen.findByRole('heading', { name: '商品已停止刊登或連結無效' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    mount('/listings/invalid');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
