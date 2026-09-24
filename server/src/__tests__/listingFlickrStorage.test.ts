import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { ListingFlickrStorage, FlickrMediaUnavailable, validatedFlickrSource } from '../lib/listingFlickrStorage';

const prior = { key: process.env.FLICKR_API_KEY, secret: process.env.FLICKR_API_SECRET,
    token: process.env.FLICKR_OAUTH_TOKEN, tokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET };
beforeEach(() => {
    process.env.FLICKR_API_KEY = 'synthetic'; process.env.FLICKR_API_SECRET = 'synthetic';
    process.env.FLICKR_OAUTH_TOKEN = 'synthetic'; process.env.FLICKR_OAUTH_TOKEN_SECRET = 'synthetic';
});
afterAll(() => {
    for (const [key, value] of [['FLICKR_API_KEY', prior.key], ['FLICKR_API_SECRET', prior.secret],
        ['FLICKR_OAUTH_TOKEN', prior.token], ['FLICKR_OAUTH_TOKEN_SECRET', prior.tokenSecret]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

const jpeg = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#ffffff' } }).webp().toBuffer();
const sizes = { stat: 'ok', sizes: { size: [
    { label: 'Large 1600', source: 'https://live.staticflickr.com/22/123456_abc_h.jpg' },
    { label: 'Small 320', source: 'https://live.staticflickr.com/22/123456_abc_n.jpg' },
] } };

describe('native Flickr media adapter', () => {
    it('uploads a sanitized private master and records only Flickr-owned renditions', async () => {
        const fetcher = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            if (init.body instanceof FormData) {
                expect(init.body.get('is_public')).toBe('0'); expect(init.body.get('hidden')).toBe('2');
                expect(init.body.get('photo')).toBeInstanceOf(Blob);
                return new Response('<rsp stat="ok"><photoid>123456</photoid></rsp>');
            }
            return Response.json(sizes);
        });
        const stored = await new ListingFlickrStorage(fetcher as typeof fetch).upload(randomUUID(), await jpeg());
        expect(stored).toEqual({ photoId: '123456', imageSource: sizes.sizes.size[0].source,
            thumbnailSource: sizes.sizes.size[1].source });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('rejects mismatched or attacker-controlled CDN sources', () => {
        expect(() => validatedFlickrSource('https://live.staticflickr.com.evil.test/1/123_abc_n.jpg', '123')).toThrow(FlickrMediaUnavailable);
        expect(() => validatedFlickrSource('https://live.staticflickr.com/1/999_abc_n.jpg', '123')).toThrow(FlickrMediaUnavailable);
        expect(() => validatedFlickrSource('https://live.staticflickr.com/1/123_abc_n.jpg?redirect=1', '123')).toThrow(FlickrMediaUnavailable);
    });
    it('fails closed without complete credentials', async () => {
        delete process.env.FLICKR_OAUTH_TOKEN;
        await expect(new ListingFlickrStorage().ready()).rejects.toThrow(FlickrMediaUnavailable);
    });
    it('refuses an upload-only Flickr token before any photo is sent', async () => {
        const fetcher = jest.fn().mockResolvedValue(Response.json({ stat: 'ok', oauth: { perms: { _content: 'write' } } }));
        await expect(new ListingFlickrStorage(fetcher as typeof fetch).ready()).rejects.toThrow(FlickrMediaUnavailable);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('deletes a remote upload if Flickr returns an invalid CDN URL', async () => {
        const fetcher = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => init.body instanceof FormData
            ? new Response('<rsp stat="ok"><photoid>123456</photoid></rsp>')
            : init.method === 'POST' ? Response.json({ stat: 'ok' })
                : Response.json({ stat: 'ok', sizes: { size: [{ label: 'Small 320', source: 'https://attacker.invalid/secret.jpg' }] } }));
        await expect(new ListingFlickrStorage(fetcher as typeof fetch).upload(randomUUID(), await jpeg())).rejects.toThrow(FlickrMediaUnavailable);
        expect(fetcher).toHaveBeenCalledTimes(3);
    });
});
