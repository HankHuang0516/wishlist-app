import { describe, expect, it } from 'vitest';
import { wishShareMessage, wishShareUrl } from '../wishShare';

const site = 'https://wishlist-app-production.up.railway.app', path = '/shared-wishes/AbCdEfGhIjKlMnOpQrSt_-';
describe('wish sharing privacy boundary', () => {
  it('shares the chosen name and budget, then the address of the shared page, while withholding private fields', () => {
    const owned = { name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD', notes: 'PRIVATE_NOTE', imageUrl: 'https://private.example/secret', link: 'https://shop.example/private-link', id: 123456789 };
    const message = wishShareMessage(owned, site + path);
    expect(message).toBe(`我的願望是「橘色桌燈」\n我的預算：TWD 1,500\n如果你剛好看到，分享給我吧！\n— Wishlist.ai 願望市集\n${site}${path}`);
    for (const privateValue of ['PRIVATE_NOTE', 'private.example', 'shop.example', '123456789']) expect(message).not.toContain(privateValue);
  });
  it('omits the budget when the owner did not set one, and still ends with the address', () => {
    const message = wishShareMessage({ name: '相機', maxPrice: null, priceCurrency: null }, site + path);
    expect(message).not.toContain('預算');
    expect(message.split('\n').at(-1)).toBe(site + path);
  });
  it('builds the address on the public site from the path the server answered, and from nothing else', () => {
    expect(wishShareUrl({ path }, site + '/api')).toBe(site + path);
    for (const answer of [null, {}, { path: '/shared-wishes/short' }, { path: '/wishlists/5' }, { path: 'https://evil.example' + path }, { path: path + '?next=1' }, { url: site + path }])
      expect(() => wishShareUrl(answer, site)).toThrow();
    expect(() => wishShareUrl({ path }, 'http://evil.test')).toThrow();
  });
});
