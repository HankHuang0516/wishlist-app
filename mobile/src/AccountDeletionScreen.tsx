import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import * as Crypto from 'expo-crypto';
import { abandonDeletion, deletionApi, DELETION_IMPACT_LABELS, encodeDeletionJournal, lookupDeletion, parseDeletionImpact, prepareDeletion, retainDeletionResult, submitDeletion, type DeletionAck, type DeletionImpact, type DeletionJournal, type DeletionResult } from './accountDeletion';
import { DELETION_STORAGE_ISSUE, clearErasedSession } from './deletionRecovery';
import { nativeDeletionRecovery, deletionPrivateStore } from './nativeDeletionRecovery';
import { erasePrivatePendingData } from './nativePendingStore';
import { createAuthOperationGate } from './authOperation';
import { createApi } from './api';
import { securityPayload } from './accountSecurity';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType } from './iosTheme';

export function AccountDeletionScreen({ apiUrl, userId, token, initialJournal, onPrepared, onErased, onExit }: {
  apiUrl: string; userId?: number; token?: string; initialJournal: DeletionJournal | null;
  onPrepared: (journal: DeletionJournal) => void; onErased: () => void; onExit: () => void;
}) {
  const [journal, setJournal] = useState(initialJournal), [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [outcome, setOutcome] = useState<DeletionResult | null>(null), [deviceClean, setDeviceClean] = useState(false);
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  const active = useRef(true), gate = useRef(createAuthOperationGate()).current;
  const scroll = useRef<ScrollView>(null);
  const proven = useRef<DeletionResult | null>(null);
  const currentApi = useMemo(() => createApi(apiUrl, () => token ?? null, __DEV__), [apiUrl, token]);
  async function cleanDevice(binding: DeletionJournal, ack: DeletionAck) {
    if (ack.state !== 'ERASED' || !ack.accountDeleted || ack.clientActionId !== binding.clientActionId) throw new Error('尚未確認刪除，不清理本人資料。');
    // onErased removes all private UI before asynchronous storage work.
    onErased();
    try {
      await (await nativeDeletionRecovery(apiUrl)).saveProof(binding, ack);
      const pending = await erasePrivatePendingData(apiUrl, binding.userId);
      await clearErasedSession(deletionPrivateStore, binding, __DEV__);
      if (pending.remaining !== 0) throw new Error(DELETION_STORAGE_ISSUE);
      if (active.current) setDeviceClean(true);
    } catch { if (active.current) { setDeviceClean(false); setIssue('帳號已確認刪除，但本人裝置資料尚未清理完成。已保留恢復資料，請重試清理。'); } }
  }
  async function accept(result: DeletionResult, binding: DeletionJournal) {
    if (!active.current) return;
    const retained = retainDeletionResult(proven.current, result);
    if (result.kind === 'unconfirmed') { setOutcome(retained); setIssue(result.message); return; }
    proven.current = result; setOutcome(result);
    if (result.kind === 'erased') await cleanDevice(binding, result.ack);
    else await (await nativeDeletionRecovery(apiUrl)).saveProof(binding, result.ack);
  }
  async function run(work: () => Promise<void>) {
    if (!active.current) return;
    const release = gate.tryBegin(); if (!release) return;
    setBusy(true); setIssue('');
    try { await work(); }
    catch { if (active.current) setIssue(journal ? DELETION_STORAGE_ISSUE : '暫時無法盤點或安全保存刪除操作；尚未送出新的刪除。請重試。'); }
    finally { release(); if (active.current) setBusy(false); }
  }
  async function check() {
    if (!journal) return;
    await run(async () => accept(await lookupDeletion(deletionApi(journal, __DEV__), journal.clientActionId), journal));
  }
  async function loadImpact() {
    await run(async () => {
      const fresh = parseDeletionImpact(await currentApi('/users/me/deletion-impact'));
      if (active.current) setImpact(fresh);
    });
  }
  function back() {
    if (gate.isRunning()) Alert.alert('正在確認操作', '請等候結果；返回不會取消已送出的刪除。');
    else if (journal) Alert.alert('已保留刪除操作', '請先查詢結果或明確放棄尚未成立的操作。關閉 App 不會取消刪除，重啟只查詢結果。');
    else onExit();
  }
  useEffect(() => {
    active.current = true;
    // Mount recovery is GET only. Never replay a password or deletion.
    if (initialJournal) void run(async () => {
      const proof = await (await nativeDeletionRecovery(apiUrl)).readProof(initialJournal);
      if (proof) await accept({ kind: proof.state === 'ERASED' ? 'erased' : 'abandoned', ack: proof }, initialJournal);
      else await accept(await lookupDeletion(deletionApi(initialJournal, __DEV__), initialJournal.clientActionId), initialJournal);
    }); else void loadImpact();
    return () => { active.current = false; };
  }, []);
  // A deletion result replaces the long confirmation form. Reset the retained
  // form offset so the irreversible outcome and cleanup status are visible.
  useEffect(() => {
    if (!outcome) return;
    // Wait for the shorter result tree to finish layout. Otherwise iOS can
    // retain the long confirmation form's bottom offset and hide the outcome.
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [outcome?.kind, deviceClean]);
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => subscription.remove(); }, [journal]);
  async function send() {
    if (!impact || !userId || !token || journal || confirmation !== '刪除帳號') return;
    let exact: string;
    try { exact = securityPayload('sessions', password).currentPassword; }
    catch { setIssue('請輸入目前密碼及完整「刪除帳號」確認文字。'); return; }
    setPassword(''); setConfirmation('');
    await run(async () => {
      const encoded = encodeDeletionJournal(apiUrl, userId, token, Crypto.randomUUID(), __DEV__);
      const recovery = await nativeDeletionRecovery(apiUrl);
      const binding = await prepareDeletion(encoded, apiUrl, recovery.save, __DEV__);
      if (!active.current) return; // No send if preparation was interrupted.
      setJournal(binding); onPrepared(binding);
      await accept(await submitDeletion(deletionApi(binding, __DEV__), binding.clientActionId, exact), binding);
    });
  }
  function confirmDelete() {
    if (gate.isRunning()) return;
    Alert.alert('永久刪除本人帳號？', '本人願望、刊登及發送的訊息會刪除，共享聊天室封存、私密面交移除。不能復原。伺服器照片清理與備份保留不代表即刻完成。', [{ text: '返回', style: 'cancel' }, { text: '永久刪除', style: 'destructive', onPress: () => void send() }]);
  }
  function confirmAbandon() {
    if (!journal || gate.isRunning()) return;
    Alert.alert('放棄尚未成立的刪除？', '只有伺服器確認放棄後，延遲的同筆刪除才被阻擋。已完成的刪除不能取消。', [{ text: '返回', style: 'cancel' }, { text: '確認放棄', onPress: () => void run(async () => accept(await abandonDeletion(deletionApi(journal, __DEV__), journal.clientActionId), journal)) }]);
  }
  async function finish() {
    if (!journal || !outcome || outcome.kind === 'unconfirmed' || outcome.kind === 'erased' && !deviceClean) return;
    await run(async () => { const recovery = await nativeDeletionRecovery(apiUrl); await recovery.saveProof(journal, outcome.ack); await recovery.clear(journal); if (active.current) onExit(); });
  }
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.title}>刪除帳號</Text>
    <Text style={styles.body}>只處理目前本人帳號；不刪其他人的願望或自有訊息。購買紀錄解除帳號關聯，照片可能需後續清理。資料保留政策仍須與正式實作核對。</Text>
    <Text style={styles.body}>本人商品檢舉、證據及收件／安全放棄回執會隨帳號刪除。本人商品上的案件與審核紀錄也會移除；其他人商品上的審核紀錄會保留但解除本人案件關聯。其他檢舉者仍可確認原操作已收件，不保留已刪商品內容。以下分類可能重疊，不可加總為唯一資料筆數。</Text>
    {busy && <ActivityIndicator accessibilityLabel="確認刪除操作中" />}
    {!!issue && <Text accessibilityRole="alert" style={styles.error}>{issue}</Text>}
    {!journal ? <>
      <Text style={styles.heading}>刪除影響盤點</Text>
      {impact ? <><Text style={styles.note}>唯讀盤點時間：{new Date(impact.capturedAt).toLocaleString('zh-TW')}。數量可能因新資料而變動，不是刪除收據。</Text>{Object.entries(DELETION_IMPACT_LABELS).map(([name, label]) => <Text key={name} style={styles.body}>{label}：{impact.counts[name as keyof typeof DELETION_IMPACT_LABELS]}</Text>)}</> : <Text style={styles.note}>尚未取得有效盤點，不可送出刪除。</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton, busy && styles.disabled]} onPress={() => void loadImpact()}><Text style={styles.secondaryButtonText}>重新盤點</Text></Pressable>
      <TextInput accessibilityLabel="刪除帳號的目前密碼" placeholder="目前密碼" secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={1024} value={password} onChangeText={setPassword} style={styles.input} />
      <TextInput accessibilityLabel="輸入刪除帳號以確認" placeholder="請輸入「刪除帳號」" autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={20} value={confirmation} onChangeText={setConfirmation} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy || !impact || !password || confirmation !== '刪除帳號'} style={[styles.button, styles.danger, (busy || !impact || !password || confirmation !== '刪除帳號') && styles.disabled]} onPress={confirmDelete}><Text style={styles.buttonText}>永久刪除本人帳號</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton]} onPress={back}><Text style={styles.secondaryButtonText}>返回，不建立刪除操作</Text></Pressable>
    </> : <>
      <Text selectable style={styles.note}>操作識別碼：{journal.clientActionId}</Text>
      <Text style={styles.note}>恢復資料僅保存在此裝置加密儲存，沒有密碼；重啟只查收據，不重送刪除。登入失效或找不到收據都不是成功。</Text>
      {outcome?.kind === 'erased' ? <><Text testID="帳號已確認刪除" accessibilityRole="alert" style={styles.heading}>帳號已確認刪除</Text><Text style={styles.body}>伺服器照片待清理：{outcome.ack.photoCleanupPending}；舊資產待核對／清理：{outcome.ack.legacyCleanupPending}。不代表全部資產或備份已清除。</Text>{deviceClean ? <Text testID="deletion-device-clean-proof" style={styles.body}>本人已索引的待確認資料與原登入已清理。</Text> : <Text testID="deletion-device-not-clean" style={styles.body}>裝置清理尚未確認完成。</Text>}<Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton]} onPress={() => void run(() => cleanDevice(journal, outcome.ack))}><Text style={styles.secondaryButtonText}>重試本人裝置清理</Text></Pressable></> : outcome?.kind === 'abandoned' ? <Text accessibilityRole="alert" style={styles.heading}>伺服器已確認放棄同筆刪除，帳號未刪除。</Text> : <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton]} onPress={confirmAbandon}><Text style={styles.secondaryButtonText}>明確放棄尚未成立的操作</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton]} onPress={() => void check()}><Text style={styles.secondaryButtonText}>只查詢刪除結果</Text></Pressable>
      {!!outcome && outcome.kind !== 'unconfirmed' && <Pressable accessibilityRole="button" disabled={busy || outcome.kind === 'erased' && !deviceClean} style={[styles.button, (busy || outcome.kind === 'erased' && !deviceClean) && styles.disabled]} onPress={() => void finish()}><Text style={styles.buttonText}>清除恢復資料並返回登入確認</Text></Pressable>}
    </>}
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.lg, paddingBottom: 48, gap: iosSpacing.md },
  title: { ...iosType.largeTitle, color: iosColors.label },
  heading: { ...iosType.title2, color: iosColors.label },
  body: { ...iosType.body, color: iosColors.label },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm },
  input: { minHeight: 52, padding: iosSpacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, fontSize: 17, color: iosColors.label, ...iosShadow },
  button: { minHeight: 52, borderRadius: iosRadius.control, padding: iosSpacing.md, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...iosType.headline, color: iosColors.white },
  danger: { backgroundColor: iosColors.danger },
  secondaryButton: { backgroundColor: iosColors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator },
  secondaryButtonText: { ...iosType.headline, color: iosColors.tint },
  disabled: { opacity: 0.45 },
});
