import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { api } from './marketplaceApi';
import { pendingRequestKey, privatePendingStore, PendingStoreError } from './webPendingStore';
import { abandonProfileOperation, normalizeProfilePatch, parseOwnProfile, parseProfileJournal, profileJournal, readProfileOperation, sendProfileOperation, type OwnProfile, type ProfileField, type ProfilePatch, type ProfileResult } from './profileWeb';

/** Single scoped operation at a time. Persist before HTTP; reopens only GET.
 * Unsent fields remain drafts and never become acknowledged by another field.
 */
export function useSettingsProfile(token: string | null, userId: number | undefined) {
  const [profile,setProfile] = useState<OwnProfile | null>(null), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
  const [pending,setPending] = useState<string | null>(null), [storageError,setStorageError] = useState(false), [notice,setNotice] = useState(''), [savedField,setSavedField] = useState<string | null>(null);
  const [discardConfirm,setDiscardConfirm] = useState(false), [reload,setReload] = useState(0);
  const generation = useRef(0), locked = useRef(false), pendingRef = useRef<string | null>(null), keyRef = useRef('');
  const confirmed = useRef<OwnProfile | null>(null), drafts = useRef<ProfilePatch>({}), acknowledged = useRef<ProfileResult | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const adopt = (remote: OwnProfile) => { confirmed.current = remote; setProfile({...remote,...drafts.current} as OwnProfile); };
  const markPending = (raw: string | null) => { pendingRef.current = raw; setPending(raw); };
  const finish = async (result: ProfileResult, raw: string, epoch: number) => {
    if (generation.current !== epoch) return;
    acknowledged.current = result;
    const journal = await parseProfileJournal(raw);
    if (generation.current !== epoch) return;
    if (result.state === 'APPLIED') {
      for (const key of Object.keys(journal.updates) as ProfileField[]) {
        // Do not overwrite a newer, never-submitted draft.
        if (Object.hasOwn(drafts.current,key)) {
          try { if (normalizeProfilePatch({[key]:drafts.current[key]})[key] === journal.updates[key]) delete drafts.current[key]; } catch { /* keep invalid draft for correction */ }
        }
      }
    }
    adopt(result.profile);
    setNotice(result.state === 'APPLIED' ? result.current ? '後台已確認儲存。' : '原變更已儲存，但資料已被之後的變更取代；請核對目前資料。' : result.state === 'CONFLICT' ? '資料已被其他操作更新；本次未套用。請核對保留的草稿後再儲存。' : '原操作已安全取消，不會再套用；未儲存的草稿仍保留在本頁。');
    if (result.current) {
      setSavedField(Object.keys(journal.updates)[0]); clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => { if (generation.current === epoch) setSavedField(null); },2000);
    }
    try {
      await privatePendingStore.clear(keyRef.current,raw);
      const remaining = await privatePendingStore.get(keyRef.current);
      if (generation.current !== epoch) return;
      // A different tab's new journal must not be cleared or hidden by this ACK.
      markPending(remaining); acknowledged.current = remaining === raw ? result : null;
      if (remaining) setNotice('已確認原操作；另一個待確認操作仍存在，請查核後再編輯。');
    } catch {
      if (generation.current === epoch) { markPending(raw); setNotice('後台原操作已確認，但本機恢復標記尚未清理；只需重試清理，不要重送。'); }
    }
  };
  useEffect(() => {
    const epoch = ++generation.current, abort = new AbortController(); locked.current = true; setLoading(true); setStorageError(false); setNotice('');
    if (token && userId) void (async () => {
      try {
        const key = await pendingRequestKey(API_URL,userId,'profile');
        const [remote,raw] = await Promise.all([api(token,'/users/me',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])}),privatePendingStore.get(key)]);
        if (generation.current !== epoch) return;
        keyRef.current = key; adopt(parseOwnProfile(remote,userId)); markPending(raw);
        if (raw) {
          await parseProfileJournal(raw); if (generation.current !== epoch) return;
          try { await finish(await readProfileOperation(token,raw,userId),raw,epoch); }
          catch { if (generation.current === epoch) setNotice('原儲存結果尚未確認；重開只查核，不會自動重送。'); }
        }
      } catch {
        if (generation.current === epoch) { setStorageError(true); setNotice('無法安全讀取帳號資料或恢復標記，暫停儲存。請重試讀取，不代表資料為空。'); }
      } finally { if (generation.current === epoch) { locked.current = false; setLoading(false); } }
    })(); else { locked.current = false; setLoading(false); }
    return () => { generation.current++; abort.abort(); clearTimeout(savedTimer.current); };
  },[token,userId,reload]);
  const edit = (field: ProfileField, value: string) => {
    if (locked.current || pendingRef.current || storageError) return;
    drafts.current[field] = value; setSavedField(null);
    setProfile(prev => prev ? {...prev,[field]:value} : null);
  };
  const update = async (updates: ProfilePatch) => {
    if (!token || !userId || !confirmed.current || locked.current || pendingRef.current || storageError) return;
    const epoch = generation.current; locked.current = true; setBusy(true); setSavedField(null); setNotice('正在保存與確認…');
    let raw: string | null = null, persisted = false;
    try {
      const patch = normalizeProfilePatch(updates);
      if (Object.entries(patch).every(([key,value]) => confirmed.current?.[key as ProfileField] === value)) { setNotice('資料沒有變更。'); return; }
      raw = await profileJournal(patch,confirmed.current.profileVersion);
      await privatePendingStore.save(keyRef.current,raw); persisted = true;
      if (generation.current !== epoch) return;
      markPending(raw); acknowledged.current = null;
      await finish(await sendProfileOperation(token,raw,userId,privatePendingStore,keyRef.current,() => generation.current === epoch),raw,epoch);
    } catch (error) {
      if (generation.current !== epoch) return;
      if (persisted && raw) { markPending(raw); setNotice('尚未確認儲存結果；請查核原回執，或明確重試同一操作。'); }
      else if (error instanceof PendingStoreError) { setStorageError(true); setNotice(error.message); }
      else setNotice(error instanceof Error ? error.message : '無法保存；尚未送出。');
    } finally { if (generation.current === epoch) { locked.current = false; setBusy(false); } }
  };
  const recover = async (mode: 'read' | 'retry' | 'abandon' | 'cleanup') => {
    const raw = pendingRef.current;
    if (!token || !userId || !raw || locked.current) return;
    const epoch = generation.current; locked.current = true; setBusy(true); setDiscardConfirm(false);
    try {
      const result = acknowledged.current ?? (mode === 'retry' ? await sendProfileOperation(token,raw,userId,privatePendingStore,keyRef.current,() => generation.current === epoch) : mode === 'abandon' ? await abandonProfileOperation(token,raw,userId,() => generation.current === epoch) : await readProfileOperation(token,raw,userId));
      await finish(result,raw,epoch);
    } catch { if (generation.current === epoch) setNotice('原儲存結果仍未確認；不會改用新操作，也不會自動重送。'); }
    finally { if (generation.current === epoch) { locked.current = false; setBusy(false); } }
  };
  return { profile, loading, busy, pending, notice, savedField, storageError, discardConfirm, setDiscardConfirm,
    locked: loading || busy || !!pending || storageError, emailReadOnly: !!confirmed.current?.email,
    edit,update,recover, retryRead: () => setReload(value => value+1),
    patchDisplay: (patch: Partial<OwnProfile>) => setProfile(prev => prev ? {...prev,...patch} : null),
    cleanupOnly: !!acknowledged.current };
}
