import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebNavigation from './WebNavigation';

describe('approved web navigation', () => {
  beforeEach(() => localStorage.setItem('user-locale', 'zh-TW'));
  afterEach(() => { localStorage.removeItem('user-locale'); vi.restoreAllMocks(); });
  it('has six labelled links, exactly one settings gear, and no nested buttons', () => {
    const { container } = render(<MemoryRouter initialEntries={['/settings']}><WebNavigation /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['首頁', '禮物', '探索', '聊天', '朋友', '設定']);
    expect(screen.getAllByRole('link', { name: '設定' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelectorAll('a button')).toHaveLength(0);
    expect(container.querySelectorAll('.lucide-settings')).toHaveLength(1);
  });
  it('uses English labels and accessible descriptions with the same active settings route', () => {
    localStorage.setItem('user-locale', 'en-US');
    const { container } = render(<MemoryRouter initialEntries={['/settings']}><WebNavigation /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.querySelectorAll('a')).toHaveLength(6);
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Gifts', 'Explore', 'Chat', 'Friends', 'Settings']);
    expect(screen.getByRole('link', { name: 'My wishes and photo recognition' })).toHaveAttribute('href', '/wishes');
    expect(screen.getByRole('link', { name: 'Chat and meetups' })).toHaveAttribute('href', '/chat');
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(container.querySelectorAll('.lucide-settings')).toHaveLength(1);
  });
  it('keeps navigation usable when locale storage cannot be read', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw Error('storage unavailable'); });
    render(<MemoryRouter initialEntries={['/explore']}><WebNavigation /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Explore the listing map' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});
