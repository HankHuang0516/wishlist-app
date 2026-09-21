import { validateApiUrl } from './api';

export const PRODUCT_NOTICE_KEY = 'wishlist.product-notice.v1';
const revision = 'weesh-to-wishlist-2026-09';

export function encodeProductNotice(apiUrl: string, local = false): string {
  return JSON.stringify({ version: 1, revision, apiBase: validateApiUrl(apiUrl, local) });
}

export function hasProductNoticeAck(saved: string | null, apiUrl: string, local = false): boolean {
  if (!saved || saved.length > 2048) return false;
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const ack = value as Record<string, unknown>;
    return Object.keys(ack).length === 3 && ack.version === 1 && ack.revision === revision &&
      ack.apiBase === validateApiUrl(apiUrl, local);
  } catch { return false; }
}

export async function rememberProductNotice(apiUrl: string, save: (value: string) => Promise<void>, local = false): Promise<boolean> {
  try { await save(encodeProductNotice(apiUrl, local)); return true; }
  catch { return false; }
}
