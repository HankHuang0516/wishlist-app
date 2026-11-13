import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthAction,AuthField,AuthLinks,AuthMessage,AuthPage,AuthSubmit } from '../components/AuthLayout';
import { AuthFlowError,authIssue,authText,recoveryToken,verificationAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';

export default function EmailVerification() {
  const [params]=useSearchParams(),scope=params.toString();
  const [link,setLink]=useState(params.getAll('token').length===1?params.get('token')??'':''),[issue,setIssue]=useState(''),[confirmed,setConfirmed]=useState(false),[uncertain,setUncertain]=useState(false);
  const {busy,run}=useAuthRequest(scope);
  useEffect(()=>{setLink(params.getAll('token').length===1?params.get('token')??'':'');setIssue('');setConfirmed(false);setUncertain(false);},[scope]);
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(busy||confirmed||uncertain) return;
    setIssue('');
    try { const token=recoveryToken(link,'verify'); const ack=await run('/verify-email',{token}); if(!ack)return; verificationAck(ack);setLink('');setConfirmed(true); }
    catch(error){setIssue(authIssue(error));setUncertain(error instanceof AuthFlowError&&error.uncertain);}
  }
  return <AuthPage title={authText('verifyTitle')} subtitle={confirmed||uncertain?undefined:authText('verifyIntro')}>
    <div className="space-y-4">
      {issue&&<AuthMessage tone="error">{issue}</AuthMessage>}
      {confirmed?<><AuthMessage tone="success">{authText('verifySuccess')}</AuthMessage><AuthAction to="/login">{authText('goLogin')}</AuthAction></>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <AuthField id="verification-link" label={authText('verifyInput')} hint={authText('linkNote')} autoComplete="off" spellCheck={false} maxLength={2048} required value={link} onChange={event=>setLink(event.target.value)} disabled={busy}/>
        <AuthSubmit disabled={busy}>{authText(busy?'processing':'verifyTitle')}</AuthSubmit>
      </form>}
    </div>
    <AuthLinks links={confirmed?[]:['resend','login']}/>
  </AuthPage>;
}
