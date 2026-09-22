import { LogManager } from '@maplibre/maplibre-react-native';
import { LogBox } from 'react-native';

type MapLogEvent = { level: string; tag: string; message: string };
export const KNOWN_BASEMAP_GEOMETRY_MESSAGE = /^(?:\{Worker [0-9]+\})?\[General\]: Invalid geometry in line layer$/;
export const KNOWN_BASEMAP_GEOMETRY_CONSOLE = /^MapLibre Native \[WARN\] \[Mbgl\] (?:\{Worker [0-9]+\})?\[General\]: Invalid geometry in line layer$/;

/**
 * OpenFreeMap occasionally contains a malformed basemap line geometry. Native
 * MapLibre drops that one geometry and reports this known worker warning. It
 * does not concern our marketplace GeoJSON. Suppress only that exact bounded
 * warning so development QA does not present it as an App failure.
 */
export function isKnownBasemapGeometryWarning(event: MapLogEvent) {
  return event.level === 'warn' && event.tag === 'Mbgl' &&
    KNOWN_BASEMAP_GEOMETRY_MESSAGE.test(event.message);
}

export function configureMapLogging() {
  LogManager.onLog(isKnownBasemapGeometryWarning);
  // Native iOS can deliver the same core warning through console before the
  // JS log handler subscribes. Suppress only the complete known message in
  // the development LogBox; all other warnings and every error remain visible.
  LogBox.ignoreLogs([KNOWN_BASEMAP_GEOMETRY_CONSOLE]);
}
