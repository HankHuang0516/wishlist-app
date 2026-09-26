import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { performSecurityOperation, securityPayload, SecurityApi, SecurityOperation } from './accountSecurity';
import type { AuthOperationGate } from './authOperation';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType } from './iosTheme';
export function AccountSecurityScreen({ api, onPublish, onManage, onLogout, onRevoked, onDelete, operationGate }: { api: SecurityApi; onPublish: () => void; onManage: () => void; onLogout: () => void; onRevoked: (message: string) => Promise<void>; onDelete: () => void; operationGate: AuthOperationGate }) {
  const [current, setCurrent] = useState(''), [replacement, setReplacement] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  const active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
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
    <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={onPublish}><Text style={styles.buttonText}>刊登好物</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton]} onPress={onManage}><Text style={styles.secondaryButtonText}>我的商品 · 閱覽與管理</Text></Pressable>
    <Text style={styles.heading}>帳號安全</Text><Text style={styles.note}>請輸入目前密碼以確認操作。密碼不會儲存在裝置，也不會自動重送。</Text>
    <Text style={styles.fieldLabel}>目前密碼</Text><TextInput accessibilityLabel="目前密碼" placeholder="目前密碼" secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={current} onChangeText={setCurrent} maxLength={1024} style={styles.input} />
    <Text style={styles.fieldLabel}>新密碼</Text><TextInput accessibilityLabel="新密碼" placeholder="新密碼" secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={replacement} onChangeText={setReplacement} maxLength={73} style={styles.input} />
    <Text style={styles.fieldLabel}>再次輸入新密碼</Text><TextInput accessibilityLabel="再次輸入新密碼" placeholder="再次輸入新密碼" secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} editable={!busy} value={confirmation} onChangeText={setConfirmation} maxLength={73} style={styles.input} />
    <Text style={styles.note}>新密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。</Text>
    {!!issue && <Text accessibilityRole="alert" style={styles.error}>{issue}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !current || !replacement || !confirmation} style={[styles.button, (busy || !current || !replacement || !confirmation) && styles.disabled]} onPress={() => confirm('password')}><Text style={styles.buttonText}>{busy ? '確認中…' : '更新密碼並重新登入'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy || !current} style={[styles.button, styles.secondaryButton, (busy || !current) && styles.disabled]} onPress={() => confirm('sessions')}><Text style={styles.secondaryButtonText}>撤銷所有裝置登入</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.secondaryButton, busy && styles.disabled]} onPress={onLogout}><Text style={styles.secondaryButtonText}>登出此裝置</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, styles.dangerButton, busy && styles.disabled]} onPress={onDelete}><Text style={styles.dangerButtonText}>刪除本人帳號與資料</Text></Pressable>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { paddingHorizontal: iosSpacing.lg, paddingTop: iosSpacing.xs, paddingBottom: iosSpacing.xxl, gap: iosSpacing.md },
  title: { ...iosType.largeTitle, color: iosColors.label },
  heading: { ...iosType.title2, color: iosColors.label, marginTop: iosSpacing.sm },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
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
