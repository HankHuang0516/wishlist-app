import { getFullApiUrl } from '../config';

/** Trusted API base, never a server-supplied photo origin. */
export function validateApiUrl(value: string, local = false) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
    url.protocol !== 'https:' && !(local && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new Error('商品服務網址不正確。');
  return url.href.replace(/\/$/, '').replace(/\/api$/, '');
}
export const marketplaceOrigin = () => new URL(getFullApiUrl()).origin;
