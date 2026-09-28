import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { performSecurityOperation, securityPayload, SecurityApi, SecurityOperation } from './accountSecurity';
import type { AuthOperationGate } from './authOperation';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType } from './iosTheme';
export function AccountSecurityScreen({ api, onPublish, onManage, onLogout, onRevoked, onDelete, operationGate }: { api: SecurityApi; onPublish: () => void; onManage: () => void; onLogout: () => void; onRevoked: (message: string) => Promise<void>; onDelete: () => void; operationGate: AuthOperationGate }) {
  const [current, setCurrent] = useState(''), [replacement, setReplacement] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  const [securityOpen, setSecurityOpen] = useState(false), [benefits, setBenefits] = useState<{ freeMonthlyLimit: number; freeUsedThisMonth: number; permanentCreditsRemaining: number; paidPurchasesAvailable: boolean } | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.all([api<unknown>('/marketing/availability'), api<{ isPremium: boolean }>('/users/me')])
      .then(([allowance, profile]) => {
        if (!mounted) return;
        const value = allowance && typeof allowance === 'object' ? allowance as Record<string, unknown> : null;
        const valid = value && ['freeMonthlyLimit', 'freeUsedThisMonth', 'permanentCreditsRemaining'].every(key =>
          Number.isSafeInteger(value[key]) && Number(value[key]) >= 0) && typeof value.paidPurchasesAvailable === 'boolean';
        setBenefits(valid ? value as typeof benefits : null);
        setPremium(profile.isPremium === true);
      })
      .catch(() => { if (mounted) { setBenefits(null); setPremium(null); } });
    return () => { mounted = false; };
  }, [api]);
  async function submit(operation: SecurityOperation) {
    if (!active.current || running.current) return;
    let payload: ReturnType<typeof securityPayload>;
    try { payload = securityPayload(operation, current, replacement, confirmation); }
    catch (error) { setIssue(error instanceof Error ? error.message : '請檢查輸入。'); return; }
    const release = operationGate.tryBegin(); if (!release) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const result = await performSecurityOperation(api, operation, payload);
      if (!active.current) return;
      if (result.kind === 'signed-out') { setCurrent(''); setReplacement(''); setConfirmation(''); await onRevoked(result.message); }
      else setIssue(result.message);
    } finally { release(); running.current = false; if (active.current) setBusy(false); }
  }
  function confirm(operation: SecurityOperation) {
    if (running.current || !active.current) return;
    Alert.alert(operation === 'password' ? '確認更新密碼？' : '撤銷所有裝置登入？', operation === 'password' ? '所有裝置都需重新登入，個人 API key 將失效。管理與上架簽章不受影響。' : '包含此裝置，所有裝置都需重新登入。個人 API key、管理與上架簽章不變。', [{ text: '取消', style: 'cancel' }, { text: '確認', style: 'destructive', onPress: () => void submit(operation) }]);
  }
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.title}>我的</Text>
    <View style={styles.actionGroup}>
      <Pressable accessibilityRole="button" accessibilityLabel="刊登好物" accessibilityHint="連續拍照或批次選照片，由 AI 建議商品資訊" disabled={busy} style={styles.actionRow} onPress={onPublish}><View style={styles.actionIcon}><Ionicons name="camera-outline" size={24} color={iosColors.white} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>刊登好物</Text><Text style={styles.note}>連續拍照或批次選照片，由 AI 建議商品資訊</Text></View><Ionicons name="chevron-forward" size={19} color={iosColors.tertiaryLabel} /></Pressable>
      <View style={styles.rowSeparator} />
      <Pressable accessibilityRole="button" accessibilityLabel="我的商品 · 閱覽與管理" accessibilityHint="查看、編輯、保留、售出或延長刊登" disabled={busy} style={styles.actionRow} onPress={onManage}><View style={styles.actionIcon}><Ionicons name="list-outline" size={24} color={iosColors.white} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>我的商品 · 閱覽與管理</Text><Text style={styles.note}>查看、編輯、保留、售出或延長刊登</Text></View><Ionicons name="chevron-forward" size={19} color={iosColors.tertiaryLabel} /></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={securityOpen ? '收合帳號安全' : '展開帳號安全'} accessibilityState={{ expanded: securityOpen }} style={styles.securityRow} onPress={() => setSecurityOpen(open => !open)}><Ionicons name="shield-checkmark-outline" size={23} color={iosColors.label} /><Text style={styles.actionTitle}>帳號安全</Text><Ionicons name={securityOpen ? 'chevron-up' : 'chevron-down'} size={19} color={iosColors.secondaryLabel} /></Pressable>
    {securityOpen && <><Text style={styles.note}>請輸入目前密碼以確認操作。密碼不會儲存在裝置，也不會自動重送。</Text>
    <Text style={styles.fieldLabel}>目前密碼</Text><TextInput accessibilityLabel="目前密碼" placeholder="目前密碼" secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={current} onChangeText={setCurrent} maxLength={1024} style={styles.input} />
    <Text style={styles.fieldLabel}>新密碼</Text><TextInput accessibilityLabel="新密碼" placeholder="新密碼" secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={replacement} onChangeText={setReplacement} maxLength={73} style={styles.input} />
    <Text style={styles.fieldLabel}>再次輸入新密碼</Text><TextInput accessibilityLabel="再次輸入新密碼" placeholder="再次輸入新密碼" secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={confirmation} onChangeText={setConfirmation} maxLength={73} style={styles.input} />
    <Text style={styles.note}>新密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。</Text>
    {!!issue && <Text accessibilityRole="alert" style={styles.error}>{issue}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !current || !replacement || !confirmation} style={[styles.button, (busy || !current || !replacement || !confirmation) && styles.disabled]} onPress={() => confirm('password')}><Text style={styles.buttonText}>{busy ? '確認中…' : '更新密碼並重新登入'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy || !current} style={[styles.button, styles.secondaryButton, (busy || !current) && styles.disabled]} onPress={() => confirm('sessions')}><Text style={styles.secondaryButtonText}>撤銷所有裝置登入</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton, busy && styles.disabled]} onPress={onLogout}><Text style={styles.secondaryButtonText}>登出此裝置</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.dangerButton, busy && styles.disabled]} onPress={onDelete}><Text style={styles.dangerButtonText}>刪除本人帳號與資料</Text></Pressable></>}
    <View style={styles.billingCard}>
      <Text style={styles.billingHeading}>贊助與升級</Text>
      <View style={styles.pausedNotice}><Ionicons name="ban-outline" size={20} color={iosColors.danger} /><View style={styles.actionCopy}><Text style={styles.pausedTitle}>購買與訂閱操作暫停</Text><Text style={styles.billingNote}>商店付款與後端驗單尚未開放；既有權益不受影響。</Text></View></View>
      <View style={styles.billingRow}><Ionicons name="heart-outline" size={21} color={iosColors.label} /><View style={styles.actionCopy}><Text style={styles.fieldLabel}>贊助服務</Text><Text style={styles.billingNote}>目前未開放收款，不會導向付款頁。</Text></View></View>
      <View style={styles.rowSeparator} />
      <View style={styles.billingRow}><Ionicons name="ribbon-outline" size={21} color={iosColors.label} /><View style={styles.actionCopy}><Text style={styles.fieldLabel}>尊榮版訂閱 · NT$90／月</Text><Text style={styles.billingNote}>{premium === true ? '既有尊榮會員；請於原付款平台管理訂閱。' : premium === false ? '每月 100 次行銷額度；購買尚未開放。' : '會員狀態暫時無法確認。'}</Text></View></View>
      <View style={styles.rowSeparator} />
      <View style={styles.billingRow}><Ionicons name="sparkles-outline" size={21} color={iosColors.label} /><View style={styles.actionCopy}><Text style={styles.fieldLabel}>行銷小助手加值 · US$1／10 次</Text><Text style={styles.billingNote}>次數不限期；購買尚未開放。</Text><Text style={styles.creditBalance}>永久加值剩餘：{benefits ? `${benefits.permanentCreditsRemaining} 次` : '暫時無法核對'}{benefits && benefits.freeUsedThisMonth >= benefits.freeMonthlyLimit ? ' · 本月免費次數已用完' : ''}</Text></View></View>
    </View>
    <Text style={styles.note}>若有持續扣款，請由原付款平台管理；未驗證的商店交易不會開通權益。</Text>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: iosSpacing.md },
  title: { ...iosType.title, color: iosColors.label },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  actionGroup: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, paddingHorizontal: iosSpacing.md, ...iosShadow },
  actionRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm, paddingVertical: iosSpacing.sm },
  actionIcon: { width: 44, height: 44, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, gap: iosSpacing.xxs },
  actionTitle: { ...iosType.headline, color: iosColors.label, flex: 1 },
  rowSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: iosColors.separator, marginLeft: 56 },
  securityRow: { minHeight: 58, backgroundColor: iosColors.surface, borderRadius: iosRadius.card, paddingHorizontal: iosSpacing.md, flexDirection: 'row', alignItems: 'center', gap: iosSpacing.md, ...iosShadow },
  billingCard: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.sm, gap: iosSpacing.xxs, ...iosShadow },
  billingHeading: { ...iosType.subheadline, color: iosColors.label, fontWeight: '700' },
  billingNote: { ...iosType.footnote, color: iosColors.secondaryLabel },
  pausedNotice: { backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm, flexDirection: 'row', alignItems: 'flex-start', gap: iosSpacing.sm },
  pausedTitle: { ...iosType.subheadline, color: iosColors.danger, fontWeight: '700' },
  billingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: iosSpacing.sm, paddingVertical: iosSpacing.xxs },
  creditBalance: { ...iosType.footnote, color: iosColors.label, fontWeight: '600' },
  fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' },
  input: { minHeight: 52, padding: iosSpacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, borderRadius: iosRadius.control, backgroundColor: iosColors.surface, fontSize: 17, color: iosColors.label, ...iosShadow },
  button: { minHeight: 52, padding: iosSpacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: iosColors.tint, borderRadius: iosRadius.control },
  buttonText: { ...iosType.headline, color: iosColors.white },
  secondaryButton: { backgroundColor: iosColors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator },
  secondaryButtonText: { ...iosType.headline, color: iosColors.tint },
  dangerButton: { backgroundColor: iosColors.dangerSoft },
  dangerButtonText: { ...iosType.headline, color: iosColors.danger },
  disabled: { opacity: 0.45 },
  error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm },
});
