import { describe, expect, it } from 'vitest';
import { wishShareMessage } from '../wishShare';

describe('wish sharing privacy boundary', () => {
  it('shares the chosen name and budget while withholding private fields', () => {
    const owned = { name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD', notes: 'PRIVATE_NOTE', imageUrl: 'https://private.example/secret', id: 123456789 };
    const message = wishShareMessage(owned);
    expect(message).toContain('橘色桌燈');
    expect(message).toContain('TWD 1,500');
    for (const privateValue of ['PRIVATE_NOTE', 'private.example', '123456789']) expect(message).not.toContain(privateValue);
  });
  it('omits the budget when the owner did not set one', () => {
    expect(wishShareMessage({ name: '相機', maxPrice: null, priceCurrency: null })).not.toContain('預算');
  });
});
