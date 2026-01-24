
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';
import { AuthContext } from '../context/AuthContext';

// Mock Auth Context
const mockAuth = {
    token: 'fake-token',
    user: { id: 1, name: 'Test User' },
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateUser: vi.fn(),
    isAuthenticated: true,
    loading: false
};

// Mock localized strings
vi.mock('../utils/localization', () => ({
    t: (key: string) => key,
    getUserLocale: () => 'zh-TW',
    createTranslator: () => (key: string) => key
}));

// Mock API URL hook/config
vi.mock('../config', () => ({
    API_URL: 'http://localhost/api',
    API_BASE_URL: 'http://localhost'
}));

// Mock fetch
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
            id: 1,
            name: 'Test User',
            phoneNumber: '0912345678',
            nicknames: 'Tester',
            isAvatarVisible: true
        })
    })
) as any;

describe('Avatar Upload Interaction', () => {
    it('triggers file input click when avatar container is clicked', async () => {
        render(
            <AuthContext.Provider value={mockAuth}>
                <MemoryRouter>
                    <SettingsPage />
                </MemoryRouter>
            </AuthContext.Provider>
        );

        // Wait for profile load (mocked fetch)
        await screen.findByText('settings.profile');

        // Verify avatar container exists
        // We find it by looking for the camera icon container or structure
        // The container has `relative group cursor-pointer w-24 h-24`
        // Testing Library doesn't query by class easily, but we can find the hidden input 
        // and check its parent, or find the user icon/camera icon.

        // Find hidden input
        // Note: hidden inputs are not "visible", use querySelector instead
        const fileInput = document.querySelector('input[type="file"]');

        expect(fileInput).toBeTruthy();

        // Spy on the click method of the input
        const clickSpy = vi.spyOn(fileInput as HTMLInputElement, 'click');

        // Find the clickable container. 
        // It's the parent of the input in the current structure.
        const container = (fileInput as HTMLElement).parentElement;
        expect(container).toBeTruthy();
        expect(container?.className).toContain('cursor-pointer');

        // Simulate click on container
        fireEvent.click(container!);

        // Assert click was called
        expect(clickSpy).toHaveBeenCalled();
    });
});
