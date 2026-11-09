import prisma from './prisma';
import { isContactLocation } from './sourceContactLocation';
import { leadCurrent } from './sourceLeadRules';

// What the source map draws: one point per place, with how many public source
// references share it. It is the list endpoint's whole answer (approximate places
// included, references without a place left out) reduced to its places, so the
// page does not have to read every page of the list to draw the map.
export type SourceMapPoint = { id: string; latitude: number; longitude: number; count: number; publicPlaceName: string | null };
export type SourceMapSummary = { total: number; points: SourceMapPoint[] };

type Placed = { id: string; latitude: number | null; longitude: number | null; publicPlaceName: string | null };
// Rows must arrive in id order: a point is named after, and opens, its first reference.
export function groupSourceMap(rows: Placed[]): SourceMapSummary {
  const points = new Map<string, SourceMapPoint>();
  let total = 0;
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null) continue;
    total++;
    const key = row.latitude + ',' + row.longitude, point = points.get(key);
    if (point) point.count++;
    else points.set(key, { id: row.id, latitude: row.latitude, longitude: row.longitude, count: 1, publicPlaceName: row.publicPlaceName });
  }
  return { total, points: [...points.values()] };
}

// The reference answer: every published row, checked again. Used while the public
// catalogue is not available; publicCatalog.catalogSourceMap() gives the same from stored entries.
export async function scanSourceMap(now = new Date()): Promise<SourceMapSummary> {
  const rows = await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED', latitude: { not: null }, longitude: { not: null } }, orderBy: { id: 'asc' } });
  return groupSourceMap(rows.filter(row => leadCurrent(row, now) && !isContactLocation(row.evidence)));
}
