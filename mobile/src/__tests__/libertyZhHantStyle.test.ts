import { describe, expect, it } from 'vitest';
import { libertyZhHantStyle } from '../libertyZhHantStyle';

describe('bundled Traditional Chinese map style', () => {
  it('keeps the OpenFreeMap tile, sprite, glyph and attribution endpoints', () => {
    expect(libertyZhHantStyle.version).toBe(8);
    expect(libertyZhHantStyle.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
    expect(libertyZhHantStyle.sprite).toBe('https://tiles.openfreemap.org/sprites/ofm_f384/ofm');
    expect(JSON.stringify(libertyZhHantStyle.sources)).toContain('https://tiles.openfreemap.org/planet');
  });

  it('prefers Traditional Chinese on all ordinary map-name labels without touching road shields', () => {
    const labels = libertyZhHantStyle.layers.filter(layer => layer.type === 'symbol' && layer.layout?.['text-field']);
    const names = labels.filter(layer => !layer.id.includes('shield'));
    expect(names).toHaveLength(20);
    for (const layer of names) {
      expect(layer.type).toBe('symbol');
      if (layer.type !== 'symbol') throw new Error('Unexpected non-symbol map label');
      expect(layer.layout?.['text-field']).toEqual([
        'coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name'], ['get', 'name_en'],
      ]);
    }
    expect(labels.filter(layer => layer.id.includes('shield'))).toHaveLength(3);
  });
});
