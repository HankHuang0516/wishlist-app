import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min'> & {
  label: string; value: string; onChange: (value: string) => void; min?: string;
};
const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) !== '0000' &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const monthDays = (month: string) => {
  const start = new Date(`${month}-01T12:00:00Z`), end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return { offset: start.getUTCDay(), count: end.getUTCDate() };
};
const shiftedMonth = (month: string, step: number) => {
  const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + step);
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 7) : month;
};

/** Controlled ISO date input with a stable, accessible web calendar. Month
 * navigation never dispatches a value change; only selection or clearing does. */
export default function DateField({ label, value, onChange, min, disabled, className = '', ...inputProps }: Props) {
  const generatedId = useId(), id = inputProps.id ?? generatedId, headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [month, setMonth] = useState(today().slice(0, 7)), [focusDay, setFocusDay] = useState('');
  const minimum = min && valid(min) ? min : '';
  const { offset, count } = monthDays(month);
  const previous = shiftedMonth(month, -1), next = shiftedMonth(month, 1);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = () => {
    const initial = valid(value) && (!minimum || value >= minimum) ? value : minimum || today();
    setMonth(initial.slice(0, 7)); setFocusDay(initial); setOpen(true);
  };
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (open) (dialog.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusDay}"]:not(:disabled)`) ?? dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
  }, [open, focusDay]);
  function navigate(step: number) {
    const target = shiftedMonth(month, step);
    if (target === month || minimum && target < minimum.slice(0, 7)) return;
    setMonth(target);
  }
  function onCalendarKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') {
      const buttons = [...dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      return;
    }
    const target = event.target as HTMLButtonElement, date = target.dataset.calendarDate;
    if (!date) return;
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    if (step === undefined) return;
    event.preventDefault(); const moved = new Date(`${date}T12:00:00Z`); moved.setUTCDate(moved.getUTCDate() + step);
    if (moved.getUTCFullYear() < 1 || moved.getUTCFullYear() > 9999) return;
    const selected = moved.toISOString().slice(0, 10);
    if (minimum && selected < minimum) return;
    setMonth(selected.slice(0, 7)); setFocusDay(selected);
  }
  return <div className="text-sm">
    <label htmlFor={id}>{label}</label>
    <div className="mt-1 flex max-w-sm gap-2">
      <input {...inputProps} id={id} type="date" min={min} value={value} disabled={disabled}
        className={`min-w-0 flex-1 rounded-xl border p-3 [&::-webkit-calendar-picker-indicator]:hidden ${className}`}
        onChange={event => onChange(event.target.value)} />
      <button ref={trigger} type="button" disabled={disabled} aria-label={`開啟「${label}」日曆`} aria-haspopup="dialog" aria-expanded={open}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border bg-white" onClick={show}><CalendarDays size={18} /></button>
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={onCalendarKey}
        className="max-h-[90dvh] w-full max-w-[348px] overflow-y-auto rounded-2xl border bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="上一個月" disabled={previous === month || !!minimum && previous < minimum.slice(0, 7)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border disabled:opacity-40" onClick={() => navigate(-1)}><ChevronLeft size={18} /></button>
          <h2 id={headingId} aria-live="polite" className="font-semibold">{Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月</h2>
          <button type="button" aria-label="下一個月" disabled={next === month} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border disabled:opacity-40" onClick={() => navigate(1)}><ChevronRight size={18} /></button>
        </div>
        <p className="my-2 text-xs text-stone-500">台灣日期 · 選擇後才會套用{minimum ? ` · 最早 ${minimum}` : ''}</p>
        <div className="grid grid-cols-7 text-center">
          {['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day} className="py-2 text-xs text-stone-500">{day}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const iso = `${month}-${String(i + 1).padStart(2, '0')}`, selected = iso === value;
            return <button key={iso} type="button" data-calendar-date={iso} aria-label={`選擇 ${iso}`} aria-pressed={selected} disabled={!!minimum && iso < minimum}
              className={`min-h-11 rounded-xl disabled:opacity-30 ${selected ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-stone-500'}`}
              onClick={() => { onChange(iso); close(); }}>{i + 1}</button>;
          })}
        </div>
        <div className="mt-3 flex justify-between gap-2">
          <button type="button" className="min-h-11 rounded-xl border px-3" onClick={() => { onChange(''); close(); }}>清除日期</button>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-xl border px-3" onClick={close}><X size={16} />關閉日曆</button>
        </div>
      </div>
    </div>}
  </div>;
}
