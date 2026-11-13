import { useNavigate,useSearchParams } from 'react-router-dom';
import { useEffect,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { t } from '../utils/localization';
import { Analytics } from '../utils/analytics';
import { SECURITY_NOTICES,type SecurityNotice } from '../lib/accountSecurityWeb';
import { authReturnTo } from '../lib/authReturnTo';
import { authSession } from '../lib/authSession';
import { AuthFlowError,authIssue,authText,emailPayload,emailRequestAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';
import { AuthField,AuthLink,AuthLinks,AuthMessage,AuthPage,AuthPasswordField,AuthSubmit,AuthSwitch } from '../components/AuthLayout';
import ProductNoticeWeb from '../components/ProductNoticeWeb';

export default function Login() {
  const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState('');
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
  // Verification help belongs to the one failure that needs it. The inline resend uses the email just entered;
  // someone who signed in by phone is sent to the page that asks for the email instead.
  const resendInline=identifier.includes('@');
  return <AuthPage title={t('login.title')} subtitle={t('login.subtitle')} below={<ProductNoticeWeb disabled={busy}/>}>
    <form onSubmit={submit} className="space-y-4">
      {securityNotice&&<AuthMessage tone="info">{securityNotice}</AuthMessage>}
      {error&&<AuthMessage tone="error">{error}</AuthMessage>}
      {resendSuccess&&<AuthMessage tone="success">{resendSuccess}</AuthMessage>}
      {showResend&&<div>
        {resendInline&&<Button type="button" variant="outline" onClick={()=>void resend()} disabled={busy} className="h-11 w-full">{authText(busy?'processing':'resend')}</Button>}
        <AuthLinks links={resendInline?['haveVerify']:['resend','haveVerify']}/>
      </div>}
      <AuthField id="identifier" label={t('login.phoneOrEmail')} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required value={identifier} onChange={event=>setIdentifier(event.target.value)} disabled={busy}/>
      <div>
        <AuthPasswordField id="password" label={t('login.password')} value={password} onChange={setPassword} disabled={busy} current/>
        <div className="flex justify-end"><AuthLink to="/forgot-password">{t('login.forgotPassword')}</AuthLink></div>
      </div>
      <AuthSubmit disabled={busy}>{busy?t('login.signingIn'):t('login.signIn')}</AuthSubmit>
    </form>
    <AuthSwitch prompt={t('login.noAccount')} to="/register" label={t('login.signUp')}/>
  </AuthPage>;
}
