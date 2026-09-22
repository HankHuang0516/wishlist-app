import sharp from 'sharp';
import { createHash } from 'crypto';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 20_000_000;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export class PhotoInputError extends Error {
    constructor(message = '請上傳有效的 JPEG、PNG 或 WebP 商品照片', public readonly status = 400) { super(message); }
}

function magicMime(buffer: Buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return undefined;
}

export async function encodeListingPhoto(buffer: Buffer, declaredMime: string) {
    if (!buffer.length) throw new PhotoInputError();
    if (buffer.length > MAX_PHOTO_BYTES) throw new PhotoInputError('商品照片不可超過5MB', 413);
    if (!PHOTO_MIME_TYPES.includes(declaredMime) || magicMime(buffer) !== declaredMime) throw new PhotoInputError();
    try {
        const input = sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_PHOTO_PIXELS, limitInputChannels: 4 });
        const metadata = await input.metadata();
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PHOTO_PIXELS || (metadata.pages ?? 1) > 1) throw new PhotoInputError('照片尺寸過大或含多個影格');
        // Auto-orient BEFORE removing EXIF. Do not call keepMetadata/withMetadata;
        // sharp strips EXIF/GPS/XMP/IPTC/ICC by default and outputs sRGB pixels.
        const main = await input.autoOrient().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82, effort: 4 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
        const thumbnail = await sharp(main.data).resize({ width: 320, height: 320, fit: 'cover' })
            .webp({ quality: 75, effort: 4 }).timeout({ seconds: 5 }).toBuffer();
        return { image: main.data, thumbnail, width: main.info.width, height: main.info.height, byteSize: main.data.length,
            contentHash: createHash('sha256').update(main.data).digest('hex') };
    } catch (error) {
        if (error instanceof PhotoInputError) throw error;
        // Decoder failures can contain filenames or EXIF. Never serialize them.
        throw new PhotoInputError('照片無法讀取，請選擇其他照片或先轉為JPEG');
    }
}

export class PhotoUploadSlots {
    private active = 0;
    constructor(private readonly maximum = 1) {
        if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 4) throw new Error('Invalid upload concurrency limit');
    }
    acquire(): (() => void) | undefined {
        if (this.active >= this.maximum) return undefined;
        this.active++;
        let released = false;
        return () => { if (!released) { released = true; this.active--; } };
    }
}
