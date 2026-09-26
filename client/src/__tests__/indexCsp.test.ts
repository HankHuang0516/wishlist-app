import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HTML content security policy', () => {
  it('allows browser-local private image previews only for images', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const meta = html.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    expect(meta).not.toBeNull();
    const directives = Object.fromEntries(meta![1].split(';').map(part => part.trim()).filter(Boolean)
      .map(part => { const [name, ...sources] = part.split(/\s+/); return [name, sources]; }));
    expect(directives['img-src']).toContain('blob:');
    expect(directives['script-src']).not.toContain('blob:');
  });
});
