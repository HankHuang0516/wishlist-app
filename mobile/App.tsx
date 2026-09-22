import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, createApi } from './src/api';
import { parseSessionUser, restoreSession, SESSION_KEY, sessionIssueMessage } from './src/session';
import type { SessionUser, SessionIssue } from './src/session';
import { ListingComposer } from './src/ListingComposer';
import { ExploreScreen } from './src/ExploreScreen';
import { ChatInbox } from './src/ChatScreen';
import { WishHome } from './src/WishHome';
import { WishScreen } from './src/WishScreen';
import { AccountSecurityScreen } from './src/AccountSecurityScreen';
import { AuthScreen } from './src/AuthScreen';
import { admitLogin, recoveryLink, RecoveryLink } from './src/authFlow';
import { createAuthOperationGate, isCurrentAuthEpoch } from './src/authOperation';
import { PRODUCT_NOTICE_KEY, hasProductNoticeAck } from './src/productNotice';
import { ProductNoticeScreen } from './src/ProductNoticeScreen';
import { AccountDeletionScreen } from './src/AccountDeletionScreen';
import { nativeDeletionRecovery } from './src/nativeDeletionRecovery';
import { DELETION_STORAGE_ISSUE, restoreAfterDeletionCheck } from './src/deletionRecovery';
import type { DeletionJournal } from './src/accountDeletion';
import type { PublicListing } from './src/listingSearch';
import { TABS, TAB_IDS } from './src/navigation';
import { configureMapLogging } from './src/mapLogging';
import type { Tab } from './src/navigation';
import { iosColors, iosFloatingShadow, iosRadius, iosSpacing, iosType, minimumTapSize } from './src/iosTheme';
type User = SessionUser;

