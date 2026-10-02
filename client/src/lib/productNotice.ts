export const PRODUCT_NOTICE_KEY = 'wishlist.web-product-notice.v1';
const revision = 'weesh-to-wishlist-2026-09';

function service(apiUrl: string, local: boolean) {
  const url = new URL(apiUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname) ||
    url.protocol !== 'https:' && !(local && loopback && url.protocol === 'http:')) throw new Error('Invalid notice service');
  return url.origin;
}
export function productNoticeBody(apiUrl: string, local = false) {
  return JSON.stringify({ version: 1, revision, apiBase: service(apiUrl, local) });
}
export function hasProductNoticeAck(saved: string | null, apiUrl: string, local = false) {
  if (!saved || saved.length > 2048) return false;
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const ack = value as Record<string, unknown>;
    return Object.keys(ack).length === 3 && ack.version === 1 && ack.revision === revision && ack.apiBase === service(apiUrl, local);
  } catch { return false; }
}
