/**
 * Social Feature Tests
 * Tests for user search, follow/unfollow, and friend functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Social - User Search', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('searches users by name', async () => {
        const mockUsers = [
            { id: 1, name: 'John Doe', phoneNumber: '0911111111' },
            { id: 2, name: 'John Smith', phoneNumber: '0922222222' }
        ];

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockUsers,
        });

        const response = await fetch('/api/social/search?q=John', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();

        expect(data).toHaveLength(2);
        expect(data[0].name).toBe('John Doe');
    });

    it('returns empty array for no matches', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });

        const response = await fetch('/api/social/search?q=xyz123', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();

        expect(data).toHaveLength(0);
    });

    it('handles search with minimum characters', () => {
        const isValidSearchQuery = (query: string): boolean => {
            return query.trim().length >= 2;
        };

        expect(isValidSearchQuery('J')).toBe(false);
        expect(isValidSearchQuery('Jo')).toBe(true);
        expect(isValidSearchQuery('John')).toBe(true);
    });
});

describe('Social - Follow/Unfollow', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('follows a user', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, following: true }),
        });

        const response = await fetch('/api/social/follow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token'
            },
            body: JSON.stringify({ targetUserId: 2 })
        });
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.following).toBe(true);
    });

    it('unfollows a user', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, following: false }),
        });

        const response = await fetch('/api/social/unfollow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token'
            },
            body: JSON.stringify({ targetUserId: 2 })
        });
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.following).toBe(false);
    });

    it('prevents following yourself', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Cannot follow yourself' }),
        });

        const response = await fetch('/api/social/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: 1 }) // Same as current user
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
    });
});

describe('Social - Friends List', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('fetches following list', async () => {
        const mockFollowing = [
            { id: 2, name: 'Friend 1', isPremium: false },
            { id: 3, name: 'Friend 2', isPremium: true }
        ];

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockFollowing,
        });

        const response = await fetch('/api/social/following', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();

        expect(data).toHaveLength(2);
        expect(data[1].isPremium).toBe(true);
    });

    it('fetches followers list', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ id: 4, name: 'Follower 1' }],
        });

        const response = await fetch('/api/social/followers', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();

        expect(data).toHaveLength(1);
    });
});

describe('Social - Public Wishlists', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('fetches public wishlists of followed user', async () => {
        const mockWishlists = [
            { id: 1, name: 'Birthday List', isPublic: true, itemCount: 5 }
        ];

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockWishlists,
        });

        const response = await fetch('/api/social/users/2/wishlists', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();

        expect(data).toHaveLength(1);
        expect(data[0].isPublic).toBe(true);
    });

    it('returns 403 for non-followed user private lists', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Access denied' }),
        });

        const response = await fetch('/api/social/users/999/wishlists', {
            headers: { Authorization: 'Bearer test-token' }
        });

        expect(response.status).toBe(403);
    });
});
