import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, createApi } from './api';
import { ListingExpiryPicker } from './ListingExpiryPicker';
import { PrivateListingPhoto } from './PrivateListingPhoto';
import { earliestExtensionDate, listingEditBody, managementTab, MANAGEMENT_TABS, ManagedListing, ManagedListingError,
  ManagementTab, parseManagedListing, parseManagedListingPage } from './managedListing';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
import { MarketingAssistant } from './MarketingAssistant';

const labels: Record<ManagedListing['status'], string> = {
  DRAFT: '草稿', PENDING_CONFIRMATION: '待確認', ACTIVE: '在售', RESERVED: '已保留',
  SOLD: '已售出', REMOVED: '已移除', EXPIRED: '已失效',
};
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; token: string; onClose: () => void };

export function MyListingsScreen({ api, apiUrl, userId, token, onClose }: Props) {
  const [tab, setTab] = useState<ManagementTab>('在售');
  const [rows, setRows] = useState<ManagedListing[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null), [title, setTitle] = useState(''),
    [description, setDescription] = useState(''), [price, setPrice] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expiryId, setExpiryId] = useState<string | null>(null);
  const alive = useRef(true), sequence = useRef(0), running = useRef(false);

  async function load(next?: string) {
    if (running.current) return;
    running.current = true; setLoading(true); setError('');
    const request = ++sequence.current;
    try {
      const page = parseManagedListingPage(await api<unknown>('/listings/mine?limit=50' + (next ? '&cursor=' + next : '')),
        userId, apiUrl, __DEV__);
      if (next && page.nextCursor === next) throw new ManagedListingError('商品分頁未前進，請重新載入。');
      if (alive.current && request === sequence.current) {
        setRows(old => next ? [...new Map([...old, ...page.items].map(item => [item.id, item])).values()] : page.items);
        setCursor(page.nextCursor);
      }
    } catch (failure) {
      if (alive.current && request === sequence.current) setError(failure instanceof ManagedListingError ? failure.message :
        failure instanceof ApiError && failure.status === 401 ? '登入已失效，請重新登入。' : '無法取得我的商品，請確認連線後重試。');
    } finally { running.current = false; if (alive.current && request === sequence.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; sequence.current++; }; }, []);

  async function mutate(item: ManagedListing, path: string, method: 'POST' | 'PATCH', body: object,
    expectedStatus: ManagedListing['status'] | null, success: string) {
    if (running.current) return;
    running.current = true; setLoading(true); setError(''); setNotice('');
    try {
      const updated = parseManagedListing(await api<unknown>(path, { method, body: JSON.stringify(body) }), userId, apiUrl, __DEV__);
      if (updated.id !== item.id || updated.version !== item.version + 1 || expectedStatus && updated.status !== expectedStatus)
        throw new ManagedListingError('伺服器回傳版本或狀態不符，請重新載入。');
      if (alive.current) { setRows(old => old.map(row => row.id === item.id ? updated : row)); setEditing(null); setExpiryId(null); setNotice(success); }
    } catch (failure) {
      if (alive.current) setError(failure instanceof ApiError && failure.status === 409 ? '商品已被更新；請重新載入後再操作。' :
        failure instanceof ManagedListingError ? failure.message : '操作結果尚未確認，請重新載入最新狀態；勿連續重送。');
    } finally { running.current = false; if (alive.current) setLoading(false); }
  }
  function askStatus(item: ManagedListing, action: 'reserve' | 'release' | 'sold' | 'remove', next: ManagedListing['status']) {
    const name = action === 'reserve' ? '標記已保留' : action === 'release' ? '恢復在售' : action === 'sold' ? '標記已售出' : '移除商品';
    Alert.alert(`確認${name}？`, action === 'remove' ? '移除後不會在探索地圖顯示，且無法從 App 恢復。' : `只會更改「${item.title}」的狀態。`, [
      { text: '取消', style: 'cancel' }, { text: name, style: action === 'remove' ? 'destructive' : 'default',
        onPress: () => void mutate(item, `/listings/${item.id}/status`, 'POST', { expectedVersion: item.version, action }, next, `「${item.title}」已${name}。`) },
    ]);
  }
  function extend(item: ManagedListing, date: string) {
    setExpiryId(null);
    Alert.alert('確認延長刊登？', item.status === 'EXPIRED' ? '延長後會重新公開顯示在探索地圖。' : `新失效日期：${date}。`, [
      { text: '取消', style: 'cancel' }, { text: '確認延長',
        onPress: () => void mutate(item, `/listings/${item.id}/extend`, 'POST', { expectedVersion: item.version, expiryDate: date },
          item.status === 'EXPIRED' ? 'ACTIVE' : item.status, `「${item.title}」已延長至 ${date}。`) },
    ]);
  }
  function save(item: ManagedListing) {
    try { void mutate(item, `/listings/${item.id}`, 'PATCH', listingEditBody(item, title, description, price), item.status, `「${item.title}」資料已更新。`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '請確認商品資料。'); }
  }
  const now = Date.now(), visible = rows.filter(item => managementTab(item, now) === tab);
  const action = (label: string, press: () => void, danger = false) => <Pressable accessibilityRole="button" disabled={loading} onPress={press}
    style={[s.action, danger && s.dangerAction, loading && s.disabled]}><Text style={[s.actionText, danger && s.dangerText]}>{label}</Text></Pressable>;
  return <SafeAreaView style={s.screen}>
    <View style={s.header}><View><Text accessibilityRole="header" style={s.heading}>我的商品</Text><Text style={s.muted}>管理本人刊登與草稿</Text></View>{action('完成', onClose)}</View>
    <View style={s.tabs}>{MANAGEMENT_TABS.map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }}
      onPress={() => { setTab(name); setEditing(null); setExpiryId(null); }} style={[s.tab, tab === name && s.activeTab]}><Text style={[s.tabText, tab === name && s.activeTabText]}>{name}</Text></Pressable>)}</View>
    <Text style={s.summary}>本頁「{tab}」已載入 {visible.length} 件；全部狀態共已載入 {rows.length} 件{cursor ? '，還有更多' : ''}。</Text>
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <FlatList data={visible} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}
      ListEmptyComponent={!loading ? <Text style={s.muted}>這個狀態目前沒有已載入商品{cursor ? '；可繼續載入更多。' : '。'}</Text> : null}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.cardTop}><View style={s.photoShell}>{item.media[0] ? <PrivateListingPhoto thumbnailUrl={item.media[0].thumbnailUrl} apiUrl={apiUrl} token={token}
          label={`${item.title}商品縮圖`} style={s.photo} /> : <View style={s.photo}><Text style={s.muted}>無照片</Text></View>}</View>
          <View style={s.info}><Text style={s.title}>{item.title}</Text><Text style={s.muted}>{labels[item.status]}{managementTab(item, now) === '已失效' && item.status !== 'EXPIRED' ? ' · 日期已過' : ''} · {item.condition === 'USED' ? '二手' : '新品'}</Text>
            <Text style={s.price}>{item.price === null ? '售價未填' : item.price === 0 ? '免費贈送' : `NT$ ${new Intl.NumberFormat('zh-TW').format(item.price)}`}</Text>
            <Text style={s.muted}>{item.location ? `${item.location.county}${item.location.district}` : '地點未填'}{item.expiresAt ? ` · 至 ${item.expiresAt.slice(0, 10)}` : ''}</Text></View></View>
        {!!item.description && <Text numberOfLines={detailId === item.id ? undefined : 3} style={s.body}>{item.description}</Text>}
        {detailId === item.id && <Text style={s.muted}>分類：{item.category ?? '未分類'} · 建立日期：{item.createdAt.slice(0, 10)} · 商品編號：{item.id}</Text>}
        <View style={s.actions}>{action(detailId === item.id ? '收合詳情' : '查看詳情', () => setDetailId(current => current === item.id ? null : item.id))}</View>
        {(item.status === 'DRAFT' || item.status === 'ACTIVE' || item.status === 'RESERVED' || item.status === 'EXPIRED') &&
          <View style={s.actions}>{managementTab(item, now) !== '已失效' && action('編輯資訊', () => { setEditing(item.id); setTitle(item.title); setDescription(item.description ?? ''); setPrice(item.price === null ? '' : String(item.price)); })}
            {item.status === 'ACTIVE' && managementTab(item, now) === '在售' && action('標記保留', () => askStatus(item, 'reserve', 'RESERVED'))}
            {item.status === 'RESERVED' && managementTab(item, now) === '已保留' && action('恢復在售', () => askStatus(item, 'release', 'ACTIVE'))}
            {['ACTIVE', 'RESERVED'].includes(item.status) && managementTab(item, now) !== '已失效' && action('標記售出', () => askStatus(item, 'sold', 'SOLD'))}
            {['ACTIVE', 'RESERVED', 'EXPIRED'].includes(item.status) && action('延長期限', () => setExpiryId(item.id))}
            {action('移除', () => askStatus(item, 'remove', 'REMOVED'), true)}</View>}
        {managementTab(item, now) === '已失效' && <Text style={s.muted}>此商品已失效；請先延長期限，再編輯或繼續刊登。</Text>}
        {editing === item.id && <View style={s.editor}><Text style={s.subheading}>編輯商品資訊</Text>
          <Text style={s.fieldLabel}>商品名稱</Text><TextInput accessibilityLabel="編輯商品名稱" value={title} onChangeText={setTitle} maxLength={100} style={s.input} />
          <Text style={s.fieldLabel}>商品說明</Text><TextInput accessibilityLabel="編輯商品說明" value={description} onChangeText={setDescription} multiline maxLength={3000} style={[s.input, s.description]} />
          <Text style={s.fieldLabel}>售價（NT$，0 代表免費贈送）</Text><TextInput accessibilityLabel="編輯商品售價，新臺幣" value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={s.input} />
          <View style={s.actions}>{action('取消編輯', () => setEditing(null))}{action('儲存修改', () => save(item))}</View>
          <Text style={s.subheading}>額外選項</Text>
          {item.media.find(media => media.capturePurpose !== 'AI_MARKETING') && ['ACTIVE', 'RESERVED'].includes(item.status) &&
            <MarketingAssistant api={api} apiUrl={apiUrl} token={token} listingId={item.id}
              sourceMediaId={item.media.find(media => media.capturePurpose !== 'AI_MARKETING')!.id}
              beforeStart={async () => { if (title !== item.title || description !== (item.description ?? '') ||
                price !== (item.price === null ? '' : String(item.price))) {
                setError('請先儲存商品資訊，再使用行銷小助手。'); return false; } return true; }}
              onApproved={() => load()} />}</View>}
        {expiryId === item.id && <View style={s.editor}><Text style={s.subheading}>選擇新的失效日期</Text><ListingExpiryPicker value={earliestExtensionDate(item.expiresAt)} minimumDateValue={earliestExtensionDate(item.expiresAt)} onApply={date => extend(item, date)} onCancel={() => setExpiryId(null)} /></View>}
      </View>}
      ListFooterComponent={<View style={s.footer}>{cursor && action('載入更多我的商品', () => void load(cursor))}{loading && <ActivityIndicator accessibilityLabel="載入我的商品中" />}
        {action('重新載入', () => void load())}</View>} />
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: iosColors.background },
  header: { padding: iosSpacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { ...iosType.title2, color: iosColors.label }, subheading: { ...iosType.headline, color: iosColors.label },
  fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs, paddingHorizontal: iosSpacing.lg },
  tab: { minHeight: minimumTapSize, justifyContent: 'center', paddingHorizontal: iosSpacing.sm, borderRadius: iosRadius.pill, backgroundColor: iosColors.surface },
  activeTab: { backgroundColor: iosColors.tint }, tabText: { ...iosType.footnote, color: iosColors.secondaryLabel },
  activeTabText: { color: iosColors.white, fontWeight: '700' },
  summary: { ...iosType.footnote, color: iosColors.secondaryLabel, paddingHorizontal: iosSpacing.lg, paddingVertical: iosSpacing.sm },
  list: { paddingHorizontal: iosSpacing.lg, paddingBottom: iosSpacing.xxl, gap: iosSpacing.md },
  card: { padding: iosSpacing.md, borderRadius: iosRadius.card, backgroundColor: iosColors.surface, gap: iosSpacing.sm, ...iosShadow },
  cardTop: { flexDirection: 'row', gap: iosSpacing.sm }, photoShell: { width: 86, height: 86, overflow: 'hidden' }, photo: { width: 86, height: 86, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: iosSpacing.xxs }, title: { ...iosType.headline, color: iosColors.label },
  price: { ...iosType.headline, color: iosColors.tint }, body: { ...iosType.subheadline, color: iosColors.label },
  muted: { ...iosType.footnote, color: iosColors.secondaryLabel }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: iosSpacing.xs },
  action: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, borderRadius: iosRadius.control, justifyContent: 'center', backgroundColor: iosColors.tintSoft },
  actionText: { ...iosType.subheadline, color: iosColors.tint, fontWeight: '700' }, dangerAction: { backgroundColor: iosColors.dangerSoft },
  dangerText: { color: iosColors.danger }, disabled: { opacity: 0.45 },
  editor: { gap: iosSpacing.sm, borderTopColor: iosColors.separator, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: iosSpacing.sm },
  input: { minHeight: 50, borderRadius: iosRadius.control, backgroundColor: iosColors.surfaceSecondary, padding: iosSpacing.sm, ...iosType.body, color: iosColors.label },
  description: { minHeight: 90, textAlignVertical: 'top' }, footer: { gap: iosSpacing.sm, alignItems: 'center', padding: iosSpacing.md },
  notice: { ...iosType.footnote, color: iosColors.brand, backgroundColor: iosColors.brandSoft, marginHorizontal: iosSpacing.lg, padding: iosSpacing.sm, borderRadius: iosRadius.control },
  error: { ...iosType.footnote, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, marginHorizontal: iosSpacing.lg, padding: iosSpacing.sm, borderRadius: iosRadius.control },
});