const TAB_ICONS: Record<Tab, { active: React.ComponentProps<typeof Ionicons>['name']; inactive: React.ComponentProps<typeof Ionicons>['name'] }> = {
  首頁: { active: 'sparkles', inactive: 'sparkles-outline' },
  願望: { active: 'heart', inactive: 'heart-outline' },
  探索: { active: 'map', inactive: 'map-outline' },
  社交: { active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  我的: { active: 'person-circle', inactive: 'person-circle-outline' },
};

configureMapLogging();

export default function App() {
  // Expo statically inlines the public endpoint in the JS bundle. A debug
  // bundle can therefore use its isolated loopback API without rebuilding the
  // embedded native manifest. This is never a place for credentials; API and
  // session validators still require HTTPS when __DEV__ is false.
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl as string | undefined;
  return <SafeAreaProvider><StatusBar style="dark" />{
    apiUrl ? <NativeApp key={apiUrl} apiUrl={apiUrl} /> : <SafeAreaView style={styles.screen}><Text style={styles.title}>Wishlist.ai</Text><Text style={styles.body}>尚未設定服務連線，請設定 EXPO_PUBLIC_API_URL 後重新建置。</Text></SafeAreaView>
  }</SafeAreaProvider>;
}

function NativeApp({ apiUrl }: { apiUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [noticeChecked, setNoticeChecked] = useState(false);
  const [noticeNeeded, setNoticeNeeded] = useState(true);
  const [tab, setTab] = useState<Tab>('首頁');
  const [authLink, setAuthLink] = useState<RecoveryLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionIssue, setSessionIssue] = useState<SessionIssue | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [composing, setComposing] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [exploreWishId, setExploreWishId] = useState<number | undefined>(undefined);
  const [focusListing, setFocusListing] = useState<PublicListing | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionJournal, setDeletionJournal] = useState<DeletionJournal | null>(null);
  const [deletionProblem, setDeletionProblem] = useState('');
  const deletionActive = useRef(false);
  const accountOperation = useRef(createAuthOperationGate()).current;
  const authEpoch = useRef(0);
  const authRunning = useRef(false);
  const recoveryOperation = useRef(createAuthOperationGate()).current;
  const sessionEpoch = authEpoch.current;
  const api = useMemo(() => createApi(apiUrl, () => token, __DEV__), [apiUrl, token]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(PRODUCT_NOTICE_KEY).then(saved => {
      if (active) { setNoticeNeeded(!hasProductNoticeAck(saved, apiUrl, __DEV__)); setNoticeChecked(true); }
    }).catch(() => { if (active) { setNoticeNeeded(true); setNoticeChecked(true); } });
    return () => { active = false; };
  }, [apiUrl]);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Recovery BEFORE ordinary restore, which deletes a stale JWT on 401.
      // Never admit another account while an irreversible operation is unknown.
      const checked = await restoreAfterDeletionCheck(() => nativeDeletionRecovery(apiUrl).then(recovery => recovery.read()), () => restoreSession(apiUrl, {
        get: () => SecureStore.getItemAsync(SESSION_KEY), remove: () => SecureStore.deleteItemAsync(SESSION_KEY),
      }, saved => createApi(apiUrl, () => saved, __DEV__)('/users/me'), __DEV__));
      if (!active) return;
      if (checked.kind === 'deletion') { deletionActive.current = true; setDeletionJournal(checked.journal); setBooting(false); return; }
      if (checked.kind === 'deletion-storage-unavailable') { deletionActive.current = true; setDeletionProblem(DELETION_STORAGE_ISSUE); setBooting(false); return; }
      deletionActive.current = false;
      const result = checked.session;
      if (active) {
        if (result.kind === 'authenticated') { authEpoch.current++; setToken(result.token); setUser(result.user); }
        else if (result.kind !== 'anonymous') { setSessionIssue(result.kind); setError(sessionIssueMessage(result.kind)); }
        setBooting(false);
      }
    })();
    return () => { active = false; };
  }, [apiUrl, restoreAttempt]);

  async function authenticate(value: unknown) {
    if (authRunning.current || deletionActive.current) throw new Error('Authentication already running or deletion unresolved');
    authRunning.current = true;
    setBusy(true); setError('');
    try {
      const result = await admitLogin(value, apiUrl, saved => createApi(apiUrl, () => saved, __DEV__)('/users/me'), encoded => SecureStore.setItemAsync(SESSION_KEY, encoded, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }), __DEV__);
      authEpoch.current++; setActiveRoom(null); setComposing(false); setExploreWishId(undefined); setFocusListing(null); setTab('首頁');
      setToken(result.token); setUser(result.user); setSessionIssue(null);
      setAuthLink(current => current === authLink ? null : current);
    }
    finally { authRunning.current = false; setBusy(false); }
  }

  async function logout(revokedMessage?: string) {
    if (authRunning.current || deletionActive.current) return;
    authRunning.current = true; setBusy(true);
    authEpoch.current++;
    if (revokedMessage) {
      setToken(null); setUser(null); setActiveRoom(null); setComposing(false); setExploreWishId(undefined); setFocusListing(null); setTab('首頁');
      setError(revokedMessage); setSessionIssue('expired');
    }
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      setToken(null); setUser(null); setActiveRoom(null); setComposing(false); setExploreWishId(undefined); setFocusListing(null); setTab('首頁');
      setError(revokedMessage ?? ''); setSessionIssue(revokedMessage ? 'expired' : null); setBusy(false);
    } catch {
      if (revokedMessage) { setSessionIssue('expired-storage-unavailable'); setError(revokedMessage + '\n' + sessionIssueMessage('expired-storage-unavailable')); }
      else Alert.alert('無法登出', '請稍後重試。');
    } finally { authRunning.current = false; setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    function receive(url: string | null) {
      if (!active || !url) return;
      const parsed = recoveryLink(url, apiUrl, __DEV__);
      if (parsed) setAuthLink(parsed);
    }
    void Linking.getInitialURL().then(receive).catch(() => { /* Never log incoming credential links. */ });
    const subscription = Linking.addEventListener('url', event => receive(event.url));
    return () => { active = false; subscription.remove(); };
  }, [apiUrl]);

  async function resetConfirmed() {
    if (!token || !isCurrentAuthEpoch(sessionEpoch, authEpoch.current)) return;
    try { await api('/users/me'); }
    catch (failure) { if (isCurrentAuthEpoch(sessionEpoch, authEpoch.current) && failure instanceof ApiError && failure.status === 401) await logout('密碼已重設，請以新密碼重新登入。'); }
  }

  function closeRecovery() {
    if (recoveryOperation.isRunning()) {
      Alert.alert('正在確認操作結果', '請等候回覆後再關閉；返回不會取消已送出的驗證或密碼重設。');
      return;
    }
    setAuthLink(null);
  }

  useEffect(() => {
    if (!token || !user || deletionOpen || deletionJournal || deletionProblem) return;
    let active = true, checking = false; const epoch = authEpoch.current, userId = user.id;
    async function check() {
      if (!active || checking || deletionActive.current || AppState.currentState !== 'active') return;
      checking = true;
      try {
        const profile = parseSessionUser(await api('/users/me'));
        if (active && !deletionActive.current && authEpoch.current === epoch && profile.id !== userId) await logout('帳號資料不一致，請重新登入以確認裝置帳號。');
      } catch (failure) {
        if (active && !deletionActive.current && authEpoch.current === epoch && failure instanceof ApiError && failure.status === 401) await logout('登入已失效，請重新登入。');
      } finally { checking = false; }
    }
    void check(); const timer = setInterval(() => void check(), 60000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [api, token, user?.id, deletionOpen, deletionJournal, deletionProblem]);

  function erasePrivateViews() {
    authEpoch.current++; setToken(null); setUser(null); setActiveRoom(null); setComposing(false); setExploreWishId(undefined); setFocusListing(null); setAuthLink(null); setTab('首頁');
  }
  function openDeletion() {
    if (authRunning.current || recoveryOperation.isRunning() || accountOperation.isRunning() || deletionActive.current) { Alert.alert('帳號操作尚未結束', '請先確認目前操作結果。'); return; }
    deletionActive.current = true; setComposing(false); setAuthLink(null); setDeletionOpen(true);
  }
  function exitDeletion() {
    deletionActive.current = false; setDeletionOpen(false); setDeletionJournal(null); setDeletionProblem('');
    erasePrivateViews(); setBooting(true); setRestoreAttempt(n => n + 1);
  }

  if (!noticeChecked) return <SafeAreaView style={styles.center}><ActivityIndicator accessibilityLabel="載入改版說明中" /><Text style={styles.body}>正在載入…</Text></SafeAreaView>;
  if (noticeNeeded) return <SafeAreaView style={styles.screen}><ProductNoticeScreen apiUrl={apiUrl} onContinue={() => setNoticeNeeded(false)} /></SafeAreaView>;
  if (booting) return <SafeAreaView style={styles.center}><ActivityIndicator accessibilityLabel="恢復登入中" /><Text style={styles.body}>正在載入…</Text></SafeAreaView>;
  if (deletionProblem) return <SafeAreaView style={styles.screen}><Text style={styles.title}>刪除恢復資料尚未確認</Text><Text accessibilityRole="alert" style={styles.body}>{deletionProblem}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => { setDeletionProblem(''); setBooting(true); setRestoreAttempt(n => n + 1); }}><Text style={styles.buttonText}>重新讀取安全儲存</Text></Pressable></SafeAreaView>;
  if (deletionJournal || deletionOpen) return <SafeAreaView style={styles.screen}><AccountDeletionScreen apiUrl={apiUrl} userId={user?.id} token={token ?? undefined} initialJournal={deletionJournal} onPrepared={setDeletionJournal} onErased={erasePrivateViews} onExit={exitDeletion} /></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.screen}><AuthScreen apiUrl={apiUrl} initialLink={authLink} externalBusy={busy} externalIssue={error} onAuthenticated={authenticate} onRetryRestore={sessionIssue ? () => { setError(''); setSessionIssue(null); setBooting(true); setRestoreAttempt(n => n + 1); } : undefined} /></SafeAreaView>;

  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <View style={styles.brandLockup}><View style={styles.appMark}><Ionicons name="sparkles" color={iosColors.white} size={17} /></View><View><Text style={styles.brand}>Wishlist.ai</Text><Text style={styles.eyebrow}>願望市集</Text></View></View>
      <View style={styles.profilePill}><Ionicons name="person" color={iosColors.secondaryLabel} size={14} /><Text numberOfLines={1} style={styles.profileName}>{user.name || '我的願望'}</Text></View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {tab === '首頁' ? <WishHome key={user.id} api={api} apiUrl={apiUrl} onExplore={(wishId, listing) => { setExploreWishId(wishId); setFocusListing(listing ?? null); setTab('探索'); }} onWishes={() => setTab('願望')} /> : tab === '願望' ? <WishScreen key={user.id} api={api} apiUrl={apiUrl} userId={user.id} onExplore={id => { setExploreWishId(id); setFocusListing(null); setTab('探索'); }} /> : tab === '探索' ? <ExploreScreen api={api} apiUrl={apiUrl} userId={user.id} initialListing={focusListing} onInitialListingHandled={() => setFocusListing(null)} wishItemId={exploreWishId} onClearWish={() => setExploreWishId(undefined)} onOpenChat={id => { setActiveRoom(id); setTab('社交'); }} /> : tab === '社交' ? <ChatInbox api={api} apiUrl={apiUrl} userId={user.id} activeRoom={activeRoom} onRoomChange={setActiveRoom} /> :
      <AccountSecurityScreen key={user.id} api={api} operationGate={accountOperation} onDelete={openDeletion} onPublish={() => setComposing(true)} onLogout={() => void logout()} onRevoked={logout} />}
    <View style={styles.tabs}>{TABS.map(item => {
      const selected = item === tab;
      return <Pressable key={item} testID={TAB_IDS[item]} accessibilityLabel={item} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(item)} style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}>
        <Ionicons name={selected ? TAB_ICONS[item].active : TAB_ICONS[item].inactive} size={23} color={selected ? iosColors.tint : iosColors.tertiaryLabel} />
        <Text style={selected ? styles.activeTab : styles.inactiveTab}>{item}</Text>
      </Pressable>;
    })}</View>
    {composing && <ListingComposer api={api} apiUrl={apiUrl} userId={user.id} onClose={() => setComposing(false)} onSaved={status => { setComposing(false); if (['ACTIVE', 'RESERVED'].includes(status)) { setExploreWishId(undefined); setFocusListing(null); setTab('探索'); } Alert.alert(status === 'DRAFT' ? '草稿已儲存' : ['ACTIVE', 'RESERVED'].includes(status) ? '已確認商品刊登' : '已確認上次商品紀錄', status === 'DRAFT' ? '商品尚未公開。' : ['ACTIVE', 'RESERVED'].includes(status) ? '可至探索地圖查找商品。' : '商品目前已停止公開刊登。'); }} />}
    {!!authLink && <Modal visible animationType="slide" onRequestClose={closeRecovery}><SafeAreaView style={styles.screen}><AuthScreen apiUrl={apiUrl} initialLink={authLink} operationGate={recoveryOperation} onAuthenticated={authenticate} onClose={closeRecovery} onResetConfirmed={resetConfirmed} /></SafeAreaView></Modal>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: iosColors.background }, flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: iosSpacing.md, backgroundColor: iosColors.background },
  login: { padding: 28, paddingTop: 64, gap: 20 }, content: { padding: 24, gap: 20 },
  header: { minHeight: 60, paddingHorizontal: iosSpacing.lg, paddingVertical: iosSpacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: iosSpacing.sm },
  appMark: { width: 34, height: 34, borderRadius: iosRadius.small, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center' },
  brand: { ...iosType.headline, color: iosColors.label }, title: { ...iosType.largeTitle, color: iosColors.label },
  eyebrow: { ...iosType.caption, letterSpacing: 0.4, color: iosColors.secondaryLabel },
  profilePill: { maxWidth: '42%', minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: iosRadius.pill, backgroundColor: iosColors.surface },
  profileName: { ...iosType.footnote, color: iosColors.secondaryLabel, flexShrink: 1 },
  body: { ...iosType.body, color: iosColors.label }, muted: { ...iosType.subheadline, color: iosColors.secondaryLabel },
  input: { minHeight: 52, backgroundColor: iosColors.surface, borderColor: iosColors.separator, borderWidth: StyleSheet.hairlineWidth, borderRadius: iosRadius.control, padding: iosSpacing.md, fontSize: 17, color: iosColors.label },
  button: { minHeight: 52, borderRadius: iosRadius.control, backgroundColor: iosColors.tint, alignItems: 'center', justifyContent: 'center', padding: iosSpacing.sm },
  buttonText: { color: iosColors.white, ...iosType.headline }, disabled: { opacity: 0.45 }, error: { ...iosType.subheadline, color: iosColors.danger, padding: iosSpacing.md },
  card: { backgroundColor: iosColors.surface, padding: iosSpacing.lg, borderRadius: iosRadius.card, gap: iosSpacing.sm }, cardTitle: { ...iosType.headline, color: iosColors.label },
  tabs: { flexDirection: 'row', minHeight: 64, paddingTop: 6, paddingHorizontal: iosSpacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator, backgroundColor: 'rgba(255,255,255,0.97)', ...iosFloatingShadow },
  tab: { flex: 1, minHeight: minimumTapSize, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: iosRadius.control },
  tabPressed: { backgroundColor: iosColors.surfaceSecondary },
  activeTab: { color: iosColors.tint, fontSize: 10.5, lineHeight: 13, fontWeight: '700' }, inactiveTab: { color: iosColors.tertiaryLabel, fontSize: 10.5, lineHeight: 13, fontWeight: '600' },
  mapNotice: { position: 'absolute', top: 12, left: 12, right: 12, backgroundColor: iosColors.surface, padding: 12, borderRadius: iosRadius.control },
});
