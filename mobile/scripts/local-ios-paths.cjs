const path = require('node:path');

function localIosPaths(mobile, kind, label) {
  if (!['simulator', 'archive'].includes(kind)) throw new Error('Unsupported local iOS build kind');
  if (label !== undefined && !/^\d{8}-\d{4}$/.test(label)) throw new Error('Use an explicitly reviewed YYYYMMDD-HHMM build label');
  if (label === undefined) {
    return kind === 'simulator' ? {
      derived: path.join(mobile, 'build/ios-simulator-signed'),
      result: path.join(mobile, 'build/ios-simulator-signed-result-20260915.xcresult'),
    } : {
      derived: path.join(mobile, 'build/ios-archive-derived'),
      archive: path.join(mobile, 'build/ios-archive-login/Wishlistai.xcarchive'),
      result: path.join(mobile, 'build/ios-archive-login-result-20260915.xcresult'),
    };
  }
  const base = path.join(mobile, 'build', `ios-${kind}-${label}`);
  return kind === 'simulator' ? { derived: base, result: base + '-result.xcresult' } : {
    derived: base + '-derived', archive: path.join(base, 'Wishlistai.xcarchive'), result: base + '-result.xcresult',
  };
}

module.exports = { localIosPaths };
