import { describe, expect, it } from 'vitest';
import { AUTH_RETURN_PATHS, authReturnTo } from './authReturnTo';
const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('validated marketplace login intentions', () => {
  it.each(AUTH_RETURN_PATHS)('retains the existing safe route %s', path => expect(authReturnTo(path)).toBe(path));
  it.each([`/chat?room=${id}`, `/listings/${id}`, '/wishlists/42', '/wishlists/2147483647', '/wishes?list=42', '/wishes?list=2147483647'])('retains a single exact validated resource %s', path => expect(authReturnTo(path)).toBe(path));
  it('normalizes UUID case without changing the route', () => expect(authReturnTo(`/chat?room=${id.toUpperCase()}`)).toBe(`/chat?room=${id}`));
  it.each([null, '//evil.example', 'https://evil.example', '/chat?room=invalid', `/chat?room=${id}&next=//evil.example`,
    `/chat?room=${id}&room=${id}`, `/chat?room=${id}#other`, `/chat?room=${id}%26other`, '/chat?other=1',
    `/listings/${id}/../settings`, `/listings/${id}?next=//evil.example`, `/listings/${id}#other`, '/listings/invalid', '/wishlists/0', '/wishlists/01', '/wishlists/2147483648', '/wishlists/42?next=//evil.example', '/wishlists/42#other', '/wishes?list=0', '/wishes?list=01', '/wishes?list=2147483648', '/wishes?list=42&list=42', '/wishes?list=42&next=//evil.example', '/wishes?list=42#other'])('rejects an unsafe or ambiguous intention %s', path => expect(authReturnTo(path)).toBe('/dashboard'));
});
