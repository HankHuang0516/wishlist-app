import { useEffect, useState } from 'react';
import { Heart, Sparkles, Crown } from 'lucide-react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { settingsChinese } from '../lib/settingsCopy';
import { parseBillingBenefits, type BillingBenefits } from '../lib/billingBenefits';

type Allowance = { freeMonthlyLimit: number; freeUsedThisMonth: number; permanentCreditsRemaining: number; paidPurchasesAvailable: boolean };
export function parseAllowance(value: unknown): Allowance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('權益資料無效。');
  const row = value as Record<string, unknown>;
  if (!['freeMonthlyLimit', 'freeUsedThisMonth', 'permanentCreditsRemaining'].every(key => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0)
    || typeof row.paidPurchasesAvailable !== 'boolean') throw new Error('權益資料無效。');
  return row as Allowance;
}
export default function AccountBenefits() {
  const { token } = useAuth(), zh=settingsChinese();
  const [state,setState]=useState<{token:string;allowance:Allowance;billing:BillingBenefits}|null>(null),[issue,setIssue]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setIssue(false);
    if(token)void Promise.all(['/marketing/availability','/payment/benefits'].map(async path=>{
      const response=await fetch(`${API_URL}${path}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal,redirect:'error'});
      if(!response.ok)throw new Error();return response.json();
    })).then(([allowance,billing])=>{const value={token,allowance:parseAllowance(allowance),billing:parseBillingBenefits(billing)};if(active)setState(value);}).catch(()=>{if(active){setState(null);setIssue(true);}});
    return()=>{active=false;controller.abort();};
  },[token,retry]);
  const current=state?.token===token?state:null;
  return <section aria-labelledby="benefits-title" className="account-benefits rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <h2 id="benefits-title" className="flex items-center gap-2 text-lg font-semibold"><Crown className="h-5 w-5" aria-hidden/>{zh?'贊助與升級':'Support and upgrade'}</h2>
    <div className="mt-3 divide-y">
      <div className="py-4"><h3 className="flex items-center gap-2 font-medium"><Heart className="h-4 w-4" aria-hidden/>{zh?'贊助 Wishlist · NT$90':'Support Wishlist · NT$90'}</h3><p className="mt-2 text-sm text-gray-600">{zh?'只有 NT$90 一檔，單次支持服務營運；不包含尊榮或行銷額度。':'One NT$90 support option. A one-time contribution with no Premium benefits or marketing credits.'}</p></div>
      <div className="py-4"><h3 className="font-medium">{zh?'尊榮版訂閱 · NT$90／月':'Premium subscription · NT$90/month'}</h3><p className="mt-2 text-sm text-gray-600">{zh?'尊榮版代問權益、每月 100 次行銷額度。按月自動續訂，可隨時於原付款平台取消。':'Premium inquiry access and 100 marketing uses per month. Renews monthly; cancel through the original billing platform.'}</p><p className="mt-2 text-sm">{current?(current.billing.inquiry.premium?(zh?'尊榮代問權益已啟用':'Premium inquiry access is active'):(zh?`本週免費代問剩 ${current.billing.inquiry.freeRemaining}／3 次`:`${current.billing.inquiry.freeRemaining} of 3 free inquiries left this week`)):(zh?'會員與代問額度尚未確認':'Membership and inquiry allowance are unconfirmed')}</p><p className="mt-2 text-xs text-gray-600">{zh?'免費代問每週一台灣時間 00:00 重新提供 3 次，不累積。':'3 free inquiries reset Mondays at 00:00 Taiwan time; unused uses do not carry over.'}</p></div>
      <div className="py-4"><h3 className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" aria-hidden/>{zh?'行銷小助手加值 · US$1／10 次':'Marketing top-up · US$1/10 uses'}</h3><p className="mt-2 text-sm text-gray-600">{zh?'額度不限期，非訂閱。':'Credits do not expire. Not a subscription.'}</p><p className="mt-2 text-sm" aria-live="polite">{zh?'永久加值剩餘：':'Permanent credits remaining: '}{current?`${current.allowance.permanentCreditsRemaining}${zh?' 次':' uses'}`:(zh?'暫時無法核對':'Unconfirmed')}</p></div>
    </div>
    <p className="rounded-xl bg-stone-100 p-3 text-sm">{zh?'網站購買尚在準備中；既有權益與每週免費代問不受影響。':'Web purchases are being prepared. Existing benefits and weekly free inquiries remain available.'}</p>
    <div className="mt-3 flex flex-wrap gap-3 text-sm"><a href={`https://support.apple.com/${zh?'zh-tw':'en-us'}/118428`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{zh?'Apple 訂閱管理說明':'Apple subscription management'}</a><a href={`https://support.google.com/googleplay/answer/7018481?hl=${zh?'zh-Hant':'en'}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{zh?'Google Play 訂閱管理說明':'Google Play subscription management'}</a></div>
    {issue&&<p role="alert" className="mt-2 text-sm text-red-700">{zh?'權益讀取失敗；不會以舊資料或零次代替。':'Benefits could not be read; old values or zero are not substituted.'}</p>}
    <Button variant="outline" size="sm" className="mt-3" onClick={()=>setRetry(n=>n+1)}>{zh?'重新核對權益':'Recheck benefits'}</Button>
  </section>;
}
