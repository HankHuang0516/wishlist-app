import { randomUUID } from 'crypto';
import type { ExternalSourceLead } from '@prisma/client';
import { parseLead } from '../lib/sourceLeadRules';
import { leadProduct } from '../lib/discovery';
import { leadBoundaries, leadDraft, nextRefresh } from '../lib/publicCatalog';

// A stored entry is only rebuilt when its source row changes or when its
// refreshAt deadline passes. These tests walk the clock across every deadline a
// source reference has and check that the stored entry always equals what the
// full scan would compute at that same instant.
const HOUR = 3_600_000, DAY = 24 * HOUR, T0 = Date.parse('2026-11-01T00:00:00.000Z');
const at = (time: number) => new Date(time).toISOString();
const photo = (row: { archiveItemId: string; canonicalUrl: string }, sequence: number, checked: number, expires: number) => ({
  id: randomUUID(), archiveItemId: row.archiveItemId, sourceUrl: row.canonicalUrl, permission: 'PUBLIC_DISPLAY_AND_STORAGE', reviewed: true, storageProvider: 'FLICKR',
  rightsEvidenceRef: 'consent:synthetic-rights', mappingEvidenceRef: 'review:synthetic-mapping', uploadReceiptRef: 'review:synthetic-upload', sequence, alt: '合成照片 ' + sequence,
  checkedAt: at(checked), permissionExpiresAt: at(expires), flickrPhotoId: '12' + sequence, imageUrl: `https://live.staticflickr.com/1/12${sequence}_abc_b.jpg`, thumbnailUrl: `https://live.staticflickr.com/1/12${sequence}_abc_s.jpg`,
});
function row(origin: 'ARCHIVE' | 'DB_MASTER', created: number, times: { checked: number; posted: number }, media: (base: { archiveItemId: string; canonicalUrl: string }) => unknown[]): ExternalSourceLead {
  const id = randomUUID(), canonicalUrl = 'https://www.facebook.com/groups/123456789/posts/' + id, archiveItemId = 'REFRESH-' + id;
  const data = parseLead({
    archiveItemId, libraryFileId: origin === 'ARCHIVE' ? 'libfile_' + 'a'.repeat(32) : null, archiveVersion: origin === 'ARCHIVE' ? 3 : null, archiveSha256: origin === 'ARCHIVE' ? 'a'.repeat(64) : null,
    title: 'BenQ GW2270 合成二手電腦螢幕', summary: '公開來源參考，庫存與交易待確認。', canonicalUrl, county: '臺南市', district: '永康區', publicPlaceName: '合成公共面交點', publicAddress: '臺南市永康區合成路123號',
    latitude: 23, longitude: 120.236, postedEarliestAt: at(times.posted), postedLatestAt: at(times.posted), checkedAt: at(times.checked),
    evidence: { sourceUrl: canonicalUrl, sourcePublic: true, publicSourceRef: 'self:synthetic-public', dateRef: 'self:synthetic-date', locationRef: 'self:synthetic-location', coordinateRef: 'self:synthetic-coordinate',
      locationSourceUrl: 'https://public.example.invalid/qa', coordinateSourceUrl: 'https://public.example.invalid/map', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true,
      independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'self:synthetic-review', ...(origin === 'DB_MASTER' ? { sourceCheckRef: 'source:synthetic-check' } : {}),
      media: media({ archiveItemId, canonicalUrl }),
      publicFacts: { priceText: '1000', currencyStatus: 'TWD', priceUnitStatus: 'SOURCE_STATED', sourceAccessNotice: '公開來源', originalDateLabel: '來源貼文', locationRelation: '公共面交點', coordinateQualityNotes: [] } },
  }, new Date(created), origin === 'DB_MASTER');
  return { id, ...data, status: 'PUBLISHED', recordOrigin: origin, sourceClaimState: 'UNKNOWN', sellerRoute: null, recordRevision: 1, pendingFacts: null, pendingHash: null, pendingEvidenceRef: null,
    createdAt: new Date(created), updatedAt: new Date(created) } as unknown as ExternalSourceLead;
}
// Every deadline, the millisecond on each side of it, and a coarse grid in between.
function instants(lead: ExternalSourceLead, from: number, to: number) {
  const points = new Set<number>();
  for (const boundary of leadBoundaries(lead)) for (const time of [boundary - 2, boundary - 1, boundary, boundary + 1]) if (time >= from && time <= to) points.add(time);
  for (let time = from; time <= to; time += 5 * HOUR + 7) points.add(time);
  return [...points].sort((a, b) => a - b);
}
function walk(lead: ExternalSourceLead, from: number, to: number) {
  let rebuilds = 0, states = 0, previous = '';
  // Photo permissions are read against the system clock, so the whole walk runs on a controlled one.
  jest.useFakeTimers();
  try {
    jest.setSystemTime(from);
    let stored = leadDraft(lead, new Date());
    for (const time of instants(lead, from, to)) {
      jest.setSystemTime(time);
      const now = new Date();
      if (stored?.refreshAt && stored.refreshAt.getTime() <= time) { stored = leadDraft(lead, now); rebuilds++; }
      const expected = leadProduct(lead, now, true), actual = stored?.product ? { ...stored.product, mapLocation: stored.mapLocation } : null;
      expect(actual).toEqual(expected);
      const state = JSON.stringify(expected);
      if (state !== previous) { states++; previous = state; }
    }
  } finally { jest.useRealTimers(); }
  return { rebuilds, states };
}

