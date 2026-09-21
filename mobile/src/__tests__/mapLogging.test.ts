import { describe, expect, it, vi } from 'vitest';

vi.mock('@maplibre/maplibre-react-native', () => ({ LogManager: { onLog: vi.fn() } }));
vi.mock('react-native', () => ({ LogBox: { ignoreLogs: vi.fn() } }));
import { configureMapLogging, isKnownBasemapGeometryWarning, KNOWN_BASEMAP_GEOMETRY_CONSOLE } from '../mapLogging';
import { LogManager } from '@maplibre/maplibre-react-native';
import { LogBox } from 'react-native';

describe('MapLibre log boundary', () => {
  it('handles only the exact known OpenFreeMap worker geometry warning', () => {
    expect(isKnownBasemapGeometryWarning({ level: 'warn', tag: 'Mbgl', message: '{Worker 3}[General]: Invalid geometry in line layer' })).toBe(true);
    expect(isKnownBasemapGeometryWarning({ level: 'warn', tag: 'Mbgl', message: '[General]: Invalid geometry in line layer' })).toBe(true);
    expect(isKnownBasemapGeometryWarning({ level: 'error', tag: 'Mbgl', message: '{Worker 3}[General]: Invalid geometry in line layer' })).toBe(false);
    expect(isKnownBasemapGeometryWarning({ level: 'warn', tag: 'Mbgl', message: '{Worker 3}[General]: Invalid geometry in fill layer' })).toBe(false);
    expect(isKnownBasemapGeometryWarning({ level: 'warn', tag: 'Network', message: '{Worker 3}[General]: Invalid geometry in line layer' })).toBe(false);
  });

  it('registers the narrow handler without changing native log level', () => {
    configureMapLogging();
    expect(LogManager.onLog).toHaveBeenCalledOnce();
    expect(LogManager.onLog).toHaveBeenCalledWith(isKnownBasemapGeometryWarning);
    expect(LogBox.ignoreLogs).toHaveBeenCalledOnce();
    expect(LogBox.ignoreLogs).toHaveBeenCalledWith([KNOWN_BASEMAP_GEOMETRY_CONSOLE]);
    expect(KNOWN_BASEMAP_GEOMETRY_CONSOLE.test('MapLibre Native [WARN] [Mbgl] [General]: Invalid geometry in line layer')).toBe(true);
    expect(KNOWN_BASEMAP_GEOMETRY_CONSOLE.test('MapLibre Native [WARN] [Mbgl] [General]: Invalid geometry in fill layer')).toBe(false);
    expect(KNOWN_BASEMAP_GEOMETRY_CONSOLE.test('MapLibre Native [ERROR] [Mbgl] [General]: Invalid geometry in line layer')).toBe(false);
  });
});
