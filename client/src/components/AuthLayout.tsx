import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/Button';
import { Input, type InputProps } from './ui/Input';
import { authText } from '../lib/authFlowWeb';

// One layout for sign-in, registration, password recovery and email verification:
// a single card holding the title, the form and the few links that belong to that step,
// with the legal links as one line of small print underneath.
const routes = { login: '/login', resend: '/resend-verification', forgot: '/forgot-password', haveVerify: '/verify-email', haveReset: '/reset-password' } as const;
export type AuthLinkKey = keyof typeof routes;

export function AuthPage({ title, subtitle, children, below }: { title: string; subtitle?: string; children: ReactNode; below?: ReactNode }) {
  return <div className="mx-auto w-full max-w-[400px] sm:py-8">
    <section className="rounded-2xl border border-muji-border bg-white px-5 pb-3 pt-6 shadow-sm sm:px-8 sm:pt-8">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {children}
    </section>
    {below}
    <p className="mt-1 flex flex-wrap items-center justify-center text-xs text-gray-600">
      <Link to="/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-muji-primary hover:underline">{authText('privacy')}</Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms" className="inline-flex min-h-11 items-center px-2 hover:text-muji-primary hover:underline">{authText('terms')}</Link>
    </p>
  </div>;
}

export function AuthMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const style = { error: 'border-red-200 bg-red-50 text-red-800', success: 'border-green-200 bg-green-50 text-green-800', info: 'border-blue-200 bg-blue-50 text-blue-800' }[tone];
  return <p role={tone === 'error' ? 'alert' : 'status'} className={'rounded-lg border px-3 py-2.5 text-sm ' + style}>{children}</p>;
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex min-h-11 items-center text-sm text-gray-600 underline decoration-gray-300 underline-offset-4 hover:text-muji-primary hover:decoration-current">{children}</Link>;
}

// Only the steps that can follow from the current page; never a link to the page itself.
export function AuthLinks({ links }: { links: readonly AuthLinkKey[] }) {
  if (!links.length) return null;
  return <nav aria-label={authText('recoveryNavigation')} className="flex flex-wrap items-center justify-center gap-x-5">
    {links.map(key => <AuthLink key={key} to={routes[key]}>{authText(key)}</AuthLink>)}
  </nav>;
}

export function AuthSubmit({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return <Button type="submit" disabled={disabled} className="h-11 w-full text-base">{children}</Button>;
}

// The next step after a finished flow, drawn like the primary button but still an ordinary link.
export function AuthAction({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="flex h-11 w-full items-center justify-center rounded-md bg-muji-primary text-base font-medium text-white shadow-sm hover:bg-opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muji-primary">{children}</Link>;
}

// "No account? Sign up" and its mirror on the registration page.
export function AuthSwitch({ prompt, to, label }: { prompt: string; to: string; label: string }) {
  return <p className="mt-2 flex min-h-11 flex-wrap items-center justify-center gap-x-0.5 text-sm text-gray-600">
    <span>{prompt}</span><Link to={to} className="inline-flex min-h-11 items-center px-1 font-medium text-muji-primary underline underline-offset-4">{label}</Link>
  </p>;
}

export function AuthField({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & InputProps) {
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <Input id={id} {...input} className="h-11 text-base" aria-describedby={hint ? id + '-hint' : undefined}/>
    {hint && <p id={id + '-hint'} className="text-xs text-gray-600">{hint}</p>}
  </div>;
}

// `current` is the sign-in password: it is checked by the service, not by the new-password policy.
export function AuthPasswordField({ id, label, value, onChange, disabled, hint = false, current = false }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; hint?: boolean; current?: boolean }) {
  const [show, setShow] = useState(false);
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} autoComplete={current ? 'current-password' : 'new-password'} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required {...(current ? {} : { minLength: 8, maxLength: 73 })} className="h-11 pr-12 text-base" aria-describedby={hint ? id + '-hint' : undefined}/>
      <button type="button" disabled={disabled} onClick={() => setShow(!show)} aria-label={authText(show ? 'hide' : 'show') + '：' + label} aria-pressed={show} className="absolute right-0 top-0 flex h-full min-w-[44px] items-center justify-center rounded-md text-gray-600 hover:text-muji-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-muji-primary">{show ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}</button>
    </div>
    {hint && <p id={id + '-hint'} className="text-xs text-gray-600">{authText('passwordHint')}</p>}
  </div>;
}
