// Private product photos are fetched with Authorization, then shown through
// browser-local object URLs. An img-src wildcard does not permit blob: URLs.
export const imageSources = ["'self'", 'data:', 'blob:', 'https:', 'http:', '*',
  'https://*.google-analytics.com', 'https://*.googletagmanager.com'];
