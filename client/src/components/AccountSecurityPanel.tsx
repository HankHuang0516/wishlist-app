import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LockKeyhole, ChevronRight, Monitor, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { settingsText as st, settingsMessage, settingsChinese } from '../lib/settingsCopy';
import { Input } from './ui/Input';
import { performSecurityOperation, securityPayload, type SecurityOperation } from '../lib/accountSecurityWeb';
import MarketplaceDialog from './MarketplaceDialog';

type Confirmation = { operation: SecurityOperation; payload: ReturnType<typeof securityPayload>; token: string };

export default function AccountSecurityPanel({ onOperationBusy, reloadPending = false, initialPage = 'directory' }: { onOperationBusy?: (busy: boolean) => void; reloadPending?: boolean; initialPage?: 'directory' | SecurityOperation }) {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<'directory' | SecurityOperation>(initialPage);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const passwordButton = useRef<HTMLButtonElement>(null), sessionsButton = useRef<HTMLButtonElement>(null);
  const lastPage = useRef<SecurityOperation | null>(null);
  useEffect(() => {
    if (page !== 'directory') pageTitle.current?.focus();
    else if (lastPage.current) (lastPage.current === 'password' ? passwordButton : sessionsButton).current?.focus();
  }, [page]);
  const [current, setCurrent] = useState(''), [replacement, setReplacement] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [issue, setIssue] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const active = useRef(true), running = useRef(false);
  const reportBusy = useRef(onOperationBusy); reportBusy.current = onOperationBusy;
  const latestToken = useRef(token); latestToken.current = token;
  useEffect(() => { active.current = true; return () => { active.current = false; confirmationRef.current = null; reportBusy.current?.(false); }; }, []);
  useEffect(() => {
    confirmationRef.current = null; setPendingConfirmation(null);
    setCurrent(''); setReplacement(''); setConfirmation(''); setIssue('');
    if (!running.current) reportBusy.current?.(false);
  }, [token]);

  function cancelConfirmation() {
    if (running.current) return;
    confirmationRef.current = null; setPendingConfirmation(null); reportBusy.current?.(false);
  }

  function submit(operation: SecurityOperation) {
    if (reloadPending || !active.current || running.current || confirmationRef.current || !token || latestToken.current !== token) return;
    let payload: ReturnType<typeof securityPayload>;
    try { payload = securityPayload(operation, current, replacement, confirmation); }
    catch (error) { setIssue(error instanceof Error ? error.message : '請檢查輸入。'); return; }
    const pending = { operation, payload, token };
    confirmationRef.current = pending; setPendingConfirmation(pending); reportBusy.current?.(true); setIssue('');
  }

  async function confirmOperation() {
    const pending = confirmationRef.current;
    if (reloadPending || !active.current || running.current || !pending || latestToken.current !== pending.token) return;
    const { operation, payload, token: confirmedToken } = pending;
    confirmationRef.current = null; setPendingConfirmation(null);
    running.current = true; reportBusy.current?.(true); setBusy(true); setIssue('');
    try {
      const result = await performSecurityOperation(confirmedToken, operation, payload);
      if (!active.current || latestToken.current !== confirmedToken) return;
      setCurrent(''); setReplacement(''); setConfirmation('');
      if (result.kind === 'signed-out') {
        logout(); navigate(`/login?security=${result.notice}`, { replace: true });
      } else setIssue(result.message);
    } finally { running.current = false; if (active.current) { setBusy(false); reportBusy.current?.(false); } }
  }

  const locked = reloadPending || busy || pendingConfirmation !== null;
  const copy = (zh: string, en: string) => settingsChinese() ? zh : en;
  function selectPage(next: typeof page) {
    if (locked || running.current) return;
    if (next !== 'directory') lastPage.current = next;
    setCurrent(''); setReplacement(''); setConfirmation(''); setIssue(''); setPage(next);
  }

  return <section className="space-y-4" aria-label={st("帳號安全")}>
    {page === 'directory' ? <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {([{ page: 'password', label: copy('修改密碼', 'Change password'), Icon: LockKeyhole },
          { page: 'sessions', label: copy('管理登入裝置', 'Manage signed-in devices'), Icon: Monitor }] as const).map(({page: target, label, Icon}) =>
          <button key={target} ref={target === 'password' ? passwordButton : sessionsButton} type="button" disabled={locked} onClick={() => selectPage(target)} className="flex min-h-14 w-full items-center gap-3 border-b p-4 text-left font-medium disabled:opacity-50">
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true"/><span className="flex-1">{label}</span><ChevronRight className="h-5 w-5" aria-hidden="true"/>
          </button>)}
        <button type="button" disabled={locked} onClick={logout} className="flex min-h-14 w-full items-center gap-3 p-4 text-left font-medium disabled:opacity-50"><LogOut className="h-5 w-5" aria-hidden="true"/><span>{st('登出此裝置')}</span></button>
      </div>
      <div className="space-y-2 rounded-2xl border border-red-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-red-800">{copy('危險操作', 'Danger zone')}</h2>
        <Link to="/account-deletion" aria-disabled={locked} tabIndex={locked ? -1 : undefined} onClick={event => { if (locked) event.preventDefault(); }} className={`flex min-h-12 items-center justify-between gap-3 font-medium text-red-700 ${locked ? 'opacity-50' : ''}`}><span>{st('刪除本人帳號與資料')}</span><ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true"/></Link>
        <p className="text-sm leading-6 text-gray-600">{copy('刪除前會列出影響範圍，並要求再次確認。', 'Review the affected data and confirm again before deletion.')}</p>
      </div>
    </> : <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
      <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => selectPage('directory')}>{copy('‹ 返回帳號安全', '‹ Back to account security')}</Button>
      <h2 ref={pageTitle} tabIndex={-1} className="text-lg font-semibold">{page === 'password' ? copy('修改密碼', 'Change password') : copy('管理登入裝置', 'Manage signed-in devices')}</h2>
      <p className="text-sm text-gray-600">{st("請輸入目前密碼以確認操作。密碼不會儲存在瀏覽器，也不會自動重送。")}</p>
      {page === 'sessions' && <p className="text-sm leading-6 text-gray-600">{copy('可撤銷所有裝置的登入，包含此裝置；完成後需要重新登入。', 'Revoke sign-in on all devices, including this one. You will need to sign in again.')}</p>}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(page); }}>
        <div className="space-y-2"><label htmlFor="security-current">{st("目前密碼")}</label>
          <Input id="security-current" type="password" autoComplete="current-password" disabled={locked} value={current}
            onChange={event => setCurrent(event.target.value)} maxLength={1024} /></div>
        {page === 'password' && <><div className="space-y-2"><label htmlFor="security-new">{st("新密碼")}</label>
          <Input id="security-new" type="password" autoComplete="new-password" disabled={locked} value={replacement}
            onChange={event => setReplacement(event.target.value)} maxLength={73} aria-describedby="security-password-rules" /></div>
        <div className="space-y-2"><label htmlFor="security-confirm">{st("再次輸入新密碼")}</label>
          <Input id="security-confirm" type="password" autoComplete="new-password" disabled={locked} value={confirmation}
            onChange={event => setConfirmation(event.target.value)} maxLength={73} /></div>
        <p id="security-password-rules" className="text-sm text-gray-600">{st("新密碼 8–72 字元，包含英文字母與數字；符號限 @$!%*?&。")}</p></>}
        {issue && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{settingsMessage(issue)}</p>}
        <Button type="submit" className="w-full min-h-12" disabled={locked || !token || !current || (page === 'password' && (!replacement || !confirmation))}>
          {busy ? st('確認中…') : st(page === 'password' ? '更新密碼並重新登入' : '撤銷所有裝置登入')}</Button>
      </form>
    </div>}
    {pendingConfirmation && <MarketplaceDialog title={st('確認帳號安全操作')} onClose={cancelConfirmation} closeLabel={st('取消')}>
      <p className="text-sm leading-6">{pendingConfirmation.operation === 'password'
        ? st('確認更新密碼？所有裝置都需重新登入，個人 API key 將失效。管理與上架簽章不受影響。')
        : st('撤銷所有裝置登入？包含此裝置，所有裝置都需重新登入。個人 API key、管理與上架簽章不變。')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" className="min-h-11" disabled={reloadPending || busy || latestToken.current !== pendingConfirmation.token} onClick={() => void confirmOperation()}>
          {st(pendingConfirmation.operation === 'password' ? '確認更新密碼' : '確認撤銷登入')}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={cancelConfirmation}>{st('保留原狀')}</Button>
      </div>
    </MarketplaceDialog>}
  </section>;
}
