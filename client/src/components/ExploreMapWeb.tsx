import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { libertyZhHantStyle } from '../lib/libertyZhHantStyle';
import { listingGeoJSON, type Bounds, type PublicListing } from '../lib/listingSearch';
import { externalGeoJSON, externalPrice, type ExternalListing } from '../lib/externalListingSearch';
import { clusterLeafIds, type ResultCamera } from '../lib/exploreMapView';
import { mapText } from '../lib/mapText';
import './ExploreMapWeb.css';

// MapLibre v6 requires Vite to bundle the worker with its shared imports.
setWorkerUrl(workerUrl);

export type MapSelection = { kind: 'seller' | 'external'; id: string };
export type MapFrame = { serial: number; camera: ResultCamera };
type Props = {
  items: PublicListing[]; external: ExternalListing[]; frame: MapFrame | null; visible: boolean;
  preview?: boolean;
  previewNotice?: string;
  onViewport: (bounds: Bounds) => void; onSelect: (item: MapSelection) => void;
  onCluster: (kind: MapSelection['kind'], ids: string[]) => void;
};

const placeholder = () => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 56;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法繪製縮圖');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 56, 56);
  ctx.fillStyle = '#e5eee8'; ctx.fillRect(3, 3, 50, 50);
  ctx.fillStyle = '#41745d'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('▧', 28, 38);
  return ctx.getImageData(0, 0, 56, 56);
};
async function thumbnail(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  if (!response.ok) throw new Error('縮圖無法讀取');
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('縮圖格式不正確');
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 56;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('無法繪製縮圖');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 56, 56);
    const size = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 3, 3, 50, 50);
    return ctx.getImageData(0, 0, 56, 56);
  } finally { bitmap.close(); }
}

