import { describe, expect, it } from 'vitest';
import { listingShareUrl } from '../listingShare';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('published listing share URLs', () => {
  it('uses the public site origin and stable listing ID', () => {
    expect(listingShareUrl({ id, publishedAt: '2026-09-25T00:00:00.000Z' },
      'https://wishlist-app-production.up.railway.app/api'))
      .toBe(`https://wishlist-app-production.up.railway.app/listings/${id}`);
  });
  it('does not expose drafts and rejects unsafe or malformed origins', () => {
    expect(listingShareUrl({ id, publishedAt: null }, 'https://wishlist-app-production.up.railway.app')).toBeNull();
    expect(listingShareUrl({ id: '../private', publishedAt: '2026-09-25T00:00:00Z' }, 'https://example.com')).toBeNull();
    expect(() => listingShareUrl({ id, publishedAt: '2026-09-25T00:00:00Z' }, 'http://evil.test')).toThrow();
  });
});
