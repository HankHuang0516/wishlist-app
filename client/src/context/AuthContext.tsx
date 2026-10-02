import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getFullApiUrl } from '../config';
import { useLocation, useNavigate } from 'react-router-dom';
import { authReturnTo, type AuthReturnTo } from '../lib/authReturnTo';
import { AUTH_SESSION_KEY, authSession, parseAuthUser, persistSession, readSession, type AuthSession, type AuthUser } from '../lib/authSession';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { authNotice, type AuthNotice } from '../lib/authNotice';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser, returnTo?: AuthReturnTo) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
function restore(): { session: AuthSession | null; notice: AuthNotice } {
  try { return { session: readSession(localStorage, getFullApiUrl()), notice: '' }; }
  catch { return { session: null, notice: 'restoreFailed' }; }
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
      setNotice(!clean ? 'logoutIncomplete' : expired ? 'expired' : '');
    } catch {
      for (const key of [AUTH_SESSION_KEY, 'token', 'user']) { try { localStorage.removeItem(key); } catch { /* Visible warning below. */ } }
      setNotice('logoutUnverified');
    }
    const next = authReturnTo(route.current.pathname + route.current.search);
    navigation.current(expired ? '/login?next=' + encodeURIComponent(next) : '/login', { replace: true });
  }, [replace]);
  const login = useCallback((token: string, user: AuthUser, returnTo: AuthReturnTo = '/dashboard') => {
    const next = authSession(token, user);
    let clean: boolean;
    try { clean = persistSession(localStorage, next, getFullApiUrl()); }
    catch { throw new Error(authNotice('loginSaveFailed')); }
    replace(next); setNotice(clean ? '' : 'loginCleanupFailed');
    navigation.current(authReturnTo(returnTo));
  }, [replace]);
  const refreshUser = useCallback(async () => {
    const original = current.current;
    if (!original) return;
    const revision = generation.current, sequence = ++request.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => active.current && generation.current === revision && request.current === sequence && current.current?.token === original.token;
    try {
      const body = await api<unknown>(original.token, '/users/me', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
      if (!isCurrent()) return;
      const user = parseAuthUser(body);
      if (user.id !== original.user.id) { signOut(true); return; }
      const next = { token: original.token, user };
      let clean = false;
      try { clean = persistSession(localStorage, next, getFullApiUrl()); } catch { /* Confirmed data remains usable in memory. */ }
      if (!isCurrent()) return;
      current.current = next; setSession(next);
      setNotice(clean ? '' : 'profileSaveFailed');
    } catch (error) {
      if (!isCurrent() || abort.signal.aborted) return;
      if (error instanceof ApiFailure && (error.status === 401 || error.status === 404)) { signOut(true); return; }
      setNotice(error instanceof ApiFailure && error.retryAfterMs > 0 ? 'limited' : 'readUnverified');
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
        replace(next); setNotice(next ? 'otherAccount' : 'otherLogout');
        if (next && sameIdentity) void refreshUser();
      } catch { replace(null); setNotice('otherInvalid'); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [replace, refreshUser]);
  return <AuthContext.Provider value={{ user: session?.user ?? null, token: session?.token ?? null, login, logout: () => signOut(false), refreshUser, isAuthenticated: Boolean(session) }}>
    {notice && <div role="status" className="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{authNotice(notice)}</p>{session && <button className="mt-2 min-h-11 rounded-xl border px-4" onClick={() => void refreshUser()}>{authNotice('recheck')}</button>}</div>}
    {children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
