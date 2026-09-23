import { promises as fs, constants } from 'fs';
import path from 'path';
import { isListingId } from './listingRules';

export class MediaStorageConfigurationError extends Error {
    constructor() { super('Private persistent photo storage is not configured'); }
}
const inside = (child: string, parent: string) => child !== parent && child.startsWith(parent + path.sep);
export type PhotoVariant = 'image' | 'thumbnail';

async function storageRoot() {
    const configured = process.env.LISTING_MEDIA_STORAGE_ROOT;
    const production = process.env.NODE_ENV === 'production';
    const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if ((configured && !path.isAbsolute(configured)) || (production && (!mount || !path.isAbsolute(mount)))) throw new MediaStorageConfigurationError();
    const root = configured ? path.resolve(configured) : production ? path.join(mount!, 'listing-media') : path.resolve(process.cwd(), 'storage', 'listing-media');
    if (production && !inside(root, path.resolve(mount!))) throw new MediaStorageConfigurationError();
    const publicRoot = path.resolve(process.cwd(), 'public');
    // The existing Railway volume is mounted at public/uploads for legacy
    // flat images. The /uploads route now serves flat filenames only, so its
    // listing-media child remains inaccessible except through the media API.
    const guardedLegacyVolume = production && !configured && path.resolve(mount!) === path.join(publicRoot, 'uploads') && root === path.join(path.resolve(mount!), 'listing-media');
    if ((root === publicRoot || inside(root, publicRoot)) && !guardedLegacyVolume) throw new MediaStorageConfigurationError();
    // A production mount must already exist. Do not silently create a directory
    // masquerading as a durable volume on the ephemeral container filesystem.
    const realMount = production ? await fs.realpath(mount!).catch(() => { throw new MediaStorageConfigurationError(); }) : undefined;
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const realRoot = await fs.realpath(root);
    const realPublicRoot = await fs.realpath(publicRoot).catch(() => publicRoot);
    if ((realMount && !inside(realRoot, realMount)) || (realRoot === realPublicRoot || inside(realRoot, realPublicRoot)) && !guardedLegacyVolume) throw new MediaStorageConfigurationError();
    return realRoot;
}

async function folderFor(id: string) {
    if (!isListingId(id)) throw new Error('Invalid internal media identity');
    return path.join(await storageRoot(), id);
}

export class ListingMediaStorage {
    async ready() { await storageRoot(); }
    async write(id: string, image: Buffer, thumbnail: Buffer) {
        const folder = await folderFor(id);
        // UUID directory claim is exclusive. Never overwrite or clean a folder
        // another upload already owns if mkdir fails.
        await fs.mkdir(folder, { mode: 0o700 });
        try {
            await fs.writeFile(path.join(folder, 'image.webp'), image, { flag: 'wx', mode: 0o600 });
            await fs.writeFile(path.join(folder, 'thumbnail.webp'), thumbnail, { flag: 'wx', mode: 0o600 });
        } catch (error) {
            await this.remove(id).catch(() => undefined);
            throw error;
        }
    }
    async open(id: string, variant: PhotoVariant) {
        const folder = await folderFor(id);
        const dir = await fs.lstat(folder);
        if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Invalid internal photo directory');
        const file = await fs.open(path.join(folder, `${variant}.webp`), constants.O_RDONLY | constants.O_NOFOLLOW);
        try { if (!(await file.stat()).isFile()) throw new Error('Not a photo file'); }
        catch (error) { await file.close(); throw error; }
        return file;
    }
    async remove(id: string) {
        const folder = await folderFor(id);
        const dir = await fs.lstat(folder).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (!dir) return;
        if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Invalid internal photo directory');
        // Only two known files in this exact validated UUID folder are removed.
        // Never recursively remove the storage root or unknown files.
        for (const name of ['image.webp', 'thumbnail.webp']) await fs.unlink(path.join(folder, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await fs.rmdir(folder);
    }
}
