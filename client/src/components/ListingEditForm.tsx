import { managementText as t } from '../lib/listingManagementCopy';
import { useEffect, useRef, useState } from 'react';
import type { ManagedListing } from '../lib/managedListingWeb';
import { listingEditBody, ManagedListingError } from '../lib/managedListingWeb';
import { getFullApiUrl } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { listingFields, parseListingEditDraft, sameEditFields, serializeListingEditDraft } from '../lib/listingEditDraft';
import type { ListingEditFields } from '../lib/listingEditDraft';
import MarketingAssistantWeb from './MarketingAssistantWeb';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type Props = {
  item: ManagedListing; token: string; userId: number; locked: boolean; seed?: ListingEditFields;
  onClose(): void;
  onSave(changes: Record<string, unknown>): Promise<boolean>;
  beforeApprove(): Promise<(() => void) | null>;
  onApproved(): Promise<ManagedListing>;
};
export default function ListingEditForm({ item, token, userId, locked, seed, onClose, onSave, beforeApprove, onApproved }: Props) {
  const [value, setValue] = useState<ListingEditFields>(seed ?? listingFields(item));
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [issue, setIssue] = useState('');
  const [notice, setNotice] = useState(''), [baseVersion, setBaseVersion] = useState(item.version);
  const [stopped, setStopped] = useState(false), [sending, setSending] = useState(false);
  const generation = useRef(0);
  const isCurrent = (epoch: number) => active.current && generation.current === epoch;
  const active = useRef(true), state = useRef({ key: '', raw: null as string | null, base: listingFields(item), version: item.version, stopped: false });
  const queue = useRef(Promise.resolve()), currentValue = useRef(value), writeSerial = useRef(0), inFlight = useRef(false);
  const stale = ready && baseVersion !== item.version;
  const dirty = !sameEditFields(value, listingFields(item));
  const blocked = locked || !ready || stopped || sending;
  const source = item.media.find(media => media.capturePurpose !== 'AI_MARKETING');
  useEffect(() => {
    active.current = true; const epoch = ++generation.current;
    void (async () => {
      try {
        const key = await pendingRequestKey(getFullApiUrl(), userId, 'listing-edit.' + item.id);
        const raw = await privatePendingStore.get(key);
        const draft = raw ? parseListingEditDraft(raw, item.id) : null;
        if (!isCurrent(epoch)) return;
        const retainConfirmedConflict = !!seed && !!draft && sameEditFields(seed, draft.fields);
        state.current = { key, raw, base: retainConfirmedConflict ? listingFields(item) : draft?.baseFields ?? listingFields(item), version: retainConfirmedConflict ? item.version : draft?.baseVersion ?? item.version, stopped: false };
        const recovered = draft?.fields ?? seed ?? listingFields(item);
        currentValue.current = recovered; setValue(recovered); setBaseVersion(state.current.version); setReady(true);
        if (draft) setNotice(t("已恢復本機編輯草稿；尚未更新商品。"));
        if (seed && (!draft || retainConfirmedConflict)) persist(recovered);
      } catch { if (isCurrent(epoch)) { state.current.stopped = true; setStopped(true); setIssue(t("無法安全讀取商品編輯草稿；原資料保留，請關閉後重試。")); } }
    })();
    return () => { active.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    if (!saving && !stopped) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saving, stopped]);
  function persist(next: ListingEditFields) {
    const epoch = generation.current;
    const serial = ++writeSerial.current;
    setSaving(true); setNotice(t("正在保存本機草稿；尚未更新商品。"));
    queue.current = queue.current.then(async () => {
      const s = state.current;
      if (!isCurrent(epoch) || s.stopped) return;
      const raw = serializeListingEditDraft(item.id, s.version, s.base, next);
      await privatePendingStore.replaceDraft(s.key, s.raw, raw); s.raw = raw;
    }).catch(() => {
      state.current.stopped = true;
      if (isCurrent(epoch)) { setStopped(true); setNotice(t("此頁修改尚未保存；後台商品未更改。")); setIssue(t("草稿未安全保存，可能已被另一分頁更新；此頁修改仍保留，請先複製文字，再關閉後重新開啟比較。")); }
    }).finally(() => {
      if (isCurrent(epoch) && writeSerial.current === serial) {
        setSaving(false);
        if (!state.current.stopped) setNotice(t("本機草稿已保存；尚未更新商品。"));
      }
    });
  }
  function change(field: keyof ListingEditFields, text: string) {
    if (blocked) return;
    const next = { ...currentValue.current, [field]: text };
    currentValue.current = next; setValue(next); persist(next);
  }
  async function adoptLatest() {
    if (blocked || saving || inFlight.current) return;
    // User explicitly compared current backend data below; retaining these fields
    // changes only the local draft's base, never writes the listing.
    state.current.version = item.version; state.current.base = listingFields(item);
    setBaseVersion(item.version); persist(currentValue.current);
  }
  async function submit() {
    const epoch = generation.current;
    if (blocked || stale || inFlight.current) return;
    inFlight.current = true; setSending(true); setIssue('');
    try {
      await queue.current;
      const s = state.current;
      if (!isCurrent(epoch) || s.stopped) return;
      // Fence another tab's update even when this tab has no new keystrokes.
      if (await privatePendingStore.get(s.key) !== s.raw) throw new ManagedListingError(t("草稿已被另一分頁更新，請先複製此頁文字，再重新開啟比較。"));
      const { expectedVersion: _version, ...changes } = listingEditBody(item, currentValue.current.title, currentValue.current.description, currentValue.current.price);
      if (!isCurrent(epoch)) return;
      const applied = await onSave(changes);
      if (applied && s.raw) {
        // Clear only the exact form submitted. A newer tab's draft survives.
        await privatePendingStore.clear(s.key, s.raw);
      }
    } catch (error) { if (isCurrent(epoch)) setIssue(error instanceof ManagedListingError ? error.message : t("無法安全送出商品修改，草稿保留。")); }
    finally { inFlight.current = false; if (isCurrent(epoch)) setSending(false); }
  }
  async function discard() {
    const epoch = generation.current;
    if (blocked || saving || inFlight.current || !window.confirm(t("確認捨棄這份尚未送出的本機編輯草稿？不會更改後台商品。"))) return;
    inFlight.current = true; setSending(true);
    try {
      const s = state.current;
      if (s.raw && !await privatePendingStore.clear(s.key, s.raw)) throw new Error();
      if (!isCurrent(epoch)) return;
      onClose();
    } catch { if (isCurrent(epoch)) { setStopped(true); state.current.stopped = true; setIssue(t("另一分頁已更新草稿；未清除其內容，請保留文字並重新開啟比較。")); } }
    finally { inFlight.current = false; if (isCurrent(epoch)) setSending(false); }
  }
  return <div className="rounded-xl bg-gray-50 p-4 space-y-4"><h3 className="font-semibold">{t("編輯商品資訊")}</h3>
    {notice && <p role="status" className="text-sm text-blue-800">{notice}</p>}
    {issue && <p role="alert" className="text-sm text-red-700">{issue}</p>}
    {stale && <section aria-label={t("尚未送出草稿與最新商品比較")} className="rounded-lg border bg-white p-3 text-sm break-words space-y-2">
      <p>{t("本機草稿以版本 {base} 編輯；後台已是版本 {latest}。請先比較，不會自動覆蓋。", { base: baseVersion, latest: item.version })}</p>
      <p>{t("後台商品名稱：")}{item.title}</p><p className="whitespace-pre-wrap">{t("後台商品說明：")}{item.description ?? t("未填")}</p><p>{t("後台售價（NT$）：")}{item.price ?? t("未填")}</p>
      <Button variant="outline" disabled={blocked || saving} onClick={() => void adoptLatest()}>{t("保留草稿，以最新版本繼續編輯")}</Button>
    </section>}
    <div className="space-y-2"><label htmlFor={`title-${item.id}`}>{t("商品名稱")}</label><Input id={`title-${item.id}`} disabled={locked || !ready || sending} readOnly={stopped} value={value.title} onChange={event => change('title', event.target.value)} maxLength={100} /></div>
    <div className="space-y-2"><label htmlFor={`description-${item.id}`}>{t("商品說明")}</label><textarea id={`description-${item.id}`} disabled={locked || !ready || sending} readOnly={stopped} className="w-full min-h-32 rounded-xl border p-3" value={value.description} onChange={event => change('description', event.target.value)} maxLength={3000} /></div>
    <div className="space-y-2"><label htmlFor={`price-${item.id}`}>{t("售價（NT$，0 代表免費贈送）")}</label><Input id={`price-${item.id}`} inputMode="decimal" disabled={locked || !ready || sending} readOnly={stopped} maxLength={128} value={value.price} onChange={event => change('price', event.target.value)} /></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={locked || sending || saving} onClick={onClose}>{t("關閉編輯，保留草稿")}</Button><Button variant="outline" disabled={blocked || saving} onClick={() => void discard()}>{t("捨棄本機草稿")}</Button><Button disabled={blocked || stale} onClick={() => void submit()}>{t("儲存修改")}</Button></div>
    <h3 className="font-semibold">{t("額外選項")}</h3>
    {source && ['ACTIVE', 'RESERVED'].includes(item.status) && ready && <MarketingAssistantWeb token={token} userId={userId} sourceMediaId={source.id} listingId={item.id} getExpectedVersion={() => item.version}
      beforeStart={async () => { if (locked || dirty || stale || saving || stopped || sending) { setIssue(t("請先儲存商品資訊，再使用行銷小助手。")); return false; } return true; }}
      beforeApprove={async () => locked || dirty || stale || saving || stopped || sending ? null : beforeApprove()}
      onApproved={async () => {
        const epoch = generation.current;
        const latest = await onApproved();
        if (!isCurrent(epoch)) return;
        const fields = listingFields(latest);
        state.current.version = latest.version; state.current.base = fields;
        setBaseVersion(latest.version); currentValue.current = fields; setValue(fields);
        persist(fields);
      }} />}
  </div>;
}
