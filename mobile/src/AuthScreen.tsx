import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, createApi, validateApiUrl } from './api';
import { validateNewPassword } from './accountSecurity';
import { AuthMode, RecoveryLink, authErrorMessage, emailPayload, emailRequestAck, recoveryToken, registrationAck, registrationPayload, resetAck, verificationAck } from './authFlow';
import { AuthOperationGate, createAuthOperationGate } from './authOperation';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
const titles: Record<AuthMode, string> = { login: '登入', register: '建立帳號', forgot: '忘記密碼', resend: '重新寄送驗證信', verify: '驗證 Email', reset: '重設密碼' };
export function AuthScreen({ apiUrl, initialLink, externalBusy = false, externalIssue, onRetryRestore, onAuthenticated, onClose, onResetConfirmed, operationGate }: {
  apiUrl: string; initialLink: RecoveryLink | null; externalBusy?: boolean; externalIssue?: string; onRetryRestore?: () => void;
  onAuthenticated: (value: unknown) => Promise<void>; onClose?: () => void; onResetConfirmed?: () => Promise<void>; operationGate?: AuthOperationGate;
}) {
  const [mode, setMode] = useState<AuthMode>(initialLink?.mode ?? 'login');
  const [identifier, setIdentifier] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [linkText, setLinkText] = useState(initialLink?.token ?? '');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState(''), [message, setMessage] = useState('');
  const active = useRef(true), handledLink = useRef<RecoveryLink | null>(null);
  const ownOperation = useRef(createAuthOperationGate());
  const operation = operationGate ?? ownOperation.current;
  const scroll = useRef<ScrollView>(null);
  const publicApi = React.useMemo(() => createApi(apiUrl, () => null, __DEV__), [apiUrl]);
  const disabled = busy || externalBusy;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [mode]);
  useEffect(() => {
    if (!initialLink || handledLink.current === initialLink || busy) return;
    handledLink.current = initialLink; setMode(initialLink.mode); setLinkText(initialLink.token); setPassword(''); setConfirmation(''); setIssue('');
    scroll.current?.scrollTo({ y: 0, animated: false });
    setMessage('連結已載入。請確認後提交；不會自動操作或切換登入帳號。');
  }, [initialLink, busy]);
  function navigate(next: AuthMode) {
    if (operation.isRunning() || externalBusy) return;
    setMode(next); setPassword(''); setConfirmation(''); setLinkText(''); setIssue(''); setMessage('');
  }
  async function policy(path: '/privacy' | '/terms') {
    try { await Linking.openURL(validateApiUrl(apiUrl, __DEV__) + path); }
    catch { if (active.current) setIssue('無法開啟政策頁，請稍後重試。'); }
  }
  async function submit() {
    if (operation.isRunning() || externalBusy || !active.current) return;
    let path: string, payload: object;
    try {
      if (mode === 'login') {
        if (!identifier.trim() || identifier.length > 254 || !password || password.length > 1024 || password.includes('\u0000')) throw new Error('請輸入帳號與密碼。');
        path = '/auth/login'; payload = { phoneNumber: identifier.trim(), password };
      } else if (mode === 'register') {
        path = '/auth/register'; payload = registrationPayload({ name, phone, email, password, confirmation });
      } else if (mode === 'forgot' || mode === 'resend') {
        path = mode === 'forgot' ? '/auth/forgot-password' : '/auth/resend-verification'; payload = emailPayload(email);
      } else {
        const token = recoveryToken(linkText, mode, apiUrl, __DEV__);
        path = mode === 'verify' ? '/auth/verify-email' : '/auth/reset-password';
        payload = mode === 'verify' ? { token } : { token, newPassword: validateNewPassword(password, confirmation) };
      }
    } catch (failure) { setIssue(failure instanceof Error ? failure.message : '請檢查輸入。'); return; }
    const release = operation.tryBegin();
    if (!release) return;
    setBusy(true); setIssue(''); setMessage('');
    try {
      const ack = await publicApi<unknown>(path, { method: 'POST', body: JSON.stringify(payload) });
      if (!active.current) return;
      if (mode === 'login') await onAuthenticated(ack);
      else if (mode === 'register') {
        const result = registrationAck(ack, email.trim()); setPassword(''); setConfirmation(''); setMode('resend');
        setMessage(result.sent ? '帳號已建立，請至 Email 收取驗證連結。驗證後再登入，才能刊登商品。' : '帳號已建立，但驗證信未成功寄送。請使用下方入口重新申請；不要重複註冊。');
      } else if (mode === 'forgot' || mode === 'resend') {
        emailRequestAck(ack); setMessage('已收到請求；若帳號符合條件，系統會嘗試寄送信件。請查看信箱；未收到可稍後重試。');
      } else if (mode === 'verify') {
        verificationAck(ack); setLinkText(''); setMessage('Email 已驗證。請以帳號與密碼登入；不會使用驗證信切換目前帳號。');
        if (!onClose) setMode('login');
      } else {
        resetAck(ack); setLinkText(''); setPassword(''); setConfirmation('');
        setMessage('密碼已重設，該帳號的舊裝置登入與個人 API key 已撤銷。請使用新密碼登入。');
        await onResetConfirmed?.(); if (!onClose && active.current) setMode('login');
      }
    } catch (failure) {
      if (active.current) {
        setIssue(authErrorMessage(failure));
        if (failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED') { if (identifier.includes('@')) setEmail(identifier.trim()); setMode('resend'); setPassword(''); }
      }
    } finally { release(); if (active.current) setBusy(false); }
  }
  const input = (label: string, value: string, change: (value: string) => void, options: Partial<React.ComponentProps<typeof TextInput>> = {}) =>
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={change} editable={!disabled} autoCapitalize="none" autoCorrect={false} style={styles.input} {...options} />;
  const button = (label: string, action: () => void, primary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={[primary ? styles.button : styles.link, disabled && styles.disabled]}><Text style={primary ? styles.buttonText : styles.linkText}>{label}</Text></Pressable>;
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>YOUR WISH, A LITTLE CLOSER</Text><Text style={styles.brand}>Wishlist.ai</Text><Text style={styles.body}>留下願望，找到附近的下一個好物。</Text><Text style={styles.heading}>{titles[mode]}</Text>
    {mode === 'login' && <>{input('手機號碼或 Email', identifier, setIdentifier, { autoComplete: 'username', maxLength: 254 })}{input('密碼', password, setPassword, { secureTextEntry: true, autoComplete: 'current-password', maxLength: 1024 })}</>}
    {mode === 'register' && <>{input('顯示名稱', name, setName, { maxLength: 50, autoComplete: 'name' })}{input('手機號碼', phone, setPhone, { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 10 })}{input('Email', email, setEmail, { keyboardType: 'email-address', autoComplete: 'email', maxLength: 254 })}</>}
    {(mode === 'forgot' || mode === 'resend') && input('註冊時的 Email', email, setEmail, { keyboardType: 'email-address', autoComplete: 'email', maxLength: 254 })}
    {(mode === 'verify' || mode === 'reset') && <><Text style={styles.note}>請貼上信件中的連結或驗證碼。連結含一次性憑證，不會儲存到裝置或傳送給其他服務。</Text>{input(mode === 'verify' ? 'Email 驗證連結或驗證碼' : '密碼重設連結或驗證碼', linkText, setLinkText, { maxLength: 2048 })}</>}
    {(mode === 'register' || mode === 'reset') && <>{input('新密碼', password, setPassword, { secureTextEntry: true, autoComplete: 'new-password', maxLength: 73 })}{input('再次輸入新密碼', confirmation, setConfirmation, { secureTextEntry: true, autoComplete: 'new-password', maxLength: 73 })}<Text style={styles.note}>密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。</Text></>}
    {!!(issue || externalIssue) && <Text accessibilityRole="alert" style={styles.error}>{issue || externalIssue}</Text>}
    {!!message && <Text accessibilityRole="alert" style={styles.note}>{message}</Text>}
    {button(disabled ? '確認中…' : titles[mode], () => void submit(), true)}
    {!!onRetryRestore && button('重試確認裝置登入狀態', onRetryRestore)}
    {!onClose && <View style={styles.navigation}>
      {mode !== 'login' && button('返回登入', () => navigate('login'))}
      {mode === 'login' && <>{button('建立帳號', () => navigate('register'))}{button('忘記密碼', () => navigate('forgot'))}</>}
      {mode !== 'resend' && button('重新寄送驗證信', () => navigate('resend'))}
      {mode !== 'verify' && button('我已有 Email 驗證連結', () => navigate('verify'))}
      {mode !== 'reset' && button('我已有密碼重設連結', () => navigate('reset'))}
    </View>}
    {!!onClose && button('關閉，返回目前帳號', onClose)}
    <View>{button('隱私政策', () => void policy('/privacy'))}{button('使用條款', () => void policy('/terms'))}</View>
    <Text style={styles.note}>目前為開發驗證版本，完整雙平台與商店驗收尚未完成。</Text>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { flexGrow: 1, paddingHorizontal: iosSpacing.xl, paddingTop: iosSpacing.xxl, paddingBottom: 48, gap: iosSpacing.md },
  brand: { ...iosType.largeTitle, color: iosColors.label },
  heading: { ...iosType.title2, color: iosColors.label, marginTop: iosSpacing.sm },
  eyebrow: { ...iosType.caption, letterSpacing: 1.1, color: iosColors.tint },
  body: { ...iosType.body, color: iosColors.secondaryLabel },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  input: { minHeight: 54, backgroundColor: iosColors.surface, borderColor: iosColors.separator, borderWidth: StyleSheet.hairlineWidth, borderRadius: iosRadius.control, paddingHorizontal: iosSpacing.md, paddingVertical: 14, fontSize: 17, color: iosColors.label, ...iosShadow },
  button: { minHeight: 54, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center', padding: iosSpacing.md, marginTop: iosSpacing.xs },
  buttonText: { color: iosColors.white, ...iosType.headline },
  link: { minHeight: minimumTapSize, justifyContent: 'center', alignItems: 'center', paddingVertical: iosSpacing.sm },
  linkText: { ...iosType.callout, fontWeight: '600', color: iosColors.tint },
  navigation: { gap: iosSpacing.xxs, backgroundColor: iosColors.surface, borderRadius: iosRadius.card, paddingHorizontal: iosSpacing.md, paddingVertical: iosSpacing.xs },
  disabled: { opacity: 0.45 },
  error: { color: iosColors.danger, ...iosType.subheadline, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm },
});
