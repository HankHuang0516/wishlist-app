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

describe('source search rows without an area', () => {
  it('opts in, keeps no-area rows off the map list and returns them separately', async () => {
    const contact = { ...lead(), id: '5d4f1c8e-2a3b-4c5d-8e9f-0a1b2c3d4e5f', locationPrecision: 'CONTACT_FOR_LOCATION', county: null, district: null, publicPlaceName: null, publicAddress: null, latitude: null, longitude: null, coordinateSourceUrl: null, coordinateAttribution: null };
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ enabled: true, items: [lead(), contact], nextCursor: null })));
    const request = query();
    const { result } = renderHook(() => useSourceLeadSearch('synthetic', request));
    await settle();
    expect(String(fetchMock.mock.calls[0][0])).toContain('unlocated=1');
    expect(result.current.items.map(i => i.id)).toEqual([lead().id]);
    expect(result.current.contactItems.map(i => i.id)).toEqual([contact.id]);
  });
});

describe('incremental public-source pages past the old 500-record boundary',()=>{
 it('keeps every completed batch, continues explicitly beyond 500 and completes without an error or duplicate IDs',async()=>{
  const rows=Array.from({length:564},(_,i)=>({...lead(),id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}));
  fetchMock.mockImplementation(async(url:string)=>{const cursor=new URL(url).searchParams.get('cursor'),start=cursor?rows.findIndex(r=>r.id===cursor)+1:0,items=rows.slice(start,start+25);return new Response(JSON.stringify({enabled:true,items,nextCursor:start+items.length<rows.length?items.at(-1)!.id:null}));});
  const request=query();const {result}=renderHook(()=>useSourceLeadSearch('synthetic',request));await settle();
  expect(result.current.items).toHaveLength(100);expect(result.current.hasMore).toBe(true);expect(result.current.error).toBe('');
  for(let i=0;i<5;i++){await act(async()=>{await result.current.loadMore();});expect(result.current.error).toBe('');}
  expect(result.current.items).toHaveLength(564);expect(new Set(result.current.items.map(r=>r.id)).size).toBe(564);expect(result.current.hasMore).toBe(false);expect(fetchMock).toHaveBeenCalledTimes(23);
 });
 it('retains the first batch if a later page fails and does not silently retry it',async()=>{
  const rows=Array.from({length:125},(_,i)=>({...lead(),id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}));
  fetchMock.mockImplementation(async(url:string)=>{const c=new URL(url).searchParams.get('cursor'),start=c?rows.findIndex(r=>r.id===c)+1:0;if(start===100)throw Error('synthetic network failure');return new Response(JSON.stringify({enabled:true,items:rows.slice(start,start+25),nextCursor:rows[start+24].id}));});
  const request=query();const {result}=renderHook(()=>useSourceLeadSearch('synthetic',request));await settle();expect(result.current.items).toHaveLength(100);
  await act(async()=>{await result.current.loadMore();});expect(result.current.error).toBeTruthy();expect(result.current.items).toHaveLength(100);
  await act(async()=>{await vi.advanceTimersByTimeAsync(60_000);});expect(fetchMock).toHaveBeenCalledTimes(5);
 });
});
