import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeListing, makeExternalListing } from '../__tests__/fixtures/marketplace';
import { parseExternalListing } from '../lib/externalListingSearch';
import { parsePublicListing } from '../lib/listingSearch';
import { marketplaceOrigin } from '../lib/marketplaceUrl';
import ExploreMapWeb from './ExploreMapWeb';

const mocks = vi.hoisted(() => ({ maps: [] as any[], markers: [] as any[], fail: false, worker: vi.fn() }));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: mocks.worker, NavigationControl: class {}, Marker: class {
  options: any; constructor(options: any) { this.options = options; mocks.markers.push(this); } setLngLat = vi.fn(() => this); addTo = vi.fn(() => this); remove = vi.fn();
}, Map: class {
  handlers: Record<string, (...args: any[]) => void> = {}; sources: Record<string, any> = {}; images = new Set<string>(); zoom = 19;
  features: any[] = []; options: any; constructor(options: any) { if (mocks.fail) throw new Error('no WebGL'); this.options = options; mocks.maps.push(this); }
  on = vi.fn((event: string, handler: (...args: any[]) => void) => { this.handlers[event] = handler; });
  off = vi.fn();
  addSource = vi.fn((id: string) => { this.sources[id] = { setData: vi.fn(), getClusterExpansionZoom: vi.fn().mockResolvedValue(20), getClusterLeaves: vi.fn().mockResolvedValue([]) }; });
  addLayer = vi.fn(); addControl = vi.fn(); getLayer = vi.fn(() => true); getSource = vi.fn((id: string) => this.sources[id]);
  addImage = vi.fn((id: string) => { this.images.add(id); }); hasImage = (id: string) => this.images.has(id);
  listImages = () => [...this.images]; removeImage = vi.fn((id: string) => { this.images.delete(id); }); updateImage = vi.fn();
  getBounds = () => ({ getWest: () => 121.4, getSouth: () => 24.9, getEast: () => 121.6, getNorth: () => 25.1 });
  queryRenderedFeatures = (query: any) => query.layers ? this.features.filter(feature => feature.source === 'external' && !feature.properties.cluster) : this.features;
  getZoom = () => this.zoom; easeTo = vi.fn(); fitBounds = vi.fn(); resize = vi.fn(); remove = vi.fn();
} }));
beforeEach(() => {
  localStorage.setItem('user-locale', 'zh-TW');
  mocks.maps.length = 0; mocks.markers.length = 0; mocks.fail = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const ctx = { fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), getImageData: () => ({ width: 56, height: 56, data: new Uint8ClampedArray(56 * 56 * 4) }) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 320, height: 200, close: vi.fn() }));
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const listing = () => parsePublicListing(makeListing(), marketplaceOrigin(), true);
const props = () => ({ items: [listing()], external: [], frame: null, visible: true, onViewport: vi.fn(), onSelect: vi.fn(), onCluster: vi.fn() });
describe('real web map lifecycle and photo isolation', () => {
  it('sizes the actual preview canvas rather than clipping the full map and its attribution', () => {
    const mounted = render(<ExploreMapWeb {...props()} preview />);
    const map = screen.getByRole('region', { name: '商品探索地圖，亦可切換商品列表使用鍵盤操作' });
    expect(map).toHaveClass('h-56', 'sm:h-40');
    expect(map.parentElement).not.toHaveClass('overflow-hidden');
    expect(screen.getByText(/底圖：OpenFreeMap／OpenStreetMap/)).toBeVisible();
    mounted.rerender(<ExploreMapWeb {...props()} />);
    expect(map).toHaveClass('h-[480px]');
    expect(map).not.toHaveClass('h-56', 'sm:h-40');
  });
  it('keeps search/list available when the browser cannot start WebGL', () => {
    mocks.fail = true; render(<ExploreMapWeb {...props()} />);
    expect(screen.getByRole('status')).toHaveTextContent('請使用商品列表'); expect(mocks.maps).toHaveLength(0);
  });
  it('waits for sources before updating data, fetches only thumbnails without credentials, and cleans up', async () => {
    const value = props(), fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['fixture'], { type: 'image/jpeg' }) })); vi.stubGlobal('fetch', fetch);
    const mounted = render(<ExploreMapWeb {...value} />); const map = mocks.maps[0];
    expect(map.addSource).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    await act(async () => map.handlers.load());
    await waitFor(() => expect(map.updateImage).toHaveBeenCalled());
    expect(map.sources.seller.setData).toHaveBeenCalledWith(expect.objectContaining({ type: 'FeatureCollection' }));
    expect(fetch).toHaveBeenCalledWith(value.items[0].media[0].thumbnailUrl, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers');
    act(() => map.handlers.moveend()); expect(value.onViewport).toHaveBeenCalledWith([121.4, 24.9, 121.6, 25.1]);
    mounted.unmount(); expect(map.remove).toHaveBeenCalledOnce();
  });
  it('uses single-result zoom and bounds for multiple results without launching new searches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const value = props(), mounted = render(<ExploreMapWeb {...value} frame={{ serial: 1, camera: { kind: 'single', center: [121.5, 25], zoom: 13 } }} />), map = mocks.maps[0];
    await act(async () => map.handlers.load()); expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [121.5, 25], zoom: 13 }));
    mounted.rerender(<ExploreMapWeb {...value} frame={{ serial: 2, camera: { kind: 'multiple', bounds: [121.4, 24.9, 121.6, 25.1] } }} />);
    expect(map.fitBounds).toHaveBeenCalledWith([[121.4, 24.9], [121.6, 25.1]], expect.objectContaining({ maxZoom: 13 }));
  });
  it('caps cluster expansion and scopes list fallback to actual leaf IDs, not every loaded item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }))); const value = props(); render(<ExploreMapWeb {...value} />); const map = mocks.maps[0];
    await act(async () => map.handlers.load());
    map.features = [{ source: 'seller', geometry: { type: 'Point', coordinates: [121.5, 25] }, properties: { cluster: true, cluster_id: 1 } }];
    map.sources.seller.getClusterLeaves.mockResolvedValue([{ type: 'Feature', properties: { listingId: value.items[0].id } }]);
    await act(async () => map.handlers.click({ point: {} }));
    expect(map.sources.seller.getClusterLeaves).toHaveBeenCalledWith(1, 500, 0); expect(value.onCluster).toHaveBeenCalledWith('seller', [value.items[0].id]);
    map.zoom = 10; await act(async () => map.handlers.click({ point: {} })); expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 19 }));
  });
  it('does not let failed thumbnails take down map/list results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('image unavailable'); })); const value = props(); render(<ExploreMapWeb {...value} />);
    await act(async () => mocks.maps[0].handlers.load()); expect(await screen.findByRole('status')).toHaveTextContent('請從列表查看照片');
    expect(mocks.maps[0].sources.seller.setData).toHaveBeenCalled();
  });
  it('renders external thumbnails without canvas/CORS fetch and keeps the marker accessible and source-attributed', async () => {
    const item = parseExternalListing(makeExternalListing()), value = { ...props(), items: [], external: [item] };
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const mounted = render(<ExploreMapWeb {...value} />), map = mocks.maps[0];
    map.features = [{ source: 'external', properties: { externalId: item.id }, geometry: { type: 'Point', coordinates: [item.location.longitude, item.location.latitude] } }];
    await act(async () => map.handlers.load());
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.markers).toHaveLength(1);
    const marker = mocks.markers[0], button = marker.options.element as HTMLButtonElement;
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('外部來源'));
    expect(button.querySelector('img')).toHaveAttribute('src', item.thumbnailUrl);
    expect(button.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    button.click(); expect(value.onSelect).toHaveBeenCalledWith({ kind: 'external', id: item.id });
    expect(marker.setLngLat).toHaveBeenCalledWith([item.location.longitude, item.location.latitude]);
    mounted.unmount(); expect(marker.remove).toHaveBeenCalled();
  });
  it('localizes live controls, attribution and resource failure without changing map data', () => {
    localStorage.setItem('user-locale', 'en-US'); render(<ExploreMapWeb {...props()} preview />);
    expect(mocks.maps[0].options.locale).toMatchObject({ 'NavigationControl.ZoomIn': 'Zoom in', 'NavigationControl.ZoomOut': 'Zoom out', 'AttributionControl.ToggleAttribution': 'Toggle map attribution' });
    expect(screen.getByRole('region', { name: /Item exploration map/ })).toHaveClass('wishlist-map', 'h-56', 'sm:h-40');
    act(() => mocks.maps[0].handlers.error()); expect(screen.getByRole('status')).toHaveTextContent('Item data is unaffected');
    expect(screen.getByText(/Basemap: OpenFreeMap\/OpenStreetMap/)).toBeInTheDocument();
  });
});
