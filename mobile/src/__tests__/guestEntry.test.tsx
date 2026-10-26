// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestEntryScreen } from '../GuestEntryScreen';
const fixture = vi.hoisted(() => ({ save: vi.fn(async () => {}), fetch: vi.fn() }));
vi.mock('expo-secure-store', () => ({ setItemAsync: fixture.save, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('../GuestExploreScreen', () => ({ GuestExploreScreen: ({ active, onSignIn }: any) => {
  const [opened, setOpened] = useState(false);
  return active ? <div><span>{opened ? 'Public detail' : 'Public listings'}</span><button onClick={() => setOpened(true)}>Read public product</button><button onClick={onSignIn}>登入或建立帳號</button></div> : null;
} }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }, Linking: { openURL: vi.fn() }, StyleSheet: { create: (value: unknown) => value },
  View: ({ children, style }: any) => <div hidden={style?.display === 'none'}>{children}</div>,
  KeyboardAvoidingView: ({ children }: any) => <div>{children}</div>,
  ScrollView: React.forwardRef(({ children }: any, ref) => { React.useImperativeHandle(ref, () => ({ scrollTo: () => {} })); return <div>{children}</div>; }),
  Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole === 'alert' ? 'alert' : undefined}>{children}</span>,
  TextInput: ({ accessibilityLabel, value, onChangeText, editable }: any) => <input aria-label={accessibilityLabel} value={value} disabled={editable === false} onChange={event => onChangeText(event.target.value)} />,
  Pressable: ({ children, accessibilityLabel, accessibilityRole, accessibilityState, onPress, disabled }: any) => <button role={accessibilityRole} aria-label={accessibilityLabel} aria-checked={accessibilityState?.checked} onClick={onPress} disabled={disabled}>{children}</button>,
}));
beforeEach(() => { vi.stubGlobal('__DEV__', false); vi.stubGlobal('fetch', fixture.fetch); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = () => ({ apiUrl: 'https://example.com', initialLink: null, externalBusy: false, onAuthenticated: vi.fn(async () => {}), onTermsAccepted: vi.fn(), onCloseRecovery: vi.fn() });
async function consent() {
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '同意並繼續' }));
  await screen.findByLabelText('手機號碼或 Email');
}
it('starts as a visitor without a terms barrier, opens terms before credentials, and returns to the same public product without consent', () => {
  render(<GuestEntryScreen {...props()} />);
  expect(screen.getByText('Public listings')).toBeTruthy(); expect(screen.queryByText('使用條款與社群安全')).toBeNull();
  fireEvent.click(screen.getByText('Read public product')); fireEvent.click(screen.getByText('登入或建立帳號'));
  expect(screen.getByText('使用條款與社群安全')).toBeTruthy(); expect(screen.queryByLabelText('密碼')).toBeNull();
  expect(screen.getByRole('button', { name: '同意並繼續' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '先逛逛，不登入' })); expect(screen.getByText('Public detail')).toBeTruthy();
  expect(fixture.save).not.toHaveBeenCalled(); expect(fixture.fetch).not.toHaveBeenCalled();
});
it('actually submits email-only registration from the visible form and accepts a NULL contact response without admitting its unverified JWT', async () => {
  const callbacks = props(); render(<GuestEntryScreen {...callbacks} />);
  fireEvent.click(screen.getByText('登入或建立帳號')); await consent();
  fireEvent.click(screen.getByRole('button', { name: '建立帳號' }));
  expect(screen.getByLabelText('手機號碼（選填）')).toBeTruthy();
  for (const [label, value] of [['顯示名稱', 'QA'], ['Email', 'qa@example.invalid'], ['新密碼', 'Synthetic123!'], ['再次輸入新密碼', 'Synthetic123!']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fixture.fetch.mockResolvedValue(new Response(JSON.stringify({ user: { id: 42, phoneNumber: 'account:42', contactPhoneNumber: null }, emailVerification: { required: true, sent: true, sentTo: 'qa@example.invalid' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
  fireEvent.click(screen.getByRole('button', { name: '建立帳號' }));
  await screen.findByText('帳號已建立，請至 Email 收取驗證連結。驗證後再登入，才能刊登商品。');
  expect(JSON.parse(fixture.fetch.mock.calls[0][1].body)).toEqual({ name: 'QA', email: 'qa@example.invalid', password: 'Synthetic123!' });
  expect(callbacks.onAuthenticated).not.toHaveBeenCalled(); expect(fixture.save).toHaveBeenCalledOnce();
});
it('retains recovery navigation and never auto-submits a verification deep link', async () => {
  render(<GuestEntryScreen {...props()} initialLink={{ mode: 'verify', token: 'a'.repeat(64) }} />);
  await screen.findByLabelText('Email 驗證連結或驗證碼');
  expect(fixture.fetch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '返回訪客瀏覽' }));
  await waitFor(() => expect(screen.getByText('Public listings')).toBeTruthy());
});