test('picks the next deadline strictly after now, or none', () => {
  expect(nextRefresh([5, 10, 20], new Date(10))).toEqual(new Date(20));
  expect(nextRefresh([5, 10], new Date(10))).toBeNull();
  expect(nextRefresh([], new Date(0))).toBeNull();
});
test('an archive reference loses its photos and then its place exactly when the full scan says so', () => {
  const lead = row('ARCHIVE', T0, { checked: T0 - HOUR, posted: T0 - DAY }, base => [
    photo(base, 0, T0 - HOUR, T0 - HOUR + 48 * HOUR),   // the old 48 hour shape, read as 14 days
    photo(base, 1, T0 - 2 * HOUR, T0 + 3 * DAY),        // an earlier, independent permission deadline
  ]);
  const result = walk(lead, T0, T0 + 16 * DAY);
  // Two photos, then one, then none of the reference at all: more than one public state was covered.
  expect(result.states).toBeGreaterThanOrEqual(3);
  expect(result.rebuilds).toBeGreaterThan(0);
  jest.useFakeTimers();
  try {
    jest.setSystemTime(T0 + 16 * DAY);
    expect(leadDraft(lead, new Date())?.product ?? null).toBeNull();   // no longer public
    jest.setSystemTime(T0 + 20 * DAY);
    expect(leadDraft(lead, new Date())).toBeNull();                    // and, once no deadline is left, no entry at all
  } finally { jest.useRealTimers(); }
});
test('a reference whose check time is still ahead appears at that time and then stays', () => {
  const lead = row('DB_MASTER', T0 + 2 * HOUR, { checked: T0 + HOUR, posted: T0 - DAY }, base => [photo(base, 0, T0 + 90 * 60_000, T0 + 2 * HOUR)]);
  jest.useFakeTimers();
  try {
    jest.setSystemTime(T0);
    const before = leadDraft(lead, new Date());
    expect(before?.product).toBeNull();
    expect(before?.refreshAt).not.toBeNull();
  } finally { jest.useRealTimers(); }
  const result = walk(lead, T0, T0 + 30 * DAY);
  expect(result.states).toBeGreaterThanOrEqual(3);   // hidden, shown without the photo, shown with it
  jest.useFakeTimers();
  try {
    jest.setSystemTime(T0 + 30 * DAY);
    const settled = leadDraft(lead, new Date());
    expect(settled?.product).not.toBeNull();
    expect(settled?.refreshAt).toBeNull();   // nothing left that the clock can change
  } finally { jest.useRealTimers(); }
});
