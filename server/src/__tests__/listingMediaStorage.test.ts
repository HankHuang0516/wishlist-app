import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { ListingMediaStorage, MediaStorageConfigurationError } from '../lib/listingMediaStorage';

const saved = { root: process.env.LISTING_MEDIA_STORAGE_ROOT, mount: process.env.RAILWAY_VOLUME_MOUNT_PATH, mode: process.env.NODE_ENV };
let root: string;
const store = new ListingMediaStorage();
beforeAll(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-media-storage-test-')); });
beforeEach(() => { process.env.NODE_ENV = 'test'; process.env.LISTING_MEDIA_STORAGE_ROOT = path.join(root, 'private'); delete process.env.RAILWAY_VOLUME_MOUNT_PATH; });
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
    for (const [key, value] of [['LISTING_MEDIA_STORAGE_ROOT', saved.root], ['RAILWAY_VOLUME_MOUNT_PATH', saved.mount], ['NODE_ENV', saved.mode]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // This exact directory was created by this suite, never a user storage root.
    await fs.rm(root, { recursive: true, force: true });
});

describe('private filesystem photo storage', () => {
    it('writes only two private files and never overwrites an existing UUID folder', async () => {
        const id = randomUUID(); await store.write(id, Buffer.from('image'), Buffer.from('thumb'));
        const folder = path.join(root, 'private', id);
        expect((await fs.stat(folder)).mode & 0o777).toBe(0o700);
        expect((await fs.stat(path.join(folder, 'image.webp'))).mode & 0o777).toBe(0o600);
        expect((await fs.readdir(folder)).sort()).toEqual(['image.webp', 'thumbnail.webp']);
        await expect(store.write(id, Buffer.from('new'), Buffer.from('new'))).rejects.toThrow();
        expect(await fs.readFile(path.join(folder, 'image.webp'), 'utf8')).toBe('image');
        const opened = await store.open(id, 'thumbnail');
        expect(await opened.readFile('utf8')).toBe('thumb'); await opened.close();
        await store.remove(id); await store.remove(id);
    });
    it('refuses path traversal and does not remove unknown files', async () => {
        await expect(store.write('../outside', Buffer.from('x'), Buffer.from('x'))).rejects.toThrow();
        await expect(store.remove('../outside')).rejects.toThrow();
        const id = randomUUID(); await store.write(id, Buffer.from('x'), Buffer.from('x'));
        const unrelated = path.join(root, 'private', id, 'unrelated.txt'); await fs.writeFile(unrelated, 'preserve');
        await expect(store.remove(id)).rejects.toThrow();
        expect(await fs.readFile(unrelated, 'utf8')).toBe('preserve');
    });
    it('refuses public or relative roots before writing photo bytes', async () => {
        process.env.LISTING_MEDIA_STORAGE_ROOT = 'relative'; await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
        process.env.LISTING_MEDIA_STORAGE_ROOT = path.resolve(process.cwd(), 'public', 'uploads'); await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
    });
    it('fails closed in production without an actual configured mount directory', async () => {
        process.env.NODE_ENV = 'production'; await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
        process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(root, 'missing');
        process.env.LISTING_MEDIA_STORAGE_ROOT = path.join(root, 'missing', 'private');
        await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
        await expect(fs.stat(path.join(root, 'missing'))).rejects.toThrow();
    });
    it('accepts only a private child inside a production mount and rejects symlink escapes', async () => {
        const mount = path.join(root, 'volume'); await fs.mkdir(mount);
        process.env.NODE_ENV = 'production'; process.env.RAILWAY_VOLUME_MOUNT_PATH = mount;
        process.env.LISTING_MEDIA_STORAGE_ROOT = path.join(mount, 'photos'); await expect(store.ready()).resolves.toBeUndefined();
        process.env.LISTING_MEDIA_STORAGE_ROOT = root; await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
        const outside = path.join(root, 'outside'); await fs.mkdir(outside);
        const link = path.join(mount, 'escape'); await fs.symlink(outside, link);
        process.env.LISTING_MEDIA_STORAGE_ROOT = link; await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
    });
    it('does not follow a UUID directory symlink or serve symlinked photo files', async () => {
        const id = randomUUID(); await store.write(id, Buffer.from('x'), Buffer.from('x'));
        const dir = path.join(root, 'private', id);
        const target = path.join(root, 'outside-private.txt'); await fs.writeFile(target, 'private');
        await fs.unlink(path.join(dir, 'image.webp')); await fs.symlink(target, path.join(dir, 'image.webp'));
        await expect(store.open(id, 'image')).rejects.toThrow();
        const linkId = randomUUID(); await fs.symlink(dir, path.join(root, 'private', linkId));
        await expect(store.open(linkId, 'image')).rejects.toThrow(); await expect(store.remove(linkId)).rejects.toThrow();
        expect(await fs.readFile(target, 'utf8')).toBe('private');
    });
    it('rolls back its own directory after a partial write without affecting another upload', async () => {
        const preserved = randomUUID(); await store.write(preserved, Buffer.from('preserve'), Buffer.from('thumb'));
        const failed = randomUUID(); const original = fs.writeFile; const canonical = await fs.realpath(path.join(root, 'private'));
        jest.spyOn(fs, 'writeFile').mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
            if (String(args[0]) === path.join(canonical, failed, 'thumbnail.webp')) throw new Error('simulated disk failure');
            return original(...args);
        });
        await expect(store.write(failed, Buffer.from('partial'), Buffer.from('thumb'))).rejects.toThrow('simulated disk failure');
        await expect(fs.stat(path.join(root, 'private', failed))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await fs.readFile(path.join(root, 'private', preserved, 'image.webp'), 'utf8')).toBe('preserve');
    });
    it('rejects directories masquerading as photo files and closes the opened handle', async () => {
        const id = randomUUID(); await store.write(id, Buffer.from('x'), Buffer.from('x'));
        const file = path.join(root, 'private', id, 'image.webp'); await fs.unlink(file); await fs.mkdir(file);
        const original = fs.open; let closed = false;
        jest.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
            const handle = await original(...args); const close = handle.close.bind(handle);
            handle.close = async () => { closed = true; return close(); };
            return handle;
        });
        await expect(store.open(id, 'image')).rejects.toThrow('Not a photo file'); expect(closed).toBe(true);
    });
    it('propagates filesystem failures rather than claiming successful removal', async () => {
        const id = randomUUID(); await store.write(id, Buffer.from('x'), Buffer.from('x'));
        const original = fs.unlink; const canonical = await fs.realpath(path.join(root, 'private'));
        jest.spyOn(fs, 'unlink').mockImplementation(async (...args: Parameters<typeof fs.unlink>) => {
            if (String(args[0]) === path.join(canonical, id, 'image.webp')) throw Object.assign(new Error('simulated denial'), { code: 'EACCES' });
            return original(...args);
        });
        await expect(store.remove(id)).rejects.toMatchObject({ code: 'EACCES' });
        expect(await fs.readFile(path.join(root, 'private', id, 'image.webp'), 'utf8')).toBe('x');
        jest.restoreAllMocks();
        jest.spyOn(fs, 'lstat').mockRejectedValue(Object.assign(new Error('simulated denial'), { code: 'EACCES' }));
        await expect(store.remove(id)).rejects.toMatchObject({ code: 'EACCES' });
    });
    it('refuses a regular file used as a UUID directory', async () => {
        await store.ready(); const id = randomUUID(); await fs.writeFile(path.join(root, 'private', id), 'preserve');
        await expect(store.open(id, 'image')).rejects.toThrow('Invalid internal photo directory');
        await expect(store.remove(id)).rejects.toThrow('Invalid internal photo directory');
        expect(await fs.readFile(path.join(root, 'private', id), 'utf8')).toBe('preserve');
    });
    it('defaults to a private child of a production mount, rejecting relative or root mount configuration', async () => {
        const mount = path.join(root, 'default-volume'); await fs.mkdir(mount);
        process.env.NODE_ENV = 'production'; delete process.env.LISTING_MEDIA_STORAGE_ROOT;
        process.env.RAILWAY_VOLUME_MOUNT_PATH = mount; await store.ready();
        expect((await fs.stat(path.join(mount, 'listing-media'))).isDirectory()).toBe(true);
        process.env.LISTING_MEDIA_STORAGE_ROOT = mount; await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
        delete process.env.LISTING_MEDIA_STORAGE_ROOT; process.env.RAILWAY_VOLUME_MOUNT_PATH = 'relative';
        await expect(store.ready()).rejects.toBeInstanceOf(MediaStorageConfigurationError);
    });
});
