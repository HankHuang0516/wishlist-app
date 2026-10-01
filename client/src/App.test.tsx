import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import App from './App';
import { Analytics } from './utils/analytics';

describe('App', () => {
    beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'zh-TW'); window.history.replaceState(null, '', '/'); });
    afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
    it('loads the home page and navigates to login without removing the shared shell', async () => {
        render(<App />);
        await screen.findByRole('heading', { name: '整理你的願望。' });
        fireEvent.click(screen.getByRole('link', { name: '登入' }));
        await screen.findByRole('heading', { name: '歡迎回來' });
        expect(screen.getByRole('link', { name: 'Wishlist.ai' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '隱私權政策' })).toHaveAttribute('href', '/privacy');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('preserves reset-link parameters for the form while tracking only its route category', async () => {
        const track = vi.spyOn(Analytics,'logPageView').mockImplementation(() => {});
        window.history.replaceState(null,'','/reset-password?token=synthetic-privacy-only#synthetic-fragment');
        render(<App />);
        await screen.findByRole('heading',{name:'重設密碼'});
        expect(track.mock.calls).toEqual([['/reset-password']]);
        expect(window.location.search).toBe('?token=synthetic-privacy-only');
        expect(window.location.hash).toBe('#synthetic-fragment');
        fireEvent.click(screen.getByRole('link',{name:'隱私權政策'}));
        await screen.findByRole('heading',{name:'隱私權政策'});
        expect(track.mock.calls).toEqual([['/reset-password'],['/privacy']]);
    });
});
