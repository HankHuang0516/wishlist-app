import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySearchFilters, TAIWAN_BOUNDS } from './listingSearch';
import type { ExploreQuery } from './exploreWeb';

let useSourceLeadSearch: typeof import('./useSourceLeadSearch').useSourceLeadSearch;
const fetchMock = vi.fn();
const query = (serial = 1): ExploreQuery => ({ filters: { ...emptySearchFilters }, bounds: TAIWAN_BOUNDS, wishId: null, radius: '', serial });
const page = () => new Response(JSON.stringify({ enabled: true, items: [], nextCursor: null }));
const lead = () => {
  const now = new Date().toISOString();
  return { id: 'd897f4d9-1e66-4a0d-bd3f-1861f0e6cb46', kind: 'SOURCE_LEAD', title: '合成來源商品', summary: '僅供本地測試', canonicalUrl: 'https://example.invalid/source/one', county: '臺南市', district: '永康區', publicPlaceName: '公共面交點', publicAddress: '公開地點', latitude: 23, longitude: 120.2, postedEarliestAt: now, postedLatestAt: now, checkedAt: now, stockStatus: 'UNKNOWN', qualifiedSupply: false, checkoutEnabled: false, notice: '待確認', publicFacts: null, coordinateSourceUrl: 'https://www.openstreetmap.org/node/1', coordinateAttribution: null };
};
beforeEach(async () => {
  vi.resetModules(); ({ useSourceLeadSearch } = await import('./useSourceLeadSearch'));
  vi.useFakeTimers(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe('source search explicit recovery', () => {
  it('stops automatic requests after HTTP 429, even after its cooldown ends; a new explicit search can recover', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"errorCode":"RATE_LIMIT_EXCEEDED"}', { status: 429, headers: { 'Retry-After': '60' } })).mockImplementation(page);
    const { result, rerender } = renderHook(({ request }) => useSourceLeadSearch('synthetic', request), { initialProps: { request: query() } });
    await settle(); expect(result.current.error).toBeTruthy(); expect(result.current.busy).toBe(false);
    expect(result.current.retryUntil).toBeGreaterThan(Date.now());
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ request: query(2) }); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(result.current.error).toBe(''); expect(result.current.completedSerial).toBe(2);
  });
  it('preserves the last successfully read page when a background update fails and stops later automatic reads', async () => {
    const saved = lead();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, items: [saved], nextCursor: null }))).mockRejectedValueOnce(new Error('private upstream diagnostics')).mockImplementation(page);
    const { result, rerender } = renderHook(({ request }) => useSourceLeadSearch('synthetic', request), { initialProps: { request: query() } });
    await settle(); expect(result.current.error).toBe(''); expect(result.current.items).toEqual([saved]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.error).toBeTruthy(); expect(result.current.error).not.toContain('private upstream');
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(result.current.items).toEqual([saved]);
    rerender({ request: query(2) }); await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(result.current.error).toBe('');
  });
  it('does not publish a partial page or poll again after malformed pagination', async () => {
    fetchMock.mockResolvedValue(new Response('{"enabled":true,"items":[],"nextCursor":"not-a-cursor"}'));
    const request = query();
    const { result, unmount } = renderHook(() => useSourceLeadSearch('synthetic', request));
    await settle(); expect(result.current.items).toEqual([]); expect(result.current.error).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1); unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
