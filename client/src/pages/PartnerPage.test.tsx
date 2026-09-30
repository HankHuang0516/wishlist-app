import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PartnerPage from './PartnerPage';

describe('partner introduction page', () => {
  it('presents a source-attributed pilot without implying existing authorization or direct auction sales', () => {
    render(<MemoryRouter><PartnerPage /></MemoryRouter>);
    expect(document.title).toBe('供給合作｜Wishlist.ai');
    expect(screen.getByRole('heading', { name: '讓好物，遇見正在尋找它的人。' })).toBeInTheDocument();
    expect(screen.getByText(/不表示任何來源已授權/)).toBeInTheDocument();
    expect(screen.getByText(/競標底價不會偽裝成固定售價/)).toBeInTheDocument();
    expect(screen.getByText(/不需要提供賣場密碼/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '提出合作意向' })).toHaveAttribute('href', '/partners/inquiry');
  });
});
