import { useEffect, useRef, useState } from 'react';
import MarketplaceDialog from './MarketplaceDialog';
import { getFullApiUrl } from '../config';
import { api } from '../lib/marketplaceApi';
import { privatePendingStore, pendingRequestKey, PendingStoreError, sha256 } from '../lib/webPendingStore';
import { abandonReport, buildReportRequest, lookupReport, parseReportPage, parseReportRequest, REPORT_REASONS, REPORT_STATUS_LABELS,
  reportPagePath, submitReport, type ListingReport, type ReportReason, type ReportResult } from '../lib/listingReports';

const button = 'min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50';
export default function ListingReportWeb({ token, userId, listing, onClose }: {
  token: string; userId: number; listing?: { id: string; title: string; available: boolean }; onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('FRAUD'), [details, setDetails] = useState('');
  const [pending, setPending] = useState<string | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ListingReport[]>([]), [cursor, setCursor] = useState<string | null>(null), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [historyError, setHistoryError] = useState(''), [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false), [confirmFence, setConfirmFence] = useState(false);
  const active = useRef(true), gate = useRef(false), reading = useRef(false), key = useRef<string | null>(null), pendingRef = useRef<string | null>(null);
  const cursors = useRef(new Set<string>());
  const read = async (path: string, init?: RequestInit) => { if (!active.current) throw new Error('已關閉'); return api<unknown>(token, path, init); };
  function accept(result: ReportResult, body: string) {
    if (!active.current) return;
    if (result.kind === 'unconfirmed') { setError(result.message); return; }
    const request = parseReportRequest(JSON.parse(body));
    if (result.kind === 'confirmed') {
      setItems(old => [result.report, ...old.filter(item => item.id !== result.report.id)].map(item => {
        const newer = old.find(prior => prior.id === item.id && prior.version > item.version); return newer ?? item;
      }));
      setNotice('已確認收到檢舉；審核是否下架請查看狀態，不代表已下架。');
    } else setNotice(result.kind === 'abandoned' ? '未被收件的原操作已安全封存，不會稍後送出。' : '原操作已收件，但沒有可顯示的案件明細；不代表撤回或下架。');
    if (listing?.id === request.listingId && result.kind !== 'abandoned') setSubmitted(true);
    if (result.pendingCleared) { pendingRef.current = null; setPending(null); setConfirmFence(false); }
    else setError('後台結果已確認，但本機待確認標記尚未清除。請查核原回執；暫不建立新檢舉。');
  }
  async function history(next?: string) {
    if (reading.current) return; reading.current = true; setHistoryError('');
    try {
      if (next && cursors.current.has(next)) throw new Error('檢舉分頁重複，請重新整理紀錄。');
      const page = parseReportPage(await read(reportPagePath(next)));
      if (!active.current) return;
      if (!next) cursors.current.clear(); else cursors.current.add(next);
      setItems(old => {
        const latest = page.items.map(row => old.find(prior => prior.id === row.id && prior.version > row.version) ?? row);
        return next ? [...old.map(row => latest.find(item => item.id === row.id && item.version > row.version) ?? row), ...latest.filter(row => !old.some(prior => prior.id === row.id))] : latest;
      });
      setCursor(page.nextCursor); setLoaded(true);
    } catch { if (active.current) setHistoryError('無法讀取檢舉紀錄；不代表沒有紀錄，請重試。'); }
    finally { reading.current = false; }
  }
  async function restore() {
    if (gate.current) return; gate.current = true; setBusy(true); setReady(false); setError('');
    try {
      const requestKey = await pendingRequestKey(getFullApiUrl(), userId, 'listing-report'), saved = await privatePendingStore.get(requestKey);
      if (saved && JSON.stringify(parseReportRequest(JSON.parse(saved))) !== saved) throw new PendingStoreError();
      if (!active.current) return;
      key.current = requestKey; pendingRef.current = saved; setPending(saved); setReady(true);
      if (saved) accept(await lookupReport(read, privatePendingStore, requestKey, parseReportRequest(JSON.parse(saved)), sha256), saved);
    } catch { if (active.current) setError('無法安全恢復原檢舉。請重試恢復；未恢復前不會送出新的檢舉。'); }
    finally { gate.current = false; if (active.current) { setBusy(false); void history(); } }
  }
  useEffect(() => { active.current = true; void restore(); return () => { active.current = false; }; }, []);
  async function run(mode: 'send' | 'lookup' | 'abandon') {
    if (!ready || !key.current || gate.current || (mode !== 'send' && !pendingRef.current)) return;
    if (!pendingRef.current && (!listing?.available || submitted)) return;
    gate.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const request = pendingRef.current ? parseReportRequest(JSON.parse(pendingRef.current)) : buildReportRequest(listing!.id, crypto.randomUUID(), reason, details);
      const body = JSON.stringify(request), requestKey = key.current;
      if (mode !== 'lookup') {
        await privatePendingStore.save(requestKey, body); pendingRef.current = body;
        if (!active.current) return; setPending(body);
      }
      const result = mode === 'send' ? await submitReport(read, privatePendingStore, requestKey, request) : mode === 'lookup' ?
        await lookupReport(read, privatePendingStore, requestKey, request, sha256) : await abandonReport(read, privatePendingStore, requestKey, request, sha256);
      accept(result, body);
    } catch (failure) {
      if (active.current) { if (failure instanceof PendingStoreError) setReady(false); setError(failure instanceof Error ? failure.message : '尚未確認結果，原操作仍保留。'); }
    } finally { gate.current = false; if (active.current) setBusy(false); }
  }
  const request = pending ? parseReportRequest(JSON.parse(pending)) : null;
  return <MarketplaceDialog title={listing ? `檢舉商品：${listing.title}` : '我的商品檢舉'} onClose={onClose}>
    <div className="space-y-4"><p className="text-sm text-gray-600">只有本人及平台審核人員可見。送出不會立即下架；請勿填入密碼、證件或完整住址。</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-green-50 p-3">{notice}</p>}
      {!ready && <button type="button" disabled={busy} className={button} onClick={() => void restore()}>重試恢復原檢舉</button>}
      {request ? <section aria-label="待確認檢舉" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold">有一件尚未確認結果的檢舉</h3><p className="break-all text-sm">商品：{request.listingId}</p><p>{REPORT_REASONS.find(([id]) => id === request.reason)![1]}</p>{request.details && <p className="whitespace-pre-wrap break-words">{request.details}</p>}
        <p className="text-sm">查核只讀取回執；重新送出會沿用原識別碼與原內容，不會新增另一件。</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !ready} onClick={() => void run('lookup')}>只查核原回執</button><button className={button} disabled={busy || !ready} onClick={() => void run('send')}>明確重新送出原檢舉</button>
          <button className={button} disabled={busy || !ready} onClick={() => setConfirmFence(true)}>安全放棄未收件操作</button></div>
        {confirmFence && <div role="group" aria-label="確認安全放棄" className="space-y-2"><p>只封存尚未收件的操作；已收件檢舉不會被撤回，也不會刪除商品。</p><button className={button} disabled={busy || !ready} onClick={() => void run('abandon')}>確認安全放棄</button><button className={button} disabled={busy} onClick={() => setConfirmFence(false)}>返回查核</button></div>}
      </section> : listing && !submitted && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run('send'); }}>
        {!listing.available && <p role="alert">商品已停止刊登，不能送出新檢舉。</p>}
        <fieldset disabled={!ready || busy || !listing.available} className="space-y-2"><legend className="mb-2 font-semibold">檢舉原因</legend>{REPORT_REASONS.map(([id, label]) => <label key={id} className="flex min-h-11 items-center gap-3"><input type="radio" name="report-reason" value={id} checked={reason === id} onChange={() => setReason(id)} />{label}</label>)}</fieldset>
        <label className="block">補充說明（選填，最多1000字元）<textarea disabled={!ready || busy || !listing.available} value={details} maxLength={1000} onChange={event => setDetails(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border p-3" /></label>
        <button type="submit" disabled={!ready || busy || !listing.available} className={`${button} bg-green-800 text-white`}>{busy ? '正在確認…' : '送出檢舉'}</button>
      </form>}
      <section aria-label="我的檢舉紀錄" className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">我的檢舉紀錄</h3><button className={button} disabled={busy} onClick={() => void history()}>更新紀錄</button></div>
        {historyError && <p role="alert" className="text-red-800">{historyError}</p>}{!loaded && !historyError && <p role="status">正在讀取紀錄…</p>}{loaded && !items.length && !historyError && <p>尚無已收件紀錄。</p>}
        {items.map(item => <article key={item.id} className="space-y-1 rounded-xl bg-gray-50 p-3"><p className="font-semibold">{REPORT_STATUS_LABELS[item.status]}</p><p>{REPORT_REASONS.find(([id]) => id === item.reason)![1]}</p><p className="break-all text-xs">商品：{item.listingId}</p>{item.details && <p className="whitespace-pre-wrap break-words text-sm">{item.details}</p>}<p className="text-xs text-gray-600">更新：{new Date(item.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（台灣時間）</p></article>)}
        {cursor && <button className={button} disabled={busy} onClick={() => void history(cursor)}>載入更多紀錄</button>}
      </section>
    </div>
  </MarketplaceDialog>;
}
