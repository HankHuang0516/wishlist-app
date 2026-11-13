import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthAction,AuthField,AuthLinks,AuthMessage,AuthPage,AuthPasswordField,AuthSubmit } from '../components/AuthLayout';
import { AuthFlowError,authIssue,authText,newPasswordPayload,recoveryToken,resetAck } from '../lib/authFlowWeb';
import { useAuthRequest } from '../lib/useAuthRequest';
import { t } from '../utils/localization';

export default function ResetPassword() {
  const [params]=useSearchParams(),scope=params.toString();
  const [link,setLink]=useState(params.getAll('token').length===1?params.get('token')??'':''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [issue,setIssue]=useState(''),[confirmed,setConfirmed]=useState(false),[uncertain,setUncertain]=useState(false);
  const {busy,run}=useAuthRequest(scope),{user,refreshUser}=useAuth();
  useEffect(()=>{setLink(params.getAll('token').length===1?params.get('token')??'':'');setPassword('');setConfirmation('');setIssue('');setConfirmed(false);setUncertain(false);},[scope]);
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(busy||confirmed||uncertain)return;
    setIssue('');
    try {const token=recoveryToken(link,'reset'),newPassword=newPasswordPayload(password,confirmation);const ack=await run('/reset-password',{token,newPassword});if(!ack)return;resetAck(ack);setConfirmed(true);setLink('');setPassword('');setConfirmation('');if(user)void refreshUser().catch(()=>{});}
    catch(error){setIssue(authIssue(error));const unknown=error instanceof AuthFlowError&&error.uncertain;setUncertain(unknown);if(unknown){setPassword('');setConfirmation('');}}
  }
  return <AuthPage title={authText('resetTitle')} subtitle={confirmed||uncertain?undefined:authText('resetIntro')}>
    <div className="space-y-4">
      {issue&&<AuthMessage tone="error">{issue}</AuthMessage>}
      {confirmed?<><AuthMessage tone="success">{authText('resetSuccess')}</AuthMessage><AuthAction to="/login">{authText('goLogin')}</AuthAction></>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <AuthField id="reset-link" label={authText('resetInput')} hint={authText('linkNote')} autoComplete="off" spellCheck={false} maxLength={2048} required value={link} onChange={event=>setLink(event.target.value)} disabled={busy}/>
        <AuthPasswordField id="new-password" label={t('forgot.newPassword')} value={password} onChange={setPassword} disabled={busy} hint/>
        <AuthPasswordField id="confirm-password" label={authText('confirmation')} value={confirmation} onChange={setConfirmation} disabled={busy}/>
        <AuthSubmit disabled={busy}>{authText(busy?'processing':'resetTitle')}</AuthSubmit>
      </form>}
    </div>
    <AuthLinks links={confirmed?[]:['forgot','login']}/>
  </AuthPage>;
}
