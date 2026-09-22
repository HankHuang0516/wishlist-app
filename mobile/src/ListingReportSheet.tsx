import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { ApiError, createApi } from './api';
import type { PublicListing } from './listingSearch';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { PendingStoreError } from './pendingStore';
import { abandonReport, buildReportRequest, lookupReport, parseReportPage, parseReportRequest, REPORT_REASONS, REPORT_STATUS_LABELS, reportPagePath, ReportInputError, submitReport, type ListingReport, type ReportReason, type ReportRequest, type ReportResult } from './listingReports';

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

export function ListingReportSheet({ api, apiUrl, userId, listing, onClose, onBusyChange }: {
    api: ReturnType<typeof createApi>; apiUrl: string; userId: number; listing: PublicListing | null; onClose: () => void; onBusyChange: (busy: boolean) => void;
}) {
    const [reason, setReason] = useState<ReportReason>('FRAUD'), [details, setDetails] = useState('');
    const [pending, setPending] = useState<ReportRequest | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
    const [items, setItems] = useState<ListingReport[]>([]), [cursor, setCursor] = useState<string | null>(null), [loaded, setLoaded] = useState(false);
    const [issue, setIssue] = useState(''), [notice, setNotice] = useState(''), [submitted, setSubmitted] = useState(false);
    const alive = useRef(true), running = useRef(false), key = useRef<string | null>(null), pendingRef = useRef<ReportRequest | null>(null);
    async function run(work: () => Promise<void>) {
        if (!alive.current || running.current) return;
        running.current = true; onBusyChange(true); setBusy(true); setIssue('');
        try { await work(); }
        catch (error) {
            if (alive.current) {
                if (error instanceof PendingStoreError) { setReady(false); setIssue('無法安全保存或讀取本機檢舉；尚未建立另一筆操作。請重讀待確認紀錄。'); }
                else setIssue(error instanceof ReportInputError ? error.message : error instanceof ApiError && error.status === 401 ? '登入已失效，請重新登入。未確認檢舉仍保留在本人加密儲存。' : '暫時無法取得檢舉紀錄；請稍後重試。');
            }
        } finally { running.current = false; onBusyChange(false); if (alive.current) setBusy(false); }
    }
    function accept(result: ReportResult, requested: ReportRequest) {
        if (!alive.current) return;
        if (result.kind === 'unconfirmed') { setIssue(result.message); return; }
        if (result.kind === 'confirmed') setItems(previous => [result.report, ...previous.filter(row => row.id !== result.report.id)]);
        else setItems(previous => previous.filter(row => row.clientReportId !== requested.clientReportId));
        if (result.kind !== 'abandoned' && listing?.id === requested.listingId) setSubmitted(true);
        if (result.pendingCleared) { pendingRef.current = null; setPending(null); }
        const known = result.kind === 'abandoned' ? '伺服器已安全放棄這筆尚未收件的操作；原識別碼後續不能再送出。' : result.kind === 'received-without-case' ? '伺服器確認先前已收件；商品或案件已刪除，不代表已審核下架，也不代表取消。' : '伺服器已確認收到檢舉；是否下架仍以審核狀態為準。';
        setNotice(known + (result.pendingCleared ? '' : ' 本機待確認紀錄尚未清理，請再查回執，不要建立另一筆。'));
    }
    async function fetchPage(next?: string) {
        const page = parseReportPage(await api<unknown>(reportPagePath(next)));
        if (next && page.nextCursor === next) throw new ReportInputError('分頁未前進，請重新讀取紀錄。');
        if (!alive.current) return;
        setItems(previous => next ? [...previous, ...page.items.filter(row => !previous.some(old => old.id === row.id))] : page.items);
        setCursor(page.nextCursor); setLoaded(true);
    }
    async function initialize() {
        const requestKey = await pendingRequestKey(apiUrl, userId, 'listing-report'), saved = await privatePendingStore.get(requestKey);
        let restored: ReportRequest | null = null;
        if (saved !== null) {
            try { restored = parseReportRequest(JSON.parse(saved)); if (JSON.stringify(restored) !== saved) throw new Error(); }
            catch { throw new PendingStoreError(); }
        }
        if (!alive.current) return;
        key.current = requestKey; pendingRef.current = restored; setPending(restored); setReady(true);
        // Reopening is GET only, including a journal for a now-hidden listing.
        if (restored) accept(await lookupReport(api, privatePendingStore, requestKey, restored, digest), restored);
        await fetchPage();
    }
    useEffect(() => { alive.current = true; void run(initialize); return () => { alive.current = false; }; }, []);
    async function send(retry = false) {
        if (!ready || !key.current || running.current) return;
        await run(async () => {
            const saved = pendingRef.current;
            if (retry && !saved || !retry && saved) return;
            if (!saved && (!listing || listing.owner.id === userId || Date.parse(listing.expiresAt) <= Date.now())) throw new ReportInputError('商品已停止刊登或屬於本人，不能建立新的商品檢舉。');
            const request = saved ?? buildReportRequest(listing!.id, Crypto.randomUUID(), reason, details);
            await privatePendingStore.save(key.current!, JSON.stringify(request));
            if (!alive.current) return; // Interrupted preparation never sends.
            pendingRef.current = request; setPending(request); setNotice('');
            accept(await submitReport(api, privatePendingStore, key.current!, request), request);
        });
    }
    async function lookup() {
        if (!ready || !key.current || !pendingRef.current) return;
        const request = pendingRef.current;
        await run(async () => accept(await lookupReport(api, privatePendingStore, key.current!, request, digest), request));
    }
    function confirmAbandon() {
        const request = pendingRef.current;
        if (!ready || !key.current || !request || running.current) return;
        Alert.alert('安全放棄先前操作？', '只有伺服器確認尚未收件，才會阻止這筆原請求後續送達。若已收件，會顯示原回執，不會撤回案件。查詢或網路失敗都不代表已放棄。', [
            { text: '保留並查詢', style: 'cancel' },
            { text: '確認安全放棄', style: 'destructive', onPress: () => {
                if (pendingRef.current?.clientReportId !== request.clientReportId || !key.current) return;
                void run(async () => accept(await abandonReport(api, privatePendingStore, key.current!, request, digest), request));
            } },
        ]);
    }
    const frozen = busy || !ready || !!pending;
    return <SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Text style={s.heading}>我的商品檢舉</Text>
        <Text style={s.text}>檢舉原因與補充說明不會顯示在公開商品或地圖。送出代表收件，不代表商品立即下架；請勿填入密碼、證件或完整住址。</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={onClose}><Text style={s.text}>返回探索，保留未確認紀錄</Text></Pressable>
        {busy && <ActivityIndicator accessibilityLabel="確認商品檢舉中" />}
        {!!issue && <Text accessibilityRole="alert" style={s.error}>{issue}</Text>}
        {!!notice && <Text accessibilityRole="alert" style={s.text}>{notice}</Text>}
        {!ready && <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void run(initialize)}><Text style={s.text}>重讀本機待確認紀錄</Text></Pressable>}
        {pending && <View style={s.card}><Text style={s.title}>先前檢舉尚待確認</Text><Text style={s.text}>商品識別碼：{pending.listingId}</Text><Text style={s.text}>原因：{REPORT_REASONS.find(([value]) => value === pending.reason)?.[1]}</Text>{pending.details && <Text style={s.text}>{pending.details}</Text>}<Text style={s.small}>只查回執不會重送或取消。查不到也不代表原請求已取消；不能更換識別碼建立另一筆。</Text>
            <Pressable accessibilityRole="button" disabled={busy || !ready} style={s.button} onPress={() => void lookup()}><Text style={s.white}>只查詢先前檢舉回執</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy || !ready} style={s.chip} onPress={() => void send(true)}><Text style={s.text}>明確重送相同檢舉與識別碼</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy || !ready} style={s.chip} onPress={confirmAbandon}><Text style={s.text}>要求安全放棄尚未收件的操作</Text></Pressable>
        </View>}
        {listing && !submitted && !pending && <View style={s.card}><Text style={s.title}>檢舉：{listing.title}</Text><Text style={s.small}>請提供具體原因；不要用檢舉取代正常議價或商品取消。</Text>
            {REPORT_REASONS.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: reason === value, disabled: frozen }} disabled={frozen} style={[s.chip, reason === value && s.selected]} onPress={() => setReason(value)}><Text style={s.text}>{label}</Text></Pressable>)}
            <TextInput accessibilityLabel="檢舉補充說明，選填" placeholder="補充說明（選填，最多1000字元）" multiline maxLength={1000} editable={!frozen} value={details} onChangeText={setDetails} style={s.input} />
            <Pressable accessibilityRole="button" disabled={frozen} style={[s.button, frozen && s.disabled]} onPress={() => void send()}><Text style={s.white}>送出商品檢舉</Text></Pressable>
        </View>}
        <Text style={s.title}>本人檢舉紀錄</Text><Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void run(() => fetchPage())}><Text style={s.text}>重新查詢審核狀態</Text></Pressable>
        {loaded && !items.length && <Text style={s.text}>目前沒有已確認的本人商品檢舉。</Text>}
        {items.map(report => <View key={report.id} style={s.card}><Text style={s.title}>{REPORT_STATUS_LABELS[report.status]}</Text><Text style={s.small}>商品識別碼：{report.listingId}</Text><Text style={s.text}>{REPORT_REASONS.find(([value]) => value === report.reason)?.[1]}</Text>{report.details && <Text style={s.text}>{report.details}</Text>}<Text style={s.small}>更新於 {new Date(report.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</Text></View>)}
        {cursor && <Pressable accessibilityRole="button" disabled={busy} style={s.chip} onPress={() => void run(() => fetchPage(cursor))}><Text style={s.text}>載入更多本人檢舉</Text></Pressable>}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F8F7F3' }, content: { padding: 20, gap: 16, paddingBottom: 40 }, heading: { fontSize: 26, fontWeight: '800', color: '#173E36' }, title: { fontSize: 19, fontWeight: '700', color: '#173E36' }, text: { fontSize: 16, lineHeight: 24, color: '#173E36' }, small: { fontSize: 14, lineHeight: 22, color: '#596960' }, error: { fontSize: 15, lineHeight: 23, color: '#A52626' }, card: { padding: 16, gap: 12, borderRadius: 14, backgroundColor: '#FFF' }, chip: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#B4BDB4', borderRadius: 12, justifyContent: 'center' }, selected: { borderColor: '#173E36', backgroundColor: '#DDEAE0' }, button: { minHeight: 52, padding: 14, borderRadius: 14, backgroundColor: '#173E36', alignItems: 'center', justifyContent: 'center' }, white: { color: '#FFF', fontSize: 16, fontWeight: '700' }, input: { minHeight: 120, padding: 14, borderWidth: 1, borderColor: '#B4BDB4', borderRadius: 12, color: '#173E36', fontSize: 16, textAlignVertical: 'top' }, disabled: { opacity: 0.5 } });
