import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
    beforeEach(() => { localStorage.clear(); localStorage.setItem('user-locale', 'zh-TW'); window.history.replaceState(null, '', '/'); });
    afterEach(() => { cleanup(); localStorage.clear(); });
    it('loads the home page and navigates to login without removing the shared shell', async () => {
        render(<App />);
        await screen.findByRole('heading', { name: '整理你的願望。' });
        fireEvent.click(screen.getByRole('link', { name: '登入' }));
        await screen.findByRole('heading', { name: '歡迎回來' });
        expect(screen.getByRole('link', { name: 'Wishlist.ai' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '隱私權政策' })).toHaveAttribute('href', '/privacy');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
