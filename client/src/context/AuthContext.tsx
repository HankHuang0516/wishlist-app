import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { API_URL, getFullApiUrl } from '../config';
import { useLocation, useNavigate } from 'react-router-dom';
import { authReturnTo, type AuthReturnTo } from '../lib/authReturnTo';
import { AUTH_SESSION_KEY, authSession, parseAuthUser, persistSession, readSession, type AuthSession, type AuthUser } from '../lib/authSession';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser, returnTo?: AuthReturnTo) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
function restore(): { session: AuthSession | null; notice: string } {
  try { return { session: readSession(localStorage, getFullApiUrl()), notice: '' }; }
  catch { return { session: null, notice: '無法恢復瀏覽器登入資料，請重新登入。待確認操作仍保留於原帳號。' }; }
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(restore), [session, setSession] = useState(initial.session), [notice, setNotice] = useState(initial.notice);
  const current = useRef(session), generation = useRef(0), request = useRef(0), active = useRef(true), controller = useRef<AbortController | null>(null);
  const navigate = useNavigate(), location = useLocation(), route = useRef(location);
  const navigation = useRef(navigate); navigation.current = navigate;
  route.current = location;
  const replace = useCallback((next: AuthSession | null) => {
    generation.current++; request.current++; controller.current?.abort();
    current.current = next; setSession(next);
  }, []);
  const signOut = useCallback((expired: boolean) => {
    replace(null);
    try {
      const clean = persistSession(localStorage, null, getFullApiUrl());
      setNotice(!clean ? '此頁已登出，但部分舊登入資料未能清除。請清除網站登入資料後再重新登入。' : expired ? '登入已失效，請重新登入後繼續；原待確認操作沒有被刪除。' : '');
    } catch {
      for (const key of [AUTH_SESSION_KEY, 'token', 'user']) { try { localStorage.removeItem(key); } catch { /* Visible warning below. */ } }
      setNotice('此頁已登出，但無法確認瀏覽器登入資料已清除。請清除網站登入資料後再重新登入。');
    }
    const next = authReturnTo(route.current.pathname + route.current.search);
    navigation.current(expired ? '/login?next=' + encodeURIComponent(next) : '/login', { replace: true });
  }, [replace]);
  const login = useCallback((token: string, user: AuthUser, returnTo: AuthReturnTo = '/dashboard') => {
    const next = authSession(token, user);
    let clean: boolean;
    try { clean = persistSession(localStorage, next, getFullApiUrl()); }
    catch { throw new Error('無法安全保存登入資料，請檢查瀏覽器網站儲存設定後重試。'); }
    replace(next); setNotice(clean ? '' : '已登入，但部分舊登入資料未能清除；目前使用新帳號的獨立登入紀錄。');
    navigation.current(authReturnTo(returnTo));
  }, [replace]);
  const refreshUser = useCallback(async () => {
    const original = current.current;
    if (!original) return;
    const revision = generation.current, sequence = ++request.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => active.current && generation.current === revision && request.current === sequence && current.current?.token === original.token;
    try {
      const res = await fetch(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${original.token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
      if (!isCurrent()) return;
      if (res.status === 401 || res.status === 404) { signOut(true); return; }
      if (!res.ok) throw new Error('Account read unavailable');
      const user = parseAuthUser(await res.json());
      if (!isCurrent()) return;
      if (user.id !== original.user.id) { signOut(true); return; }
      const next = { token: original.token, user };
      let clean = false;
      try { clean = persistSession(localStorage, next, getFullApiUrl()); } catch { /* Confirmed data remains usable in memory. */ }
      if (!isCurrent()) return;
      current.current = next; setSession(next);
      setNotice(clean ? '' : '已取得最新帳號資料，但無法完整保存至瀏覽器；重新開啟後請再次核對。');
    } catch {
      if (isCurrent() && !abort.signal.aborted) setNotice('暫時無法更新帳號資料；目前顯示上次確認內容，尚未確認登入失效。可重試更新。');
    }
  }, [signOut]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current++; request.current++; controller.current?.abort(); };
  }, []);
  useEffect(() => { if (session) void refreshUser(); }, [session?.token, session?.user.id, refreshUser]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== AUTH_SESSION_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== localStorage) return;
        const next = readSession(localStorage, getFullApiUrl());
        const sameIdentity = next?.token === current.current?.token && next?.user.id === current.current?.user.id;
        replace(next); setNotice(next ? '其他分頁已變更登入帳號，已切換並重新核對。' : '其他分頁已登出；原待確認操作仍保留。');
        if (next && sameIdentity) void refreshUser();
      } catch { replace(null); setNotice('其他分頁的登入資料無法驗證，請重新登入。'); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [replace, refreshUser]);
  return <AuthContext.Provider value={{ user: session?.user ?? null, token: session?.token ?? null, login, logout: () => signOut(false), refreshUser, isAuthenticated: Boolean(session) }}>
    {notice && <div role="status" className="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{notice}</p>{session && <button className="mt-2 min-h-11 rounded-xl border px-4" onClick={() => void refreshUser()}>重新核對帳號</button>}</div>}
    {children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
