import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function MarketplaceDialog({ title, children, onClose, closeLabel='關閉' }: { title: string; children: ReactNode; onClose: () => void; closeLabel?:string }) {
  const panel = useRef<HTMLDivElement>(null), close = useRef(onClose), titleId = useId(); close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panel.current?.focus();
    return () => { document.body.style.overflow = overflow; if (before?.isConnected) before.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
    if (event.key !== 'Tab') return;
    const elements = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => !el.hidden && !el.closest('[hidden]'));
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); panel.current?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last!.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none">
      <div className="mb-5 flex items-start justify-between gap-4"><h2 id={titleId} className="break-words text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label={closeLabel} className="min-h-11 flex-none rounded-xl border px-4">{closeLabel}</button></div>{children}
    </div>
  </div>;
}
