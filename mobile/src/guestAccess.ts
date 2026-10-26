import { ApiError, type ApiRequestOptions } from './api';
type Api = <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
const uuid = '[0-9a-fA-F-]{36}';
const publicRead = new RegExp(`^(?:/discovery(?:/cp|/products/(?:listing|source|external)/${uuid})?|/listings/${uuid}|/users/[1-9][0-9]*/storefront|/product-interest)$`);

export function guestReadApi(api: Api): Api {
  return <T>(path: string, options?: ApiRequestOptions) => {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('#') ||
      (options?.method ?? 'GET').toUpperCase() !== 'GET' ||
      !publicRead.test(path.split('?')[0]) || new Headers(options?.headers).has('Authorization'))
      return Promise.reject(new ApiError(401, 'LOGIN_REQUIRED'));
    return api<T>(path, options);
  };
}
