import { managementText as t, managementEnglish } from '../lib/listingManagementCopy';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { earliestExtensionDate, managementTab, MANAGEMENT_TABS, marketplaceOrigin,
  ManagedListingError, parseManagedListing, parseManagedListingPage } from '../lib/managedListingWeb';
import type { ManagedListing, ManagementTab } from '../lib/managedListingWeb';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import DateField from '../components/DateField';
import ListingEditForm from '../components/ListingEditForm';
import { parseListingEditDraft } from '../lib/listingEditDraft';
import type { ListingEditFields } from '../lib/listingEditDraft';
import { Button } from '../components/ui/Button';
import { getFullApiUrl } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { abandonManagement, managementJournal, managementTargetStatus, parseManagementJournal, readManagement, sendManagement } from '../lib/listingManagementWeb';
import type { ManagementBody, ManagementJournal, ManagementResult } from '../lib/listingManagementWeb';

export default function MyListingsPage() {
  const { token, user } = useAuth();
  if (!token || !user) return <div className="max-w-xl mx-auto p-6">{t("請先 ")}<Link className="text-blue-700 underline" to="/login?next=%2Fmy-listings">{t("登入")}</Link>{t(" 再閱覽與管理自己的商品。")}</div>;
  return <MyListingsSession key={`${user.id}:${token}`} token={token} userId={user.id} />;
}

