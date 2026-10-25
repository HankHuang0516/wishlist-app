import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/marketplaceApi';
import { parseBillingBenefits, type BillingBenefits } from '../lib/billingBenefits';
import { settingsChinese } from '../lib/settingsCopy';
export default function InquiryAllowance({ revision = 0 }: { revision?: number }) {
    const { token } = useAuth(), [value,setValue] = useState<{token:string;benefits:BillingBenefits}|null>(null), [retry,setRetry] = useState(0), [issue,setIssue] = useState(false);
    const zh = settingsChinese();
    useEffect(()=>{
        let current=true;const controller=new AbortController();setIssue(false);
        if(token)void api<unknown>(token,'/payment/benefits',{signal:controller.signal}).then(parseBillingBenefits).then(benefits=>{if(current)setValue({token,benefits});}).catch(()=>{if(current){setValue(null);setIssue(true);}});
        return()=>{current=false;controller.abort();};
    },[token,retry,revision]);
    if(!token)return null;
    const quota=value?.token===token?value.benefits.inquiry:null;
    return <aside className="rounded-xl bg-stone-100 p-3 text-sm" aria-live="polite">
        <p>{quota?quota.premium?(zh?'尊榮版代問權益已啟用':'Premium inquiry access is active'):(zh?`本週免費代問剩 ${quota.freeRemaining}／3 次`:`${quota.freeRemaining} of 3 free inquiries left this week`):(zh?'代問額度尚未確認':'Inquiry allowance is unconfirmed')}</p>
        <p className="mt-1 text-xs text-stone-600">{zh?'每週一台灣時間 00:00 重新提供 3 次，不累積。新一輪委託才計次；更正、讀取與同筆重試不重複計次。':'3 free inquiries reset Mondays at 00:00 Taiwan time; unused uses do not carry over. New rounds count; corrections, reads and exact retries do not.'}</p>
        {quota&&!quota.premium&&<Link to="/settings#benefits-title" className="inline-flex min-h-11 items-center underline">{zh?'查看尊榮版 · NT$90／月':'View Premium · NT$90/month'}</Link>}
        {issue&&<button className="min-h-11 underline" onClick={()=>setRetry(n=>n+1)}>{zh?'重新核對額度':'Recheck allowance'}</button>}
    </aside>;
}
