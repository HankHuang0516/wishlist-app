import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function MarketplaceDialog({ title, children, onClose, closeLabel='關閉', closeDisabled=false, wide=false, footer }: { title: string; children: ReactNode; onClose: () => void; closeLabel?:string; closeDisabled?:boolean; wide?:boolean; footer?:ReactNode }) {
  const panel = useRef<HTMLDivElement>(null), titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panel.current?.focus();
    return () => { document.body.style.overflow = overflow; if (before?.isConnected) before.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!closeDisabled) onClose(); }
    if (event.key !== 'Tab') return;
    const elements = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => !el.hidden && !el.closest('[hidden]'));
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); panel.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last!.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={'flex max-h-[90dvh] w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none ' + (wide ? 'max-w-4xl' : 'max-w-2xl')}>
      <div className="flex flex-none items-center justify-between gap-4 border-b border-stone-100 px-5 py-3"><h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel} className="min-h-11 flex-none rounded-xl border px-4 disabled:opacity-50">{closeLabel}</button></div><div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>{footer && <footer className="flex-none border-t border-stone-100 bg-white px-5 py-3">{footer}</footer>}
    </div>
  </div>;
}
