import { describe, expect, it } from 'vitest';
import { buildListingBody, emptyListingForm, ListingFormError, parsePhotoRecord, taiwanDate, uuid } from '../listingForm';

const id = '745d5d99-547b-4df7-a417-a43723c34b67';
const now = new Date('2026-09-15T04:00:00Z');
const full = { ...emptyListingForm, title: '商品', description: '實拍功能正常', brand: '品牌', price: '0', county: '台北市', district: '中山區', latitude: '25.05', longitude: '121.52', consent: true };
describe('native listing form contracts', () => {
  it('omits the expiry field only when the user selected default', () => {
    const body = buildListingBody(full, id, [id], true, now); expect(body).not.toHaveProperty('expiryDate'); expect(body.price).toBe(0);
    expect(body.deliveryMethods).toEqual(['MEETUP']); expect(body.location).toMatchObject({ latitude: 25.05, longitude: 121.52 });
    expect(buildListingBody({ ...full, expiryDate: '2026-09-16', shipping: true, negotiable: true }, id, [id], true, now)).toMatchObject({ expiryDate: '2026-09-16', deliveryMethods: ['MEETUP', 'SHIPPING'], negotiable: true });
  });
  it('permits title-only private drafts', () => {
    const body = buildListingBody({ ...emptyListingForm, title: '待整理' }, id, [], false, now);
    expect(body).toMatchObject({ publish: false, consentToMap: false, mediaIds: [] }); expect(body).not.toHaveProperty('location'); expect(body).not.toHaveProperty('price');
  });
  it('allows an unbranded photographed item to be confirmed without inventing a brand', () => {
    const body = buildListingBody({ ...full, brand: '' }, id, [id], true, now);
    expect(body).not.toHaveProperty('brand');
    expect(body).toMatchObject({ publish: true, price: 0 });
  });
  it.each([{ title: '' }, { title: 'x'.repeat(101) }, { description: 'x'.repeat(3001) }, { brand: 'x'.repeat(61) }, { category: 'bad' }, { price: '-1' }, { price: '1.001' },
    { price: '10000000000' }, { expiryDate: '2026-02-30' }, { expiryDate: '2020-01-01' }, { consent: false }, { latitude: '' }, { latitude: '0' }, { longitude: 'x' }, { county: '' },
    { district: 'x'.repeat(31) }, { description: '' }, { price: '' }, { meetup: false, shipping: false }])('rejects invalid publication data %p', changes => {
    expect(() => buildListingBody({ ...full, ...changes }, id, [id], true, now)).toThrow(ListingFormError);
  });
  it('rejects missing/duplicate image IDs and malformed listing IDs', () => {
    expect(() => buildListingBody(full, id, [], true, now)).toThrow(); expect(() => buildListingBody(full, id, [id, id], true, now)).toThrow();
    expect(() => buildListingBody(full, 'bad', [id], true, now)).toThrow(); expect(() => buildListingBody(full, id, ['bad'], true, now)).toThrow();
    expect(uuid(null)).toBe(false); expect(uuid(id)).toBe(true);
  });
  it('shows dates in Taiwan regardless of the device timezone', () => {
    expect(taiwanDate(new Date('2026-09-15T16:00:00Z'))).toBe('2026-09-16');
    expect(buildListingBody({ ...full, expiryDate: '2026-09-15' }, id, [id], true, now).expiryDate).toBe('2026-09-15');
  });
});
describe('safe photo response / bearer-token origin', () => {
  const record = { id, imageUrl: `https://example.com/api/listing-media/${id}/image`, thumbnailUrl: `https://example.com/api/listing-media/${id}/thumbnail`, width: 100, height: 100, byteSize: 1000 };
  it('accepts only the exact expected API image paths and strips unrelated server fields', () => {
    expect(parsePhotoRecord({ ...record, secret: 'never-copy' }, 'https://example.com/api')).toEqual(record);
  });
  it.each([null, false, {}, { ...record, id: 'bad' }, { ...record, thumbnailUrl: 'https://attacker.example/photo' }, { ...record, imageUrl: record.imageUrl + '?token=bad' },
    { ...record, width: 1601 }, { ...record, width: 0 }, { ...record, height: '100' }, { ...record, byteSize: -1 }])('rejects malformed or cross-origin photo responses %p', value => {
    expect(() => parsePhotoRecord(value, 'https://example.com')).toThrow(ListingFormError);
  });
});
