import fs from 'node:fs';
import path from 'node:path';
import { transformWithEsbuild, type Plugin } from 'vite';
import { buildPlan, firstScreenExtras, inlineBoot, parseRoutes, type FirstScreenChunk } from './src/firstScreen/plan';

/* Puts the first-screen boot script (src/firstScreen/boot.ts) inline into the built index.html, together with the
 * list of files each route needs. It runs after the bundle is final, so the names it writes are the names on disk;
 * scripts/verify-first-screen.cjs checks that again after the build. Development and tests are left alone.
 */
export function firstScreen(): Plugin {
  let root = '';
  return {
    name: 'wishlist-first-screen',
    apply: 'build',
    configResolved(config) { root = config.root; },
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        if (!context.bundle) throw new Error('First screen: the bundle is not available to index.html.');
        const chunks: FirstScreenChunk[] = Object.values(context.bundle).flatMap(item => item.type === 'chunk' ? [{
          fileName: item.fileName, isEntry: item.isEntry, imports: item.imports, moduleIds: item.moduleIds,
          css: [...(item.viteMetadata?.importedCss ?? [])],
        }] : []);
        const routes = parseRoutes(fs.readFileSync(path.resolve(root, 'src/App.tsx'), 'utf8'));
        const boot = await transformWithEsbuild(fs.readFileSync(path.resolve(root, 'src/firstScreen/boot.ts'), 'utf8'), 'boot.ts',
          { loader: 'ts', format: 'iife', globalName: '__wfs', minify: true, target: 'es2020', sourcemap: false });
        return inlineBoot(html, boot.code, buildPlan(chunks, routes, firstScreenExtras));
      },
    },
  };
}
