import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import WebNavigation from './WebNavigation';

describe('approved web navigation', () => {
  it('has six labelled links, exactly one settings gear, and no nested buttons', () => {
    const { container } = render(<MemoryRouter initialEntries={['/settings']}><WebNavigation /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['首頁', '禮物', '探索', '聊天', '朋友', '設定']);
    expect(screen.getAllByRole('link', { name: '設定' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelectorAll('a button')).toHaveLength(0);
    expect(container.querySelectorAll('.lucide-settings')).toHaveLength(1);
  });
});
