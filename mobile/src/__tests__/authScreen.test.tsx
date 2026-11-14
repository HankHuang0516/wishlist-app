// @vitest-environment jsdom
// What each account step offers: its own action, the links a person needs next from it, and nothing that points at itself.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from '../AuthScreen';
const fixture = vi.hoisted(() => ({ save: vi.fn(async () => {}), fetch: vi.fn() }));
vi.mock('expo-secure-store', () => ({ setItemAsync: fixture.save, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }, Linking: { openURL: vi.fn() }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  View: ({ children }: any) => <div>{children}</div>,
  KeyboardAvoidingView: ({ children }: any) => <div>{children}</div>,
  ScrollView: React.forwardRef(({ children }: any, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo: () => {} })); return <div>{children}</div>; }),
  Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole === 'alert' ? 'alert' : undefined}>{children}</span>,
  TextInput: ({ accessibilityLabel, value, onChangeText, editable, secureTextEntry }: any) => <input aria-label={accessibilityLabel} type={secureTextEntry ? 'password' : 'text'} value={value} disabled={editable === false} onChange={event => onChangeText(event.target.value)} />,
  Pressable: ({ children, accessibilityLabel, accessibilityRole, accessibilityState, onPress, disabled }: any) => <button role={accessibilityRole} aria-label={accessibilityLabel} aria-checked={accessibilityState?.checked} onClick={onPress} disabled={disabled}>{children}</button>,
}));
beforeEach(() => { vi.stubGlobal('__DEV__', false); vi.stubGlobal('fetch', fixture.fetch); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const policies = ['隱私政策', '使用條款'];
const names = () => screen.getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent);
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const rejects = (status: number, errorCode: string) => fixture.fetch.mockResolvedValue(new Response(JSON.stringify({ errorCode }), { status, headers: { 'Content-Type': 'application/json' } }));
function props(extra: Partial<React.ComponentProps<typeof AuthScreen>> = {}) {
  return { apiUrl: 'https://example.com', initialLink: null, onAuthenticated: vi.fn(async () => {}), onBrowse: vi.fn(), ...extra };
}
async function open(extra: Partial<React.ComponentProps<typeof AuthScreen>> = {}) {
  const callbacks = props(extra); render(<AuthScreen {...callbacks} />);
  fireEvent.click(screen.getByRole('checkbox')); press('同意並繼續');
  await screen.findByLabelText('手機號碼或 Email');
  return callbacks;
}

describe('signing in', () => {
  it('shows the two fields, forgot password, the sign-in button, the way to register and one policy line', async () => {
    await open();
    expect(names()).toEqual(['返回訪客瀏覽', '顯示密碼：密碼', '忘記密碼', '登入', '建立帳號', ...policies]);
    expect(screen.getByText('使用手機號碼或 Email 登入')).toBeTruthy(); expect(screen.getByText('還沒有帳號？')).toBeTruthy();
    for (const absent of ['返回登入', '重新寄送驗證信', '我已有驗證連結', '我已有重設連結', '我已有 Email 驗證連結', '我已有密碼重設連結'])
      expect(screen.queryByRole('button', { name: absent })).toBeNull();
  });
  it('keeps the password hidden until its reveal button is pressed, and hides it again', async () => {
    await open(); type('密碼', 'Synthetic123!');
    expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('password');
    press('顯示密碼：密碼'); expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('text');
    press('隱藏密碼：密碼'); expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('password');
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it('moves an unverified sign-in to the resend step with its email filled in, and offers the pasted link from there', async () => {
    const callbacks = await open(); rejects(403, 'EMAIL_NOT_VERIFIED');
    type('手機號碼或 Email', 'qa@example.invalid'); type('密碼', 'Synthetic123!'); press('登入');
    await screen.findByText('請先驗證 Email；可以重新寄送驗證信。');
    expect((screen.getByLabelText('註冊時的 Email') as HTMLInputElement).value).toBe('qa@example.invalid');
    expect(names()).toEqual(['返回訪客瀏覽', '寄送驗證信', '我已有驗證連結', '返回登入', ...policies]);
    expect(callbacks.onAuthenticated).not.toHaveBeenCalled(); expect(fixture.fetch).toHaveBeenCalledOnce();
    press('我已有驗證連結');
    expect(screen.getByLabelText('Email 驗證連結或驗證碼')).toBeTruthy();
    expect(names()).toEqual(['返回訪客瀏覽', '驗證 Email', '重新寄送驗證信', '返回登入', ...policies]);
    expect(fixture.fetch).toHaveBeenCalledOnce();
  });
  it('asks a phone sign-in for the email on the resend step instead of guessing one', async () => {
    await open(); rejects(403, 'EMAIL_NOT_VERIFIED');
    type('手機號碼或 Email', '0900000000'); type('密碼', 'Synthetic123!'); press('登入');
    await screen.findByText('請先驗證 Email；可以重新寄送驗證信。');
    expect((screen.getByLabelText('註冊時的 Email') as HTMLInputElement).value).toBe('');
  });
  it('offers no verification help after an ordinary rejection', async () => {
    await open(); rejects(401, 'INVALID_CREDENTIALS');
    type('手機號碼或 Email', 'qa@example.invalid'); type('密碼', 'Synthetic123!'); press('登入');
    await screen.findByText('帳號或密碼不正確。');
    expect(names()).toEqual(['返回訪客瀏覽', '顯示密碼：密碼', '忘記密碼', '登入', '建立帳號', ...policies]);
  });
});

describe('the other account steps', () => {
  it('lets registration go back to signing in, and offers forgot password only once the account is known to exist', async () => {
    await open(); press('建立帳號');
    expect(names()).toEqual(['返回訪客瀏覽', '顯示密碼：新密碼', '顯示密碼：再次輸入新密碼', '建立帳號', '登入', ...policies]);
    expect(screen.getByText('已有帳號？')).toBeTruthy();
    for (const [label, value] of [['顯示名稱', 'QA'], ['Email', 'qa@example.invalid'], ['新密碼', 'Synthetic123!'], ['再次輸入新密碼', 'Synthetic123!']]) type(label, value);
    rejects(409, 'USER_EXISTS'); press('建立帳號');
    await screen.findByText('此手機或 Email 已註冊，請登入或使用忘記密碼。');
    expect(names()).toContain('忘記密碼'); press('忘記密碼');
    expect((screen.getByLabelText('註冊時的 Email') as HTMLInputElement).value).toBe('qa@example.invalid');
    expect(fixture.fetch).toHaveBeenCalledOnce();
  });
  it('keeps the pasted reset link beside forgot password, and sends a spent link back to request a new one', async () => {
    await open(); press('忘記密碼');
    expect(screen.getByText('輸入註冊時的 Email，我們會寄送重設連結。')).toBeTruthy();
    expect(names()).toEqual(['返回訪客瀏覽', '寄送重設連結', '我已有重設連結', '返回登入', ...policies]);
    press('我已有重設連結');
    expect(names()).toEqual(['返回訪客瀏覽', '顯示密碼：新密碼', '顯示密碼：再次輸入新密碼', '重設密碼', '重新申請密碼重設信', '返回登入', ...policies]);
    press('重新申請密碼重設信'); expect(screen.getByLabelText('註冊時的 Email')).toBeTruthy();
    press('返回登入'); expect(screen.getByLabelText('手機號碼或 Email')).toBeTruthy();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it('sends a new account to the resend step, where the verification link can be pasted', async () => {
    await open(); press('建立帳號');
    for (const [label, value] of [['顯示名稱', 'QA'], ['Email', 'qa@example.invalid'], ['新密碼', 'Synthetic123!'], ['再次輸入新密碼', 'Synthetic123!']]) type(label, value);
    fixture.fetch.mockResolvedValue(new Response(JSON.stringify({ user: { id: 42, phoneNumber: 'account:42', contactPhoneNumber: null }, emailVerification: { required: true, sent: false, sentTo: 'qa@example.invalid' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    press('建立帳號');
    await screen.findByText('帳號已建立，但驗證信未成功寄送。請在這裡重新申請；不要重複註冊。');
    expect((screen.getByLabelText('註冊時的 Email') as HTMLInputElement).value).toBe('qa@example.invalid');
    expect(names()).toEqual(['返回訪客瀏覽', '寄送驗證信', '我已有驗證連結', '返回登入', ...policies]);
  });
  it('shows a signed-in person opening a recovery link only that step and the way back to their account', async () => {
    const onClose = vi.fn(); render(<AuthScreen {...props({ onBrowse: undefined, onClose, initialLink: { mode: 'reset', token: 'a'.repeat(64) } })} />);
    await screen.findByText('連結已載入。請確認後提交；不會自動操作或切換登入帳號。');
    expect(names()).toEqual(['顯示密碼：新密碼', '顯示密碼：再次輸入新密碼', '重設密碼', '關閉，返回目前帳號', ...policies]);
    press('關閉，返回目前帳號'); await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
});
