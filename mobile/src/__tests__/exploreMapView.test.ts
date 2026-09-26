import { describe, expect, it } from 'vitest';
import { expandedSearchBounds, resultCamera } from '../exploreMapView';
import { TAIWAN_BOUNDS } from '../listingSearch';

describe('explore result camera', () => {
  it('centers one result on its public approximate point without opening detail', () => {
    expect(resultCamera([{ longitude: 121.52, latitude: 25.05 }])).toEqual({
      kind: 'single', center: [121.52, 25.05], zoom: 13,
    });
  });
  it('fits several public points with margin and never expands outside Taiwan', () => {
    const camera = resultCamera([{ longitude: 121.5, latitude: 25 }, { longitude: 121.8, latitude: 25.2 }]);
    expect(camera?.kind).toBe('multiple');
    if (camera?.kind !== 'multiple') return;
    expect(camera.bounds[0]).toBeLessThan(121.5);
    expect(camera.bounds[1]).toBeLessThan(25);
    expect(camera.bounds[2]).toBeGreaterThan(121.8);
    expect(camera.bounds[3]).toBeGreaterThan(25.2);
    expect(resultCamera([])).toBeNull();
    expect(resultCamera([{ longitude: 181, latitude: 90 }])).toBeNull();
  });
  it('widens the current search scope, still clipped to Taiwan', () => {
    const expanded = expandedSearchBounds([121.5, 25, 121.6, 25.1]);
    [121.45, 24.95, 121.65, 25.15].forEach((value, index) => expect(expanded[index]).toBeCloseTo(value, 5));
    expect(expandedSearchBounds(TAIWAN_BOUNDS)).toEqual(TAIWAN_BOUNDS);
  });
});
