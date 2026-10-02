import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card,CardContent,CardHeader,CardTitle,CardFooter } from '../components/ui/Card';
import { AuthPasswordField,AuthRecoveryLinks } from '../components/AuthRecovery';
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
  return <div className="flex items-center justify-center min-h-[60vh] p-4"><Card className="w-full max-w-md">
    <CardHeader><CardTitle className="text-2xl text-center">{authText('resetTitle')}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muji-secondary">{authText('linkNote')}</p>
      {issue&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{issue}</p>}
      {confirmed?<p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{authText('resetSuccess')}</p>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><label htmlFor="reset-link" className="text-sm font-medium">{authText('resetInput')}</label><Input id="reset-link" autoComplete="off" spellCheck={false} maxLength={2048} required value={link} onChange={event=>setLink(event.target.value)} disabled={busy} className="min-h-[44px]"/></div>
        <AuthPasswordField id="new-password" label={t('forgot.newPassword')} value={password} onChange={setPassword} disabled={busy} hint/>
        <AuthPasswordField id="confirm-password" label={authText('confirmation')} value={confirmation} onChange={setConfirmation} disabled={busy}/>
        <Button type="submit" disabled={busy} className="w-full min-h-[44px]">{authText(busy?'processing':'resetTitle')}</Button>
      </form>}
    </CardContent><CardFooter className="block"><AuthRecoveryLinks/></CardFooter>
  </Card></div>;
}
