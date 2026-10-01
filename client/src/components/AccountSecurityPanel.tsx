import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { performSecurityOperation, securityPayload, type SecurityOperation } from '../lib/accountSecurityWeb';

export default function AccountSecurityPanel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(initiallyOpen);
  const [current, setCurrent] = useState(''), [replacement, setReplacement] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  const active = useRef(true), running = useRef(false);
  const latestToken = useRef(token); latestToken.current = token;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setCurrent(''); setReplacement(''); setConfirmation(''); setIssue(''); }, [token]);

  async function submit(operation: SecurityOperation) {
    if (!active.current || running.current || !token || latestToken.current !== token) return;
    let payload: ReturnType<typeof securityPayload>;
    try { payload = securityPayload(operation, current, replacement, confirmation); }
    catch (error) { setIssue(error instanceof Error ? error.message : '請檢查輸入。'); return; }
    if (!window.confirm(operation === 'password'
      ? '確認更新密碼？所有裝置都需重新登入，個人 API key 將失效。管理與上架簽章不受影響。'
      : '撤銷所有裝置登入？包含此裝置，所有裝置都需重新登入。個人 API key、管理與上架簽章不變。')) return;
    running.current = true; setBusy(true); setIssue('');
    try {
      const result = await performSecurityOperation(token, operation, payload);
      if (!active.current || latestToken.current !== token) return;
      setCurrent(''); setReplacement(''); setConfirmation('');
      if (result.kind === 'signed-out') {
        logout(); navigate(`/login?security=${result.notice}`, { replace: true });
      } else setIssue(result.message);
    } finally { running.current = false; if (active.current) setBusy(false); }
  }

  return <section className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden" aria-label="帳號安全">
    <button type="button" className="w-full flex items-center gap-3 p-5 text-left font-semibold"
      aria-label="帳號安全" aria-expanded={open} aria-controls="account-security-fields" onClick={() => setOpen(value => !value)}>
      <ShieldCheck aria-hidden className="h-5 w-5" /><span><span className="block">帳號安全</span><span className="block text-xs font-normal text-gray-500">密碼・登入裝置・登出・刪除帳號</span></span>
      <ChevronDown aria-hidden className={`ml-auto h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id="account-security-fields" className="p-5 pt-0 space-y-4">
      <p className="text-sm text-gray-600">請輸入目前密碼以確認操作。密碼不會儲存在瀏覽器，也不會自動重送。</p>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit('password'); }}>
        <div className="space-y-2"><label htmlFor="security-current">目前密碼</label>
          <Input id="security-current" type="password" autoComplete="current-password" disabled={busy} value={current}
            onChange={event => setCurrent(event.target.value)} maxLength={1024} /></div>
        <div className="space-y-2"><label htmlFor="security-new">新密碼</label>
          <Input id="security-new" type="password" autoComplete="new-password" disabled={busy} value={replacement}
            onChange={event => setReplacement(event.target.value)} maxLength={73} aria-describedby="security-password-rules" /></div>
        <div className="space-y-2"><label htmlFor="security-confirm">再次輸入新密碼</label>
          <Input id="security-confirm" type="password" autoComplete="new-password" disabled={busy} value={confirmation}
            onChange={event => setConfirmation(event.target.value)} maxLength={73} /></div>
        <p id="security-password-rules" className="text-sm text-gray-600">新密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。</p>
        {issue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{issue}</p>}
        <Button type="submit" className="w-full min-h-12" disabled={busy || !token || !current || !replacement || !confirmation}>
          {busy ? '確認中…' : '更新密碼並重新登入'}</Button>
        <Button type="button" variant="outline" className="w-full min-h-12" disabled={busy || !token || !current}
          onClick={() => void submit('sessions')}>撤銷所有裝置登入</Button>
      </form>
      <Button type="button" variant="outline" className="w-full min-h-12" disabled={busy} onClick={logout}>登出此裝置</Button>
      <Link to="/account-deletion" aria-disabled={busy} tabIndex={busy ? -1 : undefined}
        onClick={event => { if (busy) event.preventDefault(); }}
        className={`flex min-h-12 items-center justify-center rounded-xl bg-red-50 text-red-700 font-medium ${busy ? 'opacity-50' : ''}`}>
        刪除本人帳號與資料</Link>
    </div>}
  </section>;
}
