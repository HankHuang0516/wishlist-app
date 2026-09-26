import { describe, expect, it } from 'vitest';
import { earliestExtensionDate, listingEditBody, managementTab, parseManagedListing, parseManagedListingPage } from '../managedListing';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
const mediaId = 'fab22941-2df0-4ca4-90c2-70c504527243';
const api = 'https://example.com';
const row = { id, ownerUserId: 42, owner: { id: 42, name: 'Tester' }, version: 3,
  title: '檯燈', description: '二手檯燈', status: 'ACTIVE', condition: 'USED', category: 'home',
  price: '590', currency: 'TWD', createdAt: '2026-09-25T00:00:00.000Z', expiresAt: '2026-10-25T00:00:00.000Z',
  location: { county: '新北市', district: '板橋區' }, media: [{ id: mediaId, thumbnailUrl: `${api}/api/listing-media/${mediaId}/thumbnail` }] };

describe('my listings safety and management', () => {
  it('projects only own listing fields and checks owner identity', () => {
    expect(parseManagedListing({ ...row, requestHash: 'private' }, 42, api)).not.toHaveProperty('requestHash');
    expect(() => parseManagedListing({ ...row, ownerUserId: 43 }, 42, api)).toThrow();
    expect(() => parseManagedListing({ ...row, owner: { id: 43 } }, 42, api)).toThrow();
    expect(() => parseManagedListing({ ...row, media: [{ id: mediaId, thumbnailUrl: 'https://evil.test/photo' }] }, 42, api)).toThrow();
  });
  it('rejects malformed pages, duplicates and non-progressing cursors', () => {
    expect(parseManagedListingPage({ items: [row], nextCursor: id }, 42, api).items).toHaveLength(1);
    for (const value of [{ items: [row, row], nextCursor: null }, { items: [], nextCursor: id },
      { items: [row], nextCursor: mediaId }, { items: 'bad', nextCursor: null }])
      expect(() => parseManagedListingPage(value, 42, api)).toThrow();
  });
  it('classifies expired active goods separately from true active goods', () => {
    const item = parseManagedListing(row, 42, api);
    expect(managementTab(item, Date.parse('2026-10-01T00:00:00Z'))).toBe('在售');
    expect(managementTab(item, Date.parse('2026-11-01T00:00:00Z'))).toBe('已失效');
    expect(managementTab({ ...item, status: 'RESERVED' }, Date.parse('2026-10-01T00:00:00Z'))).toBe('已保留');
    expect(managementTab({ ...item, status: 'SOLD' })).toBe('已售出');
    expect(managementTab({ ...item, status: 'DRAFT' })).toBe('草稿');
  });
  it('builds versioned edits without writing arbitrary fields', () => {
    const item = parseManagedListing(row, 42, api);
    expect(listingEditBody(item, ' 新檯燈 ', ' 九成新 ', '600')).toEqual({ expectedVersion: 3, title: '新檯燈', description: '九成新', price: 600 });
    expect(() => listingEditBody(item, '檯燈', '', '600')).toThrow();
    expect(() => listingEditBody(item, '檯燈', '說明', '1e3')).toThrow();
  });
  it('starts extension after the current deadline or today if already expired', () => {
    const now = new Date('2026-09-26T10:00:00.000Z');
    expect(earliestExtensionDate('2026-10-26T15:59:59.999Z', now)).toBe('2026-10-27');
    expect(earliestExtensionDate('2026-09-20T15:59:59.999Z', now)).toBe('2026-09-26');
    expect(earliestExtensionDate(null, now)).toBe('2026-09-26');
    expect(() => earliestExtensionDate('not-a-date', now)).toThrow();
  });
});
