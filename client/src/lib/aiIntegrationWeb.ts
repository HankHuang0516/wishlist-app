import { getFullApiUrl } from '../config';
import { privatePendingStore, type PendingStore } from './webPendingStore';
export { parseDiagnosticsMarker as parseIntegrationMarker } from './emailDiagnosticsWeb';
import { parseDiagnosticsMarker } from './emailDiagnosticsWeb';

export class IntegrationError extends Error {}
export class IntegrationConflict extends IntegrationError {}
export function integrationApiBase(value = getFullApiUrl()) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/api' ||
    url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new IntegrationError();
  return url.href.replace(/\/$/, '');
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fields(value: unknown, expected: string): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).sort().join(',') !== expected) throw new IntegrationError();
}
const routes: Record<string, Record<string, [string, string, string?]>> = {
  wishlists: { list_all:['GET','/wishlists'], create:['POST','/wishlists','{"title":"string"}'], get_one:['GET','/wishlists/{id}'], update:['PUT','/wishlists/{id}'], delete:['DELETE','/wishlists/{id}'] },
  items: { create:['POST','/wishlists/{id}/items','{"name":"string","price":"string?","notes":"string?"}'], create_from_url:['POST','/wishlists/{id}/items/url','{"url":"string"}'], get:['GET','/items/{id}'], update:['PUT','/items/{id}'], delete:['DELETE','/items/{id}'] },
  user: { get_profile:['GET','/users/me'], update_profile:['PUT','/users/me'] },
  social: { search_users:['GET','/users/search?q={keyword}'], follow:['POST','/users/{id}/follow'], unfollow:['DELETE','/users/{id}/follow'], get_user_wishlists:['GET','/users/{id}/wishlists'], get_delivery_info:['GET','/users/{id}/delivery-info'] },
};
const descriptions: Record<string, Record<string,string>> = {
  wishlists: {list_all:'Get all wishlists',create:'Create new wishlist',get_one:'Get single wishlist',update:'Update wishlist',delete:'Delete wishlist'},
  items: {create:'Add item to wishlist',create_from_url:'Auto-fetch item from URL',get:'Get item details',update:'Update item',delete:'Delete item'},
  user: {get_profile:'Get my profile',update_profile:'Update my profile'},
  social: {search_users:'Search users',follow:'Follow user',unfollow:'Unfollow user',get_user_wishlists:'Get user public wishlists',get_delivery_info:'Get delivery info (mutual follow required)'},
};
export function parseIntegrationReply(value: unknown, expectedBase = integrationApiBase()): string {
  fields(value,'apiKey,prompt,userName');
  if (typeof value.apiKey !== 'string' || !/^[^\s\u0000-\u001f\u007f]{1,512}$/.test(value.apiKey) || typeof value.userName !== 'string' || !value.userName.trim() || value.userName.length > 500 || typeof value.prompt !== 'string' || value.prompt.length > 16000) throw new IntegrationError();
  let prompt: unknown; try { prompt = JSON.parse(value.prompt); } catch { throw new IntegrationError(); }
  fields(prompt,'authentication,available_apis,instructions,role');
  if (prompt.role !== 'You are a Wishlist.ai assistant helping users manage their wishlists.' || prompt.instructions !== 'Start helping me manage my wishlists now!') throw new IntegrationError();
  fields(prompt.authentication,'api_key,base_url,header');
  if (prompt.authentication.api_key !== value.apiKey || prompt.authentication.header !== `x-api-key: ${value.apiKey}` || prompt.authentication.base_url !== expectedBase) throw new IntegrationError();
  fields(prompt.available_apis,'items,social,user,wishlists');
  for (const [group, endpoints] of Object.entries(routes)) {
    const actual = prompt.available_apis[group]; fields(actual,Object.keys(endpoints).sort().join(','));
    for (const [name, [method,path,body]] of Object.entries(endpoints)) {
      const endpoint = actual[name]; fields(endpoint,body ? 'body,description,method,path' : 'description,method,path');
      if (endpoint.method !== method || endpoint.path !== path || endpoint.description !== descriptions[group][name]) throw new IntegrationError();
      if (body && JSON.stringify(endpoint.body) !== body) throw new IntegrationError();
    }
  }
  return value.prompt;
}
/** Local marker contains no credential. GET reports only the current key, never
 * proof of an earlier allocation. Check owner lifetime before every side effect. */
export async function requestInstructions(api: string, token: string, method: 'GET'|'POST', marker: { key: string; raw: string }, active: () => boolean, store: PendingStore = privatePendingStore) {
  parseDiagnosticsMarker(marker.raw);
  const base = integrationApiBase();
  if (!active()) throw new IntegrationError();
  if (await store.get(marker.key) !== marker.raw) throw new IntegrationConflict();
  if (!active()) throw new IntegrationError();
  const response = await fetch(`${api}/users/me/ai-prompt`, { method, headers: { Authorization: `Bearer ${token}` }, cache:'no-store', redirect:'error', signal:AbortSignal.timeout(30000) });
  const value: unknown = await response.json();
  if (!response.ok || !active()) throw new IntegrationError();
  if (method === 'GET' && record(value) && Object.keys(value).join(',') === 'available' && value.available === false) return null;
  const prompt = parseIntegrationReply(value,base);
  if (await store.get(marker.key) !== marker.raw) throw new IntegrationConflict();
  if (!active()) throw new IntegrationError();
  return prompt;
}
