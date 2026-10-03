import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type InstallChoice = { outcome: 'accepted' | 'dismissed' };
interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<InstallChoice>;
}
type InstallStatus = 'idle' | 'pending' | 'cancelled' | 'accepted' | 'failed' | 'timeout' | 'installed';
interface InstallState {
  available: boolean;
  busy: boolean;
  standalone: boolean;
  status: InstallStatus;
}
interface InstallContext extends InstallState {
  install: () => Promise<void>;
  isBusy: () => boolean;
}
const Context = createContext<InstallContext | null>(null);

export function isStandaloneWebApp() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Keep the browser's one-use opportunity across routes, never in storage. */
export default function WebAppInstallProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InstallState>(() => ({ available: false, busy: false, standalone: isStandaloneWebApp(), status: 'idle' }));
  const opportunity = useRef<InstallPromptEvent | null>(null);
  const operation = useRef<symbol | null>(null);
  const installed = useRef(state.standalone);
  const reportedInstalled = useRef(false);
  const releaseWait = useRef<(() => void) | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const invalidate = () => { operation.current = null; releaseWait.current?.(); releaseWait.current = null; opportunity.current = null; };
    const capture = (event: Event) => {
      const candidate = event as InstallPromptEvent;
      if (installed.current || typeof candidate.prompt !== 'function') return;
      event.preventDefault();
      opportunity.current = candidate;
      setState(previous => ({ ...previous, available: true, status: operation.current ? previous.status : 'idle' }));
    };
    const report = () => {
      reportedInstalled.current = true; installed.current = true; invalidate();
      setState(previous => ({ ...previous, available: false, busy: false, status: 'installed' }));
    };
    const updateStandalone = () => {
      const standalone = isStandaloneWebApp(); installed.current = standalone || reportedInstalled.current;
      if (standalone) invalidate();
      setState(previous => ({ ...previous, standalone, ...(standalone ? { available: false, busy: false, status: reportedInstalled.current ? 'installed' : 'idle' } : {}) }));
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', report);
    media.addEventListener('change', updateStandalone);
    updateStandalone();
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', report);
      media.removeEventListener('change', updateStandalone);
      invalidate();
    };
  }, []);

  const install = useCallback(async () => {
    const event = opportunity.current;
    if (!event || operation.current || installed.current) return;
    const current = Symbol('installation');
    operation.current = current; opportunity.current = null;
    setState(previous => ({ ...previous, available: false, busy: true, status: 'pending' }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // prompt must run synchronously in the user's click. The event is consumed
      // before it runs, including synchronous throws and repeated clicks.
      const prompt = Promise.resolve(event.prompt());
      void prompt.catch(() => {});
      const choice = Promise.all([prompt, event.userChoice]).then(([, result]) => result);
      if (operation.current !== current) { void choice.catch(() => {}); return; }
      const boundary = new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), 30000);
        releaseWait.current = () => { clearTimeout(timer); resolve(null); };
      });
      const result = await Promise.race([choice, boundary]);
      if (operation.current !== current) return;
      const status = result === null ? 'timeout' : result?.outcome === 'dismissed' ? 'cancelled' : result?.outcome === 'accepted' ? 'accepted' : 'failed';
      setState(previous => ({ ...previous, status }));
    } catch {
      if (operation.current === current) setState(previous => ({ ...previous, status: 'failed' }));
    } finally {
      clearTimeout(timer);
      if (operation.current === current) {
        operation.current = null; releaseWait.current = null;
        // A newer browser opportunity received during this wait stays usable.
        setState(previous => ({ ...previous, busy: false, available: opportunity.current !== null }));
      }
    }
  }, []);
  const isBusy = useCallback(() => operation.current !== null, []);
  return <Context.Provider value={{ ...state, install, isBusy }}>{children}</Context.Provider>;
}

export function useWebAppInstall(): InstallContext {
  const value = useContext(Context);
  return value ?? { available: false, busy: false, standalone: isStandaloneWebApp(), status: 'idle', install: async () => {}, isBusy: () => false };
}
