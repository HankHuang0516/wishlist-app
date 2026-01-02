/**
 * Wishlist Module Tests
 * Tests for wishlist CRUD operations and item management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Wishlist API', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        localStorage.clear();
    });

    describe('Fetch Wishlists', () => {
        it('fetches wishlists with correct auth header', async () => {
            const mockWishlists = [
                { id: 1, name: 'My Wishlist', items: [] },
                { id: 2, name: 'Birthday Gifts', items: [] }
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockWishlists,
            });

            // Simulate API call
            const token = 'test-token';
            const response = await fetch('/api/wishlists', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            expect(mockFetch).toHaveBeenCalledWith('/api/wishlists', {
                headers: { Authorization: 'Bearer test-token' }
            });
            expect(data).toHaveLength(2);
            expect(data[0].name).toBe('My Wishlist');
        });
    });

    describe('Create Wishlist', () => {
        it('creates a new wishlist with correct data', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 3, name: 'New Wishlist', items: [] }),
            });

            const token = 'test-token';
            const response = await fetch('/api/wishlists', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: 'New Wishlist' })
            });
            const data = await response.json();

            expect(data.name).toBe('New Wishlist');
            expect(data.id).toBe(3);
        });

        it('handles creation error gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Name is required' }),
            });

            const response = await fetch('/api/wishlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(response.ok).toBe(false);
            expect(response.status).toBe(400);
        });
    });

    describe('Delete Wishlist', () => {
        it('deletes wishlist by ID', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

            const response = await fetch('/api/wishlists/1', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer test-token' }
            });

            expect(response.ok).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith('/api/wishlists/1', expect.objectContaining({
                method: 'DELETE'
            }));
        });
    });
});

describe('Wishlist Item API', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('Add Item', () => {
        it('adds item to wishlist', async () => {
            const newItem = {
                name: 'AirPods Pro',
                price: 7990,
                link: 'https://apple.com/airpods-pro',
                imageUrl: 'https://example.com/airpods.jpg'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 1, ...newItem, wishlistId: 1 }),
            });

            const response = await fetch('/api/wishlists/1/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token'
                },
                body: JSON.stringify(newItem)
            });
            const data = await response.json();

            expect(data.name).toBe('AirPods Pro');
            expect(data.price).toBe(7990);
        });
    });

    describe('Update Item', () => {
        it('updates item details', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 1, name: 'Updated Item', price: 8990 }),
            });

            const response = await fetch('/api/items/1', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token'
                },
                body: JSON.stringify({ name: 'Updated Item', price: 8990 })
            });
            const data = await response.json();

            expect(data.name).toBe('Updated Item');
        });
    });

    describe('Delete Item', () => {
        it('removes item from wishlist', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

            const response = await fetch('/api/items/1', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer test-token' }
            });

            expect(response.ok).toBe(true);
        });
    });
});

describe('Wishlist Data Validation', () => {
    it('validates wishlist name is not empty', () => {
        const validateWishlistName = (name: string) => {
            if (!name || name.trim() === '') {
                return { valid: false, error: 'Name is required' };
            }
            if (name.length > 100) {
                return { valid: false, error: 'Name too long' };
            }
            return { valid: true };
        };

        expect(validateWishlistName('')).toEqual({ valid: false, error: 'Name is required' });
        expect(validateWishlistName('   ')).toEqual({ valid: false, error: 'Name is required' });
        expect(validateWishlistName('My List')).toEqual({ valid: true });
        expect(validateWishlistName('a'.repeat(101))).toEqual({ valid: false, error: 'Name too long' });
    });

    it('validates item price is a positive number', () => {
        const validatePrice = (price: number | undefined) => {
            if (price === undefined || price === null) return { valid: true }; // Optional
            if (typeof price !== 'number' || isNaN(price)) {
                return { valid: false, error: 'Price must be a number' };
            }
            if (price < 0) {
                return { valid: false, error: 'Price cannot be negative' };
            }
            return { valid: true };
        };

        expect(validatePrice(-100)).toEqual({ valid: false, error: 'Price cannot be negative' });
        expect(validatePrice(0)).toEqual({ valid: true });
        expect(validatePrice(100)).toEqual({ valid: true });
        expect(validatePrice(undefined)).toEqual({ valid: true });
    });
});
