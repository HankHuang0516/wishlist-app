import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaModal } from './SafeAreaModal';
import * as Crypto from 'expo-crypto';
import { createApi } from './api';
import { chatReportBody, chatReportReceipt, CHAT_REPORT_REASONS } from './chatReport';
import { pendingRequestKey, privatePendingStore } from './nativePendingStore';
import { iosColors, iosRadius, iosSpacing, iosType } from './iosTheme';
type Props = { api: ReturnType<typeof createApi>; apiUrl: string; userId: number; roomId: string; reportedUserId: number; messageId: string | null; onClose: () => void };
export function ChatReportSheet({ api, apiUrl, userId, roomId, reportedUserId, messageId, onClose }: Props) {
  const [reason, setReason] = useState<string>('HARASSMENT'), [details, setDetails] = useState(''), [issue, setIssue] = useState(''), [receipt, setReceipt] = useState('');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState<string | null>(null);
  const alive = useRef(true), running = useRef(false), key = useRef<string | null>(null), original = useRef<string | null>(null);
  async function acknowledge(value: unknown, body: string) {
    const accepted = chatReportReceipt(value, roomId, JSON.parse(body).clientReportId);
    if (!key.current || !await privatePendingStore.clear(key.current, body)) throw Error('已收件，但裝置確認資料尚未清理；請重新查核。');
    original.current = null;
    if (alive.current) { setPending(null); setReceipt(accepted); setIssue(''); }
  }
  async function check(body: string) {
    await acknowledge(await api(`/chat/conversations/${roomId}/reports/${JSON.parse(body).clientReportId}`), body);
  }
  async function restore() {
    if (running.current) return; running.current = true; setReady(false); setBusy(true); setIssue('');
    try {
      key.current = await pendingRequestKey(apiUrl, userId, 'chat-report.' + roomId);
      const saved = await privatePendingStore.get(key.current);
      if (saved) {
        const b = JSON.parse(saved);
        if (JSON.stringify(chatReportBody(b.clientReportId, b.reportedUserId, b.reason, b.details, b.messageId)) !== saved || b.reportedUserId !== reportedUserId) throw Error();
        original.current = saved;
        if (alive.current) { setPending(saved); setReason(b.reason); setDetails(b.details); }
        try { await check(saved); } catch { if (alive.current) setIssue('原檢舉尚未確認。重開只查核收件；需要重試時請按「重試原檢舉」。'); }
      }
      if (alive.current) setReady(true);
    } catch { if (alive.current) setIssue('無法讀取安全儲存；請重試恢復，不會另建檢舉。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => { alive.current = true; void restore(); return () => { alive.current = false; }; }, []);
  async function submit() {
    if (!ready || running.current || !key.current || receipt) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const body = original.current ?? JSON.stringify(chatReportBody(Crypto.randomUUID(), reportedUserId, reason, details, messageId));
      await privatePendingStore.save(key.current, body); original.current = body; if (alive.current) setPending(body);
      await acknowledge(await api(`/chat/conversations/${roomId}/reports`, { method: 'POST', body }), body);
    } catch { if (alive.current) setIssue('未能確認收件。原檢舉保留；查核或重試會沿用原識別碼及內容。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function verify() {
    if (running.current || !original.current) return; running.current = true; setBusy(true);
    try { await check(original.current); } catch { if (alive.current) setIssue('尚未確認原檢舉收件；內容仍保留。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled || busy} style={[s.button, (disabled || busy) && s.disabled]} onPress={action}><Text style={s.buttonText}>{label}</Text></Pressable>;
  return <SafeAreaModal visible animationType="slide" onRequestClose={onClose} contentStyle={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>檢舉聊天內容或對方</Text><Text style={s.body}>{messageId ? '這次檢舉會附上你選擇的對方訊息編號。' : '檢舉這段對話中的不當內容或對方。'} 檢舉會交由人工查閱；也可回聊天室封鎖對方停止新訊息。</Text>
    {!receipt && <>{CHAT_REPORT_REASONS.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value, disabled: !!pending || !ready || busy }} disabled={!!pending || !ready || busy} style={s.option} onPress={() => setReason(value)}><Text style={s.body}>{reason === value ? '●' : '○'} {label}</Text></Pressable>)}
      <TextInput accessibilityLabel="聊天檢舉補充說明" placeholder="補充說明（選填，最多 2000 字）" maxLength={2000} multiline editable={!pending && ready && !busy} value={details} onChangeText={setDetails} style={s.input} />
      {button(pending ? '重試原檢舉' : '送出檢舉', () => void submit(), !ready)}{pending && button('只查核原收件', () => void verify())}{!ready && button('重試恢復', () => void restore())}</>}
    {!!receipt && <Text accessibilityRole="alert" style={s.body}>已收件，收件編號：{receipt}。由人工查閱；尚不代表已移除內容或封鎖對方。</Text>}
    {!!issue && <Text accessibilityRole="alert" style={s.error}>{issue}</Text>}{busy && <ActivityIndicator />}{button(receipt ? '完成，返回聊天' : '返回聊天', onClose)}
  </ScrollView></SafeAreaModal>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: iosColors.background }, content: { padding: iosSpacing.lg, gap: iosSpacing.md }, title: { ...iosType.title2, color: iosColors.label }, body: { ...iosType.body, color: iosColors.label }, option: { minHeight: 48, justifyContent: 'center' }, input: { ...iosType.body, color: iosColors.label, minHeight: 110, backgroundColor: iosColors.surface, borderRadius: iosRadius.control, padding: iosSpacing.md }, button: { minHeight: 48, backgroundColor: iosColors.tint, borderRadius: iosRadius.control, alignItems: 'center', justifyContent: 'center', padding: iosSpacing.sm }, buttonText: { ...iosType.headline, color: iosColors.white }, disabled: { opacity: 0.4 }, error: { ...iosType.body, color: iosColors.danger } });
