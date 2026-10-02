import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { DiagnosticsConflict, DiagnosticsRejected, dispatchEmailDiagnostic, parseDiagnosticsMarker, readDiagnosticsCapability } from '../lib/emailDiagnosticsWeb';
import { diagnosticsText as dt } from '../lib/emailDiagnosticsCopy';

type Phase = 'reading' | 'ready' | 'hidden' | 'readError' | 'storageError' | 'pending' | 'cleanup' | 'accepted' | 'rejected' | 'conflict';
export default function EmailDiagnostics({ token, userId, onBusy }: { token: string; userId: number; onBusy: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('reading');
  const [marker, setMarker] = useState<{ key: string; raw: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const generation = useRef(0), gate = useRef(false), confirmed = useRef<'accepted' | 'rejected' | 'readError' | null>(null);
  useLayoutEffect(() => { generation.current++; gate.current = false; confirmed.current = null; setPhase('reading'); setMarker(null); setChecked(false); setBusy(false); onBusy(false); return () => { generation.current++; onBusy(false); }; }, [token, userId, onBusy]);
  const load = useCallback(async () => {
    if (gate.current) return;
    gate.current = true; const epoch = generation.current; const active = () => generation.current === epoch;
    setBusy(true); setChecked(false); setPhase('reading'); confirmed.current = null;
    try {
      const key = await pendingRequestKey(API_URL, userId, 'email-diagnostics');
      const raw = await privatePendingStore.get(key);
      if (raw) parseDiagnosticsMarker(raw);
      if (!active()) return;
      setMarker(raw ? { key, raw } : null);
      if (raw) { setPhase('pending'); return; }
      try {
        const allowed = await readDiagnosticsCapability(API_URL, token, userId);
        if (active()) setPhase(allowed ? 'ready' : 'hidden');
      } catch { if (active()) setPhase('readError'); }
    } catch { if (active()) setPhase('storageError'); }
    finally { if (active()) { gate.current = false; setBusy(false); } }
  }, [token, userId]);
  useEffect(() => { void load(); }, [load]);

  const cleanup = async (current: { key: string; raw: string }, active: () => boolean, result: 'accepted' | 'rejected' | 'readError' | null) => {
    if (!active()) throw Error();
    if (await privatePendingStore.get(current.key) !== current.raw) throw new DiagnosticsConflict();
    if (!active()) throw Error();
    if (!await privatePendingStore.clear(current.key, current.raw)) throw new DiagnosticsConflict();
    if (!active()) throw Error();
    if (await privatePendingStore.get(current.key) !== null) throw new DiagnosticsConflict();
    if (!active()) throw Error();
    setMarker(null); setChecked(false); confirmed.current = null; setPhase(result ?? 'hidden');
  };
  const send = async () => {
    if (gate.current || phase !== 'ready' || marker) return;
    gate.current = true; const epoch = generation.current; const active = () => generation.current === epoch;
    setBusy(true); onBusy(true); let current: { key: string; raw: string } | null = null, dispatched = false;
    try {
      const key = await pendingRequestKey(API_URL, userId, 'email-diagnostics');
      const raw = JSON.stringify({ version: 1, localOperationId: crypto.randomUUID(), startedAt: new Date().toISOString() });
      parseDiagnosticsMarker(raw);
      await privatePendingStore.save(key, raw);
      if (!active()) return;
      current = { key, raw }; setMarker(current);
      if (await privatePendingStore.get(key) !== raw) throw new DiagnosticsConflict();
      if (!active()) return;
      if (!await readDiagnosticsCapability(API_URL, token, userId)) throw new DiagnosticsRejected();
      if (!active()) return;
      dispatched = true;
      await dispatchEmailDiagnostic(API_URL, token, key, raw, active);
      if (!active()) return;
      confirmed.current = 'accepted';
      await cleanup(current, active, 'accepted');
    } catch (error) {
      if (!active()) return;
      if (error instanceof DiagnosticsConflict) setPhase('conflict');
      else if (current && (error instanceof DiagnosticsRejected || !dispatched)) {
        confirmed.current = error instanceof DiagnosticsRejected ? 'rejected' : 'readError';
        try { await cleanup(current, active, confirmed.current); } catch (fault) { if (active()) setPhase(fault instanceof DiagnosticsConflict ? 'conflict' : 'cleanup'); }
      } else setPhase(confirmed.current ? 'cleanup' : current ? 'pending' : 'storageError');
    } finally { if (active()) { gate.current = false; setBusy(false); onBusy(false); } }
  };
  const clear = async () => {
    if (gate.current || !marker || !confirmed.current && !checked) return;
    gate.current = true; const epoch = generation.current; const active = () => generation.current === epoch;
    setBusy(true); onBusy(true);
    try { await cleanup(marker, active, confirmed.current); }
    catch (error) { if (active()) setPhase(error instanceof DiagnosticsConflict ? 'conflict' : confirmed.current ? 'cleanup' : 'storageError'); }
    finally { if (active()) { gate.current = false; setBusy(false); onBusy(false); } }
  };
  if (phase === 'hidden' || phase === 'reading') return null;
  const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-muji-border px-4 py-2 text-sm disabled:opacity-50';
  return <section aria-label={dt('系統診斷')} className="mt-8 space-y-3 border-t border-gray-200 pt-6">
    <h2 className="text-xl font-semibold">{dt('系統診斷')}</h2>
    <h3 className="font-medium">{dt('測試郵件')}</h3>
    <p className="text-sm text-gray-500">{dt('僅後台指定的管理者可寄到固定管理信箱。郵件服務接受不等於收件匣送達。')}</p>
    {phase === 'ready' && <button className={button} disabled={busy} onClick={() => void send()}>{dt(busy ? '正在處理…' : '寄送測試郵件')}</button>}
    {phase === 'readError' && <p role="alert">{dt('診斷權限尚未確認；沒有送出。')}</p>}
    {phase === 'storageError' && <p role="alert">{dt('無法安全保存或讀取本機操作；暫停送出，請重試讀取。')}</p>}
    {phase === 'accepted' && <p role="status">{dt('郵件服務已接受測試請求；尚未確認收件匣送達。')}</p>}
    {phase === 'rejected' && <p role="status">{dt('後台拒絕這次操作；沒有寄送。')}</p>}
    {phase === 'cleanup' && <p role="alert">{dt('回覆已核對；本機提醒尚未清理，只需重試清理。')}</p>}
    {phase === 'conflict' && <p role="alert">{dt('另一份本機操作仍存在，請重新讀取。')}</p>}
    {marker && <>{!confirmed.current && <p role="status">{dt('寄送結果未確認；重開不會自動重送。')}</p>}<p className="text-sm">{dt('本機標記不是後台回執。請到郵件服務核對；重新讀取權限不能證明原郵件結果。')}</p><p className="break-all text-sm">{dt('本機操作標記')}：{parseDiagnosticsMarker(marker.raw).localOperationId}</p>
      {!confirmed.current && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />{dt('我已到郵件服務核對，了解清理不會取消原請求')}</label>}
      <button className={button} disabled={busy || !confirmed.current && !checked} onClick={() => void clear()}>{dt('只清理本機提醒')}</button></>}
    {['readError','storageError','accepted','rejected','pending','conflict'].includes(phase) && <button className={button} disabled={busy} onClick={() => void load()}>{dt('重試讀取診斷權限與提醒')}</button>}
  </section>;
}
