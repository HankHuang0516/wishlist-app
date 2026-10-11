import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsProfile } from './useSettingsProfile';
import { parseProfileJournal } from './profileWeb';
import { privatePendingStore } from './webPendingStore';

const records = vi.hoisted(() => new Map<string, string>());
vi.mock('./webPendingStore', async importOriginal => ({
  ...await importOriginal<typeof import('./webPendingStore')>(),
  privatePendingStore: {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    save: vi.fn(async (key: string, raw: string) => {
      if (records.has(key) && records.get(key) !== raw) throw new Error('changed record');
      records.set(key, raw);
    }),
    clear: vi.fn(async (key: string, raw: string) => {
      if (records.get(key) !== raw) return false;
      records.delete(key); return true;
    }),
  },
}));

const first = { id: 19, profileVersion: 0, name: 'First fixture', phoneNumber: 'fixture-one',
  nicknames: 'First nickname', realName: 'First name', address: 'First address', birthday: '1993-05-16',
  isPremium: false, isAvatarVisible: false, isPhoneVisible: false, isRealNameVisible: false,
  isAddressVisible: false, isEmailVisible: false, isBirthdayVisible: false, marketingEmailsEnabled: false };
const second = { ...first, id: 44, profileVersion: 4, name: 'Second fixture', phoneNumber: 'fixture-two',
  nicknames: 'Second nickname', realName: 'Second name', address: 'Second address', birthday: '1994-06-17' };
