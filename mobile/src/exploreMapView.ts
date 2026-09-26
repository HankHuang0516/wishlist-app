import { clipBounds, TAIWAN_BOUNDS, type Bounds } from './listingSearch';

export type PublicMapPoint = { longitude: number; latitude: number };
export type ResultCamera = { kind: 'single'; center: [number, number]; zoom: number } |
  { kind: 'multiple'; bounds: Bounds };

/** Result framing uses only the already-public, deliberately coarse coordinates. */
export function resultCamera(points: PublicMapPoint[]): ResultCamera | null {
  const valid = points.filter(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude) &&
    point.longitude >= TAIWAN_BOUNDS[0] && point.longitude <= TAIWAN_BOUNDS[2] &&
    point.latitude >= TAIWAN_BOUNDS[1] && point.latitude <= TAIWAN_BOUNDS[3]);
  if (!valid.length) return null;
  if (valid.length === 1 || valid.every(point => point.longitude === valid[0].longitude && point.latitude === valid[0].latitude))
    return { kind: 'single', center: [valid[0].longitude, valid[0].latitude], zoom: 13 };
  const longitudes = valid.map(point => point.longitude), latitudes = valid.map(point => point.latitude);
  const west = Math.min(...longitudes), east = Math.max(...longitudes);
  const south = Math.min(...latitudes), north = Math.max(...latitudes);
  const lngPad = Math.max(0.015, (east - west) * 0.18), latPad = Math.max(0.015, (north - south) * 0.18);
  const bounds = clipBounds([west - lngPad, south - latPad, east + lngPad, north + latPad]);
  return bounds ? { kind: 'multiple', bounds } : null;
}

export function expandedSearchBounds(bounds: Bounds): Bounds {
  const centerLng = (bounds[0] + bounds[2]) / 2, centerLat = (bounds[1] + bounds[3]) / 2;
  const halfLng = Math.max(0.05, bounds[2] - bounds[0]);
  const halfLat = Math.max(0.05, bounds[3] - bounds[1]);
  return clipBounds([centerLng - halfLng, centerLat - halfLat, centerLng + halfLng, centerLat + halfLat]) ?? TAIWAN_BOUNDS;
}
