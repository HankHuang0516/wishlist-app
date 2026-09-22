import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { PRODUCT_NOTICE_KEY, rememberProductNotice } from './productNotice';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';

export function ProductNoticeScreen({ apiUrl, onContinue }: { apiUrl: string; onContinue: () => void }) {
  const [busy, setBusy] = useState(false), [storageIssue, setStorageIssue] = useState(false);
  const running = useRef(false), active = useRef(true);
  React.useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function acknowledge() {
    if (running.current) return;
    running.current = true; setBusy(true); setStorageIssue(false);
    try {
      const saved = await rememberProductNotice(apiUrl, value => SecureStore.setItemAsync(PRODUCT_NOTICE_KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), __DEV__);
      if (!active.current) return;
      if (saved) onContinue(); else setStorageIssue(true);
    } finally { running.current = false; if (active.current) setBusy(false); }
  }
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.heroIcon}><Ionicons name="sparkles" size={34} color={iosColors.white} /></View>
    <Text style={styles.eyebrow}>WEESH → WISHLIST.AI</Text>
    <Text accessibilityRole="header" style={styles.title}>新的願望，附近的好物</Text>
    <Text style={styles.body}>Weesh 已改版為 Wishlist.ai。除了整理願望，新版加入附近商品地圖、商品聊天室與面交預約。</Text>
    <Text accessibilityRole="header" style={styles.heading}>帳號與資料說明</Text>
    <Text style={styles.body}>新版使用 Wishlist.ai 帳號系統，不會自動匯入舊 Weesh 帳號或資料，也不代表已完成舊資料遷移。</Text>
    <Text style={styles.body}>已有 Wishlist.ai 帳號，請直接登入；沒有帳號，請建立新帳號。既有 Wishlist.ai 願望不需重新建立。</Text>
    <Text style={styles.note}>確認這份說明不會建立帳號、匯入資料或接受隱私政策與使用條款。</Text>
    {storageIssue && <Text accessibilityRole="alert" style={styles.error}>裝置暫時無法記住確認結果。可以重試，或僅這次繼續；下次開啟仍會提醒。</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="我了解，繼續使用" disabled={busy} onPress={() => void acknowledge()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? '正在記住確認…' : '我了解，繼續使用'}</Text></Pressable>
    {storageIssue && <Pressable accessibilityRole="button" accessibilityLabel="這次繼續，下次再提醒" disabled={busy} onPress={onContinue} style={styles.link}><Text style={styles.linkText}>這次繼續，下次再提醒</Text></Pressable>}
    <Text style={styles.note}>目前為開發驗證版本，完整雙平台與商店驗收尚未完成。</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: iosSpacing.xl, paddingTop: 52, paddingBottom: 48, gap: iosSpacing.lg, backgroundColor: iosColors.background },
  heroIcon: { width: 72, height: 72, borderRadius: iosRadius.large, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: iosSpacing.xs, ...iosShadow },
  eyebrow: { ...iosType.caption, letterSpacing: 1.1, color: iosColors.tint },
  title: { ...iosType.largeTitle, color: iosColors.label },
  heading: { ...iosType.title2, color: iosColors.label, marginTop: iosSpacing.sm },
  body: { ...iosType.body, color: iosColors.label },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  error: { ...iosType.subheadline, color: iosColors.danger, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm },
  button: { minHeight: 54, borderRadius: iosRadius.control, padding: iosSpacing.md, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center', marginTop: iosSpacing.sm },
  buttonText: { ...iosType.headline, color: iosColors.white },
  disabled: { opacity: 0.45 }, link: { minHeight: minimumTapSize, justifyContent: 'center', alignItems: 'center' }, linkText: { ...iosType.callout, fontWeight: '600', color: iosColors.tint },
});
