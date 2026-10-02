import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SocialAvatar from './SocialAvatar';

beforeEach(() => localStorage.setItem('user-locale', 'en-US'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('keeps undisclosed photos undisclosed without attempting another source', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<SocialAvatar url={null} name="Original name" fallback={<span>Photo absent or private</span>} />);
    expect(screen.getByText('Photo absent or private')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
});

it('failed image offers explicit same-URL retry without claiming privacy or calling a mutation', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<SocialAvatar url="https://example.invalid/original.jpg" name="原名稱" compact={false} fallback={<span>Photo absent or private</span>} />);
    fireEvent.error(screen.getByRole('img', { name: '原名稱' }));
    expect(screen.getByText('Photo could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('Photo absent or private')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry photo · 原名稱' }));
    expect(screen.getByRole('img', { name: '原名稱' })).toHaveAttribute('src', 'https://example.invalid/original.jpg');
    expect(screen.getByRole('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByText('Photo could not be loaded')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
});

it('replacement URL and explicit retry ignore error events from retired image attempts', () => {
    const view = render(<SocialAvatar url="https://example.invalid/old.jpg" name="Original" fallback="Absent" />);
    const old = screen.getByRole('img');
    fireEvent.error(old);
    view.rerender(<SocialAvatar url="https://example.invalid/new.jpg" name="Replacement" fallback="Absent" />);
    const replacement = screen.getByRole('img', { name: 'Replacement' });
    fireEvent.error(old);
    expect(replacement).toHaveAttribute('src', 'https://example.invalid/new.jpg');
    fireEvent.error(replacement);
    fireEvent.click(screen.getByRole('button', { name: 'Retry photo · Replacement' }));
    fireEvent.error(replacement);
    expect(screen.getByRole('img', { name: 'Replacement' })).toHaveAttribute('src', 'https://example.invalid/new.jpg');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('Chinese compact recovery has a named photo action with the original name', () => {
    localStorage.setItem('user-locale', 'zh-TW');
    render(<SocialAvatar url="/uploads/synthetic.jpg" name="原公開名稱" fallback="U" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('照片暫時無法顯示')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試照片 · 原公開名稱' })).toHaveClass('min-h-11', 'min-w-11');
});
