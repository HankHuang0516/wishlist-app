import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, createApi, validateApiUrl } from './api';
import { validateNewPassword } from './accountSecurity';
import { AuthMode, RecoveryLink, authErrorMessage, emailPayload, emailRequestAck, recoveryToken, registrationAck, registrationPayload, resetAck, verificationAck } from './authFlow';
import { AuthOperationGate, createAuthOperationGate } from './authOperation';
import { iosColors, iosRadius, iosShadow, iosSpacing, iosType, minimumTapSize } from './iosTheme';
import { TermsAgreement } from './TermsAgreement';
const titles: Record<AuthMode, string> = { login: '登入', register: '建立帳號', forgot: '忘記密碼', resend: '重新寄送驗證信', verify: '驗證 Email', reset: '重設密碼' };
const intros: Record<AuthMode, string> = {
  login: '使用手機號碼或 Email 登入', register: '輸入資料建立你的帳號',
  forgot: '輸入註冊時的 Email，我們會寄送重設連結。', resend: '輸入註冊時的 Email，我們會再寄一次驗證信。',
  verify: '貼上信件中的連結或驗證碼，完成 Email 驗證。', reset: '貼上信件中的連結或驗證碼，並設定新密碼。',
};
const actions: Record<AuthMode, string> = { login: '登入', register: '建立帳號', forgot: '寄送重設連結', resend: '寄送驗證信', verify: '驗證 Email', reset: '重設密碼' };
// Each step lists only where a person goes next from it; signing in and registering use the switch line instead.
const nextSteps: Record<AuthMode, readonly (readonly [label: string, target: AuthMode])[]> = {
  login: [], register: [],
  forgot: [['我已有重設連結', 'reset'], ['返回登入', 'login']],
  resend: [['我已有驗證連結', 'verify'], ['返回登入', 'login']],
  verify: [['重新寄送驗證信', 'resend'], ['返回登入', 'login']],
  reset: [['重新申請密碼重設信', 'forgot'], ['返回登入', 'login']],
};
function Field({ label, secret = false, hint, ...options }: { label: string; secret?: boolean; hint?: string } & React.ComponentProps<typeof TextInput>) {
  const [shown, setShown] = useState(false);
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>
    <View><TextInput placeholderTextColor={iosColors.secondaryLabel} accessibilityLabel={label} placeholder={label} autoCapitalize="none" autoCorrect={false} {...options} secureTextEntry={secret && !shown} style={[styles.input, secret && styles.secretInput]} />
      {secret && <Pressable accessibilityRole="button" accessibilityLabel={(shown ? '隱藏密碼' : '顯示密碼') + '：' + label} onPress={() => setShown(value => !value)} style={styles.reveal}><Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={iosColors.secondaryLabel} /></Pressable>}</View>
    {!!hint && <Text style={styles.hint}>{hint}</Text>}</View>;
}
export function AuthScreen({ apiUrl, initialLink, externalBusy = false, externalIssue, onRetryRestore, onAuthenticated, onClose, onResetConfirmed, operationGate, onTermsAccepted, onBrowse }: {
  onTermsAccepted?: () => void; onBrowse?: () => void;
  apiUrl: string; initialLink: RecoveryLink | null; externalBusy?: boolean; externalIssue?: string; onRetryRestore?: () => void;
  onAuthenticated: (value: unknown) => Promise<void>; onClose?: () => void; onResetConfirmed?: () => Promise<void>; operationGate?: AuthOperationGate;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialLink?.mode ?? 'login');
  const [identifier, setIdentifier] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [linkText, setLinkText] = useState(initialLink?.token ?? '');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState(''), [message, setMessage] = useState(''), [taken, setTaken] = useState(false);
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
    setMode(next); setPassword(''); setConfirmation(''); setLinkText(''); setIssue(''); setMessage(''); setTaken(false);
  }
  async function policy(path: '/privacy' | '/terms') {
    try { await Linking.openURL(validateApiUrl(apiUrl, __DEV__) + path); }
    catch { if (active.current) setIssue('無法開啟政策頁，請稍後重試。'); }
  }
  async function submit() {
    if (operation.isRunning() || externalBusy || !active.current) return;
    if ((mode === 'login' || mode === 'register') && !termsAccepted) { setIssue('請先閱讀並同意使用條款。'); return; }
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
    setBusy(true); setIssue(''); setMessage(''); setTaken(false);
    try {
      const ack = await publicApi<unknown>(path, { method: 'POST', body: JSON.stringify(payload) });
      if (!active.current) return;
      if (mode === 'login') await onAuthenticated(ack);
      else if (mode === 'register') {
        const result = registrationAck(ack, email.trim()); setPassword(''); setConfirmation(''); setMode('resend');
        setMessage(result.sent ? '帳號已建立，請至 Email 收取驗證連結。驗證後再登入，才能刊登商品。' : '帳號已建立，但驗證信未成功寄送。請在這裡重新申請；不要重複註冊。');
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
        setIssue(authErrorMessage(failure)); setTaken(mode === 'register' && failure instanceof ApiError && failure.code === 'USER_EXISTS');
        if (failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED') { if (identifier.includes('@')) setEmail(identifier.trim()); setMode('resend'); setPassword(''); }
      }
    } finally { release(); if (active.current) setBusy(false); }
  }
  const field = (label: string, value: string, change: (value: string) => void, options: Partial<React.ComponentProps<typeof Field>> = {}) =>
    <Field key={mode + label} label={label} value={value} onChangeText={change} editable={!disabled} {...options} />;
  const button = (label: string, action: () => void, primary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={[primary ? styles.button : styles.link, disabled && styles.disabled]}><Text style={primary ? styles.buttonText : styles.linkText}>{label}</Text></Pressable>;
  // `name` is what assistive technology and the QA tools address; `label` is what is drawn.
  const link = (label: string, action: () => void, name = label, small = false) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={name} disabled={disabled} onPress={action} style={[styles.inlineLink, disabled && styles.disabled]}><Text style={small ? styles.smallLinkText : styles.linkText}>{label}</Text></Pressable>;
  const switchLine = (prompt: string, label: string, target: AuthMode) => <View style={[styles.row, styles.switchLine]}><Text style={styles.prompt}>{prompt}</Text>{link(label, () => navigate(target))}</View>;
  if ((mode === 'login' || mode === 'register') && !termsAccepted) return <View style={styles.flex}>{!!externalIssue?.trim() && <Text accessibilityRole="alert" style={styles.error}>{externalIssue.trim()}</Text>}{onBrowse&&button('先逛逛，不登入',onBrowse)}<TermsAgreement apiUrl={apiUrl} onAccept={() => { setTermsAccepted(true); onTermsAccepted?.(); }} /></View>;
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, !!onBrowse && styles.contentUnderBack]}>
    {onBrowse && <Pressable accessibilityRole="button" accessibilityLabel="返回訪客瀏覽" disabled={disabled} onPress={onBrowse} style={[styles.back, disabled && styles.disabled]}><Ionicons name="chevron-back" size={20} color={iosColors.tint} /><Text style={styles.linkText}>返回訪客瀏覽</Text></Pressable>}
    <View style={styles.header}><Text style={styles.brand}>Wishlist.ai</Text><Text style={styles.heading}>{titles[mode]}</Text><Text style={styles.body}>{intros[mode]}</Text></View>
    {mode === 'login' && <>{field('手機號碼或 Email', identifier, setIdentifier, { autoComplete: 'username', maxLength: 254 })}
      <View>{field('密碼', password, setPassword, { secret: true, autoComplete: 'current-password', maxLength: 1024 })}
        {!onClose && <View style={styles.trailing}>{link('忘記密碼？', () => navigate('forgot'), '忘記密碼')}</View>}</View></>}
    {mode === 'register' && <>{field('顯示名稱', name, setName, { maxLength: 50, autoComplete: 'name' })}{field('手機號碼（選填）', phone, setPhone, { keyboardType: 'phone-pad', autoComplete: 'tel', maxLength: 10 })}{field('Email', email, setEmail, { keyboardType: 'email-address', autoComplete: 'email', maxLength: 254 })}</>}
    {(mode === 'forgot' || mode === 'resend') && field('註冊時的 Email', email, setEmail, { keyboardType: 'email-address', autoComplete: 'email', maxLength: 254 })}
    {(mode === 'verify' || mode === 'reset') && field(mode === 'verify' ? 'Email 驗證連結或驗證碼' : '密碼重設連結或驗證碼', linkText, setLinkText, { maxLength: 2048, hint: '連結含一次性憑證，不會儲存到裝置或傳送給其他服務。' })}
    {(mode === 'register' || mode === 'reset') && <>{field('新密碼', password, setPassword, { secret: true, autoComplete: 'new-password', maxLength: 73, hint: '密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。' })}{field('再次輸入新密碼', confirmation, setConfirmation, { secret: true, autoComplete: 'new-password', maxLength: 73 })}</>}
    {!!(issue || externalIssue) && <Text accessibilityRole="alert" style={styles.error}>{issue || externalIssue}</Text>}
    {taken && !onClose && <View style={styles.trailing}>{link('忘記密碼？', () => navigate('forgot'), '忘記密碼')}</View>}
    {!!message && <Text accessibilityRole="alert" style={styles.note}>{message}</Text>}
    {button(disabled ? '確認中…' : actions[mode], () => void submit(), true)}
    {!!onRetryRestore && button('重試確認裝置登入狀態', onRetryRestore)}
    {!onClose && mode === 'login' && switchLine('還沒有帳號？', '建立帳號', 'register')}
    {!onClose && mode === 'register' && switchLine('已有帳號？', '登入', 'login')}
    {!onClose && nextSteps[mode].length > 0 && <View style={styles.row}>{nextSteps[mode].map(([label, target]) => link(label, () => navigate(target)))}</View>}
    {!!onClose && button('關閉，返回目前帳號', onClose)}
    <View style={[styles.row, styles.policies]}>{link('隱私政策', () => void policy('/privacy'), '隱私政策', true)}<View style={styles.divider} />{link('使用條款', () => void policy('/terms'), '使用條款', true)}</View>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: iosColors.background },
  content: { flexGrow: 1, paddingHorizontal: iosSpacing.xl, paddingTop: iosSpacing.xl, paddingBottom: iosSpacing.xl, gap: iosSpacing.md },
  contentUnderBack: { paddingTop: iosSpacing.xs },
  back: { minHeight: minimumTapSize, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: iosSpacing.xxs, marginLeft: -iosSpacing.xxs, paddingRight: iosSpacing.sm },
  header: { gap: iosSpacing.xxs, marginBottom: iosSpacing.xxs },
  brand: { ...iosType.headline, color: iosColors.label, letterSpacing: 0.2, marginBottom: iosSpacing.xs },
  heading: { ...iosType.title, color: iosColors.label },
  body: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  note: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  field: { gap: iosSpacing.xxs },
  fieldLabel: { ...iosType.subheadline, color: iosColors.label, fontWeight: '600' },
  hint: { ...iosType.footnote, color: iosColors.secondaryLabel, marginTop: iosSpacing.xxs },
  input: { minHeight: 54, backgroundColor: iosColors.surface, borderColor: iosColors.separator, borderWidth: StyleSheet.hairlineWidth, borderRadius: iosRadius.control, paddingHorizontal: iosSpacing.md, paddingVertical: 14, fontSize: 17, color: iosColors.label, ...iosShadow },
  secretInput: { paddingRight: 54 },
  reveal: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 54, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  button: { minHeight: 54, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center', padding: iosSpacing.md, marginTop: iosSpacing.xs },
  buttonText: { color: iosColors.white, ...iosType.headline },
  link: { minHeight: minimumTapSize, justifyContent: 'center', alignItems: 'center', paddingVertical: iosSpacing.sm },
  linkText: { ...iosType.callout, fontWeight: '600', color: iosColors.tint },
  inlineLink: { minHeight: minimumTapSize, minWidth: minimumTapSize, justifyContent: 'center', alignItems: 'center', paddingHorizontal: iosSpacing.xs },
  smallLinkText: { ...iosType.footnote, color: iosColors.secondaryLabel },
  divider: { width: 1, height: 12, backgroundColor: iosColors.separator },
  trailing: { alignItems: 'flex-end', marginRight: -iosSpacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: iosSpacing.xs },
  switchLine: { columnGap: 0 },
  prompt: { ...iosType.callout, color: iosColors.secondaryLabel },
  policies: { marginTop: 'auto' },
  disabled: { opacity: 0.45 },
  error: { color: iosColors.danger, ...iosType.subheadline, backgroundColor: iosColors.dangerSoft, borderRadius: iosRadius.control, padding: iosSpacing.sm },
});
