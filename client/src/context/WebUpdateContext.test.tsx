import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebUpdateProvider from './WebUpdateContext';
import WebUpdateNotice, { WebsiteUpdateControls } from '../components/WebUpdateNotice';
import { webUpdateNavigation } from '../lib/webUpdate';
const current = __APP_VERSION__, next = '2.0.9001', latest = '2.0.9002';
let advertised: string, installed: string, container: EventTarget, registration: { update: ReturnType<typeof vi.fn> }, reload: ReturnType<typeof vi.spyOn>;
function served(path: string, value: string) {
  return { status: 200, redirected: false, url: location.origin + path, headers: new Headers({ 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/html' }), text: async () => value };
}
function metadata(url: string) { return Promise.resolve(url.endsWith('.json') ? served('/web-version.json', JSON.stringify({ version: advertised })) : served('/index.html', `<meta name="wishlist-web-version" content="${installed}">`)); }
function start(worker = true) {
  if (!worker) Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
  return render(<WebUpdateProvider><WebUpdateNotice/><WebsiteUpdateControls/><input aria-label="Original unsaved draft" defaultValue="original 250.7500 USD"/></WebUpdateProvider>);
}
beforeEach(() => {
  advertised = installed = current;localStorage.setItem('user-locale', 'en-US');localStorage.setItem('synthetic-original-journal', 'immutable-original-marker');
  registration = { update: vi.fn().mockResolvedValue(undefined) };container = new EventTarget();
  Object.assign(container, { register: vi.fn().mockResolvedValue(registration) });Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  vi.stubGlobal('fetch', vi.fn(metadata));reload = vi.spyOn(webUpdateNavigation, 'reload').mockImplementation(() => {});
});
afterEach(() => { cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete (navigator as any).serviceWorker;localStorage.clear(); });
describe('explicit website update lifecycle', () => {
  it('does not prompt or reload on first installation of the already running version', async () => {
    start();await waitFor(() => expect(registration.update).toHaveBeenCalled());await act(async () => container.dispatchEvent(new Event('controllerchange')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for website updates' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Update website' })).toBeNull();expect(reload).not.toHaveBeenCalled();
  });
  it('shows a prepared release on controller change while retaining original unsent input and the original journal', async () => {
    start();await waitFor(() => expect(registration.update).toHaveBeenCalled());advertised = installed = next;
    await act(async () => container.dispatchEvent(new Event('controllerchange')));await screen.findByRole('button', { name: 'Update website' });
    expect(screen.getByRole('textbox', { name: 'Original unsaved draft' })).toHaveValue('original 250.7500 USD');expect(localStorage.getItem('synthetic-original-journal')).toBe('immutable-original-marker');expect(reload).not.toHaveBeenCalled();
    expect((container as any).register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });
  it('asks to save work, permits continuing, and only explicitly confirmed fresh proof reloads the page', async () => {
    advertised = installed = next;start();fireEvent.click(await screen.findByRole('button', { name: 'Update website' }));
    const dialog = screen.getByRole('dialog', { name: 'Update website' });expect(within(dialog).getByText(/unsaved input may be lost/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue my current work' }));expect(screen.queryByRole('dialog')).toBeNull();expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update website' }));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));expect(localStorage.getItem('synthetic-original-journal')).toBe('immutable-original-marker');
  });
  it('refuses reload when another server release supersedes the prepared worker and allows explicit recovery', async () => {
    advertised = installed = next;start();fireEvent.click(await screen.findByRole('button', { name: 'Update website' }));advertised = latest;
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' }));
    await within(screen.getByRole('dialog')).findByText('The update is being prepared. Check again shortly.');expect(reload).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' })).toBeDisabled();
    installed = latest;fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check for website updates' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' })).toBeEnabled());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' }));await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
  it('a cancellation during fresh verification fences a late ready reply from reloading', async () => {
    advertised = installed = next;start();fireEvent.click(await screen.findByRole('button', { name: 'Update website' }));
    let finish!: (response: ReturnType<typeof served>) => void;vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(metadata));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'I have saved my work, reload' }));await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue my current work' }));
    await act(async () => finish(served('/web-version.json', JSON.stringify({ version: next }))));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check for website updates' })).toBeEnabled());expect(reload).not.toHaveBeenCalled();
  });
  it('failed verification is not current or ready, retains drafts, and succeeds after manual retry without worker support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('synthetic offline')));start(false);fireEvent.click(screen.getByRole('button', { name: 'Check for website updates' }));
    await screen.findByText('Updates could not be verified. Check your connection and try again.');expect(screen.queryByRole('button', { name: 'Update website' })).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('original 250.7500 USD');expect(reload).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(metadata));fireEvent.click(screen.getByRole('button', { name: 'Check for website updates' }));await screen.findByText('You are using the available version.');
  });
  it('bounds a hung registration update and never reloads or clears original recovery data', async () => {
    vi.useFakeTimers();registration.update.mockImplementation(() => new Promise(() => {}));start();await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(10_001));
    fireEvent.click(screen.getByRole('button', { name: 'Check for website updates' }));await act(async () => vi.advanceTimersByTimeAsync(10_001));
    expect(screen.getByText('Updates could not be verified. Check your connection and try again.')).toBeInTheDocument();expect(reload).not.toHaveBeenCalled();expect(localStorage.getItem('synthetic-original-journal')).toBe('immutable-original-marker');
  });
  it('a late read after departure cannot display a ready notice or reload the page', async () => {
    let finish!: (response: ReturnType<typeof served>) => void;vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(metadata));
    const view = start(false);fireEvent.click(screen.getByRole('button', { name: 'Check for website updates' }));await waitFor(() => expect(finish).toBeDefined());view.unmount();
    await act(async () => finish(served('/web-version.json', JSON.stringify({ version: next }))));expect(reload).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps Chinese copy and usable English fallback when locale storage refuses reads', async () => {
    localStorage.setItem('user-locale', 'zh-TW');start(false);expect(screen.getByRole('button', { name: '檢查網站更新' })).toBeInTheDocument();
    cleanup();vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw Error('synthetic storage'); });start(false);expect(screen.getByRole('button', { name: 'Check for website updates' })).toBeInTheDocument();
  });
});
