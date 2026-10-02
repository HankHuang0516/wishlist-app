import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { probeWebUpdate, webUpdateNavigation, type WebUpdateState } from '../lib/webUpdate';
type Updates = { state: WebUpdateState; manual: boolean; busy: boolean; confirming: boolean; check: () => void; requestReload: () => void; cancelReload: () => void; confirmReload: () => void };
const Context = createContext<Updates | null>(null);
export const useWebUpdate = () => useContext(Context);

export default function WebUpdateProvider({ children }: { children: ReactNode }) {
  const route = useLocation();
  const [state, setState] = useState<WebUpdateState>({ status: 'idle' });
  const [manual, setManual] = useState(false), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false);
  const active = useRef(false), checking = useRef(false), queued = useRef(false), confirmation = useRef(0);
  const controller = useRef<AbortController | null>(null), registration = useRef<ServiceWorkerRegistration | null>(null);
  const perform = useRef<(manual: boolean) => Promise<WebUpdateState | null>>(async () => null);
  const check = useCallback(async (show: boolean): Promise<WebUpdateState | null> => {
    if (!active.current) return null;
    if (show) setManual(true);
    if (checking.current) { queued.current = true; return null; }
    checking.current = true; setBusy(true); setState({ status: 'checking' });
    const abort = new AbortController(); controller.current = abort;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          if (registration.current) await registration.current.update();
          return probeWebUpdate(__APP_VERSION__, abort.signal);
        })(),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => { abort.abort(); reject(Error('Update deadline')); }, 10_000); }),
      ]);
      if (!active.current || abort.signal.aborted) return null;
      setState(result); return result;
    } catch { if (active.current) setState({ status: 'unavailable' }); return null; }
    finally {
      clearTimeout(deadline); abort.abort(); if (controller.current === abort) controller.current = null;
      checking.current = false;
      if (active.current) {
        setBusy(false);
        if (queued.current) { queued.current = false; void perform.current(false); }
      }
    }
  }, []);
  perform.current = check;
  useLayoutEffect(() => { confirmation.current++; setConfirming(false); }, [route.key, route.pathname, route.search, route.hash]);
  useEffect(() => {
    active.current = true;
    let container: ServiceWorkerContainer | null = null;
    try { const candidate = (navigator as Partial<Navigator>).serviceWorker; if (typeof candidate?.register === 'function') container = candidate; } catch { /* HTTP checks remain available without worker access. */ }
    const foreground = () => { if (document.visibilityState === 'visible') void check(false); };
    const changed = () => { void check(false); };
    container?.addEventListener('controllerchange', changed);
    if (container) {
      void container.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
        if (active.current) { registration.current = value; void check(false); }
      }).catch(() => { if (active.current) void check(false); });
    }
    const timer = window.setInterval(foreground, 5 * 60_000);
    document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground);
    return () => {
      active.current = false; confirmation.current++; queued.current = false; controller.current?.abort(); registration.current = null;
      window.clearInterval(timer); container?.removeEventListener('controllerchange', changed);
      document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground);
    };
  }, [check]);
  const cancelReload = () => { confirmation.current++; setConfirming(false); };
  const confirmReload = async () => {
    if (checking.current || !confirming) return;
    const original = confirmation.current;
    const proof = await check(true);
    if (active.current && original === confirmation.current && proof?.status === 'ready') webUpdateNavigation.reload();
  };
  return <Context.Provider value={{ state, manual, busy, confirming, check: () => void check(true), requestReload: () => { confirmation.current++; setConfirming(true); }, cancelReload, confirmReload: () => void confirmReload() }}>{children}</Context.Provider>;
}
