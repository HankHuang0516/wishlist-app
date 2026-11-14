import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { AuthField,AuthLinks,AuthMessage,AuthPage,AuthSubmit } from '../components/AuthLayout';
import { authIssue,authText,emailPayload,emailRequestAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';

export function EmailRequestPage({mode='forgot'}:{mode?:'forgot'|'resend'}) {
  const [email,setEmail]=useState(''),[issue,setIssue]=useState(''),[accepted,setAccepted]=useState(false);
  const {busy,run}=useAuthRequest(mode);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setIssue('');
    try {const payload=emailPayload(email);const ack=await run(mode==='forgot'?'/forgot-password':'/resend-verification',payload);if(!ack)return;emailRequestAck(ack);setAccepted(true);}
    catch(error){setIssue(authIssue(error));}
  }
  const forgot=mode==='forgot';
  return <AuthPage title={authText(forgot?'forgotTitle':'resend')} subtitle={authText(forgot?'forgotIntro':'resendIntro')}>
    <div className="space-y-4">
      {issue&&<AuthMessage tone="error">{issue}</AuthMessage>}
      {accepted?<><AuthMessage tone="success">{authText('requestAccepted')}</AuthMessage><Button type="button" variant="outline" onClick={()=>{setAccepted(false);setIssue('');}} className="h-11 w-full">{authText('requestAgain')}</Button></>:<form onSubmit={submit} className="space-y-4">
        <AuthField id="recovery-email" label={authText('email')} type="email" autoComplete="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/>
        <AuthSubmit disabled={busy}>{authText(busy?'processing':forgot?'sendReset':'sendVerify')}</AuthSubmit>
      </form>}
    </div>
    <AuthLinks links={[forgot?'haveReset':'haveVerify','login']}/>
  </AuthPage>;
}
export default function ForgotPasswordPage(){return <EmailRequestPage/>;}
