import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
const auth = { token: 'install-fixture', user: { id: 19, phoneNumber: 'synthetic-only' }, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
vi.mock('../context/AuthContext', async original => {
  const module = await original<typeof import('../context/AuthContext')>();
  return { ...module, AuthProvider: ({ children }: { children: import('react').ReactNode }) => <module.AuthContext.Provider value={auth}>{children}</module.AuthContext.Provider> };
});
vi.mock('./Home', () => ({ default: () => <Link to="/settings">Open settings</Link> }));
vi.mock('../utils/analytics', () => ({ Analytics: { logPageView: vi.fn(), logEvent: vi.fn() } }));
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: { get: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() } }));
const profile = { id: 19, profileVersion: 0, name: '合成帳號', phoneNumber: 'synthetic-only', isPremium: false, isAvatarVisible: false, isRealNameVisible: false, isBirthdayVisible: false, isAddressVisible: false, isPhoneVisible: false, isEmailVisible: false, marketingEmailsEnabled: false };
let fetcher: ReturnType<typeof vi.fn>;
const originalTouch = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
const originalStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');
beforeEach(() => {
  localStorage.setItem('user-locale', 'en-US'); window.history.replaceState({}, '', '/settings');
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 0 });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Desktop browser');
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(0);
  fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => profile })); vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear();
  for (const [name, original] of [['maxTouchPoints', originalTouch], ['standalone', originalStandalone]] as const) {
    if (original) Object.defineProperty(navigator, name, original); else Reflect.deleteProperty(navigator, name);
  }
});
async function settings() {
  await screen.findByRole('heading', { name: 'Personal profile' });
  const advanced = screen.getByText('More features').closest('details')!;
  advanced.open = true; fireEvent(advanced, new Event('toggle'));
}
function installEvent(prompt: () => Promise<unknown>, userChoice: Promise<unknown>) {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.defineProperties(event, { prompt: { value: prompt }, userChoice: { value: userChoice } });
  act(() => window.dispatchEvent(event)); return event;
}
const posts = () => fetcher.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === 'POST');
describe('web app installation across routes and browser outcomes', () => {
  it('retains a browser install opportunity received on Home until Settings is opened', async () => {
    window.history.replaceState({}, '', '/'); render(<App />); await screen.findByRole('link', { name: 'Open settings' });
    const prompt = vi.fn(async () => {}); installEvent(prompt, Promise.resolve({ outcome: 'dismissed' }));
    fireEvent.click(screen.getByRole('link', { name: 'Open settings' })); await settings();
    expect(screen.getByRole('button', { name: 'Install Now' })).toBeEnabled(); expect(prompt).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0);
  });
  it('consumes a cancelled prompt once and preserves a usable manual alternative', async () => {
    render(<App />); await settings(); const prompt = vi.fn(async () => {});
    installEvent(prompt, Promise.resolve({ outcome: 'dismissed' })); fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    await screen.findByText('Installation was cancelled. You can use the browser menu later or continue on the website.');
    expect(screen.queryByRole('button', { name: 'Install Now' })).not.toBeInTheDocument(); expect(screen.getByText(/Look for the install icon/)).toBeInTheDocument();
    expect(prompt).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
  });
  it('does not invoke the same browser prompt twice while its result is pending and blocks a language reload', async () => {
    render(<App />); await settings(); let resolve!: (value: unknown) => void;
    const prompt = vi.fn(async () => {}); installEvent(prompt, new Promise(value => { resolve = value; }));
    const button = screen.getByRole('button', { name: 'Install Now' }); fireEvent.click(button); fireEvent.click(button);
    expect(prompt).toHaveBeenCalledTimes(1); expect(screen.getByRole('button', { name: '繁體中文' })).toBeDisabled();
    await act(async () => resolve({ outcome: 'dismissed' }));
    await screen.findByText(/Installation was cancelled/); expect(screen.getByRole('button', { name: '繁體中文' })).toBeEnabled(); expect(posts()).toHaveLength(0);
  });
  it('recognizes installation reported by the browser even when its own button was never used', async () => {
    render(<App />); await settings(); const prompt = vi.fn(async () => {}); installEvent(prompt, Promise.resolve({ outcome: 'accepted' }));
    act(() => window.dispatchEvent(new Event('appinstalled')));
    await screen.findByText('The browser reported that the Web app was installed. Open it from your device’s app entry.');
    expect(screen.queryByRole('button', { name: 'Install Now' })).not.toBeInTheDocument(); expect(screen.queryByText(/Look for the install icon/)).not.toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled(); expect(posts()).toHaveLength(0);
  });
  it('offers iPad Safari steps for a desktop-class Mac user agent with touch instead of PC installation steps', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15');
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    render(<App />); await settings();
    expect(screen.getByText('Tap the Share button')).toBeInTheDocument(); expect(screen.queryByText(/Look for the install icon/)).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
  it('does not ask an already standalone Safari Web app to install again', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone'); Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    render(<App />); await settings();
    expect(screen.queryByText('Tap the Share button')).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
  });
  it.each(['throw', 'reject', 'invalid'] as const)('recovers from a %s browser prompt without a false installation or automatic retry', async failure => {
    render(<App />); await settings();
    const prompt = vi.fn(() => failure === 'throw' ? (() => { throw new Error('browser denied'); })() : failure === 'reject' ? Promise.reject(new Error('browser denied')) : Promise.resolve());
    installEvent(prompt, Promise.resolve(failure === 'invalid' ? { outcome: 'unexpected' } : { outcome: 'accepted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    await screen.findByText('Installation could not be opened or verified. Use the manual steps below or continue on the website.');
    expect(screen.getByText(/Look for the install icon/)).toBeInTheDocument(); expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '繁體中文' })).toBeEnabled(); expect(posts()).toHaveLength(0);
  });
  it('does not call an accepted prompt completed until the browser actually reports installation', async () => {
    render(<App />); await settings(); installEvent(vi.fn(async () => {}), Promise.resolve({ outcome: 'accepted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    await screen.findByText(/The browser accepted installation/);
    expect(screen.queryByText(/The browser reported that the Web app was installed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Look for the install icon/)).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event('appinstalled'))); await screen.findByText(/The browser reported that the Web app was installed/);
    expect(posts()).toHaveLength(0);
  });
  it('bounds an unresolved installation, ignores its late result, and can use a newly issued browser opportunity', async () => {
    render(<App />); await settings(); vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    const oldPrompt = vi.fn(async () => {}); installEvent(oldPrompt, new Promise(value => { resolve = value; }));
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(screen.getByText(/Installation is unconfirmed/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '繁體中文' })).toBeEnabled();
    await act(async () => resolve({ outcome: 'accepted' })); expect(screen.queryByText(/The browser accepted installation/)).not.toBeInTheDocument();
    const freshPrompt = vi.fn(async () => {}); installEvent(freshPrompt, Promise.resolve({ outcome: 'dismissed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' })); await act(async () => {});
    expect(screen.getByText(/Installation was cancelled/)).toBeInTheDocument(); expect(oldPrompt).toHaveBeenCalledTimes(1); expect(freshPrompt).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
  });
  it('keeps a newer browser opportunity received while an earlier result is pending', async () => {
    render(<App />); await settings(); let resolve!: (value: unknown) => void;
    installEvent(vi.fn(async () => {}), new Promise(value => { resolve = value; })); fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    const freshPrompt = vi.fn(async () => {}); installEvent(freshPrompt, Promise.resolve({ outcome: 'dismissed' }));
    expect(screen.getByRole('button', { name: 'Waiting for installation…' })).toBeDisabled();
    await act(async () => resolve({ outcome: 'dismissed' })); expect(screen.getByRole('button', { name: 'Install Now' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' })); await screen.findByText(/Installation was cancelled/);
    expect(freshPrompt).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
  });
  it('does not replace a browser installation report with a late dismissed result', async () => {
    render(<App />); await settings(); let resolve!: (value: unknown) => void;
    installEvent(vi.fn(async () => {}), new Promise(value => { resolve = value; })); fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    act(() => window.dispatchEvent(new Event('appinstalled'))); await screen.findByText(/The browser reported that the Web app was installed/);
    await act(async () => resolve({ outcome: 'dismissed' }));
    expect(screen.queryByText(/Installation was cancelled/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '繁體中文' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Install Now' })).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
  });
  it('responds to a live standalone display-mode change and releases a pending installation without reloading', async () => {
    let standalone = false; const listeners = new Set<() => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ media: query, get matches() { return standalone; }, addEventListener: (_type: string, listener: () => void) => listeners.add(listener), removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener) }) as unknown as MediaQueryList);
    render(<App />); await settings(); const prompt = vi.fn(async () => {}); installEvent(prompt, new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));
    act(() => { standalone = true; for (const listener of listeners) listener(); });
    await screen.findByText('You are already using the standalone Web app.');
    expect(screen.queryByRole('button', { name: 'Install Now' })).not.toBeInTheDocument(); expect(prompt).toHaveBeenCalledTimes(1); expect(posts()).toHaveLength(0);
    expect(screen.queryByText(/Finish the installation in the browser/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '繁體中文' })).toBeEnabled();
  });
});
