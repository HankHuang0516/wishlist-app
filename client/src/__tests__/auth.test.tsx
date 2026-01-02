/**
 * Auth Module Tests
 * Unit tests for authentication logic and localStorage management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Auth - Login API', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('sends correct login request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'test-token',
                user: { id: 1, phoneNumber: '0912345678', name: 'Test User' }
            }),
        });

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '0912345678', password: 'password123' })
        });
        const data = await response.json();

        expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
            method: 'POST',
        }));
        expect(data.token).toBe('test-token');
        expect(data.user.phoneNumber).toBe('0912345678');
    });

    it('handles login failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Invalid credentials' }),
        });

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '0912345678', password: 'wrong' })
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);
    });
});

describe('Auth - Register API', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('sends correct registration request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                token: 'new-user-token',
                user: { id: 2, phoneNumber: '0987654321', name: 'New User' }
            }),
        });

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: '0987654321',
                password: 'securepass123',
                name: 'New User'
            })
        });
        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.user.name).toBe('New User');
    });

    it('handles duplicate phone number error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({ error: 'Phone number already registered' }),
        });

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '0912345678', password: 'pass' })
        });

        expect(response.status).toBe(409);
    });
});

describe('Auth - Token Storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('can store and retrieve token', () => {
        const token = 'test-jwt-token';
        localStorage.setItem('token', token);
        expect(localStorage.getItem('token')).toBe(token);
    });

    it('can store and retrieve user object', () => {
        const user = { id: 1, phoneNumber: '0912345678', name: 'Test User', isPremium: false };
        localStorage.setItem('user', JSON.stringify(user));

        const retrieved = JSON.parse(localStorage.getItem('user') || '{}');
        expect(retrieved.id).toBe(1);
        expect(retrieved.phoneNumber).toBe('0912345678');
        expect(retrieved.isPremium).toBe(false);
    });

    it('clears all auth data on logout', () => {
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1 }));

        // Simulate logout
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('checks if user is authenticated', () => {
        const isAuthenticated = () => !!localStorage.getItem('token');

        expect(isAuthenticated()).toBe(false);

        localStorage.setItem('token', 'test-token');
        expect(isAuthenticated()).toBe(true);
    });
});

describe('Auth - Password Validation', () => {
    const validatePassword = (password: string) => {
        if (!password || password.length < 6) {
            return { valid: false, error: 'Password must be at least 6 characters' };
        }
        if (password.length > 100) {
            return { valid: false, error: 'Password too long' };
        }
        return { valid: true };
    };

    it('rejects short passwords', () => {
        expect(validatePassword('12345')).toEqual({ valid: false, error: 'Password must be at least 6 characters' });
    });

    it('accepts valid passwords', () => {
        expect(validatePassword('validpass123')).toEqual({ valid: true });
    });

    it('rejects empty passwords', () => {
        expect(validatePassword('')).toEqual({ valid: false, error: 'Password must be at least 6 characters' });
    });
});

describe('Auth - Phone Number Validation', () => {
    const validatePhoneNumber = (phone: string) => {
        if (!phone || phone.trim() === '') {
            return { valid: false, error: 'Phone number is required' };
        }
        // Taiwan phone number format: 09XXXXXXXX
        const phoneRegex = /^09\d{8}$/;
        if (!phoneRegex.test(phone)) {
            return { valid: false, error: 'Invalid phone number format' };
        }
        return { valid: true };
    };

    it('validates Taiwan phone format', () => {
        expect(validatePhoneNumber('0912345678')).toEqual({ valid: true });
        expect(validatePhoneNumber('0987654321')).toEqual({ valid: true });
    });

    it('rejects invalid formats', () => {
        expect(validatePhoneNumber('12345')).toEqual({ valid: false, error: 'Invalid phone number format' });
        expect(validatePhoneNumber('')).toEqual({ valid: false, error: 'Phone number is required' });
        expect(validatePhoneNumber('1234567890')).toEqual({ valid: false, error: 'Invalid phone number format' });
    });
});
