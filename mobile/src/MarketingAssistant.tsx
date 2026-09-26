import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { ApiError, createApi } from './api';
import { PrivateListingPhoto } from './PrivateListingPhoto';
import { iosColors, iosRadius, iosSpacing, iosType, minimumTapSize } from './iosTheme';

type MarketingMedia = { id: string; thumbnailUrl: string; marketingSlot: number; marketingSelected: boolean };
type Job = { id: string; status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'FAILED';
  parentJobId: string | null; deliveredAt: string | null; copy: string | null; generatedMedia: MarketingMedia[];
  previousMedia?: MarketingMedia[]; selectedMediaIds?: string[]; failureCode: string | null };
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; token: string; sourceMediaId: string;
  listingId?: string; beforeStart?: () => Promise<boolean>; onApproved?: () => Promise<void> | void };

export function MarketingAssistant({ api, apiUrl, token, sourceMediaId, listingId, beforeStart, onApproved }: Props) {
  const [available, setAvailable] = useState(false), [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [copy, setCopy] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [revisionText, setRevisionText] = useState(''), [revisionSlots, setRevisionSlots] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    void Promise.all([api<{ available: boolean }>('/marketing/availability'),
      api<{ job: { id: string } | null }>(`/marketing/jobs?sourceMediaId=${sourceMediaId}`)])
      .then(([access, latest]) => { if (!active) return; setAvailable(access.available === true);
        if (latest.job?.id) void api<Job>(`/marketing/jobs/${latest.job.id}`).then(value => { if (active) setJob(value); }).catch(() => undefined); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [api, sourceMediaId]);
  useEffect(() => {
    if (!job || !['PENDING', 'PROCESSING'].includes(job.status)) return;
    let active = true;
    const timer = setInterval(() => { void api<Job>(`/marketing/jobs/${job.id}`).then(value => { if (active) setJob(value); })
      .catch(() => { if (active) setError('排隊狀態暫時無法讀取；照片仍安全保存。'); }); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [api, job?.id, job?.status]);
  useEffect(() => { if (!job || !['REVIEW', 'COMPLETED'].includes(job.status)) return;
    setCopy(job.copy ?? ''); setSelected(job.selectedMediaIds?.length
      ? job.selectedMediaIds : job.generatedMedia.map(media => media.id)); }, [job?.id, job?.status]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  if (!available) return null;
  const deadline = job?.deliveredAt ? Date.parse(job.deliveredAt) + 7 * 86_400_000 : 0;
  const canRevise = !!job && !job.parentJobId && ['REVIEW', 'COMPLETED'].includes(job.status) &&
    Number.isFinite(deadline) && deadline > now;
  const remaining = canRevise ? Math.max(0, deadline - now) : 0;
  const countdown = `${Math.floor(remaining / 86_400_000)}天 ${Math.floor(remaining % 86_400_000 / 3_600_000)}時 ${Math.floor(remaining % 3_600_000 / 60_000)}分`;
  async function begin() {
    if (loading || beforeStart && !await beforeStart()) { setError('請先確認並儲存商品名稱、說明與售價。'); return; }
    setLoading(true); setError(''); setMessage('');
    try {
      const created = await api<{ id: string; status: Job['status'] }>('/marketing/jobs', { method: 'POST',
        body: JSON.stringify({ clientRequestId: Crypto.randomUUID(), sourceMediaId, ...(listingId ? { listingId } : {}) }) });
      setJob({ id: created.id, status: created.status, parentJobId: null, deliveredAt: null, copy: null,
        generatedMedia: [], failureCode: null });
    } catch (failure) { setError(failure instanceof ApiError && failure.code === 'MONTHLY_LIMIT'
      ? '免費版每月 3 次已用完。尊榮版每月 100 次、10 次包 US$1 尚待付款驗證開放。'
      : '無法加入行銷排隊；請檢查資料是否已儲存，再稍後重試。'); }
    finally { setLoading(false); }
  }
  async function revise() {
    if (!job || !revisionSlots.length || revisionText.trim().length < 3) { setError('請勾選至少一張照片並描述要調整的地方。'); return; }
    setLoading(true); setError('');
    try {
      const created = await api<{ id: string; status: Job['status'] }>(`/marketing/jobs/${job.id}/revision`, {
        method: 'POST', body: JSON.stringify({ clientRequestId: Crypto.randomUUID(), prompt: revisionText.trim(), slots: revisionSlots }) });
      setJob({ id: created.id, status: created.status, parentJobId: job.id, deliveredAt: null, copy: null,
        generatedMedia: [], failureCode: null }); setMessage('免費調整已排隊；未勾選的照片會保留。');
    } catch { setError('免費調整未排隊；請確認仍在七天期限內且尚未使用。'); }
    finally { setLoading(false); }
  }
  async function approve() {
    if (!job || !selected.length) { setError('請至少選一張行銷圖。'); return; }
    setLoading(true); setError('');
    try { await api(`/marketing/jobs/${job.id}/approve`, { method: 'POST', body: JSON.stringify({ selectedMediaIds: selected, copy }) });
      setJob(await api<Job>(`/marketing/jobs/${job.id}`)); setMessage('已確認選用；實拍原圖仍保留。'); await onApproved?.(); }
    catch { setError('尚未套用：商品資訊可能已更新，請重新載入並核對。'); }
    finally { setLoading(false); }
  }
  const choices = [...(job?.generatedMedia ?? []), ...(job?.previousMedia ?? [])];
  const toggle = (id: string) => setSelected(old => {
    if (old.includes(id)) return old.filter(value => value !== id);
    const slot = choices.find(media => media.id === id)?.marketingSlot;
    const sameSlotAt = old.findIndex(value => choices.find(media => media.id === value)?.marketingSlot === slot);
    if (sameSlotAt < 0) return [...old, id];
    const updated = [...old]; updated[sameSlotAt] = id; return updated;
  });
  const move = (id: string, direction: -1 | 1) => setSelected(old => {
    const from = old.indexOf(id), to = from + direction;
    if (from < 0 || to < 0 || to >= old.length) return old;
    const updated = [...old]; [updated[from], updated[to]] = [updated[to], updated[from]]; return updated;
  });
  return <View style={s.box}>
    <Text style={s.title}>行銷小助手 · Beta</Text>
    <Text style={s.small}>原始實拍照保留；以下 AI 圖僅為行銷示意，確認前不公開。</Text>
    {!job || job.status === 'FAILED' ? <Pressable accessibilityRole="button" disabled={loading} style={s.button} onPress={() => void begin()}>
      <Text style={s.buttonText}>{job?.status === 'FAILED' ? '重新排隊生成四圖' : '生成四張行銷圖'}</Text></Pressable>
      : ['PENDING', 'PROCESSING'].includes(job.status) ? <View><ActivityIndicator />
        <Text accessibilityLiveRegion="polite" style={s.small}>{job.status === 'PENDING' ? '已排隊，稍後自動更新' : '正在生成四張圖片與文案'}</Text></View>
        : <>
          <View style={s.grid}>{job.generatedMedia.map(media => <Pressable key={media.id} accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(media.id) }} onPress={() => toggle(media.id)} style={s.imageCard}>
            <PrivateListingPhoto thumbnailUrl={media.thumbnailUrl} apiUrl={apiUrl} token={token}
              label={`第 ${media.marketingSlot} 張 AI 行銷示意圖`} style={s.image} />
            <Text style={s.small}>{selected.includes(media.id) ? '☑ 選用' : '☐ 不選用'} · AI 示意</Text>
          </Pressable>)}</View>
          {!!job.previousMedia?.length && <View style={s.revision}><Text style={s.small}>調整前的照片（可點選保留原版）</Text>
            <View style={s.grid}>{job.previousMedia.map(media => <Pressable key={media.id} accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.includes(media.id) }} onPress={() => toggle(media.id)} style={s.imageCard}>
              <PrivateListingPhoto thumbnailUrl={media.thumbnailUrl} apiUrl={apiUrl} token={token}
                label={`第 ${media.marketingSlot} 張調整前行銷示意圖`} style={s.image} />
              <Text style={s.small}>{selected.includes(media.id) ? '☑ 保留原版' : '☐ 選原版'} · 圖 {media.marketingSlot}</Text>
            </Pressable>)}</View></View>}
          {!!selected.length && <View style={s.revision}><Text style={s.small}>公開照片順序（第一張為封面）</Text>
            {selected.map((id, index) => <View key={id} style={s.row}>
              <Text style={s.small}>{index + 1}. 圖 {choices.find(media => media.id === id)?.marketingSlot}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`圖 ${choices.find(media => media.id === id)?.marketingSlot} 往前移`}
                disabled={index === 0} onPress={() => move(id, -1)} style={s.chip}><Text>↑</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`圖 ${choices.find(media => media.id === id)?.marketingSlot} 往後移`}
                disabled={index === selected.length - 1} onPress={() => move(id, 1)} style={s.chip}><Text>↓</Text></Pressable>
            </View>)}</View>}
          <Text style={s.small}>行銷文案（可修改後確認）</Text><TextInput accessibilityLabel="編輯行銷文案" multiline
            maxLength={1200} value={copy} onChangeText={setCopy} style={s.input} />
          {job.status === 'REVIEW' && <Pressable accessibilityRole="button" disabled={loading || job.generatedMedia.length !== 4}
            style={s.button} onPress={() => void approve()}><Text style={s.buttonText}>確認照片與文案</Text></Pressable>}
          {canRevise && <View style={s.revision}><Text style={s.deadline}>免費調整剩餘 {countdown}</Text>
            <Text style={s.small}>勾選要重新生成的圖片（最多一次）</Text>
            <View style={s.row}>{[1, 2, 3, 4].map(slot => <Pressable key={slot} accessibilityRole="checkbox"
              accessibilityState={{ checked: revisionSlots.includes(slot) }} onPress={() => setRevisionSlots(old => old.includes(slot)
                ? old.filter(value => value !== slot) : [...old, slot])} style={s.chip}>
              <Text>{revisionSlots.includes(slot) ? '☑' : '☐'} 圖 {slot}</Text></Pressable>)}</View>
            <TextInput accessibilityLabel="描述要調整的地方" placeholder="例如：改成更明亮的背景" maxLength={500}
              value={revisionText} onChangeText={setRevisionText} style={s.input} />
            <Pressable accessibilityRole="button" disabled={loading} style={s.chip} onPress={() => void revise()}><Text>免費調整一次</Text></Pressable>
          </View>}
        </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.small}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  box: { backgroundColor: iosColors.brandSoft, borderRadius: iosRadius.card, padding: iosSpacing.md, gap: iosSpacing.sm },
  title: { ...iosType.headline, color: iosColors.label }, small: { ...iosType.footnote, color: iosColors.secondaryLabel },
  button: { minHeight: minimumTapSize, backgroundColor: iosColors.tint, borderRadius: iosRadius.control,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: iosSpacing.md },
  buttonText: { ...iosType.subheadline, color: iosColors.white, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.sm },
  imageCard: { width: '47%', gap: iosSpacing.xs }, image: { width: '100%', height: 145, borderRadius: iosRadius.control },
  input: { minHeight: minimumTapSize, backgroundColor: iosColors.surface, color: iosColors.label,
    borderRadius: iosRadius.control, padding: iosSpacing.sm, ...iosType.body },
  revision: { gap: iosSpacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: iosColors.separator, paddingTop: iosSpacing.sm },
  deadline: { ...iosType.footnote, color: iosColors.danger, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs }, chip: { minHeight: minimumTapSize,
    borderRadius: iosRadius.control, backgroundColor: iosColors.surface, paddingHorizontal: iosSpacing.sm, justifyContent: 'center' },
  error: { ...iosType.footnote, color: iosColors.danger },
});
