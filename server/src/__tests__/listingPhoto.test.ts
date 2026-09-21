import sharp from 'sharp';
import { encodeListingPhoto, MAX_PHOTO_BYTES, PhotoInputError, PhotoUploadSlots } from '../lib/listingPhoto';

describe('untrusted listing photo decoding and privacy', () => {
    it.each(['jpeg', 'png', 'webp'] as const)('actually decodes %s pixels into safe WebP and a square thumbnail', async format => {
        const input = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#cc8855' } }).toFormat(format).toBuffer();
        const result = await encodeListingPhoto(input, 'image/' + format);
        expect(result).toMatchObject({ width: 640, height: 480, byteSize: result.image.length });
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(await sharp(result.image).metadata()).toMatchObject({ format: 'webp', width: 640, height: 480 });
        expect(await sharp(result.thumbnail).metadata()).toMatchObject({ format: 'webp', width: 320, height: 320 });
    });
    it('auto-orients a real EXIF/GPS photo and strips every private metadata block', async () => {
        const input = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#448855' } }).jpeg()
            .withExif({ IFD0: { Artist: 'PRIVATE_PHOTO_OWNER' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 3/1 1/1', GPSLongitudeRef: 'E', GPSLongitude: '121/1 31/1 1/1' } })
            .withMetadata({ orientation: 6 }).toBuffer();
        const before = await sharp(input).metadata();
        expect(before.orientation).toBe(6);
        expect(before.exif!.includes(Buffer.from('PRIVATE_PHOTO_OWNER'))).toBe(true);
        // TIFF root IFD must actually contain a GPS sub-IFD pointer (0x8825).
        const exif = before.exif!; const tiff = exif.subarray(6); const little = tiff.toString('ascii', 0, 2) === 'II';
        const u16 = (offset: number) => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
        const u32 = (offset: number) => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
        const root = u32(4); const tags = Array.from({ length: u16(root) }, (_, i) => u16(root + 2 + 12 * i));
        expect(tags).toContain(0x8825);
        const result = await encodeListingPhoto(input, 'image/jpeg');
        expect(result).toMatchObject({ width: 40, height: 80 });
        for (const output of [result.image, result.thumbnail]) {
            const metadata = await sharp(output).metadata();
            for (const key of ['exif', 'xmp', 'iptc', 'icc', 'orientation']) expect(metadata).not.toHaveProperty(key);
            expect(output.includes(Buffer.from('PRIVATE_PHOTO_OWNER'))).toBe(false);
        }
    });
    it('downscales large photos without storing the original upload', async () => {
        const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#336699' } }).jpeg().toBuffer();
        const result = await encodeListingPhoto(input, 'image/jpeg');
        expect(result).toMatchObject({ width: 1600, height: 800 });
        expect(result.image.equals(input)).toBe(false);
    });
    it('has stable hashes for the same actual encoded image', async () => {
        const input = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#448855' } }).png().toBuffer();
        expect((await encodeListingPhoto(input, 'image/png')).contentHash).toBe((await encodeListingPhoto(input, 'image/png')).contentHash);
    });
    it.each([
        [Buffer.alloc(0), 'image/jpeg'], [Buffer.from('<svg onload="evil()"/>'), 'image/jpeg'],
        [Buffer.from('GIF89a'), 'image/gif'], [Buffer.from('not an image'), 'image/png'],
        [Buffer.from([0xff, 0xd8, 0xff, 0]), 'image/jpeg'], [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
        [Buffer.from('RIFF0000WEBPbroken'), 'image/webp'],
    ])('rejects empty, spoofed, unsupported and truncated content without decoder detail leaks', async (input, mime) => {
        await expect(encodeListingPhoto(input as Buffer, mime as string)).rejects.toBeInstanceOf(PhotoInputError);
    });
    it('rejects a real image whose declared MIME does not match the bytes', async () => {
        const input = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#448855' } }).png().toBuffer();
        await expect(encodeListingPhoto(input, 'image/jpeg')).rejects.toBeInstanceOf(PhotoInputError);
    });
    it('limits compressed bytes to5MB and decompressed pixels to20MP', async () => {
        await expect(encodeListingPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/png')).rejects.toMatchObject({ status: 413 });
        const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#448855' } }).jpeg().toBuffer();
        expect(oversized.length).toBeLessThan(MAX_PHOTO_BYTES);
        await expect(encodeListingPhoto(oversized, 'image/jpeg')).rejects.toBeInstanceOf(PhotoInputError);
    });
});

describe('memory-bounded upload slots', () => {
    it('rejects excess work and releases exactly once', () => {
        const slots = new PhotoUploadSlots(); const release = slots.acquire()!;
        expect(slots.acquire()).toBeUndefined(); release(); release();
        expect(slots.acquire()).toBeDefined(); expect(slots.acquire()).toBeUndefined();
    });
    it('permits only the configured number of concurrent requests', () => {
        const slots = new PhotoUploadSlots(2);
        expect(slots.acquire()).toBeDefined(); expect(slots.acquire()).toBeDefined(); expect(slots.acquire()).toBeUndefined();
    });
    it.each([0, -1, 5, 1.5, NaN])('refuses an unsafe slot limit %p', value => expect(() => new PhotoUploadSlots(value)).toThrow());
});
