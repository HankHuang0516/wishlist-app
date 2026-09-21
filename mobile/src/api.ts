export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(status === 401 ? '登入已失效，請重新登入。' : '目前無法完成，請稍後再試。');
  }
}

export function validateApiUrl(value: string, allowLocalHttp = false): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:'))) {
    throw new Error('API 必須使用 HTTPS，且不可包含憑證或查詢參數。');
  }
  return url.href.replace(/\/$/, '').replace(/\/api$/, '');
}

export function createApi(baseUrl: string, getToken: () => string | null, allowLocalHttp = false) {
  const base = validateApiUrl(baseUrl, allowLocalHttp);
  return async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // UUID routes require hyphens; decimal filters and URLSearchParams require
    // dots/plus in the query, not in a path where they can escape /api.
    if (!/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/.test(path) || path.startsWith('//') || /%(?![a-fA-F0-9]{2})/.test(path)) {
      throw new Error('無效的 API 路徑。');
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    const token = getToken();
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    try {
      const response = await fetch(`${base}/api${path}`, { ...options, headers, signal: abort.signal, redirect: 'error' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, typeof body?.errorCode === 'string' ? body.errorCode : undefined);
      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  };
}
