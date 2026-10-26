import { sessionContact } from '../lib/sessionContact';
describe('optional phone session compatibility', () => {
  it('preserves an existing telephone number', () => expect(sessionContact({ id: 7, phoneNumber: '0912345678' })).toEqual({ phoneNumber: '0912345678', contactPhoneNumber: '0912345678', phoneNumberIsLegacyIdentifier: false }));
  it('gives old clients a bounded account identifier while explicitly keeping the real phone absent', () => {
    const user = { id: 2147483647, phoneNumber: null }; const dto = sessionContact(user);
    expect(dto).toEqual({ phoneNumber: 'account:2147483647', contactPhoneNumber: null, phoneNumberIsLegacyIdentifier: true });
    expect(user.phoneNumber).toBeNull(); expect(dto.phoneNumber.length).toBeLessThan(80);
  });
});
