import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { api } from './marketplaceApi';
import { parseOwnProfile } from './profileWeb';
import { pendingRequestKey, privatePendingStore } from './webPendingStore';

// The legacy avatar endpoint has no operation receipt. A current-profile GET
// cannot prove which upload committed. Retain that distinction in the UI.
function parseMarker(raw: string) {
  const row = JSON.parse(raw);
  if (!row || Object.keys(row).sort().join(',') !== 'id,version' || row.version !== 1 || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id)) throw new Error('Invalid avatar reminder');
}
function avatarUrl(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('Invalid avatar response');
  if (/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(value)) return value;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid avatar response');
  return value;
}
export function useAvatarUpload(token: string | null, userId: number | undefined, patchDisplay: (patch: { avatarUrl: string | null }) => void) {
  const [ready,setReady] = useState(false), [busy,setBusy] = useState(false), [pending,setPending] = useState<string | null>(null), [storageError,setStorageError] = useState(false);
  const [notice,setNotice] = useState(''), [checked,setChecked] = useState(false), [clearConfirm,setClearConfirm] = useState(false), [reload,setReload] = useState(0);
  const generation = useRef(0), lock = useRef(true), key = useRef(''), rawRef = useRef<string | null>(null), patch = useRef(patchDisplay);
  patch.current = patchDisplay;
  const mark = (raw: string | null) => { rawRef.current = raw; setPending(raw); };
  useEffect(() => {
    const epoch = ++generation.current; lock.current = true; setReady(false); setStorageError(false); setChecked(false); setClearConfirm(false);
    if (token && userId) void (async () => {
      try {
        const nextKey = await pendingRequestKey(API_URL,userId,'avatar'), raw = await privatePendingStore.get(nextKey);
        if (raw) parseMarker(raw);
        if (generation.current !== epoch) return;
        key.current = nextKey; mark(raw);
        setNotice(raw ? '上次大頭照上傳結果尚未確認。重開不會再次上傳；請查核目前大頭照。' : '');
      } catch { if (generation.current === epoch) { setStorageError(true); setNotice('無法安全讀取大頭照恢復提醒，暫停上傳。請重試讀取。'); } }
      finally { if (generation.current === epoch) { lock.current = false; setReady(true); } }
    })();
    return () => { generation.current++; };
  },[token,userId,reload]);
  const upload = async (file: File, blocked: boolean) => {
    if (blocked || !token || !userId || !ready || lock.current || rawRef.current || storageError) return;
    if (!file.type.startsWith('image/') || !file.size || file.size > 10 * 1024 * 1024) { setNotice('請選擇10MB內的圖片。'); return; }
    const epoch = generation.current; lock.current = true; setBusy(true); setChecked(false); setNotice('正在上傳並確認大頭照…');
    const raw = JSON.stringify({ version: 1, id: crypto.randomUUID() }); let persisted = false, acknowledged = false;
    try {
      await privatePendingStore.save(key.current,raw); persisted = true;
      if (generation.current !== epoch) return;
      mark(raw);
      const body = new FormData(); body.append('avatar',file);
      const response = await fetch(`${API_URL}/users/me/avatar`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error('Unconfirmed avatar upload');
      const data = await response.json(), url = avatarUrl(data?.avatarUrl);
      if (generation.current !== epoch) return;
      acknowledged = true; patch.current({avatarUrl:url}); setNotice('後台已回覆大頭照上傳成功。');
      await privatePendingStore.clear(key.current,raw);
      const remaining = await privatePendingStore.get(key.current);
      if (generation.current !== epoch) return;
      mark(remaining); if (remaining) setNotice('上傳已回覆，但本機提醒仍存在；請查核目前大頭照後清理。');
    } catch {
      if (generation.current !== epoch) return;
      if (persisted) { mark(raw); setNotice(acknowledged ? '上傳已回覆成功，但本機提醒未清理；請查核目前大頭照後清理。' : '大頭照上傳結果尚未確認；後台可能已保存。請查核目前大頭照，不會自動重送。'); }
      else { setStorageError(true); setNotice('無法保存大頭照恢復提醒；尚未上傳。請重試讀取。'); }
    } finally { if (generation.current === epoch) { lock.current = false; setBusy(false); } }
  };
  const read = async () => {
    if (!token || !userId || lock.current || !rawRef.current) return;
    const epoch = generation.current; lock.current = true; setBusy(true); setChecked(false); setClearConfirm(false);
    try {
      const remote = parseOwnProfile(await api(token,'/users/me'),userId);
      if (generation.current !== epoch) return;
      patch.current({avatarUrl:remote.avatarUrl}); setChecked(true);
      setNotice('已讀取目前大頭照。此查核無法證明原上傳是否完成；原請求仍可能稍後完成。');
    } catch { if (generation.current === epoch) setNotice('無法查核目前大頭照；上傳結果仍未知，請重試查核。'); }
    finally { if (generation.current === epoch) { lock.current = false; setBusy(false); } }
  };
  const clear = async () => {
    const raw = rawRef.current;
    if (!raw || !checked || !clearConfirm || lock.current) return;
    const epoch = generation.current; lock.current = true; setBusy(true);
    try {
      await privatePendingStore.clear(key.current,raw);
      const remaining = await privatePendingStore.get(key.current);
      if (generation.current !== epoch) return;
      mark(remaining); setChecked(false); setClearConfirm(false);
      setNotice(remaining ? '另一份上傳提醒仍存在；請重新查核。' : '已清除本機提醒。這不會取消原請求或撤回後台大頭照。');
    } catch { if (generation.current === epoch) setNotice('無法清理本機提醒；不會再次上傳。請重試清理。'); }
    finally { if (generation.current === epoch) { lock.current = false; setBusy(false); } }
  };
  return {busy,notice,pending,checked,clearConfirm,setClearConfirm,storageError,upload,read,clear,retryRead:()=>setReload(n=>n+1),canReload:()=>!lock.current,locked:!ready || busy || !!pending || storageError};
}
