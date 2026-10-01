import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card,CardContent,CardHeader,CardTitle,CardFooter } from '../components/ui/Card';
import { AuthRecoveryLinks } from '../components/AuthRecovery';
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
  return <div className="flex items-center justify-center min-h-[60vh] p-4"><Card className="w-full max-w-md">
    <CardHeader><CardTitle className="text-2xl text-center">{authText('verifyTitle')}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muji-secondary">{authText('linkNote')}</p>
      {issue&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{issue}</p>}
      {confirmed?<p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{authText('verifySuccess')}</p>:!uncertain&&<form onSubmit={submit} className="space-y-4">
        <label htmlFor="verification-link" className="text-sm font-medium">{authText('verifyInput')}</label>
        <Input id="verification-link" autoComplete="off" spellCheck={false} maxLength={2048} required value={link} onChange={event=>setLink(event.target.value)} disabled={busy} className="min-h-[44px]"/>
        <Button type="submit" disabled={busy} className="w-full min-h-[44px]">{authText(busy?'processing':'verifyTitle')}</Button>
      </form>}
    </CardContent><CardFooter className="block"><AuthRecoveryLinks/></CardFooter>
  </Card></div>;
}
