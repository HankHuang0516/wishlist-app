import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsDisabled, analyticsPath } from './analyticsPrivacy';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('analytics categories exclude private URL contents', () => {
  it('keeps feature categories and replaces resource identifiers', () => {
    expect(analyticsPath('/settings/notifications')).toBe('/settings/notifications');
    expect(analyticsPath('/reset-password')).toBe('/reset-password');
    expect(analyticsPath('/listings/5cfbab91-7a77-4db3-9daf-ff2aabdf1251')).toBe('/listings/item');
    expect(analyticsPath('/wishlists/987654')).toBe('/wishlists/list');
    expect(analyticsPath('/users/987654/profile')).toBe('/users/user/profile');
    expect(analyticsPath('/users/987654/wishlists')).toBe('/users/user/wishlists');
  });
  it('fails closed on arbitrary paths, queries, fragments and encoded content', () => {
    for (const value of ['/reset-password?token=synthetic-private', '/explore?q=private-wish', '/chat#private-room', '/user@example.invalid', '/wishlists/secret', '/users/%39/profile', '//external.example/path', '/unknown/synthetic-private']) {
      expect(analyticsPath(value)).toBe('/not-found');
    }
  });
  it('honors browser privacy signals', () => {
    vi.stubGlobal('navigator', {doNotTrack:'1'});
    expect(analyticsDisabled()).toBe(true);
  });
});
