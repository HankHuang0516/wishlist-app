import { API_URL } from '../config';
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; }
}

export async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/.test(path) || path.startsWith('//') || /%(?![a-fA-F0-9]{2})/.test(path))
    throw new Error('無效的 API 路徑。');
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store', headers: {
    Authorization: `Bearer ${token}`, ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers,
  }, signal: init.signal ?? AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; errorCode?: string };
    throw new ApiFailure(body.error || `操作失敗（${response.status}）`, response.status, body.errorCode);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
