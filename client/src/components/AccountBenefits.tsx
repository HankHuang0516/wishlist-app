import { useEffect, useState } from 'react';
import { Heart, Sparkles, Award, Crown, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { settingsText as st } from '../lib/settingsCopy';

type Allowance = { freeMonthlyLimit: number; freeUsedThisMonth: number; permanentCreditsRemaining: number; paidPurchasesAvailable: boolean };
export function parseAllowance(value: unknown): Allowance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('權益資料無效。');
  const row = value as Record<string, unknown>;
  if (!['freeMonthlyLimit', 'freeUsedThisMonth', 'permanentCreditsRemaining'].every(key => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0)
    || typeof row.paidPurchasesAvailable !== 'boolean') throw new Error('權益資料無效。');
  return row as Allowance;
}

export default function AccountBenefits() {
  const { token } = useAuth();
  const [state, setState] = useState<{ token: string; allowance: Allowance; premium: boolean } | null>(null);
  const [issue, setIssue] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setIssue(false);
    if (token) void Promise.all(['/marketing/availability', '/users/me'].map(async path => {
      const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('權益暫時無法核對。');
      return response.json();
    })).then(([value, profile]) => {
      const allowance = parseAllowance(value);
      if (typeof profile?.isPremium !== 'boolean') throw new Error('會員狀態無效。');
      if (active) setState({ token, allowance, premium: profile.isPremium });
    }).catch(() => { if (active) { setState(null); setIssue(true); } });
    return () => { active = false; controller.abort(); };
  }, [token, retry]);
  const current = state?.token === token ? state : null;
  return <section aria-labelledby="benefits-title" className="account-benefits rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="benefits-title" className="flex items-center gap-2 text-sm font-semibold"><Crown className="h-5 w-5" aria-hidden />{st("贊助與升級")}</h2>
      <p className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{st("購買與訂閱操作暫停")}</p></div>
    <details className="mt-2 border-t"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm"><Heart className="h-4 w-4 shrink-0" aria-hidden /><span className="font-medium">{st("贊助服務")}</span><ChevronRight className="ml-auto h-4 w-4" aria-hidden /></summary>
      <div className="space-y-2 pb-3 text-sm text-gray-600"><p>{st("目前未開放收款，不會導向付款頁。")}</p><p>{st("商店付款與後端驗單尚未開放；既有權益不受影響。")}</p></div></details>
    <details className="border-t"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm"><Award className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /><span className="font-medium">{st("尊榮版訂閱 · NT$90／月")}</span><ChevronRight className="ml-auto h-4 w-4" aria-hidden /></summary>
      <div className="space-y-2 pb-3 text-sm text-gray-600"><p>{current ? current.premium ? st("既有尊榮會員；請於原付款平台管理訂閱。") : st("每月 100 次行銷額度；購買尚未開放。") : st("會員狀態暫時無法確認。")}</p>
        <p>{st("若有持續扣款，請由原付款平台管理；未驗證的商店交易不會開通權益。")}</p></div></details>
    <details className="border-t"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm"><Sparkles className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /><span className="font-medium">{st("行銷小助手加值 · US$1／10 次")}</span><ChevronRight className="ml-auto h-4 w-4" aria-hidden /></summary>
      <p className="pb-3 text-sm text-gray-600">{st("次數不限期；購買尚未開放。")}</p></details>
    <p className="border-t pt-2 text-xs text-gray-600" aria-live="polite">{st('永久加值剩餘：{balance}',{balance:current?st('{count} 次',{count:current.allowance.permanentCreditsRemaining}):st('暫時無法核對')})}</p>
    {current && current.allowance.freeUsedThisMonth >= current.allowance.freeMonthlyLimit && <p className="mt-2 text-sm text-amber-700">{st("本月免費次數已用完")}</p>}
    {issue && <div role="alert" className="text-sm text-red-700">{st("權益讀取失敗；不會以舊資料或零次代替。")}<Button variant="outline" size="sm" className="ml-2" onClick={() => setRetry(value => value + 1)}>{st("重新核對權益")}</Button></div>}
  </section>;
}
