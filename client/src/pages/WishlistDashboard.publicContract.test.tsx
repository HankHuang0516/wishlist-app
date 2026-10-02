import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import WishlistDashboard from './WishlistDashboard';
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'synthetic-session', user: { id: 2 } }) }));
vi.mock('../utils/localization', async original => ({ ...await original<typeof import('../utils/localization')>(), t: (key: string) => key }));
const dto = (items: object[]) => [{ id: 11, title: 'Synthetic public list', description: 'Public description', isPublic: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', items, _count: { items: items.length } }];
function Location() { return <div>{useLocation().pathname}</div>; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('public wishlist dashboard consumer contract', () => {
 it.each([0, 1])('renders the minimal safe DTO with %i visible items and keeps detail navigation', async count => {
  const fetchMock = vi.fn(async (input: unknown) => ({ ok: true, json: async () => String(input).endsWith('/wishlists') ? dto(count ? [{ id: 31, name: 'Visible synthetic wish', price: null, currency: 'TWD', askPrice: null, maxPrice: 500, priceCurrency: 'TWD', link: null, imageUrl: null, notes: null, priority: 0, isPurchased: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }] : []) : { name: 'Synthetic owner' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/users/1/wishlists']}><Routes><Route path="/users/:userId/wishlists" element={<WishlistDashboard />} /><Route path="/wishlists/:id" element={<Location />} /></Routes></MemoryRouter>);
  const title = await screen.findByText('Synthetic public list');
  expect(screen.getByText(`${count} dashboard.items`)).toBeTruthy();
  expect(screen.queryByTitle('Make Public')).toBeNull(); expect(screen.queryByTitle('Make Private')).toBeNull();
  expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/users/1/wishlists'))).toBe(true);
  fireEvent.click(title); expect(await screen.findByText('/wishlists/11')).toBeTruthy();
 });
});
