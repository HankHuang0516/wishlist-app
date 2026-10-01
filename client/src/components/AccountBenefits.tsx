import { useEffect, useState } from 'react';
import { Ban, Heart, Sparkles, Award } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';

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
  return <section aria-labelledby="benefits-title" className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
    <h2 id="benefits-title" className="text-xl font-semibold">贊助與升級</h2>
    <div className="flex gap-3 rounded-md bg-gray-50 p-3 text-gray-600"><Ban className="h-5 w-5 shrink-0" aria-hidden />
      <div><p className="font-medium">購買與訂閱操作暫停</p><p className="text-sm">商店付款與後端驗單尚未開放；既有權益不受影響。</p></div></div>
    <div className="flex gap-3"><Heart className="h-5 w-5 shrink-0" aria-hidden /><div><h3 className="font-medium">贊助服務</h3><p className="text-sm text-gray-600">目前未開放收款，不會導向付款頁。</p></div></div>
    <div className="flex gap-3 border-t pt-4"><Award className="h-5 w-5 shrink-0" aria-hidden /><div><h3 className="font-medium">尊榮版訂閱 · NT$90／月</h3>
      <p className="text-sm text-gray-600">{current ? current.premium ? '既有尊榮會員；請於原付款平台管理訂閱。' : '每月 100 次行銷額度；購買尚未開放。' : '會員狀態暫時無法確認。'}</p></div></div>
    <div className="flex gap-3 border-t pt-4"><Sparkles className="h-5 w-5 shrink-0" aria-hidden /><div><h3 className="font-medium">行銷小助手加值 · US$1／10 次</h3>
      <p className="text-sm text-gray-600">次數不限期；購買尚未開放。</p>
      <p className="font-medium" aria-live="polite">永久加值剩餘：{current ? `${current.allowance.permanentCreditsRemaining} 次` : '暫時無法核對'}</p>
      {current && current.allowance.freeUsedThisMonth >= current.allowance.freeMonthlyLimit && <p className="text-sm text-amber-700">本月免費次數已用完</p>}
    </div></div>
    {issue && <div role="alert" className="text-sm text-red-700">權益讀取失敗；不會以舊資料或零次代替。<Button variant="outline" size="sm" className="ml-2" onClick={() => setRetry(value => value + 1)}>重新核對權益</Button></div>}
    <p className="text-sm text-gray-600">若有持續扣款，請由原付款平台管理；未驗證的商店交易不會開通權益。</p>
  </section>;
}
