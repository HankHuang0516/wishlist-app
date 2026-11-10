import { photoCacheControl, thumbnailMaxAge } from '../lib/mediaCachePolicy';

describe('how long a browser may keep a photo', () => {
    const saved = process.env.MEDIA_THUMBNAIL_MAX_AGE_S;
    beforeEach(() => { delete process.env.MEDIA_THUMBNAIL_MAX_AGE_S; });
    afterAll(() => { if (saved === undefined) delete process.env.MEDIA_THUMBNAIL_MAX_AGE_S; else process.env.MEDIA_THUMBNAIL_MAX_AGE_S = saved; });

    it('keeps only the thumbnail of something everyone can see, for ten minutes, and only in the viewer’s own browser', () => {
        expect(photoCacheControl('thumbnail', true)).toBe('private, max-age=600');
        expect(photoCacheControl('thumbnail', false)).toBe('private, no-store');
        expect(photoCacheControl('image', true)).toBe('private, no-store');
        expect(photoCacheControl('image', false)).toBe('private, no-store');
        expect(photoCacheControl('anything-else', true)).toBe('private, no-store');
    });

    it('reads the lifetime from MEDIA_THUMBNAIL_MAX_AGE_S: whole seconds, an hour at most, 0 or anything unreadable turns it off', () => {
        const cases: [string, number][] = [['', 600], ['  ', 600], ['600', 600], ['45', 45], ['90.7', 90], ['3600', 3600], ['3601', 3600], ['86400', 3600],
            ['0', 0], ['0.5', 0], ['-30', 0], ['off', 0], ['10m', 0], ['NaN', 0], ['Infinity', 0]];
        for (const [value, expected] of cases) {
            process.env.MEDIA_THUMBNAIL_MAX_AGE_S = value;
            expect([value, thumbnailMaxAge()]).toEqual([value, expected]);
            expect(photoCacheControl('thumbnail', true)).toBe(expected ? `private, max-age=${expected}` : 'private, no-store');
            expect(photoCacheControl('image', true)).toBe('private, no-store');
        }
    });
});
