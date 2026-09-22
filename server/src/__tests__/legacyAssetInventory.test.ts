import { legacyAssetCandidate } from '../lib/legacyAssetInventory';
const previous = process.env.CLIENT_URL;
beforeAll(() => { process.env.CLIENT_URL = 'https://owned.example.invalid'; });
afterAll(() => { if (previous === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previous; });
describe('legacy candidate inventory is not ownership/deletion authority', () => {
    it.each(['avatar_1789470000000.jpg', '1789470000000.png', 'ai_123_1789470000000.jpg', 'url_123_1789470000000.webp'])('captures only a known local producer target %s', name => {
        expect(legacyAssetCandidate('/uploads/' + name)).toEqual({ kind: 'LOCAL', target: name });
        expect(legacyAssetCandidate('https://owned.example.invalid/uploads/' + name)).toEqual({ kind: 'LOCAL', target: name });
    });
    it.each(['live', 'farm1'])('keeps only Flickr photo identity, not the access suffix or arbitrary URL', farm => {
        expect(legacyAssetCandidate('https://' + farm + '.staticflickr.com/1234/90000000000101_aabbccdd_b.jpg')).toEqual({ kind: 'FLICKR', target: '90000000000101' });
    });
    it.each([null, 12, '', 'x'.repeat(2049), '/uploads/fallback_tech.png', '/uploads/unknown.jpg', '/uploads/../uploads/1789470000000.png', '/uploads/%2e%2e/1789470000000.png', '/uploads/1789470000000.png?secret=x', '/uploads/1789470000000.png#x', '/uploads/1789470000000.exe', '/uploads/sub/1789470000000.png', 'https://other.example.invalid/uploads/1789470000000.png', 'http://live.staticflickr.com/12/90000000000101_a.jpg', 'https://live.staticflickr.com.evil.invalid/12/90000000000101_a.jpg', 'https://user:secret@live.staticflickr.com/12/90000000000101_a.jpg', 'https://live.staticflickr.com:444/12/90000000000101_a.jpg', 'https://live.staticflickr.com/12/90000000000101_a.jpg?key=x'])('does not inventory shared static assets, unknown producers or unsafe targets %j', raw => expect(legacyAssetCandidate(raw)).toBeNull());
});
