export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string, public readonly retryAfterSeconds?: number) {
    super(status === 401 ? '登入已失效，請重新登入。' : status === 429 ?
      `服務暫時限制請求，${retryAfterSeconds ? `請等待 ${retryAfterSeconds} 秒後再試` : '請稍後再試'}；不必登出或重設密碼。` : '目前無法完成，請稍後再試。');
  }
}

export type ApiRequestOptions = RequestInit & { timeoutMs?: number };

const visualQaApi = 'http://127.0.0.1:18889';
const visualQaPackage = /^com\.hank_huang0516\.snack425e646aa6a74ad8a964aadeb4741fc1\.visualqa\d{12}$/;
let visualQaApplicationId: string | null = null;
export function registerVisualQaRuntimeApplicationId(value: string | null): void {
  if (process.env.EXPO_PUBLIC_VISUAL_QA === '1') visualQaApplicationId = value;
}
export function isIsolatedVisualQaUrl(value: string, flag: string | undefined, applicationId: string | null): boolean {
  return flag === '1' && value === visualQaApi && typeof applicationId === 'string' &&
    visualQaPackage.test(applicationId);
}
function runtimeIsolatedVisualQaUrl(value: string): boolean {
  if (process.env.EXPO_PUBLIC_VISUAL_QA !== '1' || value !== visualQaApi) return false;
  return isIsolatedVisualQaUrl(value, process.env.EXPO_PUBLIC_VISUAL_QA, visualQaApplicationId);
}

export function validateApiUrl(value: string, allowLocalHttp = false): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:') &&
        !runtimeIsolatedVisualQaUrl(value))) {
    throw new Error('API 必須使用 HTTPS，且不可包含憑證或查詢參數。');
  }
  return url.href.replace(/\/$/, '').replace(/\/api$/, '');
}

export function createApi(baseUrl: string, getToken: () => string | null, allowLocalHttp = false) {
  const base = validateApiUrl(baseUrl, allowLocalHttp);
  return async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    // UUID routes require hyphens; decimal filters and URLSearchParams require
    // dots/plus in the query, not in a path where they can escape /api.
    if (!/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%+.,-]*)?$/.test(path) || path.startsWith('//') || /%(?![a-fA-F0-9]{2})/.test(path)) {
      throw new Error('無效的 API 路徑。');
    }
    const { timeoutMs = 15000, ...fetchOptions } = options;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('無效的 API 等待時間。');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    const token = getToken();
    const headers = new Headers(fetchOptions.headers);
    headers.set('Accept', 'application/json');
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    try {
      const response = await fetch(`${base}/api${path}`, { ...fetchOptions, headers, signal: abort.signal, redirect: 'error' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const retry = response.headers?.get('Retry-After');
        const seconds = retry && /^\d{1,5}$/.test(retry) ? Number(retry) : undefined;
        throw new ApiError(response.status, typeof body?.errorCode === 'string' ? body.errorCode : undefined,
          response.status === 429 && seconds && seconds <= 3600 ? seconds : undefined);
      }
      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  };
}
