import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const { localIosPaths } = createRequire(import.meta.url)('../../scripts/local-ios-paths.cjs');
const mobile = '/reviewed/mobile';

describe('non-overwriting local iOS build paths', () => {
  it('keeps default historical evidence paths unchanged', () => {
    expect(localIosPaths(mobile, 'simulator')).toEqual({ derived: mobile + '/build/ios-simulator-signed', result: mobile + '/build/ios-simulator-signed-result-20260915.xcresult' });
    expect(localIosPaths(mobile, 'archive')).toEqual({ derived: mobile + '/build/ios-archive-derived', archive: mobile + '/build/ios-archive-login/Wishlistai.xcarchive', result: mobile + '/build/ios-archive-login-result-20260915.xcresult' });
  });
  it('isolates each reviewed label for both app and result evidence', () => {
    expect(localIosPaths(mobile, 'simulator', '20260915-1918')).toEqual({ derived: mobile + '/build/ios-simulator-20260915-1918', result: mobile + '/build/ios-simulator-20260915-1918-result.xcresult' });
    expect(localIosPaths(mobile, 'archive', '20260915-1918')).toEqual({ derived: mobile + '/build/ios-archive-20260915-1918-derived', archive: mobile + '/build/ios-archive-20260915-1918/Wishlistai.xcarchive', result: mobile + '/build/ios-archive-20260915-1918-result.xcresult' });
  });
  it.each(['', '../escape', '/root', '20260915-1918/extra', '20260915-1918\n', 'label', '20260915-191', '20260915-19188'])('rejects unreviewed labels %#', label => {
    expect(() => localIosPaths(mobile, 'simulator', label)).toThrow();
  });
  it('rejects unsupported kinds', () => expect(() => localIosPaths(mobile, 'unknown', '20260915-1918')).toThrow());
});
