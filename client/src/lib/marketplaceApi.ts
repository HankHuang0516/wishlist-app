import { API_URL } from '../config';
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number;
  constructor(message: string, status: number, code = '', retryAfterMs = 0) { super(message); this.status = status; this.code = code; this.retryAfterMs = retryAfterMs; }
}

// The production limit is shared by all routes on this origin. Keep only a
// deadline, never a token, response body or pending operation. Waiting does not
// replay requests; mutations still require their original explicit action.
let limitedUntil = 0;
function retryDelay(header: string | null, now: number): number {
  const seconds = header !== null && /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header.trim()) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - now : NaN;
  return Number.isFinite(delay) && delay > 0 ? Math.min(Math.ceil(delay), 86_400_000) : 60_000;
}

export async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/.test(path) || path.startsWith('//') || /%(?![a-fA-F0-9]{2})/.test(path))
    throw new Error('無效的 API 路徑。');
  const remaining = limitedUntil - Date.now();
  if (remaining > 0) throw new ApiFailure('請求暫時受限，請稍後再試。', 429, 'RATE_LIMIT_COOLDOWN', remaining);
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store', headers: {
    Authorization: `Bearer ${token}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers,
  }, signal: init.signal ?? AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; errorCode?: string };
    // Product quotas and route-specific busy responses also use 429. They must
    // retain their own recovery path and cannot pause unrelated account reads.
    const transportLimited = response.status === 429 && (!body.errorCode || body.errorCode === 'RATE_LIMIT_EXCEEDED');
    const now = Date.now(), delay = transportLimited ? retryDelay(response.headers.get('Retry-After'), now) : 0;
    if (delay) limitedUntil = Math.max(limitedUntil, now + delay);
    throw new ApiFailure(body.error || `操作失敗（${response.status}）`, response.status, body.errorCode, delay);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
