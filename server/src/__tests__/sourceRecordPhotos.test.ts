import { recordPhotoEvidence, signPhotoReceipt, verifyPhotoReceipt, PhotoUploadReceipt } from '../lib/sourceRecordPhotos';
import { sourceLeadMedia } from '../lib/sourceLeadMedia';
import { photoCompleteness } from '../lib/sourcePhotoInventory';
import { parseLead } from '../lib/sourceLeadRules';

const now = Date.parse('2026-10-22T06:00:00Z'), key = 'synthetic-admin-key', recordId = '33333333-3333-4333-8333-333333333333';
const url = 'https://www.facebook.com/groups/123/posts/456';
const row = { id: recordId, archiveItemId: 'FB123-456-02', canonicalUrl: url, title: '合成公仔 6隻', evidence: {} as any };
const receipt = (sourcePhotoId: string, n: number): PhotoUploadReceipt => ({ recordId, sourcePhotoId, mediaId: `44444444-4444-4444-8444-44444444444${n}`, photoId: `5550${n}`,
  imageSource: `https://live.staticflickr.com/65535/5550${n}_abc${n}_b.jpg`, thumbnailSource: `https://live.staticflickr.com/65535/5550${n}_abc${n}_n.jpg`, uploadedAt: '2026-10-22T05:00:00Z' });
// One post, two listed items: photo 900 belongs to the other item, 901/902 to this one, 903 is a shop screenshot.
const assignment = (photos = [
  { sourcePhotoId: '900', classification: 'OTHER_ITEM', archiveItemId: 'FB123-456-01' },
  { sourcePhotoId: '901', classification: 'SAME_ITEM', archiveItemId: row.archiveItemId },
  { sourcePhotoId: '902', classification: 'ITEM_SPECIFICATION', archiveItemId: row.archiveItemId },
  { sourcePhotoId: '903', classification: 'ADVERTISEMENT' }]) => ({ checkedAt: '2026-10-21T10:00:00Z', sourceRevision: 'fb-photo-viewer-2026-10-22', reviewRef: 'review:claude-photo/FB123-456-02', rightsEvidenceRef: 'consent:hank-20261022-flickr-photo-backup', coverage: 'FULL_POST', photos });

