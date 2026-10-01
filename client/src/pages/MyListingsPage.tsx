import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { earliestExtensionDate, listingEditBody, managementTab, MANAGEMENT_TABS, marketplaceOrigin,
  ManagedListingError, parseManagedListing, parseManagedListingPage } from '../lib/managedListingWeb';
import type { ManagedListing, ManagementTab } from '../lib/managedListingWeb';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import MarketingAssistantWeb from '../components/MarketingAssistantWeb';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function MyListingsPage() {
  const { token, user } = useAuth();
  if (!token || !user) return <div className="max-w-xl mx-auto p-6">請先 <Link className="text-blue-700 underline" to="/login?next=%2Fmy-listings">登入</Link> 再閱覽與管理自己的商品。</div>;
  return <MyListingsSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}

function MyListingsSession({ token, userId }: { token: string; userId: number }) {
  const origin = marketplaceOrigin();
  const [rows, setRows] = useState<ManagedListing[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ManagementTab>('在售'), [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null), [detailId, setDetailId] = useState<string | null>(null);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [price, setPrice] = useState('');
  const [expiryId, setExpiryId] = useState<string | null>(null), [date, setDate] = useState('');
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const active = useRef(true), running = useRef(false);
  function parse(value: unknown) { return parseManagedListing(value, userId, origin, import.meta.env.DEV); }
  async function load(next?: string) {
    if (!active.current || running.current) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const page = parseManagedListingPage(await api<unknown>(token, '/listings/mine?limit=50' + (next ? `&cursor=${next}` : '')), userId, origin, import.meta.env.DEV);
      if (next && page.nextCursor === next) throw new ManagedListingError('商品分頁未前進，請重新載入。');
      if (!active.current) return;
      setRows(old => next ? [...new Map([...old, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.nextCursor); setLoaded(true);
    } catch (failure) { if (active.current) setIssue(failure instanceof ManagedListingError ? failure.message : failure instanceof ApiFailure && failure.status === 401 ? '登入已失效，請重新登入。' : '無法取得我的商品，請確認連線後重試。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, []);

  async function recover(id: string) {
    if (running.current || !active.current) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const latest = parse(await api<unknown>(token, `/listings/${id}`));
      if (latest.id !== id) throw new ManagedListingError();
      if (!active.current) return;
      setRows(old => old.map(row => row.id === id ? latest : row));
      setUnconfirmed(null); setEditing(null); setExpiryId(null);
      setNotice('已重新核對商品最新狀態；原操作未重送。請檢查資訊後再操作。');
    } catch { if (active.current) setIssue('仍無法核對最新商品；原操作不會重送，請稍後只查詢狀態。'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function mutate(item: ManagedListing, path: string, method: 'POST' | 'PATCH', body: object, status: ManagedListing['status'], message: string) {
    if (!active.current || running.current || unconfirmed) return;
    running.current = true; setBusy(true); setIssue(''); setNotice('');
    try {
      const updated = parse(await api<unknown>(token, path, { method, body: JSON.stringify(body) }));
      if (updated.id !== item.id || updated.version !== item.version + 1 || updated.status !== status) throw new ManagedListingError('伺服器回傳版本或狀態不符。');
      if (!active.current) return;
      setRows(old => old.map(row => row.id === item.id ? updated : row)); setEditing(null); setExpiryId(null); setNotice(message);
    } catch (failure) {
      if (!active.current) return;
      setUnconfirmed(item.id);
      setIssue(failure instanceof ApiFailure && failure.status === 409 ? '商品已被更新；請先重新核對最新狀態。' : '操作結果尚未確認；請先查詢最新狀態，勿連續重送。');
    } finally { running.current = false; if (active.current) setBusy(false); }
  }
  function statusAction(item: ManagedListing, action: 'reserve' | 'release' | 'sold' | 'remove', next: ManagedListing['status'], label: string) {
    if (!window.confirm(`確認${label}「${item.title}」？${action === 'remove' ? '移除後不會出現在探索地圖，無法從此頁恢復。' : ''}`)) return;
    void mutate(item, `/listings/${item.id}/status`, 'POST', { expectedVersion: item.version, action }, next, `「${item.title}」已${label}。`);
  }
  function save(item: ManagedListing) {
    try { void mutate(item, `/listings/${item.id}`, 'PATCH', listingEditBody(item, title, description, price), item.status, '商品資訊已更新。'); }
    catch (error) { setIssue(error instanceof Error ? error.message : '請確認商品欄位。'); }
  }
  function extend(item: ManagedListing) {
    const minimum = earliestExtensionDate(item.expiresAt);
    const timestamp = Date.parse(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < minimum || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) { setIssue(`請選擇 ${minimum} 或之後的有效日期。`); return; }
    if (!window.confirm(`確認延長至 ${date}？${managementTab(item) === '已失效' ? '延長後會重新公開顯示在探索地圖。' : ''}`)) return;
    void mutate(item, `/listings/${item.id}/extend`, 'POST', { expectedVersion: item.version, expiryDate: date }, item.status === 'EXPIRED' ? 'ACTIVE' : item.status, `商品已延長至 ${date}。`);
  }
  async function share(item: ManagedListing) {
    const url = `${origin}/listings/${item.id}?v=${item.version}`;
    const text = `看看「${item.title}」｜${item.price === null ? '價格洽詢' : item.price === 0 ? '免費贈送' : `NT$ ${item.price.toLocaleString('zh-TW')}`}：${url}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text, url });
      else { await navigator.clipboard.writeText(text); if (active.current) setNotice('已複製商品分享連結與名稱／價格。'); }
    } catch (error) { if (active.current && !(error instanceof DOMException && error.name === 'AbortError')) setIssue('無法開啟分享或複製連結，請使用下方商品網址。'); }
  }
  const now = Date.now(), visible = rows.filter(item => managementTab(item, now) === tab);
  const blocked = busy || !!unconfirmed;
  return <div className="max-w-3xl mx-auto p-4 space-y-5">
    <Link to="/settings" className="text-blue-700">返回我的／設定</Link>
    <div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold">我的商品</h1><Link to="/sell" className="rounded-xl bg-blue-600 text-white p-3">刊登好物</Link></div>
    <div role="tablist" aria-label="我的商品狀態" className="flex flex-wrap gap-2">{MANAGEMENT_TABS.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name}
      className={`min-h-11 rounded-full px-4 ${tab === name ? 'bg-blue-600 text-white' : 'bg-white border'}`}
      onClick={() => { setTab(name); setEditing(null); setExpiryId(null); }}>{name} ({rows.filter(item => managementTab(item, now) === name).length})</button>)}</div>
    {!!cursor && <p className="text-sm text-gray-600">本頁「{tab}」已載入 {visible.length} 件；全部狀態共已載入 {rows.length} 件，還有更多。</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">{notice}</p>}
    {issue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{issue}</p>}
    {unconfirmed && <Button variant="outline" disabled={busy} onClick={() => void recover(unconfirmed)}>只查詢原商品最新狀態</Button>}
    {!busy && loaded && !visible.length && <p>這個狀態目前沒有已載入商品{cursor ? '；可繼續載入更多。' : '。'}</p>}
    {visible.map(item => {
      const expired = managementTab(item, now) === '已失效';
      const editable = ['DRAFT', 'ACTIVE', 'RESERVED'].includes(item.status) && !expired;
      const source = item.media.find(media => media.capturePurpose !== 'AI_MARKETING');
      return <article key={item.id} aria-label={item.title} className="rounded-2xl bg-white border shadow-sm p-5 space-y-4">
        <div className="flex gap-4"><div className="w-28 shrink-0">{item.media[0] ? <PrivatePhoto id={item.media[0].id} token={token} label={`${item.title}商品縮圖`} /> : <p className="rounded-xl bg-gray-100 p-4">無照片</p>}</div>
          <div className="min-w-0 space-y-1"><h2 className="text-lg font-semibold break-words">{item.title}</h2><p className="font-semibold text-blue-700">{item.price === null ? '售價未填' : item.price === 0 ? '免費贈送' : `NT$ ${item.price.toLocaleString('zh-TW')}`}</p>
            <p>{managementTab(item, now)} · {item.condition === 'USED' ? '二手' : '新品'}</p><p className="text-sm text-gray-600">{item.location ? `${item.location.county}${item.location.district}` : '地點未填'}{item.expiresAt ? ` · 至 ${item.expiresAt.slice(0, 10)}` : ''}</p></div></div>
        {detailId === item.id && <div className="space-y-2"><p className="whitespace-pre-wrap">{item.description || '尚未填寫說明'}</p><p className="text-xs text-gray-600 break-all">分類：{item.category ?? '未分類'} · 建立：{item.createdAt.slice(0, 10)} · 商品編號：{item.id}</p></div>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDetailId(detailId === item.id ? null : item.id)}>{detailId === item.id ? '收合詳情' : '查看詳情'}</Button>
          {item.publishedAt && <><Button variant="outline" onClick={() => void share(item)}>分享連結</Button><Link className="p-2 text-blue-700 underline" to={`/listings/${item.id}?v=${item.version}`}>商品網址</Link></>}
          {editable && <Button variant="outline" disabled={blocked} onClick={() => { setEditing(item.id); setTitle(item.title); setDescription(item.description ?? ''); setPrice(item.price === null ? '' : String(item.price)); }}>編輯資訊</Button>}
          {item.status === 'ACTIVE' && !expired && detailId === item.id && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'reserve', 'RESERVED', '標記保留')}>標記保留</Button>}
          {item.status === 'RESERVED' && !expired && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'release', 'ACTIVE', '恢復在售')}>恢復在售</Button>}
          {['ACTIVE', 'RESERVED'].includes(item.status) && !expired && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'sold', 'SOLD', '標記售出')}>標記售出</Button>}
          {['ACTIVE', 'RESERVED', 'EXPIRED'].includes(item.status) && <Button variant="outline" disabled={blocked} onClick={() => { setExpiryId(item.id); setDate(earliestExtensionDate(item.expiresAt)); }}>延長期限</Button>}
          {['DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED'].includes(item.status) && detailId === item.id && <Button variant="destructive" disabled={blocked} onClick={() => statusAction(item, 'remove', 'REMOVED', '移除')}>移除</Button>}
        </div>
        {expired && <p className="text-sm text-gray-600">此商品已失效；請先延長期限，再編輯或繼續刊登。</p>}
        {item.publishedAt && !['ACTIVE', 'RESERVED'].includes(item.status) && <p className="text-sm text-gray-600">分享連結仍可複製，但其他人只會看到「已停止刊登」。</p>}
        {editing === item.id && <div className="rounded-xl bg-gray-50 p-4 space-y-4"><h3 className="font-semibold">編輯商品資訊</h3>
          <div className="space-y-2"><label htmlFor={`title-${item.id}`}>商品名稱</label><Input id={`title-${item.id}`} disabled={blocked} value={title} onChange={event => setTitle(event.target.value)} maxLength={100} /></div>
          <div className="space-y-2"><label htmlFor={`description-${item.id}`}>商品說明</label><textarea id={`description-${item.id}`} disabled={blocked} className="w-full min-h-32 rounded-xl border p-3" value={description} onChange={event => setDescription(event.target.value)} maxLength={3000} /></div>
          <div className="space-y-2"><label htmlFor={`price-${item.id}`}>售價（NT$，0 代表免費贈送）</label><Input id={`price-${item.id}`} inputMode="decimal" disabled={blocked} value={price} onChange={event => setPrice(event.target.value)} /></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>取消編輯</Button><Button disabled={blocked} onClick={() => save(item)}>儲存修改</Button></div>
          <h3 className="font-semibold">額外選項</h3>
          {source && ['ACTIVE', 'RESERVED'].includes(item.status) && !unconfirmed && <MarketingAssistantWeb token={token} userId={userId} sourceMediaId={source.id} listingId={item.id} getExpectedVersion={()=>item.version}
            beforeStart={async () => { if (busy || title !== item.title || description !== (item.description ?? '') || price !== (item.price === null ? '' : String(item.price))) { setIssue('請先儲存商品資訊，再使用行銷小助手。'); return false; } return true; }}
            beforeApprove={async () => {
              if (!active.current || running.current || unconfirmed || title !== item.title || description !== (item.description ?? '') || price !== (item.price === null ? '' : String(item.price))) return null;
              running.current = true; setBusy(true);
              return () => { if (active.current) { running.current = false; setBusy(false); } };
            }}
            onApproved={async () => {
              const latest = parse(await api<unknown>(token, `/listings/${item.id}`));
              if (!active.current) return;
              if (latest.id !== item.id) throw new ManagedListingError();
              setRows(old => old.map(row => row.id === item.id ? latest : row));
              setTitle(latest.title); setDescription(latest.description ?? ''); setPrice(latest.price === null ? '' : String(latest.price));
            }} />}
        </div>}
        {expiryId === item.id && <div className="rounded-xl bg-gray-50 p-4 space-y-3"><label htmlFor={`expiry-${item.id}`}>新的失效日期（台灣時間）</label>
          <Input id={`expiry-${item.id}`} type="date" min={earliestExtensionDate(item.expiresAt)} value={date} disabled={blocked} onChange={event => setDate(event.target.value)} />
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setExpiryId(null)}>取消延長</Button><Button disabled={blocked} onClick={() => extend(item)}>確認延長</Button></div></div>}
      </article>;
    })}
    {busy && <p role="status">載入或確認中…</p>}
    <div className="flex flex-wrap gap-3">{cursor && <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}>載入更多我的商品</Button>}
      <Button variant="outline" disabled={busy} onClick={() => void load()}>重新載入</Button></div>
  </div>;
}
