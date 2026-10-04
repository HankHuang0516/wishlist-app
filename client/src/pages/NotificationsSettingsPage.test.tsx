import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { parseProfileJournal, profileJournal } from '../lib/profileWeb';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from '../lib/webPendingStore';
import { API_URL } from '../config';
import NotificationsSettingsPage from './NotificationsSettingsPage';
const pending = vi.hoisted(() => new Map<string, string>());
vi.mock('../lib/webPendingStore', async original => ({ ...await original<typeof import('../lib/webPendingStore')>(), privatePendingStore: {
    get: vi.fn(async (key: string) => pending.get(key) ?? null),
    save: vi.fn(async (key: string, raw: string) => { if (pending.has(key) && pending.get(key) !== raw) throw new PendingStoreError(); pending.set(key, raw); }),
    clear: vi.fn(async (key: string, raw: string) => { if (pending.get(key) !== raw) return false; pending.delete(key); return true; }),
} }));
const auth = { user: { id: 19, phoneNumber: 'fixture' }, token: 'notification-fixture', login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: true };
const profile = { id: 19, profileVersion: 0, name: null, phoneNumber: 'fixture', isPremium: false, nicknames: '',
    isAvatarVisible: false, isPhoneVisible: false, isRealNameVisible: false, isAddressVisible: false, isEmailVisible: false, isBirthdayVisible: false, marketingEmailsEnabled: false };
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const view = (identity: typeof auth | { user: null; token: null; login: typeof auth.login; logout: typeof auth.logout; refreshUser: typeof auth.refreshUser; isAuthenticated: boolean } = auth) => <MemoryRouter><AuthContext.Provider value={identity}><NotificationsSettingsPage /></AuthContext.Provider></MemoryRouter>;
async function receipt(state = 'APPLIED', remote = { ...profile, profileVersion: 1, marketingEmailsEnabled: true }) {
    const journal = await parseProfileJournal([...pending.values()][0]);
    return { receipt: { clientActionId: journal.clientActionId, requestHash: journal.requestHash, state, appliedVersion: state === 'APPLIED' ? journal.expectedVersion + 1 : null, createdAt: new Date().toISOString() }, profile: remote };
}
beforeEach(() => { pending.clear(); localStorage.setItem('user-locale', 'zh-TW'); });
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('real notification preference, not simulated saved feedback', () => {
    it('reads opt-out from the backend and honestly labels inactive services', async () => {
        const fetcher = vi.fn(async () => ok(profile)); vi.stubGlobal('fetch', fetcher); render(view());
        expect(await screen.findByRole('checkbox')).not.toBeChecked();
        expect(screen.getByText(/行銷郵件寄送尚未開通/)).toBeInTheDocument();
        expect(screen.getByText(/這不是所有安全事件/)).toBeInTheDocument();
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);
        expect(screen.getByRole('link', { name: '查看聊天與面交' })).toHaveAttribute('href', '/chat');
        expect(fetcher).toHaveBeenCalledOnce();
        expect(screen.queryByText('已儲存！')).not.toBeInTheDocument();
    });
    it('shows saved only after an exact operation receipt and can opt out again', async () => {
        let ack!: (value: unknown) => void;
        const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? new Promise(resolve => { ack = resolve; }) : ok(profile));
        vi.stubGlobal('fetch', fetcher); render(view()); const toggle = await screen.findByRole('checkbox'); fireEvent.click(toggle);
        await vi.waitFor(() => expect(ack).toBeTypeOf('function'));
        expect(toggle).toBeDisabled(); expect(toggle).not.toBeChecked(); expect(screen.queryByText('已儲存！')).not.toBeInTheDocument();
        expect(JSON.parse(fetcher.mock.calls.find(call => call[1]?.method === 'POST')![1]!.body as string)).toEqual({ expectedVersion: 0, updates: { marketingEmailsEnabled: true } });
        await act(async () => ack(ok(await receipt()))); await screen.findByText('已儲存！');
        await vi.waitFor(() => expect(toggle).not.toBeDisabled()); expect(toggle).toBeChecked();
        fireEvent.click(toggle); await vi.waitFor(() => expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(2));
        expect(JSON.parse(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')[1][1]!.body as string)).toEqual({ expectedVersion: 1, updates: { marketingEmailsEnabled: false } });
        await act(async () => ack(ok(await receipt('APPLIED', { ...profile, profileVersion: 2 }))));
        await vi.waitFor(() => expect(toggle).not.toBeDisabled()); expect(toggle).not.toBeChecked();
    });
    it('lost ACK then reopen recovers by GET only; the operation is not replayed', async () => {
        let saved: unknown;
        const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') { saved = await receipt(); throw new Error('lost ACK'); }
            return ok(url.includes('/profile-operations/') ? saved : profile);
        }); vi.stubGlobal('fetch', fetcher);
        const mounted = render(view()); fireEvent.click(await screen.findByRole('checkbox'));
        await screen.findByText(/尚未確認儲存結果/); expect(screen.getByRole('checkbox')).toBeDisabled();
        mounted.unmount(); render(view()); await screen.findByText('後台已確認儲存。');
        await vi.waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
        expect(screen.getByRole('checkbox')).toBeChecked(); expect(pending.size).toBe(0);
        expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
        expect(fetcher.mock.calls.filter(call => call[0].includes('/profile-operations/') && !call[1]?.method)).toHaveLength(1);
    });
    it('a conflicting update shows current backend preference, not a saved claim or automatic retry', async () => {
        const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ok(init?.method === 'POST' ? await receipt('CONFLICT', { ...profile, profileVersion: 1 }) : profile));
        vi.stubGlobal('fetch', fetcher); render(view()); fireEvent.click(await screen.findByRole('checkbox'));
        await screen.findByText(/資料已被其他操作更新/); await vi.waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
        expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(screen.queryByText('已儲存！')).not.toBeInTheDocument();
        expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
    });
    it('missing or malformed preference blocks writes rather than treating unknown as opt-out', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({ ...profile, marketingEmailsEnabled: undefined }))); render(view());
        await screen.findByText(/無法安全讀取帳號資料/); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '重試讀取' })).toBeInTheDocument();
    });
    it('contradictory APPLIED content is not acknowledged as saved', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ok(init?.method === 'POST' ? await receipt('APPLIED', { ...profile, profileVersion: 1 }) : profile)));
        render(view()); fireEvent.click(await screen.findByRole('checkbox'));
        await screen.findByText(/尚未確認儲存結果/); expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.queryByText('已儲存！')).not.toBeInTheDocument(); expect(pending.size).toBe(1);
    });
    it('storage failure sends no mutation and offers a safe read retry', async () => {
        vi.mocked(privatePendingStore.save).mockRejectedValueOnce(new PendingStoreError());
        const fetcher = vi.fn(async () => ok(profile)); vi.stubGlobal('fetch', fetcher); render(view());
        fireEvent.click(await screen.findByRole('checkbox')); await screen.findByRole('button', { name: '重試讀取' });
        expect(fetcher).toHaveBeenCalledOnce(); expect(screen.getByRole('checkbox')).toBeDisabled();
    });
    it('does not overwrite another pending profile operation and requires two-step cancellation', async () => {
        const raw = await profileJournal({ address: '合成未確認地址' }, 0);
        pending.set(await pendingRequestKey(API_URL, 19, 'profile'), raw);
        const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith('/abandon')) return ok(await receipt('ABANDONED', profile));
            if (url.includes('/profile-operations/')) throw new Error('receipt unavailable');
            return ok(profile);
        }); vi.stubGlobal('fetch', fetcher); render(view());
        await screen.findByText(/原儲存結果尚未確認/); expect(screen.getByRole('checkbox')).toBeDisabled();
        expect([...pending.values()]).toEqual([raw]); fireEvent.click(screen.getByRole('button', { name: '安全取消原操作' }));
        expect(fetcher.mock.calls.every(call => !call[1]?.method)).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: '確認停止原操作' })); await screen.findByText(/原操作已安全取消/);
        await vi.waitFor(() => expect(pending.size).toBe(0));
        expect(JSON.parse(fetcher.mock.calls.find(call => call[1]?.method === 'POST')![1]!.body as string)).toEqual({ requestHash: (await parseProfileJournal(raw)).requestHash });
    });
    it('late previous-account receipt cannot alter the new account or clear its journal', async () => {
        let ack!: (value: unknown) => void;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? new Promise(resolve => { ack = resolve; }) : ok((init?.headers as Record<string, string>).Authorization === 'Bearer notification-fixture' ? profile : { ...profile, id: 20 })));
        const mounted = render(view()); fireEvent.click(await screen.findByRole('checkbox')); await vi.waitFor(() => expect(ack).toBeTypeOf('function'));
        const oldReceipt = await receipt(); mounted.rerender(view({ ...auth, user: { id: 20, phoneNumber: 'other' }, token: 'other-notification-fixture' }));
        await vi.waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
        await act(async () => ack(ok(oldReceipt))); expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(pending.size).toBe(1);
        expect(screen.queryByText('已儲存！')).not.toBeInTheDocument();
    });
    it('anonymous users get a login return link with no private request', () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); render(view({ ...auth, user: null, token: null, isAuthenticated: false }));
        expect(screen.getByRole('link', { name: '登入後返回通知設定' })).toHaveAttribute('href', '/login?next=%2Fsettings%2Fnotifications');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('uses English for every service explanation and the confirmed preference', async () => {
        localStorage.setItem('user-locale', 'en-US');
        const fetcher = vi.fn(async () => ok(profile)); vi.stubGlobal('fetch', fetcher); render(view());
        expect(await screen.findByRole('checkbox')).not.toBeChecked();
        expect(screen.getByText(/Only your preference is saved; marketing email delivery is not available/)).toBeInTheDocument();
        expect(screen.getByText(/does not subscribe you to automatic notifications for all security events/)).toBeInTheDocument();
        expect(screen.getByText(/does not request push permission/)).toBeInTheDocument();
        expect(screen.getByText('Server-confirmed preference: Do not receive')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View chat and meetups' })).toHaveAttribute('href', '/chat');
        expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
        expect(fetcher).toHaveBeenCalledOnce();
    });
    it('keeps the English guest return path without reading private data', () => {
        localStorage.setItem('user-locale', 'en-US');
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); render(view({ ...auth, user: null, token: null, isAuthenticated: false }));
        expect(screen.getByText('Sign in to read or change notification preferences.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in and return to notification settings' })).toHaveAttribute('href', '/login?next=%2Fsettings%2Fnotifications');
        expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/); expect(fetcher).not.toHaveBeenCalled();
    });
    it('retains an English unconfirmed save and recovers the exact receipt on reopen without reposting', async () => {
        localStorage.setItem('user-locale', 'en-US'); let saved: unknown;
        const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') { saved = await receipt(); throw new Error('lost ACK'); }
            return ok(url.includes('/profile-operations/') ? saved : profile);
        }); vi.stubGlobal('fetch', fetcher);
        const mounted = render(view()); fireEvent.click(await screen.findByRole('checkbox'));
        await screen.findByText('The save is unconfirmed. Verify the original receipt or explicitly retry the same operation.');
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Verify original save result' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry the same save operation' })).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
        mounted.unmount(); render(view()); await screen.findByText('The server confirmed the save.');
        await vi.waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
        expect(screen.getByRole('checkbox')).toBeChecked(); expect(pending.size).toBe(0);
        expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
        expect(fetcher.mock.calls.filter(call => call[0].includes('/profile-operations/') && !call[1]?.method)).toHaveLength(1);
    });
    it('explains an English conflict using the current preference without claiming a retained draft', async () => {
        localStorage.setItem('user-locale', 'en-US');
        const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ok(init?.method === 'POST' ? await receipt('CONFLICT', profile) : profile));
        vi.stubGlobal('fetch', fetcher); render(view()); fireEvent.click(await screen.findByRole('checkbox'));
        await screen.findByText('Another operation updated the data. This change was not applied. The page shows the current server preference; check it before changing it again.');
        await vi.waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
        expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(document.body.textContent).not.toMatch(/draft|[\u3400-\u9fff]/);
        expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
    });
    it('offers English safe read recovery after a malformed profile without treating it as opt-out', async () => {
        localStorage.setItem('user-locale', 'en-US');
        const fetcher = vi.fn().mockResolvedValueOnce(ok({ ...profile, marketingEmailsEnabled: undefined })).mockResolvedValue(ok(profile));
        vi.stubGlobal('fetch', fetcher); render(view());
        await screen.findByText('Account data or its recovery journal could not be read safely. Saving is paused. Retry reading; this does not mean your data is empty.');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry reading' }));
        expect(await screen.findByRole('checkbox')).not.toBeChecked();
        expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/); expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('keeps English two-step cancellation scoped to the pending operation and avoids a nonexistent draft claim', async () => {
        localStorage.setItem('user-locale', 'en-US');
        const raw = await profileJournal({ marketingEmailsEnabled: true }, 0);
        pending.set(await pendingRequestKey(API_URL, 19, 'profile'), raw);
        const fetcher = vi.fn(async (url: string) => {
            if (url.endsWith('/abandon')) return ok(await receipt('ABANDONED', profile));
            if (url.includes('/profile-operations/')) throw new Error('receipt unavailable');
            return ok(profile);
        }); vi.stubGlobal('fetch', fetcher); render(view());
        await screen.findByText('The original save is unconfirmed. Reopening only verifies it without resending.');
        expect(screen.getByRole('checkbox')).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Safely stop original operation' }));
        expect(screen.getByText(/Saved data will not be reversed. Continue/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Keep original operation' }));
        expect(fetcher.mock.calls.every(call => !call[0].endsWith('/abandon'))).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Safely stop original operation' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm stopping original operation' }));
        await screen.findByText('The original operation was safely stopped and cannot apply. Preferences already saved on the server are not reversed.');
        await vi.waitFor(() => expect(pending.size).toBe(0));
        expect(document.body.textContent).not.toMatch(/draft|[\u3400-\u9fff]/);
        expect(fetcher.mock.calls.filter(call => call[0].endsWith('/abandon'))).toHaveLength(1);
    });
});