export default function ExploreMapWeb(props: Props) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<MapLibreMap | null>(null), latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [photoError, setPhotoError] = useState('');
  const loadedPhotos = useRef(new Set<string>());
  const dataGeneration = useRef(0);
  useEffect(() => {
    if (!container.current) return;
    setReady(false);
    let active = true, clusterRequest = 0;
    let map: MapLibreMap;
    const watchdog = window.setTimeout(() => { if (active) setError(mapText('slow')); }, 20_000);
    try {
      map = new MapLibreMap({ container: container.current, style: libertyZhHantStyle,
        center: [121, 23.7], zoom: 6.1, maxZoom: 19, attributionControl: { compact: true },
        locale: { 'NavigationControl.ZoomIn': mapText('zoomIn'), 'NavigationControl.ZoomOut': mapText('zoomOut'),
          'AttributionControl.ToggleAttribution': mapText('attribution'), 'Map.Title': mapText('title') } });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.on('moveend', () => {
        if (!active) return;
        const bounds = map.getBounds(); latest.current.onViewport([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
      });
      map.on('error', () => { if (active) setError(mapText('resources')); });
      map.on('load', () => {
        if (!active) return;
        window.clearTimeout(watchdog);
        for (const kind of ['seller', 'external'] as const) {
          map.addSource(kind, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 20 });
          map.addLayer({ id: kind + '-clusters', type: 'circle', source: kind, filter: ['has', 'point_count'],
            paint: { 'circle-color': kind === 'seller' ? '#327458' : '#a96022', 'circle-radius': 24, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
          map.addLayer({ id: kind + '-counts', type: 'symbol', source: kind, filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
          map.addLayer({ id: kind + '-photos', type: 'symbol', source: kind, filter: ['!', ['has', 'point_count']],
            layout: { 'icon-image': ['get', 'icon'], 'icon-size': 0.9, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
        }
        setReady(true); setError('');
      });
      map.on('click', async event => {
        const seq = ++clusterRequest;
        const generation = dataGeneration.current;
        if (!map.getLayer('seller-photos')) return;
        const feature = map.queryRenderedFeatures(event.point, { layers: ['seller-photos', 'seller-clusters', 'external-photos', 'external-clusters'] })[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const kind = feature.source as MapSelection['kind'];
        if (feature.properties.cluster) {
          try {
            const source = map.getSource(kind) as GeoJSONSource;
            const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
            if (!active || seq !== clusterRequest || generation !== dataGeneration.current) return;
            if (map.getZoom() < Math.min(zoom, 19) - 0.1) {
              map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.min(zoom, 19), duration: 500 });
            } else {
              const leaves = await source.getClusterLeaves(feature.properties.cluster_id, 500, 0);
              if (active && seq === clusterRequest && generation === dataGeneration.current) latest.current.onCluster(kind, clusterLeafIds(leaves, kind === 'seller' ? 'listingId' : 'externalId'));
            }
          } catch { if (active) setError(mapText('cluster')); }
        } else {
          const id = feature.properties[kind === 'seller' ? 'listingId' : 'externalId'];
          if (typeof id === 'string') latest.current.onSelect({ kind, id });
        }
      });
    } catch { setError(mapText('unavailable')); }
    const resize = new ResizeObserver(() => mapRef.current?.resize()); resize.observe(container.current);
    return () => { active = false; window.clearTimeout(watchdog); resize.disconnect(); mapRef.current?.remove(); mapRef.current = null; loadedPhotos.current.clear(); };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const sellerSource = map.getSource('seller') as GeoJSONSource | undefined;
    const externalSource = map.getSource('external') as GeoJSONSource | undefined;
    if (!sellerSource || !externalSource) return;
    dataGeneration.current++;
    const controller = new AbortController(); let active = true;
    const photos = [...props.items.map(item => ({ key: 'photo-' + item.media[0].id, url: item.media[0].thumbnailUrl })),
      ...props.external.map(item => ({ key: 'external-' + item.id, url: item.thumbnailUrl }))];
    const keys = new Set(photos.map(photo => photo.key));
    for (const photo of photos) if (!map.hasImage(photo.key)) map.addImage(photo.key, placeholder());
    void Promise.all([sellerSource.setData(listingGeoJSON(props.items)), externalSource.setData(externalGeoJSON(props.external))]).then(() => {
      if (!active) return;
      // Remove old images only after workers have replaced the source data.
      for (const key of map.listImages()) if ((key.startsWith('photo-') || key.startsWith('external-')) && !keys.has(key)) { map.removeImage(key); loadedPhotos.current.delete(key); }
    }).catch(() => { if (active) setError(mapText('layer')); });
    let index = 0, failures = 0;
    // External hosts need not grant CORS: their photos are HTML markers below,
    // never drawn into a canvas or downloaded with the app's credentials.
    const pending = photos.filter(photo => photo.key.startsWith('photo-') && !loadedPhotos.current.has(photo.key));
    setPhotoError('');
    async function worker() {
      while (active && index < pending.length) {
        const photo = pending[index++];
        try {
          const image = await thumbnail(photo.url, controller.signal);
          if (active && map?.hasImage(photo.key)) { map.updateImage(photo.key, image); loadedPhotos.current.add(photo.key); }
        } catch { if (active) failures++; }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker)).then(() => {
      if (active && failures) setPhotoError(mapText('photos'));
    });
    return () => { active = false; controller.abort(); };
  }, [ready, props.items, props.external]);
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map || !map.getLayer('external-photos')) return;
    let active = true; const markers = new Map<string, Marker>();
    const items = new Map(props.external.map(item => [item.id, item]));
    function syncMarkers() {
      if (!active) return;
      const visible = new Set<string>();
      for (const feature of map!.queryRenderedFeatures({ layers: ['external-photos'] })) {
        const id = feature.properties.externalId;
        const item = typeof id === 'string' ? items.get(id) : undefined;
        if (!item || visible.has(item.id)) continue;
        visible.add(item.id);
        if (markers.has(item.id)) continue;
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'h-14 w-14 overflow-hidden rounded-xl border-2 border-amber-700 bg-white shadow-md';
        button.setAttribute('aria-label', mapText('external', { name: item.title, price: externalPrice(item) }));
        const image = document.createElement('img'); image.alt = ''; image.setAttribute('referrerpolicy', 'no-referrer');
        image.className = 'h-full w-full object-cover';
        image.onerror = () => { if (active) { button.textContent = '▧'; setPhotoError(mapText('externalPhotos')); } };
        image.src = item.thumbnailUrl;
        button.append(image); button.onclick = event => { event.stopPropagation(); latest.current.onSelect({ kind: 'external', id: item.id }); };
        markers.set(item.id, new Marker({ element: button }).setLngLat([item.location.longitude, item.location.latitude]).addTo(map!));
      }
      for (const [id, marker] of markers) if (!visible.has(id)) { marker.remove(); markers.delete(id); }
    }
    map.on('render', syncMarkers); syncMarkers();
    return () => { active = false; map.off('render', syncMarkers); for (const marker of markers.values()) marker.remove(); };
  }, [ready, props.external]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.frame || !props.visible) return;
    map.resize();
    const camera = props.frame.camera;
    if (camera.kind === 'single') map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 500 });
    else map.fitBounds([[camera.bounds[0], camera.bounds[1]], [camera.bounds[2], camera.bounds[3]]], { padding: 55, maxZoom: 13, duration: 500 });
  }, [ready, props.frame, props.visible]);
  useEffect(() => { if (props.visible) mapRef.current?.resize(); }, [props.visible]);
  return <div className={props.visible ? 'space-y-2' : 'hidden'}>
    {(error || photoError) && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error || photoError}</p>}
    <div ref={container} role="region" aria-label={mapText('region')} className={`wishlist-map ${props.preview ? 'h-56 rounded-md sm:h-40' : 'h-[480px] rounded-2xl'} w-full overflow-hidden border bg-gray-100`} />
    <p className="text-xs text-gray-500">{props.preview && props.previewNotice ? props.previewNotice : mapText('notice')}</p>
  </div>;
}
