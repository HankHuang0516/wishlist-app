import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure } from '../lib/marketplaceApi';
import PrivatePhoto from './PrivateMarketplacePhoto';
type MarketingMedia = { id: string; marketingSlot: number; marketingSelected: boolean };
type MarketingJob = { id: string; status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'FAILED';
  parentJobId: string | null; deliveredAt: string | null; copy: string | null; generatedMedia: MarketingMedia[];
  previousMedia?: MarketingMedia[]; selectedMediaIds?: string[] };

export default function MarketingAssistantWeb({ token, sourceMediaId, listingId, beforeStart, onApproved }: { token: string; sourceMediaId: string; listingId?: string;
  beforeStart: () => Promise<boolean>; onApproved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(false), [job, setJob] = useState<MarketingJob | null>(null);
  const [copy, setCopy] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [adjustment, setAdjustment] = useState(''), [slots, setSlots] = useState<number[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const sortList = useRef<HTMLOListElement>(null);
  const running = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    void Promise.all([api<{ available: boolean }>(token, '/marketing/availability'),
      api<{ job: { id: string } | null }>(token, `/marketing/jobs?sourceMediaId=${sourceMediaId}`)])
      .then(([access, latest]) => { if (!alive) return; setEnabled(access.available === true);
        if (latest.job?.id) void api<MarketingJob>(token, `/marketing/jobs/${latest.job.id}`)
          .then(value => { if (alive) setJob(value); }).catch(() => undefined); })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, [token, sourceMediaId]);
  useEffect(() => {
    if (!job || !['PENDING', 'PROCESSING'].includes(job.status)) return;
    let alive = true;
    const timer = window.setInterval(() => { void api<MarketingJob>(token, `/marketing/jobs/${job.id}`)
      .then(value => { if (alive) setJob(value); }).catch(() => { if (alive) setError('排隊狀態暫時無法讀取；資料仍安全保存。'); }); }, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token, job?.id, job?.status]);
  useEffect(() => { if (!job || !['REVIEW', 'COMPLETED'].includes(job.status)) return;
    setCopy(job.copy ?? ''); setSelected(job.selectedMediaIds?.length
      ? job.selectedMediaIds : job.generatedMedia.map(media => media.id)); }, [job?.id, job?.status]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  if (!enabled) return null;
  const deadline = job?.deliveredAt ? Date.parse(job.deliveredAt) + 7 * 86_400_000 : 0;
  const remaining = Math.max(0, deadline - now);
  const mayAdjust = !!job && !job.parentJobId && ['REVIEW', 'COMPLETED'].includes(job.status) && remaining > 0;
  async function start() {
    if (running.current || !active.current) return;
    running.current = true;
    setBusy(true); setError('');
    try {
      if (!await beforeStart()) { if (active.current) setError('請先儲存並確認商品名稱、說明與售價。'); return; }
      if (!active.current) return;
      const made = await api<{ id: string; status: MarketingJob['status'] }>(token, '/marketing/jobs', {
      method: 'POST', body: JSON.stringify({ clientRequestId: crypto.randomUUID(), sourceMediaId, ...(listingId ? { listingId } : {}) }) });
      if (!active.current) return;
      setJob({ id: made.id, status: made.status, parentJobId: null, deliveredAt: null, copy: null, generatedMedia: [] }); }
    catch (failure) { if (active.current) setError(failure instanceof ApiFailure && failure.code === 'MONTHLY_LIMIT'
      ? '免費版每月 3 次已用完。尊榮版每月 100 次、10 次包 US$1 尚待付款驗證開放。'
      : '未能加入排隊；請確認私人草稿已儲存。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function approve() {
    if (running.current || !active.current) return;
    if (!job || !selected.length) { setError('請至少選一張行銷圖。'); return; }
    running.current = true; setBusy(true); setError('');
    try { await api(token, `/marketing/jobs/${job.id}/approve`, { method: 'POST',
      body: JSON.stringify({ selectedMediaIds: selected, copy }) });
      const updated = await api<MarketingJob>(token, `/marketing/jobs/${job.id}`);
      if (!active.current) return;
      setJob(updated); await onApproved(); if (active.current) setNotice(listingId ? '已更新商品照片與文案；實拍原圖保留。' : '已加入私人草稿；實拍原圖保留。'); }
    catch { if (active.current) setError('尚未套用：商品資料可能變更，請重新載入核對。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function revise() {
    if (running.current || !active.current) return;
    if (!job || !slots.length || adjustment.trim().length < 3) { setError('請勾選照片並描述要調整的地方。'); return; }
    running.current = true; setBusy(true); setError('');
    try { const made = await api<{ id: string; status: MarketingJob['status'] }>(token, `/marketing/jobs/${job.id}/revision`, {
      method: 'POST', body: JSON.stringify({ clientRequestId: crypto.randomUUID(), prompt: adjustment.trim(), slots }) });
      if (!active.current) return;
      setJob({ id: made.id, status: made.status, parentJobId: job.id, deliveredAt: null, copy: null, generatedMedia: [] });
      setNotice('免費調整已排隊；未勾選的照片保留。'); }
    catch { if (active.current) setError('免費調整未排隊；請確認仍在七天期限內且尚未使用。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  const choices = [...(job?.generatedMedia ?? []), ...(job?.previousMedia ?? [])];
  function toggle(id: string) { setSelected(old => {
    if (old.includes(id)) return old.filter(value => value !== id);
    const slot = choices.find(media => media.id === id)?.marketingSlot;
    const at = old.findIndex(value => choices.find(media => media.id === value)?.marketingSlot === slot);
    if (at < 0) return [...old, id];
    const updated = [...old]; updated[at] = id; return updated;
  }); }
  function move(id: string, to: number) { if (busy) return; setSelected(old => {
    const from = old.indexOf(id);
    if (from < 0 || to < 0 || to >= old.length) return old;
    const updated = [...old]; updated.splice(from, 1); updated.splice(to, 0, id); return updated;
  }); }
  if (!expanded) return <button type="button" aria-expanded={false} aria-label="開啟行銷小助手 Beta"
    className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-left" onClick={() => setExpanded(true)}>
    <span className="rounded-xl bg-orange-600 p-3 text-white" aria-hidden>✦</span><span><span className="block font-semibold">行銷小助手 · Beta</span><span className="text-sm text-stone-600">生成商品圖與文案，提升曝光</span></span><span aria-hidden className="ml-auto">›</span>
  </button>;
  return <section aria-label="行銷小助手 Beta" className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm">
    <button type="button" aria-expanded={true} aria-label="收合行銷小助手 Beta" onClick={() => setExpanded(false)} className="flex w-full justify-between min-h-11 font-semibold">行銷小助手 · Beta<span aria-hidden>⌃</span></button>
    <p className="mt-1 text-stone-600">原始實拍照保留；AI 圖僅為行銷示意，確認前不公開。</p>
    {!job || job.status === 'FAILED' ? <button type="button" disabled={busy} onClick={() => void start()}
      className="mt-3 min-h-11 rounded-xl bg-orange-600 px-4 font-semibold text-white">{job ? '重新排隊生成四圖' : '生成四張行銷圖'}</button>
      : ['PENDING', 'PROCESSING'].includes(job.status) ? <p role="status" className="mt-3 text-orange-900">
        {job.status === 'PENDING' ? '已排隊，稍後自動更新' : '正在生成四張圖片與文案'}</p>
        : <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{job.generatedMedia.map(media => <button key={media.id}
            type="button" role="checkbox" disabled={busy} aria-checked={selected.includes(media.id)} onClick={() => toggle(media.id)} className="rounded-xl border bg-white p-2 text-left">
            <PrivatePhoto id={media.id} token={token} /><span>{selected.includes(media.id) ? '☑ 選用' : '☐ 不選用'} · AI 示意</span>
          </button>)}</div>
          {!!job.previousMedia?.length && <div className="mt-4"><p>調整前的照片（可點選保留原版）</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{job.previousMedia.map(media => <button key={media.id}
              type="button" role="checkbox" disabled={busy} aria-checked={selected.includes(media.id)} onClick={() => toggle(media.id)}
              className="rounded-xl border bg-white p-2 text-left"><PrivatePhoto id={media.id} token={token} />
              <span>{selected.includes(media.id) ? '☑ 保留原版' : '☐ 選原版'} · 圖 {media.marketingSlot}</span>
            </button>)}</div></div>}
          {!!selected.length && <div className="mt-4"><p className="font-semibold">拖放公開順序（第一張為封面）</p><p id={`sort-help-${sourceMediaId}`} className="text-stone-600">拖動右側把手；也可聚焦把手後按鍵盤上下方向鍵調整。</p>
            <ol ref={sortList}>{selected.map((id, index) => <li key={id} className={`mt-2 flex items-center gap-3 rounded-xl border p-3 ${dragging === id ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-white'}`}>
              <span className="flex-1">{index === 0 ? '封面' : index + 1}. 圖 {choices.find(media => media.id === id)?.marketingSlot}</span>
              <button type="button" disabled={busy} aria-label={`拖放圖 ${choices.find(media => media.id === id)?.marketingSlot}，目前第 ${index + 1} 張`} aria-describedby={`sort-help-${sourceMediaId}`}
                className="min-h-11 cursor-grab touch-none rounded-lg border px-3 active:cursor-grabbing"
                onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); move(id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}
                onPointerDown={event => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(id); }}
                onPointerUp={event => {
                  if (!dragging || busy) return;
                  const items = [...(sortList.current?.children ?? [])];
                  const centers = items.map(element => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; });
                  const to = centers.reduce((nearest, center, at) => Math.abs(event.clientY - center) < Math.abs(event.clientY - centers[nearest]) ? at : nearest, 0);
                  move(id, to); setDragging(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => setDragging(null)}>☰ 拖放排序</button>
            </li>)}</ol><p role="status" className="sr-only">目前照片順序：{selected.map(id => `圖 ${choices.find(media => media.id === id)?.marketingSlot}`).join('、')}</p></div>}
          <label className="mt-4 block">行銷文案（可修改後確認）<textarea aria-label="編輯行銷文案"
            className="mt-1 min-h-28 w-full rounded-xl border p-3" maxLength={1200} disabled={busy || job.status === 'COMPLETED'} value={copy} onChange={event => setCopy(event.target.value)} /></label>
          {job.status === 'REVIEW' && <button type="button" disabled={busy || job.generatedMedia.length !== 4}
            onClick={() => void approve()} className="mt-3 min-h-11 rounded-xl bg-orange-600 px-4 font-semibold text-white">確認照片與文案</button>}
          {mayAdjust && <div className="mt-4 border-t pt-3"><p className="font-semibold text-red-700">免費調整剩餘 {Math.floor(remaining / 86_400_000)}天 {Math.floor(remaining % 86_400_000 / 3_600_000)}時 {Math.floor(remaining % 3_600_000 / 60_000)}分</p>
            <p className="mt-2">勾選要重新生成的圖片（最多一次）</p><div className="mt-2 flex gap-3">{[1, 2, 3, 4].map(slot => <label key={slot}>
              <input type="checkbox" checked={slots.includes(slot)} onChange={event => setSlots(old => event.target.checked ? [...old, slot] : old.filter(value => value !== slot))} /> 圖 {slot}</label>)}</div>
            <input aria-label="描述要調整的地方" className="mt-3 w-full rounded-xl border p-3" maxLength={500} placeholder="例如：改成更明亮的背景" value={adjustment} onChange={event => setAdjustment(event.target.value)} />
            <button type="button" disabled={busy} onClick={() => void revise()} className="mt-3 min-h-11 rounded-xl border px-4">免費調整一次</button>
          </div>}
        </>}
    {notice && <p role="status" className="mt-2 text-green-800">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </section>;
}
