import { eclawImageResource } from '../lib/eclawRecognitionImage';

describe('private wish photo handoff', () => {
  const imageUrl = 'https://wishlist-app-production.up.railway.app/api/listing-media/11111111-1111-4111-8111-111111111111/image';
  const flickrImageUrl = 'https://live.staticflickr.com/123/owned_opaque.jpg';
  const photo = { ownerUserId: 946, imageUrl, flickrImageUrl };
  it('resolves the linked owner photo without exposing a user authentication credential', () => {
    expect(eclawImageResource(imageUrl, null, 946, photo)).toBe(flickrImageUrl);
  });
  it('rejects missing, different-owner, mismatched and non-provider private photos', () => {
    for (const invalid of [null, { ...photo, ownerUserId: 3 }, { ...photo, imageUrl: imageUrl + '?other' }, { ...photo, flickrImageUrl: 'https://evil.example/a.jpg' }]) {
      expect(() => eclawImageResource(imageUrl, null, 946, invalid)).toThrow('Private recognition image unavailable');
    }
  });
  it('preserves ordinary HTTPS public image and link inputs', () => {
    expect(eclawImageResource('https://images.example/a.jpg', null, 3)).toBe('https://images.example/a.jpg');
    expect(eclawImageResource(null, 'https://shop.example/a', 3)).toBe('https://shop.example/a');
  });
});
