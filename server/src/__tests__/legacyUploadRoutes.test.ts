import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { createLegacyUploadRoutes } from '../routes/legacyUploadRoutes';

describe('legacy public uploads', () => {
    it('serves flat legacy images but never the private listing-media directory', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-flat-uploads-'));
        try {
            await fs.writeFile(path.join(root, 'avatar_123.jpg'), 'legacy');
            const privateDir = path.join(root, 'listing-media', '123e4567-e89b-42d3-a456-426614174000');
            await fs.mkdir(privateDir, { recursive: true });
            await fs.writeFile(path.join(privateDir, 'image.webp'), 'private');
            const app = express(); app.use('/uploads', createLegacyUploadRoutes(root));
            const legacy = await request(app).get('/uploads/avatar_123.jpg');
            expect(legacy.status).toBe(200); expect(legacy.body.toString('utf8')).toBe('legacy');
            for (const url of [
                '/uploads/listing-media/123e4567-e89b-42d3-a456-426614174000/image.webp',
                '/uploads/listing-media%2f123e4567-e89b-42d3-a456-426614174000%2fimage.webp',
                '/uploads/.env',
            ]) expect((await request(app).get(url)).status).toBe(404);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
