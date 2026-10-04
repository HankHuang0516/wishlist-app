import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PartnerPage from './PartnerPage';

beforeEach(() => { localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { localStorage.removeItem('user-locale'); vi.restoreAllMocks(); });

describe('partner introduction page', () => {
  it('presents a source-attributed pilot without implying existing authorization or direct auction sales', () => {
    render(<MemoryRouter><PartnerPage /></MemoryRouter>);
    expect(document.title).toBe('供給合作｜Wishlist.ai');
    expect(screen.getByText('全台二手商品合作招募，先雙北小量試點')).toBeInTheDocument();
    expect(screen.getByText('Wishlist.AI 的 Hank')).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'EClaw 合作名片'})).toHaveAttribute('href','https://eclawbot.com/c/pe3vqm');
    expect(screen.getByRole('link',{name:'hankhuang0516@gmail.com'})).toHaveAttribute('href','mailto:hankhuang0516@gmail.com');
    expect(screen.getByRole('heading', { name: '讓好物，遇見正在尋找它的人。' })).toBeInTheDocument();
    expect(screen.getByText(/不表示任何來源已授權/)).toBeInTheDocument();
    expect(screen.getByText(/競標底價不會偽裝成固定售價/)).toBeInTheDocument();
    expect(screen.getByText(/不需要提供賣場密碼/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '提出合作意向' })).toHaveAttribute('href', '/partners/inquiry');
  });

  it('explains the same permission, price and withdrawal boundaries in English, including every required field', () => {
    localStorage.setItem('user-locale', 'en-US');
    render(<MemoryRouter><PartnerPage /></MemoryRouter>);
    expect(document.title).toBe('Supply partnerships | Wishlist.ai');
    expect(screen.getByRole('heading', { name: 'Help good things find the people looking for them.' })).toBeInTheDocument();
    const principles = screen.getByRole('region', { name: 'Partnership principles' });
    expect(within(principles).getByText(/does not guarantee traffic, sales/)).toBeInTheDocument();
    expect(within(principles).getByText(/never presented as a fixed sale price/)).toBeInTheDocument();
    expect(within(principles).getByText(/sold, expired or withdrawn/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean a source has granted permission/)).toBeInTheDocument();
    expect(screen.getByText(/3–10 real items.*No marketplace password is needed/)).toBeInTheDocument();
    for (const field of ['A traceable item ID and original item link', 'Item name, actual transaction method and stated price', 'Displayable original images or thumbnails and permission to use them', 'Actual county or city, district and shop, last verified availability and expiry', 'How sold, removed or withdrawn items are updated']) {
      expect(screen.getByText(field)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Explore the process' })).toHaveAttribute('href', '#cooperation');
    expect(screen.getByRole('link', { name: 'Submit a partnership inquiry' })).toHaveAttribute('href', '/partners/inquiry');
  });

  it('renders required fields from the current locale when reopened after a language change', () => {
    const page = render(<MemoryRouter><PartnerPage /></MemoryRouter>);
    expect(screen.getByText('可追蹤的商品 ID 與原始商品連結')).toBeInTheDocument();
    page.unmount();
    localStorage.setItem('user-locale', 'en-US');
    render(<MemoryRouter><PartnerPage /></MemoryRouter>);
    expect(screen.getByText('A traceable item ID and original item link')).toBeInTheDocument();
    expect(screen.queryByText('可追蹤的商品 ID 與原始商品連結')).not.toBeInTheDocument();
  });

  it('keeps the inquiry route usable when locale storage is unavailable and restores the previous document title on departure', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw Error('unavailable'); });
    document.title = 'Previous title';
    render(<MemoryRouter initialEntries={['/partners']}><Routes>
      <Route path="/partners" element={<PartnerPage />} />
      <Route path="/partners/inquiry" element={<h1>Inquiry route fixture</h1>} />
    </Routes></MemoryRouter>);
    expect(document.title).toBe('Supply partnerships | Wishlist.ai');
    fireEvent.click(screen.getByRole('link', { name: 'Contact Wishlist.ai' }));
    expect(screen.getByRole('heading', { name: 'Inquiry route fixture' })).toBeInTheDocument();
    expect(document.title).toBe('Previous title');
  });
});