function MyListingsSession({ token, userId }: { token: string; userId: number }) {
  const origin = marketplaceOrigin();
  const [rows, setRows] = useState<ManagedListing[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ManagementTab>('在售'), [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null), [detailId, setDetailId] = useState<string | null>(null);
  const [editSeed, setEditSeed] = useState<ListingEditFields | undefined>();
  const [expiryId, setExpiryId] = useState<string | null>(null), [date, setDate] = useState('');
  const [pendingRaw, setPendingRaw] = useState<string | null>(null), [journal, setJournal] = useState<ManagementJournal | null>(null);
  const [outcome, setOutcome] = useState<ManagementResult | null>(null), [latest, setLatest] = useState<ManagedListing | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false), [cancelRequested, setCancelRequested] = useState(false);
  const pendingKey = useRef('');
  const unconfirmed = pendingRaw ? journal?.body.listingId ?? 'restoring' : null;
  const [loaded, setLoaded] = useState(false);
  const active = useRef(true), running = useRef(false), generation = useRef(0);
  const seenCursors = useRef(new Set<string>());
  const isCurrent = (epoch: number) => active.current && generation.current === epoch;
  function parse(value: unknown) { return parseManagedListing(value, userId, origin, import.meta.env.DEV); }
  async function load(next?: string) {
    const epoch = generation.current;
    if (!isCurrent(epoch) || running.current) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const page = parseManagedListingPage(await api<unknown>(token, '/listings/mine?limit=50' + (next ? `&cursor=${next}` : '')), userId, origin, import.meta.env.DEV);
      if (!isCurrent(epoch)) return;
      if (next && (page.nextCursor !== null && seenCursors.current.has(page.nextCursor) ||
          page.items.length > 0 && page.items.every(item => rows.some(old => old.id === item.id))))
        throw new ManagedListingError(t("商品分頁未前進，請重新載入。"));
      if (!next) seenCursors.current.clear();
      if (page.nextCursor) seenCursors.current.add(page.nextCursor);
      setRows(old => {
        if (!next) return page.items;
        const merged = new Map(old.map(item => [item.id, item]));
        for (const item of page.items) if (!merged.has(item.id) || merged.get(item.id)!.version <= item.version) merged.set(item.id, item);
        return [...merged.values()];
      });
      setCursor(page.nextCursor); setLoaded(true);
    } catch (failure) { if (isCurrent(epoch)) setIssue(failure instanceof ManagedListingError ? failure.message : failure instanceof ApiFailure && failure.status === 400 && next ? t("商品分頁游標已失效，請重新載入；已載入的商品仍保留。") : failure instanceof ApiFailure && failure.status === 401 ? t("登入已失效，請重新登入。") : t("無法取得我的商品，請確認連線後重試。")); }
    finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
  }
  async function restore(checkReceipt = false) {
    const epoch = generation.current;
    setPendingLoaded(false);
    try {
      const key = await pendingRequestKey(getFullApiUrl(), userId, 'listing-management');
      const raw = await privatePendingStore.get(key), value = raw ? await parseManagementJournal(raw) : null;
      if (!isCurrent(epoch)) return;
      pendingKey.current = key; setPendingRaw(raw); setJournal(value); setOutcome(null); setLatest(null); setCancelRequested(false); setPendingLoaded(true);
      if (raw) setIssue(t("有原商品操作待查核；重開只讀取回執，不會自動重送。"));
      if (raw && checkReceipt) {
        running.current = true; setBusy(true);
        try { const result = await readManagement(token, raw); if (isCurrent(epoch)) { setIssue(''); await showResult(raw, result); } }
        catch { if (isCurrent(epoch)) setIssue(t("仍無法取得原操作回執；紀錄保留，不會自動重送。")); }
        finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
      }
    } catch { if (isCurrent(epoch)) setIssue(t("無法安全恢復商品操作紀錄；請重新載入恢復，未查核前不會送出。")); }
  }
  useEffect(() => {
    active.current = true; const epoch = ++generation.current; running.current = false;
    void (async () => { await load(); if (isCurrent(epoch)) await restore(true); })();
    return () => { active.current = false; generation.current++; };
  }, []);

  async function showResult(raw: string, result: ManagementResult) {
    const epoch = generation.current;
    const saved = await parseManagementJournal(raw);
    if (!isCurrent(epoch)) return;
    setOutcome(result); setLatest(null); setCancelRequested(false);
    setNotice(result.state === 'APPLIED' ? t("原商品操作已確認完成；不會再次套用。") : result.state === 'CONFLICT' ? t("原商品操作未套用；請比較最新資料與您的修改。") : t("原商品操作已取消；此識別碼不會再套用。"));
    try {
      const current = parse(await api<unknown>(token, `/listings/${saved.body.listingId}`));
      if (current.id !== saved.body.listingId || current.version < (result.appliedVersion ?? saved.body.expectedVersion)) throw new ManagedListingError();
      if (result.state === 'APPLIED' && current.version === result.appliedVersion) {
        const b = saved.body;
        if (current.status !== managementTargetStatus(b, saved.original) ||
          b.kind === 'EDIT' && (current.title !== b.changes.title || b.changes.description !== undefined && current.description !== b.changes.description || b.changes.price !== undefined && current.price !== b.changes.price) ||
          b.kind === 'EXTEND' && current.expiresAt?.slice(0,10) !== b.changes.expiryDate) throw new ManagedListingError();
      }
      if (!isCurrent(epoch)) return;
      setRows(old => old.some(row => row.id === current.id) ? old.map(row => row.id === current.id ? current : row) : [...old, current]);
      setLatest(current); setEditing(null); setExpiryId(null);
      if (result.state === 'APPLIED' && saved.body.kind === 'EDIT') {
        try {
          const key = await pendingRequestKey(getFullApiUrl(), userId, 'listing-edit.' + current.id);
          const rawDraft = await privatePendingStore.get(key);
          if (!isCurrent(epoch)) return;
          if (rawDraft) {
            const draft = parseListingEditDraft(rawDraft, current.id), changes = saved.body.changes;
            if (draft.baseVersion === saved.body.expectedVersion && draft.fields.title.trim() === changes.title &&
              draft.fields.description.trim() === (changes.description ?? '') &&
              (draft.fields.price.trim() ? Number(draft.fields.price) : null) === (changes.price ?? null))
              await privatePendingStore.clear(key, rawDraft);
          }
        } catch { if (isCurrent(epoch)) setIssue(t("原商品操作已完成，但本機編輯草稿尚未清理；草稿仍保留，請重開編輯比較。")); }
      }
    } catch { if (isCurrent(epoch)) setIssue(t("原操作回執已確認，但目前商品資料仍無法安全核對；紀錄已保留，請只查詢最新狀態。")); }
  }
  async function recover() {
    const epoch = generation.current;
    if (running.current || !isCurrent(epoch)) return;
    if (!pendingRaw || !pendingLoaded) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const result = await readManagement(token, pendingRaw);
      if (isCurrent(epoch)) await showResult(pendingRaw, result);
    } catch { if (isCurrent(epoch)) setIssue(t("仍無法核對最新商品；原操作不會重送，請稍後只查詢狀態。")); }
    finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
  }
  async function mutate(item: ManagedListing, kind: ManagementBody['kind'], changes: Record<string, unknown>) {
    const epoch = generation.current;
    if (!isCurrent(epoch) || running.current || unconfirmed || !pendingLoaded) return false;
    running.current = true; setBusy(true); setIssue(''); setNotice('');
    let saved = false;
    try {
      const raw = await managementJournal({ kind, listingId: item.id, expectedVersion: item.version, changes }, item);
      if (!isCurrent(epoch)) return false;
      await privatePendingStore.save(pendingKey.current, raw);
      saved = true;
      if (!isCurrent(epoch)) return false;
      setPendingRaw(raw); setJournal(await parseManagementJournal(raw)); setOutcome(null); setLatest(null);
      const result = await sendManagement(token, raw, privatePendingStore, pendingKey.current, () => isCurrent(epoch));
      if (isCurrent(epoch)) await showResult(raw, result);
      return result.state === 'APPLIED';
    } catch (failure) {
      if (!isCurrent(epoch)) return false;
      setIssue(!saved ? t("無法安全保存原操作；未送出。請重新載入恢復後再試。") : failure instanceof ApiFailure && failure.status === 409 ? t("原操作內容衝突；請先查核回執，勿重送或覆蓋。") : t("操作結果尚未確認；紀錄已保留，請先查核回執，勿連續重送。"));
      // A failed CAS can mean another tab owns a different pending operation.
      // Re-read storage before permitting any new mutation.
      await restore();
      return false;
    } finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
  }
  async function pendingAction(action: 'retry' | 'abandon') {
    const epoch = generation.current;
    if (!isCurrent(epoch) || running.current || !pendingRaw || outcome || !pendingLoaded) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const result = action === 'retry' ? await sendManagement(token, pendingRaw, privatePendingStore, pendingKey.current, () => isCurrent(epoch)) : await abandonManagement(token, pendingRaw, () => isCurrent(epoch));
      if (isCurrent(epoch)) await showResult(pendingRaw, result);
    } catch { if (isCurrent(epoch)) setIssue(t("仍未取得原操作回執；紀錄保留，不會自動重送。")); }
    finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
  }
  async function clearPending(keepEdit = false) {
    const epoch = generation.current;
    if (!isCurrent(epoch) || running.current || !pendingRaw || !journal || !outcome || !pendingLoaded) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      if (!await privatePendingStore.clear(pendingKey.current, pendingRaw)) throw new Error();
      if (!isCurrent(epoch)) return;
      if (keepEdit && latest && journal.body.kind === 'EDIT') {
        const changes = journal.body.changes;
        setEditSeed({ title: String(changes.title), description: typeof changes.description === 'string' ? changes.description : latest.description ?? '', price: typeof changes.price === 'number' ? String(changes.price) : latest.price === null ? '' : String(latest.price) }); setEditing(latest.id);
        setTab(managementTab(latest));
      } else { setEditing(null); setExpiryId(null); }
      setPendingRaw(null); setJournal(null); setOutcome(null); setLatest(null); setCancelRequested(false);
      setNotice(keepEdit ? t("已保留您的修改；尚未送出。請逐欄比較後明確儲存，會使用最新版本與新操作識別碼。") : t("已讀原操作結果並清理此份本機紀錄；沒有重送。"));
    } catch { if (isCurrent(epoch)) { setPendingLoaded(false); setIssue(t("紀錄已被另一分頁更新或清理；請重新載入恢復，不會清除其他操作。")); } }
    finally { if (isCurrent(epoch)) { running.current = false; setBusy(false); } }
  }
  function statusAction(item: ManagedListing, action: 'reserve' | 'release' | 'sold' | 'remove', _next: ManagedListing['status'], label: string) {
    if (!window.confirm(t("確認{action}「{title}」？{warning}", { action: label, title: item.title, warning: action === 'remove' ? t("移除後不會出現在探索地圖，無法從此頁恢復。") : '' }))) return;
    void mutate(item, 'STATUS', { action });
  }
  function extend(item: ManagedListing) {
    const minimum = earliestExtensionDate(item.expiresAt);
    const timestamp = Date.parse(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < minimum || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) { setIssue(t("請選擇 {minimum} 或之後的有效日期。", { minimum })); return; }
    if (!window.confirm(t("確認延長至 {date}？{warning}", { date, warning: t("延長刊登不會自動更新地圖顯示。") }))) return;
    void mutate(item, 'EXTEND', { expiryDate: date });
  }
  async function mapPresence(item: ManagedListing, display: boolean) {
    const epoch = generation.current;
    if (!isCurrent(epoch) || running.current || unconfirmed || !pendingLoaded) return;
    if (!window.confirm(display ? t("這次顯示商品約 2 公里模糊位置一小時？可取消；不顯示使用者即時位置，不會自動續期。") : t("停止地圖顯示？商品刊登及聊天仍保留。"))) return;
    running.current = true; setBusy(true); setIssue(''); setNotice('');
    try {
      const result = parse(await api<unknown>(token, `/listings/${item.id}/map-presence`, {method:'PUT',body:JSON.stringify({expectedVersion:item.version,display,consentToMap:display})}));
      if (result.id !== item.id || result.version !== item.version + 1 || display && (!result.mapVisibleUntil || Date.parse(result.mapVisibleUntil) <= Date.now()) || !display && result.mapVisibleUntil !== null) throw new ManagedListingError();
      if (isCurrent(epoch)) { setRows(old=>old.map(row=>row.id===item.id?result:row)); setNotice(display ? t("已確認這次地圖顯示，一小時後停止；不會自動續期。") : t("已停止地圖顯示。")); }
    } catch { if (isCurrent(epoch)) setIssue(t("地圖顯示尚未確認；請重新載入查看最新期限，不會自動重送。")); }
    finally { if (isCurrent(epoch)) { running.current=false;setBusy(false); } }
  }
  async function share(item: ManagedListing) {
    const epoch = generation.current;
    const url = `${origin}/listings/${item.id}?v=${item.version}`;
    const text = t("看看「{title}」｜{price}：{url}", { title: item.title, price: item.price === null ? t("價格洽詢") : item.price === 0 ? t("免費贈送") : `NT$ ${item.price.toLocaleString(managementEnglish() ? 'en-US' : 'zh-TW')}`, url });
    try {
      if (navigator.share) await navigator.share({ title: item.title, text, url });
      else { await navigator.clipboard.writeText(text); if (isCurrent(epoch)) setNotice(t("已複製商品分享連結與名稱／價格。")); }
    } catch (error) { if (isCurrent(epoch) && !(error instanceof DOMException && error.name === 'AbortError')) setIssue(t("無法開啟分享或複製連結，請使用下方商品網址。")); }
  }
  const now = Date.now(), visible = rows.filter(item => managementTab(item, now) === tab);
  const blocked = busy || !!unconfirmed || !pendingLoaded;
  return <div className="max-w-3xl mx-auto p-4 space-y-5 [&_button]:min-h-11">
    <Link to="/settings" className="text-blue-700">{t("返回我的／設定")}</Link>
    <div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-bold">{t("我的商品")}</h1><Link to="/sell" className="rounded-xl bg-blue-600 text-white p-3">{t("刊登好物")}</Link></div>
    <div role="tablist" aria-label={t("我的商品狀態")} className="flex flex-wrap gap-2">{MANAGEMENT_TABS.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name}
      className={`min-h-11 rounded-full px-4 ${tab === name ? 'bg-blue-600 text-white' : 'bg-white border'}`}
      onClick={() => { setTab(name); setEditing(null); setExpiryId(null); }}>{t(name)} ({rows.filter(item => managementTab(item, now) === name).length})</button>)}</div>
    {!!cursor && <p className="text-sm text-gray-600">{t("本頁「{tab}」已載入 {visible} 件；全部狀態共已載入 {total} 件，還有更多。", { tab: t(tab), visible: visible.length, total: rows.length })}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">{notice}</p>}
    {issue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{issue}</p>}
    {!pendingLoaded && <Button variant="outline" disabled={busy} onClick={() => void restore(true)}>{t("重新載入商品操作紀錄")}</Button>}
    {journal && <section aria-label={t("原商品操作與最新資料比較")} className="rounded-xl border bg-white p-4 space-y-3">
      <h2 className="font-bold">{t("原商品操作 · ")}{journal.body.kind === 'EDIT' ? t("編輯資訊") : journal.body.kind === 'EXTEND' ? t("延長期限") : t("狀態變更")}</h2>
      <p className="text-sm">{t("商品：")}{journal.original.title}{t(" · 原版本 ")}{journal.body.expectedVersion} · {outcome?.state === 'APPLIED' ? t("已完成版本 {version}", { version: outcome.appliedVersion! }) : outcome?.state === 'CONFLICT' ? t("未套用，資料有衝突或不符合規則") : outcome?.state === 'ABANDONED' ? t("已取消") : t("待查核")}</p>
      <div className="grid gap-3 sm:grid-cols-2 text-sm break-words">
        <div className="rounded-lg bg-blue-50 p-3"><h3 className="font-semibold">{t("您的原操作內容（已保存）")}</h3>
          {journal.body.kind === 'EDIT' ? <><p>{t("商品名稱：")}{String(journal.body.changes.title)}</p><p className="whitespace-pre-wrap">{t("商品說明：")}{String(journal.body.changes.description ?? journal.original.description ?? t("未填"))}</p><p>{t("售價（NT$）：")}{String(journal.body.changes.price ?? journal.original.price ?? t("未填"))}</p></>
            : journal.body.kind === 'EXTEND' ? <p>{t("新的失效日期（台灣時間）：")}{String(journal.body.changes.expiryDate)}</p> : <p>{t("動作：")}{({reserve:t("標記保留"),release:t("恢復在售"),sold:t("標記售出"),remove:t("移除")} as Record<string,string>)[String(journal.body.changes.action)]}</p>}
        </div><div className="rounded-lg bg-gray-50 p-3"><h3 className="font-semibold">{t("後台最新商品資料（只讀）")}</h3>
          {latest ? <><p>{t("版本：")}{latest.version}{outcome?.appliedVersion && latest.version > outcome.appliedVersion ? t(" · 原操作完成後又有更新") : ''}</p><p>{t("商品名稱：")}{latest.title}</p><p className="whitespace-pre-wrap">{t("商品說明：")}{latest.description ?? t("未填")}</p><p>{t("售價（NT$）：")}{latest.price ?? t("未填")}</p><p>{t("狀態：")}{t(managementTab(latest))}</p><p>{t("失效日期（台灣時間）：")}{latest.expiresAt?.slice(0,10) ?? t("未設定")}</p></> : <p>{t("尚未核對；不會用目前卡片推定原操作成功。")}</p>}
        </div></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !pendingLoaded} onClick={() => void recover()}>{t("只查核原操作回執與最新商品")}</Button>
        {!outcome ? <><Button variant="outline" disabled={busy || !pendingLoaded} onClick={() => void pendingAction('retry')}>{t("明確重試同一原操作")}</Button>
          {!cancelRequested ? <Button variant="outline" disabled={busy || !pendingLoaded} onClick={() => setCancelRequested(true)}>{t("取消原操作…")}</Button> : <><span>{t("若已完成會保留真實結果；取消不會刪除商品。")}</span><Button disabled={busy || !pendingLoaded} onClick={() => void pendingAction('abandon')}>{t("確認取消此原操作")}</Button><Button variant="outline" disabled={busy} onClick={() => setCancelRequested(false)}>{t("返回查核")}</Button></>}
        </> : <><Button disabled={busy || !pendingLoaded} onClick={() => void clearPending()}>{t("已讀結果，清理本機紀錄")}</Button>
          {outcome.state === 'CONFLICT' && journal.body.kind === 'EDIT' && latest && ['DRAFT','ACTIVE','RESERVED'].includes(latest.status) && managementTab(latest) !== '已失效' && <Button variant="outline" disabled={busy || !pendingLoaded} onClick={() => void clearPending(true)}>{t("保留我的修改，以最新版本重新編輯")}</Button>}</>}
      </div></section>}
    {!busy && loaded && !visible.length && <p>{t("這個狀態目前沒有已載入商品")}{cursor ? t("；可繼續載入更多。") : t("。")}</p>}
    {visible.map(item => {
      const expired = managementTab(item, now) === '已失效';
      const editable = ['DRAFT', 'ACTIVE', 'RESERVED'].includes(item.status) && !expired;
      return <article key={item.id} aria-label={item.title} className="rounded-2xl bg-white border shadow-sm p-5 space-y-4">
        <div className="flex gap-4"><div className="w-28 shrink-0">{item.media[0] ? <PrivatePhoto id={item.media[0].id} token={token} label={t("{title}商品縮圖", { title: item.title })} /> : <p className="rounded-xl bg-gray-100 p-4">{t("無照片")}</p>}</div>
          <div className="min-w-0 space-y-1"><h2 className="text-lg font-semibold break-words">{item.title}</h2><p className="font-semibold text-blue-700">{item.price === null ? t("售價未填") : item.price === 0 ? t("免費贈送") : `NT$ ${item.price.toLocaleString(managementEnglish() ? 'en-US' : 'zh-TW')}`}</p>
            <p>{t(managementTab(item, now))} · {item.condition === 'USED' ? t("二手") : t("新品")}</p><p className="text-sm text-gray-600">{item.location ? `${item.location.county}${item.location.district}` : t("地點未填")}{item.expiresAt ? t(" · 至 {date}", { date: item.expiresAt.slice(0, 10) }) : ''}</p></div></div>
        {detailId === item.id && <div className="space-y-2"><p className="whitespace-pre-wrap">{item.description || t("尚未填寫說明")}</p><p className="text-xs text-gray-600 break-all">{t("分類：")}{item.category ?? t("未分類")}{t(" · 建立：")}{item.createdAt.slice(0, 10)}{t(" · 商品編號：")}{item.id}</p></div>}
        <p className="text-sm text-gray-600">{item.mapVisibleUntil && Date.parse(item.mapVisibleUntil) > now ? t("地圖顯示至 {time}；不會自動續期。", {time:new Date(item.mapVisibleUntil).toLocaleTimeString()}) : t("目前不在地圖顯示；需手動確認這次顯示。")}</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDetailId(detailId === item.id ? null : item.id)}>{detailId === item.id ? t("收合詳情") : t("查看詳情")}</Button>
          {item.publishedAt && <><Button variant="outline" onClick={() => void share(item)}>{t("分享連結")}</Button><Link className="p-2 text-blue-700 underline" to={`/listings/${item.id}?v=${item.version}`}>{t("商品網址")}</Link></>}
          {['ACTIVE','RESERVED'].includes(item.status) && !expired && <><Button variant="outline" disabled={blocked} onClick={()=>void mapPresence(item,true)}>{t("手動顯示地圖一小時")}</Button>{item.mapVisibleUntil && Date.parse(item.mapVisibleUntil)>now && <Button variant="outline" disabled={blocked} onClick={()=>void mapPresence(item,false)}>{t("停止地圖顯示")}</Button>}</>}
          {editable && <Button variant="outline" disabled={blocked} onClick={() => { setEditSeed(undefined); setEditing(item.id); }}>{t("編輯資訊")}</Button>}
          {item.status === 'ACTIVE' && !expired && detailId === item.id && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'reserve', 'RESERVED', t("標記保留"))}>{t("標記保留")}</Button>}
          {item.status === 'RESERVED' && !expired && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'release', 'ACTIVE', t("恢復在售"))}>{t("恢復在售")}</Button>}
          {['ACTIVE', 'RESERVED'].includes(item.status) && !expired && <Button variant="outline" disabled={blocked} onClick={() => statusAction(item, 'sold', 'SOLD', t("標記售出"))}>{t("標記售出")}</Button>}
          {['ACTIVE', 'RESERVED', 'EXPIRED'].includes(item.status) && <Button variant="outline" disabled={blocked} onClick={() => { setExpiryId(item.id); setDate(earliestExtensionDate(item.expiresAt)); }}>{t("延長期限")}</Button>}
          {['DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED'].includes(item.status) && detailId === item.id && <Button variant="destructive" disabled={blocked} onClick={() => statusAction(item, 'remove', 'REMOVED', t("移除"))}>{t("移除")}</Button>}
        </div>
        {expired && <p className="text-sm text-gray-600">{t("此商品已失效；請先延長期限，再編輯或繼續刊登。")}</p>}
        {item.publishedAt && !['ACTIVE', 'RESERVED'].includes(item.status) && <p className="text-sm text-gray-600">{t("分享連結仍可複製，但其他人只會看到「已停止刊登」。")}</p>}
        {editing === item.id && <ListingEditForm key={item.id} item={item} token={token} userId={userId} locked={blocked} seed={editSeed}
          onClose={() => setEditing(null)} onSave={changes => mutate(item, 'EDIT', changes)}
          beforeApprove={async () => {
            const epoch = generation.current;
            if (!isCurrent(epoch) || running.current || unconfirmed || !pendingLoaded) return null;
            running.current = true; setBusy(true);
            return () => { if (isCurrent(epoch)) { running.current = false; setBusy(false); } };
          }}
          onApproved={async () => {
            const epoch = generation.current;
            const current = parse(await api<unknown>(token, `/listings/${item.id}`));
            if (!isCurrent(epoch) || current.id !== item.id) throw new ManagedListingError();
            setRows(old => old.map(row => row.id === item.id ? current : row));
            return current;
          }} />}
        {expiryId === item.id && <div className="rounded-xl bg-gray-50 p-4 space-y-3">
          <DateField label={t("新的失效日期（台灣時間）")} id={`expiry-${item.id}`} min={earliestExtensionDate(item.expiresAt)} value={date} disabled={blocked} onChange={setDate} />
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setExpiryId(null)}>{t("取消延長")}</Button><Button disabled={blocked} onClick={() => extend(item)}>{t("確認延長")}</Button></div></div>}
      </article>;
    })}
    {busy && <p role="status">{t("載入或確認中…")}</p>}
    <div className="flex flex-wrap gap-3">{cursor && <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}>{t("載入更多我的商品")}</Button>}
      <Button variant="outline" disabled={busy} onClick={() => void load()}>{t("重新載入")}</Button></div>
  </div>;
}
