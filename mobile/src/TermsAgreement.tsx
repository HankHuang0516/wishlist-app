import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { validateApiUrl } from './api';
import { iosColors, iosRadius, iosSpacing, iosType } from './iosTheme';
export const TERMS_ACK_KEY = 'wishlist.terms.20261003';
export const TERMS_VERSION = '2026-10-03';
export function TermsAgreement({ apiUrl, onAccept, onDecline }: { apiUrl: string; onAccept: () => void; onDecline?: () => void }) {
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  async function accept() {
    if (!checked || busy) return;
    setBusy(true); setIssue('');
    try { await SecureStore.setItemAsync(TERMS_ACK_KEY, TERMS_VERSION, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); onAccept(); }
    catch { setIssue('無法保存條款確認，請重試；尚未登入或註冊。'); }
    finally { setBusy(false); }
  }
  async function open(path: string) {
    try { await Linking.openURL(validateApiUrl(apiUrl, __DEV__) + path); } catch { setIssue('無法開啟完整政策頁，請稍後重試。'); }
  }
  return <ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>使用條款與社群安全</Text><Text style={s.body}>登入或建立帳號前，請閱讀並確認。版本：{TERMS_VERSION}</Text>
    <View style={s.card}><Text style={s.heading}>限年滿 18 歲使用</Text><Text style={s.body}>Wishlist.ai 提供願望、實體商品刊登、站內聊天與面交協調。請提供正確帳號資料並保護密碼；不要公開他人的私人資訊。</Text>
      <Text style={s.heading}>不容許不當內容與濫用</Text><Text style={s.body}>禁止非法、色情、仇恨、威脅、騷擾、詐騙、侵害隱私或智慧財產權的商品、照片及訊息。違規內容可被移除，濫用者的使用權可被限制或終止。</Text>
      <Text style={s.heading}>檢舉與封鎖</Text><Text style={s.body}>商品詳情可「檢舉商品」；聊天室可「檢舉」不當訊息或對方，也可「封鎖」停止新訊息。檢舉交由人工查閱，收件不等於已移除內容。</Text>
      <Text style={s.heading}>地圖位置由你決定</Text><Text style={s.body}>地圖只顯示商品約 2 公里的模糊位置或來源的公開地區示意，不顯示使用者即時位置。可拒絕定位並手動填寫地區，也可不在地圖顯示。每次顯示須手動同意，一小時後停止，App 不會自動續期。</Text>
      <Text style={s.heading}>完整條款與隱私</Text><Text style={s.body}>你保留自己內容的權利，並須確保有權使用。服務依現有狀態提供；完整條款包含帳號安全、智慧財產權、服務限制及條款更新。隱私政策說明資料用途與刪除方式。</Text></View>
    <Pressable accessibilityRole="button" style={s.link} onPress={() => void open('/terms')}><Text style={s.linkText}>閱讀完整使用條款</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.link} onPress={() => void open('/privacy')}><Text style={s.linkText}>閱讀隱私政策</Text></Pressable>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }} disabled={busy} style={s.card} onPress={() => setChecked(value => !value)}><Text style={s.body}>{checked ? '☑' : '☐'} 我已年滿 18 歲，已閱讀並同意使用條款及社群規範，並知悉隱私政策。</Text></Pressable>
    {!!issue && <Text accessibilityRole="alert" style={s.error}>{issue}</Text>}
    <Pressable accessibilityRole="button" disabled={!checked || busy} style={[s.button, (!checked || busy) && s.disabled]} onPress={() => void accept()}><Text style={s.buttonText}>{busy ? '保存確認中…' : '同意並繼續'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.link} onPress={() => onDecline ? onDecline() : setIssue('你可以不同意並離開 App；不會登入、建立帳號或公開位置。')}><Text style={s.linkText}>{onDecline ? '不同意，管理或刪除帳號' : '不同意'}</Text></Pressable>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { padding: iosSpacing.xl, gap: iosSpacing.md, paddingBottom: 48 }, title: { ...iosType.title2, color: iosColors.label },
  heading: { ...iosType.headline, color: iosColors.label }, body: { ...iosType.body, color: iosColors.label },
  card: { padding: iosSpacing.md, gap: iosSpacing.sm, backgroundColor: iosColors.surface, borderRadius: iosRadius.card },
  link: { minHeight: 44, justifyContent: 'center' }, linkText: { ...iosType.callout, color: iosColors.tint },
  button: { minHeight: 54, padding: iosSpacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: iosRadius.control, backgroundColor: iosColors.tint },
  buttonText: { ...iosType.headline, color: iosColors.white }, disabled: { opacity: 0.4 }, error: { ...iosType.body, color: iosColors.danger },
});
