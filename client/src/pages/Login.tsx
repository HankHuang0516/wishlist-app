import { Link,useNavigate,useSearchParams } from 'react-router-dom';
import { useEffect,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card,CardContent,CardHeader,CardTitle,CardFooter } from '../components/ui/Card';
import { t } from '../utils/localization';
import { Analytics } from '../utils/analytics';
import { Eye,EyeOff } from 'lucide-react';
import { SECURITY_NOTICES,type SecurityNotice } from '../lib/accountSecurityWeb';
import { authReturnTo } from '../lib/authReturnTo';
import { authSession } from '../lib/authSession';
import { AuthFlowError,authIssue,authText,emailPayload,emailRequestAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';
import { AuthRecoveryLinks } from '../components/AuthRecovery';
import ProductNoticeWeb from '../components/ProductNoticeWeb';

export default function Login() {
  const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false);
  const [error,setError]=useState(''),[showResend,setShowResend]=useState(false),[resendSuccess,setResendSuccess]=useState('');
  const {login,isAuthenticated}=useAuth(),navigate=useNavigate(),[params]=useSearchParams();
  const {busy,run}=useAuthRequest(params.toString());
  const securityCode=params.get('security'),noticeKeys:Record<SecurityNotice,'securityPassword'|'securitySessions'|'securityUnknown'>={'password-updated':'securityPassword','sessions-revoked':'securitySessions','security-unconfirmed':'securityUnknown'};
  const securityNotice=securityCode&&Object.hasOwn(SECURITY_NOTICES,securityCode)?authText(noticeKeys[securityCode as SecurityNotice]):null;
  const returnTo=authReturnTo(params.get('next'));
  useEffect(()=>{if(isAuthenticated)navigate(returnTo);},[isAuthenticated,navigate,returnTo]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setError('');setShowResend(false);setResendSuccess('');
    try {
      if(!identifier.trim()||identifier.length>254||!password||new TextEncoder().encode(password).length>1024||password.includes('\u0000'))throw new AuthFlowError('missing');
      const ack=await run('/login',{phoneNumber:identifier.trim(),password});if(!ack)return;
      const session=authSession(ack.token,ack.user);
      try{login(session.token,session.user,returnTo);}catch{throw new AuthFlowError('unknown',true);}
      Analytics.logLogin(identifier.includes('@')?'email':'phone');
    } catch(failure){setError(authIssue(failure));setShowResend(failure instanceof AuthFlowError&&failure.code==='unverified');}
  }
  async function resend() {
    if(busy)return;setResendSuccess('');
    try{const payload=emailPayload(identifier);const ack=await run('/resend-verification',payload);if(!ack)return;emailRequestAck(ack);setResendSuccess(authText('requestAccepted'));setError('');}
    catch(failure){setError(authIssue(failure));}
  }
  return <div className="flex items-center justify-center min-h-[60vh] p-4"><Card className="w-full max-w-md">
    <CardHeader className="text-center"><CardTitle className="text-2xl">{t('login.title')}</CardTitle><p className="text-sm text-muji-secondary">{t('login.subtitle')}</p></CardHeader>
    <form onSubmit={submit}><CardContent className="space-y-4">
      <ProductNoticeWeb disabled={busy}/>
      {securityNotice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{securityNotice}</p>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {resendSuccess&&<p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{resendSuccess}</p>}
      {showResend&&<Button type="button" variant="outline" onClick={()=>void resend()} disabled={busy} className="w-full min-h-[44px]">{authText(busy?'processing':'resend')}</Button>}
      <div className="space-y-2"><label htmlFor="identifier">{t('login.phoneOrEmail')}</label><Input id="identifier" autoComplete="username" maxLength={254} required value={identifier} onChange={event=>setIdentifier(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
      <div className="space-y-2"><label htmlFor="password">{t('login.password')}</label><div className="relative"><Input id="password" type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy} className="min-h-[44px] pr-12"/>
        <button type="button" disabled={busy} onClick={()=>setShowPassword(!showPassword)} aria-label={authText(showPassword?'hide':'show')} aria-pressed={showPassword} className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-muji-secondary">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button>
      </div></div>
      <Link to="/forgot-password" className="min-h-[44px] flex items-center justify-end text-sm underline">{t('login.forgotPassword')}</Link>
    </CardContent><CardFooter className="flex flex-col gap-4"><Button type="submit" disabled={busy} className="w-full min-h-[44px]">{busy?t('login.signingIn'):t('login.signIn')}</Button><p className="text-sm">{t('login.noAccount')} <Link to="/register" className="underline">{t('login.signUp')}</Link></p></CardFooter></form>
    <CardFooter className="block"><AuthRecoveryLinks/></CardFooter>
  </Card></div>;
}
