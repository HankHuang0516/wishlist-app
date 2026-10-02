import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Eye,EyeOff } from 'lucide-react';
import { Input } from './ui/Input';
import { authText } from '../lib/authFlowWeb';

export function AuthRecoveryLinks() {
  return <nav aria-label={authText('recoveryNavigation')} className="flex flex-col gap-1 text-sm">
    {([['/login','login'],['/resend-verification','resend'],['/forgot-password','forgot'],['/verify-email','haveVerify'],['/reset-password','haveReset'],['/privacy','privacy'],['/terms','terms']] as const).map(([to,key])=><Link key={to} to={to} className="min-h-[44px] flex items-center justify-center underline text-muji-secondary">{authText(key)}</Link>)}
  </nav>;
}
export function AuthPasswordField({id,label,value,onChange,disabled,hint=false}:{id:string;label:string;value:string;onChange:(value:string)=>void;disabled:boolean;hint?:boolean}) {
  const [show,setShow]=useState(false);
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <div className="relative"><Input id={id} type={show?'text':'password'} autoComplete="new-password" value={value} onChange={event=>onChange(event.target.value)} disabled={disabled} required minLength={8} maxLength={73} className="min-h-[44px] pr-12" aria-describedby={hint?id+'-hint':undefined}/>
      <button type="button" disabled={disabled} onClick={()=>setShow(!show)} aria-label={authText(show?'hide':'show')+'：'+label} aria-pressed={show} className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-muji-secondary">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button>
    </div>
    {hint&&<p id={id+'-hint'} className="text-xs text-muji-secondary">{authText('passwordHint')}</p>}
  </div>;
}