type Session = { token: string | null; userId: number | undefined };
const one: Session = { token: 'fixture-one', userId: 19 };
const two: Session = { token: 'fixture-two', userId: 44 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const ownProfile = (init?: RequestInit) => new Headers(init?.headers).get('Authorization') === 'Bearer fixture-two' ? second : first;
const mount = () => renderHook(({ token, userId }: Session) => useSettingsProfile(token, userId), { initialProps: one });

beforeEach(() => { records.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('settings profile account isolation', () => {
  it('does not render or submit the previous account private drafts after an in-place account switch', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ok(ownProfile(init)));
    vi.stubGlobal('fetch', fetcher); const { result, rerender } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.edit('address', 'PRIVATE FIRST UNSENT ADDRESS');
      result.current.edit('realName', 'PRIVATE FIRST UNSENT NAME');
      result.current.edit('nicknames', 'First unsent nickname');
      result.current.edit('birthday', '1991-01-01');
    });
    expect(result.current.canReload()).toBe(false);
    rerender(two); await waitFor(() => expect(result.current.profile?.id).toBe(44));
    expect(result.current.profile).toMatchObject({ address: second.address, realName: second.realName,
      nicknames: second.nicknames, birthday: second.birthday });
    expect(result.current.canReload()).toBe(true);
    await act(async () => result.current.update({ address: second.address }));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(records.size).toBe(0);
  });

  it('drops private in-memory values on sign-out without deleting scoped recovery records', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ok(ownProfile(init))));
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.edit('address', 'PRIVATE UNSENT ADDRESS'));
    records.set('unrelated-scoped-journal', 'KEEP');
    rerender({ token: null, userId: undefined });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeNull(); expect(result.current.pending).toBeNull();
    expect(result.current.savedField).toBeNull(); expect(result.current.cleanupOnly).toBe(false);
    expect(records.get('unrelated-scoped-journal')).toBe('KEEP');
    rerender(one); await waitFor(() => expect(result.current.profile?.id).toBe(19));
    expect(result.current.profile?.address).toBe(first.address);
  });

  it('preserves unsent drafts on a same-owner token refresh and safe profile reread', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ok(ownProfile(init)));
    vi.stubGlobal('fetch', fetcher); const { result, rerender } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.edit('address', 'SAME OWNER UNSENT ADDRESS'));
    rerender({ token: 'fixture-one-refreshed', userId: 19 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.address).toBe('SAME OWNER UNSENT ADDRESS');
    act(() => result.current.retryRead()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.address).toBe('SAME OWNER UNSENT ADDRESS');
    expect(result.current.canReload()).toBe(false);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('never exposes the old profile during the replacement-account render before effects finish', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ok(ownProfile(init))));
    const seen: Array<{ requested: number | undefined; displayed: number | undefined; loading: boolean }> = [];
    const { result, rerender } = renderHook((session: Session) => {
      const value = useSettingsProfile(session.token, session.userId);
      seen.push({ requested: session.userId, displayed: value.profile?.id, loading: value.loading });
      return value;
    }, { initialProps: one });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender(two); await waitFor(() => expect(result.current.profile?.id).toBe(44));
    expect(seen.filter(x => x.requested === 44).every(x => x.displayed === undefined || x.displayed === 44)).toBe(true);
    expect(seen.filter(x => x.requested === 44 && x.displayed === undefined).every(x => x.loading)).toBe(true);
  });

  it('rejects held old-account edit, display and save callbacks after the replacement account loads', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ok(ownProfile(init)));
    vi.stubGlobal('fetch', fetcher); const { result, rerender } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false)); const old = result.current;
    rerender(two); await waitFor(() => expect(result.current.profile?.id).toBe(44));
    await act(async () => {
      old.edit('address', 'PRIVATE LATE DRAFT'); old.patchDisplay({ address: 'PRIVATE LATE AVATAR CALLBACK' });
      await old.update({ address: 'PRIVATE LATE SAVE' });
    });
    expect(result.current.profile).toMatchObject({ id: 44, address: second.address });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(records.size).toBe(0);
  });

  it('does not borrow a previous account confirmed cleanup result or clear its original journal', async () => {
    let receipt: unknown;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const journal = await parseProfileJournal([...records.values()][0]);
        receipt = { receipt: { clientActionId: journal.clientActionId, requestHash: journal.requestHash,
          state: 'APPLIED', appliedVersion: 1, createdAt: new Date().toISOString() },
          profile: { ...first, profileVersion: 1, nicknames: 'Confirmed first nickname' } };
        return ok(receipt);
      }
      return ok(url.includes('/profile-operations/') ? receipt : ownProfile(init));
    });
    vi.stubGlobal('fetch', fetcher); vi.mocked(privatePendingStore.clear).mockRejectedValueOnce(new Error('storage unavailable'));
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.update({ nicknames: 'Confirmed first nickname' }));
    expect(result.current.cleanupOnly).toBe(true); const old = result.current;
    const [key, raw] = [...records.entries()][0];
    rerender(two); await waitFor(() => expect(result.current.profile?.id).toBe(44));
    expect(result.current.cleanupOnly).toBe(false); expect(result.current.pending).toBeNull();
    await act(async () => old.recover('cleanup'));
    expect(result.current.profile?.id).toBe(44); expect(records.get(key)).toBe(raw);
    expect(privatePendingStore.clear).toHaveBeenCalledTimes(1);
    rerender(one); await waitFor(() => expect(records.has(key)).toBe(false));
    expect(result.current.profile?.nicknames).toBe('Confirmed first nickname');
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('unlocks the replacement account while a previous save is pending and ignores its late acknowledgement', async () => {
    let finish!: (value: unknown) => void; let receipt: unknown;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise(resolve => { finish = resolve; });
      return ok(url.includes('/profile-operations/') ? receipt : ownProfile(init));
    });
    vi.stubGlobal('fetch', fetcher); const { result, rerender } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    let save!: Promise<void>;
    act(() => { save = result.current.update({ nicknames: 'First saved proposal' }); });
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    const [oldKey, oldRaw] = [...records.entries()][0], journal = await parseProfileJournal(oldRaw);
    rerender(two); await waitFor(() => expect(result.current.profile?.id).toBe(44));
    expect(result.current.busy).toBe(false); expect(result.current.locked).toBe(false);
    expect(result.current.pending).toBeNull(); expect(result.current.cleanupOnly).toBe(false);
    receipt = { receipt: { clientActionId: journal.clientActionId, requestHash: journal.requestHash,
      state: 'APPLIED', appliedVersion: 1, createdAt: new Date().toISOString() },
      profile: { ...first, profileVersion: 1, nicknames: 'First saved proposal' } };
    await act(async () => { finish(ok(receipt)); await save; });
    expect(result.current.profile).toMatchObject({ id: 44, nicknames: second.nicknames });
    expect(result.current.notice).toBe(''); expect(result.current.savedField).toBeNull();
    expect(records.get(oldKey)).toBe(oldRaw); expect(privatePendingStore.clear).not.toHaveBeenCalled();
    rerender(one); await waitFor(() => expect(result.current.profile?.nicknames).toBe('First saved proposal'));
    await waitFor(() => expect(records.has(oldKey)).toBe(false));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url, init]) => url.includes('/profile-operations/') && init?.method !== 'POST')).toHaveLength(1);
  });
});