describe('DB record photos are backed up to Flickr and bound per item', () => {
  test('signed receipts are bound to the record and a real Flickr URL', () => {
    const signed = signPhotoReceipt(receipt('901', 1), key);
    expect(verifyPhotoReceipt(signed, recordId, key)).toEqual(receipt('901', 1));
    expect(() => verifyPhotoReceipt(signed, '33333333-3333-4333-8333-000000000000', key)).toThrow('PHOTO_RECEIPT_INVALID');
    expect(() => verifyPhotoReceipt({ ...signed, photoId: '55509' }, recordId, key)).toThrow('PHOTO_RECEIPT_INVALID');
    expect(() => verifyPhotoReceipt(signed, recordId, 'other-key')).toThrow('PHOTO_RECEIPT_INVALID');
    const fake = signPhotoReceipt({ ...receipt('901', 1), imageSource: 'https://scontent.example.com/1.jpg' }, key);
    expect(() => verifyPhotoReceipt(fake, recordId, key)).toThrow('PHOTO_RECEIPT_INVALID');
  });
  test('only this item\'s photos are attached, in source order, and count as complete', () => {
    const { media, photoInventory } = recordPhotoEvidence(row, assignment(), [receipt('902', 2), receipt('901', 1)], now);
    expect(media.map((m: any) => [m.sourcePhotoId, m.sequence, m.rightsBasis])).toEqual([['901', 0, 'HANK_USER_DIRECTED'], ['902', 1, 'HANK_USER_DIRECTED']]);
    const probe = { ...row, recordOrigin: 'DB_MASTER', evidence: { media, photoInventory } };
    expect(photoCompleteness(probe, sourceLeadMedia(probe, now), now)).toMatchObject({ status: 'IMPORTED_COMPLETE', sourceCount: 2, importedCount: 2 });
  });
  test('a re-check keeps uploaded photos and only needs receipts for new ones', () => {
    const first = recordPhotoEvidence(row, assignment(), [receipt('901', 1), receipt('902', 2)], now);
    const again = recordPhotoEvidence({ ...row, evidence: first }, assignment(), [], now);
    expect(again.media.map((m: any) => m.flickrPhotoId)).toEqual(['55501', '55502']);
  });
  test('missing, extra or foreign assignments fail closed', () => {
    expect(() => recordPhotoEvidence(row, assignment(), [receipt('901', 1)], now)).toThrow('PHOTO_RECEIPT_REQUIRED');
    expect(() => recordPhotoEvidence(row, assignment(), [receipt('901', 1), receipt('902', 2), receipt('900', 3)], now)).toThrow('PHOTO_RECEIPT_UNUSED');
    const foreign = assignment([{ sourcePhotoId: '901', classification: 'SAME_ITEM', archiveItemId: 'FB123-456-01' }]);
    expect(() => recordPhotoEvidence(row, foreign, [receipt('901', 1)], now)).toThrow('PHOTO_ASSIGNMENT_INVALID');
    const unknown = assignment([{ sourcePhotoId: '901', classification: 'UNKNOWN' }]);
    expect(() => recordPhotoEvidence(row, unknown, [], now)).toThrow();
  });
  test('DB record photos do not expire passively; archive photos keep the 48h window', () => {
    const { media, photoInventory } = recordPhotoEvidence(row, assignment(), [receipt('901', 1), receipt('902', 2)], now);
    const later = now + 30 * 86400000, evidence = { media, photoInventory };
    expect(sourceLeadMedia({ ...row, recordOrigin: 'DB_MASTER', evidence }, later)).toHaveLength(2);
    expect(photoCompleteness({ ...row, recordOrigin: 'DB_MASTER', evidence }, sourceLeadMedia({ ...row, recordOrigin: 'DB_MASTER', evidence }, later), later).status).toBe('IMPORTED_COMPLETE');
    expect(sourceLeadMedia({ ...row, recordOrigin: 'ARCHIVE', evidence }, later)).toEqual([]);
    expect(photoCompleteness({ ...row, evidence }, [], later).status).toBe('STALE');
  });
});

test('DB records stay listed until a re-check withdraws them; archive leads still expire', () => {
  const facts = { archiveItemId: 'FB123-456-02', libraryFileId: null, archiveVersion: null, archiveSha256: null, canonicalUrl: url, title: '合成來源測試用品', summary: '合成測試來源；库存與交易待確認。', county: '臺南市', district: '永康區', publicPlaceName: '合成公共面交點', publicAddress: '臺南市永康區合成路123號', latitude: 23, longitude: 120.236,
    postedEarliestAt: '2026-05-01T01:00:00Z', postedLatestAt: '2026-05-01T02:00:00Z', checkedAt: '2026-09-01T06:00:00Z',
    evidence: { sourceUrl: url, sourcePublic: true, publicSourceRef: 'source:synthetic-public', dateRef: 'source:synthetic-date', locationRef: 'source:synthetic-place', coordinateRef: 'source:synthetic-coordinate', locationSourceUrl: 'https://public.example.invalid/place/qa', coordinateSourceUrl: 'https://public.example.invalid/map/qa', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, sourceCheckRef: 'source:synthetic-source-check', reviewRef: 'review:synthetic-review' } };
  expect(parseLead(facts, new Date(now), true).checkedAt.toISOString()).toBe('2026-09-01T06:00:00.000Z');
  expect(() => parseLead({ ...facts, libraryFileId: 'libfile_' + 'a'.repeat(32), archiveVersion: 1, archiveSha256: 'b'.repeat(64) }, new Date(now))).toThrow('SOURCE_DATE_OR_LOCATION_EXPIRED');
  expect(() => parseLead({ ...facts, checkedAt: '2026-10-23T06:00:00Z' }, new Date(now), true)).toThrow('SOURCE_DATE_OR_LOCATION_EXPIRED');
});
