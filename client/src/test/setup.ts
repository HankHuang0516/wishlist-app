import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

expect.extend(matchers);

// Node 25 exposes an experimental global localStorage getter. Without a
// --localstorage-file it is only a warning-producing stub, and it shadows
// jsdom's Storage implementation in Vitest. Install the browser contract
// explicitly for tests; production still uses the real browser storage.
const testStorage = (() => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(String(key)) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(String(key)); },
    setItem(key: string, value: string) { values.set(String(key), String(value)); },
  } satisfies Storage;
})();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testStorage });
Object.defineProperty(window, 'localStorage', { configurable: true, value: testStorage });

// React 19 fix for act
if (!(React as any).act) {
  (React as any).act = (cb: any) => cb();
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
