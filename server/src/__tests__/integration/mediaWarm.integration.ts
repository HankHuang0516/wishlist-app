import express from 'express';
import request from 'supertest';
import prisma from '../../lib/prisma';
import { createSourceLeadRoutes, createSourceLeadAdmin } from '../../routes/sourceLeadRoutes';
import { prepareSourcePhotoImport } from '../../lib/sourcePhotoImport';
import { clearMediaCache, mediaCacheStats } from '../../lib/listingFlickrStorage';
import { clearThumbnailAliases, warmThumbnails } from '../../lib/mediaWarm';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');

/** Thumbnails are proxied from Flickr. Every visitor of a list page asks for the same ones, so a rendition read once
 * stays in memory, and a list reply warms the renditions it is about to be asked for. Flickr is a fake here. */
describe('source thumbnails: read from Flickr once, warmed by the list reply', () => {
    const origin = 'https://wishlist-qa.invalid', admin = 'synthetic-media-warm-admin', prefix = 'SYNTHETIC-MEDIA-WARM-';
    const oldFlag = process.env.SOURCE_LEADS_PUBLIC_ENABLED, oldApi = process.env.API_URL;
    const flickr = new Map<string, Buffer>();
    const realFetch = global.fetch;
    const fetched: string[] = [];
    let app: express.Express;
    const jpeg = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1500, fill)]);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    async function importLead(count: number, photos: number) {
        const id = prefix + count, sourceUrl = 'https://www.facebook.com/groups/123456789/posts/' + id, at = new Date().toISOString();
        const base = { archiveItemId: id, libraryFileId: 'libfile_' + 'a'.repeat(32), archiveVersion: 1, archiveSha256: 'a'.repeat(64), title: '來源線索：合成預熱測試' + count, summary: '僅本地合成測試，非真實商品。', canonicalUrl: sourceUrl, county: '臺南市', district: '永康區', publicPlaceName: '合成公共面交點', publicAddress: '臺南市永康區合成路123號', latitude: 23, longitude: 120.236, postedEarliestAt: new Date(Date.now() - 86400000).toISOString(), postedLatestAt: new Date(Date.now() - 86400000).toISOString(), checkedAt: at,
            evidence: { sourceUrl, sourcePublic: true, publicSourceRef: 'self:synthetic-public', dateRef: 'self:synthetic-date', locationRef: 'self:synthetic-location', coordinateRef: 'self:synthetic-coordinate', locationSourceUrl: 'https://public.example.invalid/place/qa', coordinateSourceUrl: 'https://public.example.invalid/map/qa', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'self:synthetic-review' } };
        const ids = Array.from({ length: photos }, (_, i) => 'synthetic' + count + '-' + i);
        const inventory = { archiveItemId: id, sourceUrl, checkedAt: at, reviewRef: 'review:synthetic-all-angles', sourceRevision: 'synthetic-1', coverage: 'FULL_POST' as const, photos: ids.map(sourcePhotoId => ({ sourcePhotoId, classification: 'SAME_ITEM' as const, archiveItemId: id })) };
        const receipts = ids.map((sourcePhotoId, i) => {
            const photoId = String(count * 100 + i);
            flickr.set(`https://live.staticflickr.com/1/${photoId}_abc_s.jpg`, jpeg(i + 1)); flickr.set(`https://live.staticflickr.com/1/${photoId}_abc_b.jpg`, jpeg(100 + i));
            return { state: 'UPLOADED_AND_VERIFIED', archiveItemId: id, sourcePostUrl: sourceUrl, sourcePhotoId, mediaId: `55555555-5555-4555-8555-${String(count * 100 + i).padStart(12, '0')}`, photoId, mappingEvidenceRef: 'review:synthetic-photo', rightsBasis: 'HANK_USER_DIRECTED', rightsEvidenceRef: 'consent:synthetic-display', uploadReceiptRef: 'source:synthetic-flickr', verifiedAt: at, flickrOriginal: { source: `https://live.staticflickr.com/1/${photoId}_abc_b.jpg` }, thumbnailSource: `https://live.staticflickr.com/1/${photoId}_abc_s.jpg` };
        });
        const row = prepareSourcePhotoImport(base, inventory, receipts as any, { version: 2, sha256: 'b'.repeat(64) });
        const result = await request(app).post('/api/source-lead-admin/import').set('x-admin-key', admin).send({ items: [row], dryRun: false });
        expect(result.status).toBe(200);
        return result.body.ids[0] as string;
    }
    beforeAll(async () => {
        process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1'; process.env.API_URL = origin + '/api'; process.env.MEDIA_WARM_IN_TESTS = '1';
        global.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input);
            fetched.push(url);
            const bytes = flickr.get(url);
            return bytes ? new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length) } }) : new Response('not here', { status: 404 });
        }) as typeof fetch;
        app = express(); app.use(express.json());
        app.use('/api/source-lead-admin', createSourceLeadAdmin(() => admin)); app.use('/api/source-leads', createSourceLeadRoutes());
        await prisma.externalSourceLead.deleteMany({ where: { archiveItemId: { startsWith: prefix } } });
    });
    beforeEach(() => { clearMediaCache(); clearThumbnailAliases(); fetched.length = 0; });
    afterAll(async () => {
        global.fetch = realFetch; delete process.env.MEDIA_WARM_IN_TESTS;
        await prisma.externalSourceLead.deleteMany({ where: { archiveItemId: { startsWith: prefix } } });
        if (oldFlag === undefined) delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; else process.env.SOURCE_LEADS_PUBLIC_ENABLED = oldFlag;
        if (oldApi === undefined) delete process.env.API_URL; else process.env.API_URL = oldApi;
        await prisma.$disconnect();
    });

    it('serves the same thumbnail to every reader after one Flickr read, and still refuses a withdrawn lead', async () => {
        const leadId = await importLead(1, 3);
        const detail = await request(app).get('/api/source-leads/' + leadId).query({ presentation: '1', photos: '2', approximate: '1' });
        expect(detail.status).toBe(200);
        const [first] = detail.body.media as { thumbnailUrl: string; imageUrl: string }[];
        const path = new URL(first.thumbnailUrl).pathname.replace(/^\/api/, '');
        const a = await request(app).get('/api' + path), b = await request(app).get('/api' + path);
        expect(a.status).toBe(200); expect(b.status).toBe(200);
        expect(Buffer.from(a.body).equals(Buffer.from(b.body))).toBe(true); expect(a.headers['content-type']).toBe('image/jpeg');
        expect(a.headers['cache-control']).toBe('private, no-store');
        expect(fetched).toHaveLength(1); expect(fetched[0]).toMatch(/_abc_s\.jpg$/);
        expect(mediaCacheStats()).toMatchObject({ small: { entries: 1 } });
        // The lead's own currency check runs on every request: cached bytes do not outlive a withdrawal.
        await prisma.externalSourceLead.update({ where: { id: leadId }, data: { status: 'WITHDRAWN' } });
        expect((await request(app).get('/api' + path)).status).toBe(404);
        expect(fetched).toHaveLength(1);
    });

    it('warms the thumbnails a list reply shows, in order, so their requests are answered from memory', async () => {
        const ids = [await importLead(2, 2), await importLead(3, 2)];
        const list = await request(app).get('/api/source-leads').query({ presentation: '1', photos: '2', approximate: '1' });
        expect(list.status).toBe(200);
        const shown = (list.body.items as { id: string; media: { thumbnailUrl: string }[] }[]).filter(item => ids.includes(item.id));
        expect(shown).toHaveLength(2);
        for (let waited = 0; waited < 50 && mediaCacheStats().small.entries < 2; waited++) await sleep(50);
        // Both leads' first thumbnails were read from Flickr by the warm-up, not their second ones.
        const warmed = fetched.slice();
        expect(warmed).toHaveLength(2); expect(warmed.every(url => /_abc_s\.jpg$/.test(url))).toBe(true);
        for (const item of shown) {
            const path = new URL(item.media[0].thumbnailUrl).pathname.replace(/^\/api/, '');
            expect((await request(app).get('/api' + path)).status).toBe(200);
        }
        expect(fetched).toHaveLength(2);
        // A second read of the list costs no Flickr read and no new resolution.
        expect((await request(app).get('/api/source-leads').query({ presentation: '1', photos: '2', approximate: '1' })).status).toBe(200);
        await sleep(100);
        expect(fetched).toHaveLength(2);
    });

    it('considers at most the first eight thumbnails, ignores unknown URLs and never throws', async () => {
        const leadId = await importLead(4, 2);
        const detail = await request(app).get('/api/source-leads/' + leadId).query({ presentation: '1', photos: '2', approximate: '1' });
        const [thumb, second] = (detail.body.media as { thumbnailUrl: string }[]).map(m => m.thumbnailUrl);
        const result = await warmThumbnails([null, undefined, '', 'https://example.invalid/not-a-thumbnail', origin + '/api/source-leads/00000000-0000-4000-8000-000000000000/media/00000000-0000-4000-8000-000000000001/thumbnail', thumb, thumb, second], 3);
        // Three distinct URLs are considered: the unknown one, the lead that does not exist, and the first thumbnail.
        expect(result).toEqual({ considered: 3, read: 1 });
        expect(fetched).toHaveLength(1); expect(fetched[0]).toMatch(/_abc_s\.jpg$/);
        expect(await warmThumbnails([thumb, second])).toEqual({ considered: 2, read: 1 });
        expect(fetched).toHaveLength(2);
        expect(await warmThumbnails([thumb, second])).toEqual({ considered: 2, read: 0 });
        // A rendition Flickr refuses is remembered: the next list reply does not ask for it again.
        const missing = await importLead(5, 1);
        const gone = ((await request(app).get('/api/source-leads/' + missing).query({ presentation: '1', photos: '2', approximate: '1' })).body.media as { thumbnailUrl: string }[])[0].thumbnailUrl;
        flickr.delete([...flickr.keys()].find(url => url.includes('/500_abc_s.jpg'))!);
        expect(await warmThumbnails([gone])).toEqual({ considered: 1, read: 0 }); expect(fetched).toHaveLength(3);
        expect(await warmThumbnails([gone])).toEqual({ considered: 1, read: 0 }); expect(fetched).toHaveLength(3);
        await prisma.externalSourceLead.update({ where: { id: leadId }, data: { status: 'WITHDRAWN' } });
        clearMediaCache(); clearThumbnailAliases();
        expect(await warmThumbnails([thumb])).toEqual({ considered: 1, read: 0 });
        expect(fetched).toHaveLength(3);
    });
});
