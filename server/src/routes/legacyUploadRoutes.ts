import { Router } from 'express';
import path from 'path';

// Legacy avatars and item images are flat files. Never expose directories in
// the volume: listing-media contains owner-scoped photos served by its API.
export function createLegacyUploadRoutes(root = path.resolve(process.cwd(), 'public/uploads')) {
    const router = Router();
    router.get('/:name', (req, res) => {
        const name = req.params.name;
        if (!/^[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9]{1,12}$/.test(name)) return res.sendStatus(404);
        return res.sendFile(name, { root, dotfiles: 'deny' }, error => {
            if (error) { if (res.headersSent) res.destroy(error); else res.sendStatus(404); }
        });
    });
    router.use((_req, res) => res.sendStatus(404));
    return router;
}
